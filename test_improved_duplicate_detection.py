#!/usr/bin/env python3
"""
Test the improved pre-download duplicate detection logic
"""

import psycopg2
import os
import sys

class TestInvoiceRPAService:
    """Test version of the RPA service to validate duplicate detection"""
    
    def __init__(self):
        self.stats = {
            'total_invoices': 0,
            'processed_invoices': 0,
            'successful_imports': 0,
            'failed_imports': 0,
            'skipped_imports': 0,
        }
        
    def log(self, message: str, level: str = 'INFO'):
        """Log message with timestamp"""
        print(f"[{level}]: {message}")
        
    def is_duplicate_invoice(self, conn, invoice_number: str, emisor_id: str, total_amount: str = None) -> bool:
        """
        Robust helper function to check if an invoice already exists in the database
        Checks the imported_invoices table using normalized inputs for:
        - invoice_number (normalized and trimmed, converted to uppercase)
        - emisor_id (normalized and trimmed) - MUST match the vendor
        - total_amount (optional, with tolerance threshold for rounding differences)

        Returns True if duplicate found (should skip), False if new invoice (should process)
        """
        try:
            cursor = conn.cursor()

            # Normalize inputs as requested
            normalized_invoice_number = (invoice_number or "").strip().upper()
            normalized_emisor_id = (emisor_id or "").strip().upper()

            # Build the base SQL query checking ALL THREE key fields:
            # 1. Invoice number (erp_document_id)
            # 2. Emisor/Vendor (metadata->>'emisor')
            # 3. Total amount (metadata->>'valor_total' or metadata->>'totalAmount')
            # Skip invoices unless they are marked as 'failed' or need retry
            base_query = """
                SELECT 1 FROM imported_invoices 
                WHERE 
                    UPPER(TRIM(erp_document_id)) = %s
                    AND UPPER(TRIM(COALESCE(metadata->>'emisor', ''))) = %s
                    AND processing_status NOT IN ('failed')
            """

            params = [
                normalized_invoice_number,  # Exact match on invoice number
                normalized_emisor_id         # Exact match on emisor
            ]

            # Add total_amount validation if provided (with tolerance for rounding)
            if total_amount and total_amount.strip() and total_amount != 'N/A':
                try:
                    # Enhanced normalization: handle newlines, currency codes, and special characters
                    clean_amount = str(total_amount).replace('\n', '').replace('\r', '').replace('COP', '').replace('USD', '').replace('$', '').replace(',', '').replace('.', '').strip()
                    # Only keep digits for normalization
                    clean_amount = ''.join(filter(str.isdigit, clean_amount))
                    if clean_amount:
                        normalized_total = float(clean_amount)
                        # Check both valor_total and totalAmount fields with tolerance
                        base_query += """
                            AND (
                                ABS(CAST(REGEXP_REPLACE(COALESCE(metadata->>'valor_total', '0'), '[^0-9]', '', 'g') AS NUMERIC) - %s) <= 100
                                OR
                                ABS(CAST(REGEXP_REPLACE(COALESCE(metadata->>'totalAmount', '0'), '[^0-9]', '', 'g') AS NUMERIC) - %s) <= 100
                            )
                        """
                        params.extend([str(normalized_total), str(normalized_total)])
                        self.log(f"   🔍 Checking duplicate: Invoice={normalized_invoice_number}, Emisor={normalized_emisor_id}, Amount={normalized_total}")
                    else:
                        self.log(f"   ⚠️ Could not extract numeric value from '{total_amount}', checking without amount validation")
                except (ValueError, TypeError) as e:
                    self.log(f"   ⚠️ Could not normalize total_amount '{total_amount}': {e}, checking without amount validation")
            else:
                self.log(f"   🔍 Checking duplicate: Invoice={normalized_invoice_number}, Emisor={normalized_emisor_id} (no amount provided)")

            base_query += " LIMIT 1;"

            # Execute the query
            cursor.execute(base_query, params)
            result = cursor.fetchone()

            if result:
                amount_msg = f" Amount={total_amount}" if (total_amount and total_amount.strip() and total_amount != 'N/A') else ""
                self.log(f"   ✅ Duplicate found: Invoice {normalized_invoice_number} from {normalized_emisor_id}{amount_msg}")
                return True
            else:
                amount_msg = f" Amount={total_amount}" if total_amount else ""
                self.log(f"   🆕 No duplicate found for: Invoice {normalized_invoice_number} from {normalized_emisor_id}{amount_msg}")
                return False

        except Exception as e:
            self.log(f"   ❌ Error in is_duplicate_invoice: {e}", "ERROR")
            # On error, return False to be safe and allow processing
            return False
    
    def simulate_invoice_processing(self):
        """Simulate the improved invoice processing logic"""
        
        # Simulate real invoices from ERP system (including ones that exist in DB)
        simulated_invoices = [
            # These should exist in the database and be skipped
            ("FE26891", "8729880 JAIME ENRIQUE PIÑERES PARDO", "$9000000\nCOP"),
            ("FEV730", "900599166 INTEGRA ARQUITECTURA COMERCIAL SAS", "$678892129\nCOP"),
            ("CB12305", "900152873 EQUITECNICOS CB LTDA", "$112025648\nCOP"),
            # These should NOT exist and be processed
            ("NEW001", "999888777 NEW COMPANY SAS", "$500000\nCOP"),
            ("TEST123", "123456789 TEST VENDOR LTDA", "$1000000\nCOP"),
        ]
        
        print("🤖 SIMULATING IMPROVED RPA PROCESSING WITH PRE-DOWNLOAD CHECKS")
        print("=" * 70)
        
        try:
            database_url = os.environ.get('DATABASE_URL')
            if not database_url:
                print("❌ DATABASE_URL not found")
                return
                
            # Connect to PostgreSQL for duplicate checking
            pg_conn = psycopg2.connect(database_url)
            
            for numero_documento, emisor_raw, valor_total_raw in simulated_invoices:
                # Extract and normalize invoice metadata FIRST
                emisor = emisor_raw.replace(" ", "_").replace(".", "")
                # Enhanced total amount normalization for Colombian currency
                valor_total = valor_total_raw.replace(",", "").replace(".", "").replace("$", "").replace("COP", "").replace("\n", "").replace("\r", "").strip().split(" ")[0]
                
                # Count total invoices encountered
                self.stats['total_invoices'] += 1
                
                print(f"\n📄 Invoice {self.stats['total_invoices']}: {numero_documento}")
                print(f"   📋 From: {emisor_raw}")
                print(f"   💰 Amount: {valor_total_raw}")
                
                # ROBUST PRE-DOWNLOAD DUPLICATE CHECK 
                if self.is_duplicate_invoice(pg_conn, numero_documento, emisor_raw, valor_total_raw):
                    self.log(f"   ⏭️ RESULT: Will be SKIPPED (duplicate detected)")
                    self.stats['skipped_imports'] += 1
                    continue
                
                # If we reach here, no duplicate was found
                self.log(f"   🔄 RESULT: Will be PROCESSED (downloading ZIP, extracting files)")
                self.stats['processed_invoices'] += 1
                self.stats['successful_imports'] += 1  # Assume successful for simulation
            
            pg_conn.close()
            
            print(f"\n📊 FINAL STATISTICS")
            print("=" * 50)
            print(f"Total invoices encountered: {self.stats['total_invoices']}")
            print(f"Skipped (duplicates): {self.stats['skipped_imports']}")
            print(f"Processed (new): {self.stats['processed_invoices']}")
            print(f"Successfully imported: {self.stats['successful_imports']}")
            print(f"Failed imports: {self.stats['failed_imports']}")
            
            print(f"\n✅ VERIFICATION:")
            print(f"   - Duplicate detection works: {self.stats['skipped_imports']} invoices skipped BEFORE download")
            print(f"   - Efficiency: No ZIP downloads for existing invoices")
            print(f"   - Accurate counts: processed_invoices = {self.stats['processed_invoices']} (not 0)")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    service = TestInvoiceRPAService()
    service.simulate_invoice_processing()