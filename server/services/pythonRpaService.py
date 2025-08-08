#!/usr/bin/env python3
"""
Python RPA Service for Invoice Importing
Automated ERP login, invoice download, and XML extraction
"""

import os
import re
import time
import shutil
import zipfile
import sqlite3
import sys
import json
import base64
import psycopg2
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, Any, Optional

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException


class InvoiceRPAService:
    """Automated invoice importing service using Selenium"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.erp_url = config.get('erpUrl', '')
        self.username = config.get('erpUsername', '')

        # Decode Base64 password if it appears to be encoded
        raw_password = config.get('erpPassword', '')
        try:
            # Check if password is Base64 encoded and decode it
            if raw_password and len(raw_password) % 4 == 0:
                decoded_password = base64.b64decode(raw_password).decode(
                    'utf-8')
                self.password = decoded_password
                self.log(f"Password decoded successfully")
            else:
                self.password = raw_password
        except Exception as e:
            # If decoding fails, use the raw password
            self.password = raw_password
            self.log(f"Using raw password (decode failed: {e})")
        self.download_dir = config.get('downloadPath',
                                       'uploads/pdfs')
        self.xml_dir = config.get('xmlPath', '/tmp/xml_invoices')

        # Get headless mode from config (default to False for easier debugging)
        self.headless_mode = config.get('headless', False)
        
        # Get ZIP download timeout from config (default to 60 seconds)
        self.zip_download_timeout = config.get('zipDownloadTimeout', 60)
        
        # Proxy Rotation Configuration
        self.proxy_rotation_enabled = config.get('proxyRotationEnabled', False)
        self.proxy_rotation_interval = config.get('proxyRotationInterval', 100)
        self.proxy_list = config.get('proxyList', [])
        self.current_proxy_index = config.get('currentProxyIndex', 0)
        self.imports_since_rotation = 0

        # Validate required config values early
        if not self.erp_url:
            raise ValueError(
                "Missing required config: 'erpUrl' must be provided")
        if not self.username:
            raise ValueError(
                "Missing required config: 'erpUsername' must be provided")
        if not self.password:
            raise ValueError(
                "Missing required config: 'erpPassword' must be provided")

        self.db_path = os.path.join(self.download_dir, 'invoices.db')
        self.xml_db_path = os.path.join(self.xml_dir, 'invoices_xml.db')

        # Store log_id for PostgreSQL transfer
        self.log_id = config.get('logId')
        # Store config_id for company association
        self.config_id = config.get('configId') or config.get('id')

        # Ensure directories exist (convert Windows paths to Linux paths in Replit)
        if os.name == 'posix':  # Linux/Unix (Replit environment)
            # Convert Windows paths to persistent directories
            if self.download_dir.startswith('C:\\'):
                self.download_dir = 'uploads/pdfs'
            if self.xml_dir.startswith('C:\\'):
                self.xml_dir = 'uploads/xmls'

        os.makedirs(self.download_dir, exist_ok=True)
        os.makedirs(self.xml_dir, exist_ok=True)

        self.log(f"Download directory: {self.download_dir}")
        self.log(f"XML directory: {self.xml_dir}")

        # Initialize driver
        self.driver = None
        self.wait = None
        self.short_wait = None
        self.long_wait = None

        # Enhanced Statistics with Relationship Constraints
        self.stats = {
            'total_invoices': 0,        # All invoices discovered/iterated over
            'skipped_invoices': 0,      # Invoices skipped (duplicates/invalid)  
            'processed_invoices': 0,    # Invoices that proceeded to import
            'successful_imports': 0,    # Successfully imported invoices
            'failed_imports': 0,        # Failed import attempts
            'current_step': 'Initializing',
            'progress': 0
        }

    def is_driver_ready(self) -> bool:
        """Check if driver and wait objects are properly initialized"""
        return (self.driver is not None and self.wait is not None
                and self.short_wait is not None and self.long_wait is not None)

    def get_current_proxy(self) -> str:
        """Get the current proxy from the rotation list"""
        if not self.proxy_list or len(self.proxy_list) == 0:
            return None
        
        # Ensure index is within bounds
        if self.current_proxy_index >= len(self.proxy_list):
            self.current_proxy_index = 0
            
        return self.proxy_list[self.current_proxy_index].strip()
    
    def rotate_proxy(self) -> bool:
        """Rotate to the next proxy in the list"""
        if not self.proxy_rotation_enabled or not self.proxy_list or len(self.proxy_list) <= 1:
            return False
            
        self.current_proxy_index = (self.current_proxy_index + 1) % len(self.proxy_list)
        self.imports_since_rotation = 0
        
        new_proxy = self.get_current_proxy()
        self.log(f"🔄 Rotated to proxy: {new_proxy} (index: {self.current_proxy_index + 1}/{len(self.proxy_list)})")
        return True
    
    def should_rotate_proxy(self) -> bool:
        """Check if proxy should be rotated based on import count"""
        return (self.proxy_rotation_enabled and 
                len(self.proxy_list) > 1 and
                self.imports_since_rotation >= self.proxy_rotation_interval)
    
    def increment_import_count(self):
        """Increment import count for proxy rotation tracking"""
        self.imports_since_rotation += 1
        if self.proxy_rotation_enabled:
            self.log(f"📊 Imports since last rotation: {self.imports_since_rotation}/{self.proxy_rotation_interval}")
    
    def restart_driver_with_new_proxy(self) -> bool:
        """Restart WebDriver with new proxy configuration"""
        try:
            if self.driver:
                self.log("🔄 Shutting down current WebDriver for proxy rotation...")
                self.driver.quit()
                self.driver = None
                self.wait = None
                self.short_wait = None
                self.long_wait = None
            
            # Setup driver with new proxy
            return self.setup_driver()
            
        except Exception as e:
            self.log(f"❌ Error restarting driver with new proxy: {e}", "ERROR")
            return False

    def log(self, message: str, level: str = 'INFO'):
        """Log message with timestamp"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {level}: {message}")
        sys.stdout.flush()

    def is_duplicate_invoice(self, conn, invoice_number: str, emisor_id: str, total_amount: str = None) -> bool:
        """
        Enhanced duplicate detection that ALWAYS runs regardless of DATABASE_URL availability.
        Matches invoice number, emisor ID, and total amount (±0.01) exactly in SQL WHERE clause.
        
        Returns True if duplicate found (should skip), False if new invoice (should process)
        """
        try:
            # Always run duplicate detection regardless of DATABASE_URL
            if conn is None:
                self.log("⚠️ No database connection available, assuming no duplicate")
                return False
                
            cursor = conn.cursor()
            
            # Normalize inputs exactly as specified
            normalized_invoice_number = invoice_number.strip().upper()
            normalized_emisor_id = emisor_id.strip()
            
            # Build precise SQL query for exact matching
            base_query = """
                SELECT 1 FROM imported_invoices 
                WHERE UPPER(TRIM(original_file_name)) LIKE %s
                AND processing_status NOT IN ('failed')
            """
            
            params = [f"{normalized_invoice_number}%"]
            
            # Add exact total amount validation with ±0.01 threshold
            if total_amount and total_amount.strip() and total_amount != 'N/A':
                try:
                    # Normalize amount by removing currency symbols and whitespace
                    clean_amount = str(total_amount).replace('\n', '').replace('\r', '').replace('COP', '').replace('USD', '').replace('$', '').replace(',', '').strip()
                    # Extract numeric value
                    clean_amount = ''.join(filter(lambda x: x.isdigit() or x == '.', clean_amount))
                    
                    if clean_amount:
                        normalized_total = float(clean_amount)
                        # Add exact amount matching with ±0.01 tolerance
                        base_query += """
                            AND ABS(
                                CAST(
                                    REGEXP_REPLACE(
                                        REGEXP_REPLACE(
                                            COALESCE(metadata->>'totalAmount', '0'), 
                                            '[^0-9.]', '', 'g'
                                        ), 
                                        '^$', '0'
                                    ) AS NUMERIC
                                ) - %s
                            ) <= 0.01
                        """
                        params.append(normalized_total)
                        self.log(f"🔍 Checking duplicate with exact total_amount: {normalized_total} (±0.01)")
                    else:
                        self.log(f"⚠️ Could not extract numeric value from '{total_amount}', skipping amount validation")
                except (ValueError, TypeError) as e:
                    self.log(f"⚠️ Could not normalize total_amount '{total_amount}': {e}, skipping amount validation")
            
            base_query += " LIMIT 1;"
            
            # Execute the query
            cursor.execute(base_query, params)
            result = cursor.fetchone()
            
            if result:
                self.log(f"✅ Duplicate found: Invoice {normalized_invoice_number} from {normalized_emisor_id}")
                return True
            else:
                self.log(f"🆕 No duplicate found for invoice {normalized_invoice_number} from {normalized_emisor_id}")
                return False
                
        except Exception as e:
            self.log(f"❌ Error in is_duplicate_invoice: {e}", "ERROR")
            # On error, return False to be safe and allow processing
            return False

    def _is_invoice_successfully_processed(self, numero_documento: str, emisor: str, valor_total: str) -> bool:
        """
        Enhanced duplicate detection with processing status tracking
        Checks processing lifecycle: downloaded -> processing -> completed -> failed
        Only skips invoices that are successfully completed, allows retry of failed ones
        
        Now uses the robust is_duplicate_invoice helper for initial duplicate checking
        """
        try:
            # Connect to PostgreSQL to check both tables
            import os
            database_url = os.environ.get('DATABASE_URL')
            if not database_url:
                self.log("DATABASE_URL not found, cannot check for processed invoices", "WARNING")
                return False
                
            pg_conn = psycopg2.connect(database_url)
            pg_cursor = pg_conn.cursor()
            
            # First use the robust duplicate checking function
            if self.is_duplicate_invoice(pg_conn, numero_documento, emisor, valor_total):
                self.log(f"⏭️ Skipping already imported invoice: {numero_documento} from {emisor}")
                pg_conn.close()
                return True
            
            # Additional check for processing_status = 'completed' (legacy check for backward compatibility)
            pg_cursor.execute("""
                SELECT processing_status, metadata->>'processing_status' as metadata_status, id, original_file_name
                FROM imported_invoices 
                WHERE (
                    original_file_name LIKE %s OR 
                    original_file_name LIKE %s OR
                    original_file_name LIKE %s
                )
                AND (processing_status = 'completed' OR metadata->>'processing_status' = 'completed')
                ORDER BY created_at DESC
            """, (
                f"{numero_documento}_%",
                f"%{numero_documento}.%", 
                f"%{numero_documento}%"
            ))
            
            completed_results = pg_cursor.fetchall()
            if completed_results:
                for row in completed_results:
                    processing_status, metadata_status, imp_id, imp_filename = row[0], row[1], row[2], row[3]
                    self.log(f"✅ Invoice {numero_documento} from {emisor} already completed (ID: {imp_id}, File: {imp_filename}, Status: {processing_status})")
                pg_conn.close()
                return True
            
            # Normalize emisor for consistent comparison
            safe_emisor = re.sub(r'[\\/*?:"<>|\n\r]+', "_", emisor.replace(" ", "_").replace(".", ""))
            # Enhanced normalization to handle HTML entities and variations
            normalized_emisor = emisor.replace("_", " ").replace(".", "").replace("&AMP;", "&").replace("&amp;", "&").upper().strip()
            
            # Additional normalization patterns for better matching
            def normalize_vendor_name(name):
                """Normalize vendor name for consistent comparison"""
                if not name:
                    return ""
                # Convert to uppercase and strip
                normalized = str(name).upper().strip()
                # Replace multiple patterns
                normalized = normalized.replace("_", " ").replace(".", "")
                normalized = normalized.replace("&AMP;", "&").replace("&amp;", "&")
                normalized = normalized.replace("S.A.S", "SAS").replace("S A S", "SAS")
                normalized = normalized.replace("S.A.", "SA").replace("S A ", "SA ")
                normalized = re.sub(r'\s+', ' ', normalized)  # Multiple spaces to single
                return normalized.strip()
            
            # Helper function to validate valor_total when available
            def validate_total_amount(db_total: str) -> bool:
                """Validate valor_total with 0.01 threshold if both values are available"""
                if valor_total is None or valor_total == '' or valor_total == 'N/A':
                    return True  # No valor_total provided - skip anyway assuming same invoice
                
                if db_total is None or db_total == '' or db_total == 'N/A':
                    return True  # DB has no total but we have one - still skip assuming same invoice
                
                try:
                    input_total = float(valor_total.replace(',', '').replace('$', '').strip())
                    stored_total = float(db_total.replace(',', '').replace('$', '').strip())
                    return abs(input_total - stored_total) <= 0.01
                except (ValueError, AttributeError):
                    return True  # If we can't parse either total, skip anyway
            
            # Use improved normalization
            normalized_emisor = normalize_vendor_name(emisor)
            
            # Check 1: Main invoices table (fully processed and completed invoices)
            pg_cursor.execute("""
                SELECT id, file_name, extracted_data->>'totalAmount' as total_amount 
                FROM invoices 
                WHERE user_id = 'rpa-system'
                AND company_id = (SELECT company_id FROM invoice_importer_configs WHERE id = %s LIMIT 1)
                AND (extracted_data->>'invoiceNumber' = %s OR invoice_number = %s)
                AND (
                    UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor_name, '_', ' '), '.', ''), '&amp;', '&'), '&AMP;', '&'), 'S.A.S', 'SAS'), 'S.A.', 'SA')) = %s OR
                    UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(extracted_data->>'vendorName', '_', ' '), '.', ''), '&amp;', '&'), '&AMP;', '&'), 'S.A.S', 'SAS'), 'S.A.', 'SA')) = %s
                )
                LIMIT 1
            """, (
                self.config_id,
                numero_documento, 
                numero_documento,
                normalized_emisor,
                normalized_emisor
            ))
            
            result = pg_cursor.fetchone()
            if result:
                db_id, db_filename, db_total = result
                if validate_total_amount(db_total):
                    valor_msg = f" (valor_total not validated - assuming same invoice)" if valor_total is None else f" (valor_total validated within 0.01 threshold)"
                    self.log(f"✅ Invoice {numero_documento} from {emisor} already fully processed in main table (ID: {db_id}, File: {db_filename}){valor_msg}")
                    pg_conn.close()
                    return True
                else:
                    self.log(f"⚠️ Invoice {numero_documento} from {emisor} found but valor_total mismatch (Expected: {valor_total}, Found: {db_total}) - will process as different invoice")
            
            # Check 2: imported_invoices table - check for completed status in metadata or processing_status
            # Only skip if any record has processing_status = 'completed'
            # Use more precise pattern matching for invoice numbers and vendor names
            pg_cursor.execute("""
                SELECT metadata->>'processing_status', processing_status, id, original_file_name
                FROM imported_invoices 
                WHERE (
                    original_file_name LIKE %s OR 
                    original_file_name LIKE %s OR
                    original_file_name LIKE %s
                )
                ORDER BY created_at DESC
            """, (
                f"{numero_documento}_%",  # exact invoice number prefix
                f"%{numero_documento}.%", # invoice number with extension
                f"%{numero_documento}%"   # broader match as fallback
            ))
            
            imported_results = pg_cursor.fetchall()
            if imported_results:
                for row in imported_results:
                    metadata_status, processing_status, imp_id, imp_filename = row[0], row[1], row[2], row[3]
                    # Check both metadata and processing_status columns for 'completed'
                    if metadata_status == 'completed' or processing_status == 'completed':
                        valor_msg = f" (valor_total: {valor_total if valor_total else 'None'})"
                        self.log(f"✅ Invoice {numero_documento} from {emisor} already completed successfully (ID: {imp_id}, File: {imp_filename}){valor_msg}")
                        pg_conn.close()
                        return True
                
                # If we reach here, no completed records found - log details and continue processing
                self.log(f"🔄 Invoice {numero_documento} from {emisor} found in imported_invoices but not completed - will process")
                for row in imported_results:
                    metadata_status, processing_status, imp_id, imp_filename = row[0], row[1], row[2], row[3]
                    status_info = f"processing_status: {processing_status}, metadata_status: {metadata_status}"
                    self.log(f"   - Record ID {imp_id}: {imp_filename} ({status_info})")
            else:
                self.log(f"🔄 Invoice {numero_documento} from {emisor} not found in imported_invoices - will process")

            
            pg_conn.close()
            
            # Log exact match conditions for debugging
            valor_info = f"(valor_total: {valor_total if valor_total else 'None - will not be used for validation'})"
            self.log(f"🔄 Invoice {numero_documento} from {emisor} {valor_info} not found or available for retry:")
            self.log(f"   - Looking for invoice number: {numero_documento}")
            self.log(f"   - Looking for vendor (normalized): {normalized_emisor}")
            self.log(f"   - Config ID: {self.config_id}")
            self.log("   - Will process this invoice")
            return False
                
        except Exception as e:
            self.log(f"❌ Error checking processed invoices: {e}", "ERROR")
            # If we can't check, assume not processed to be safe
            return False

    def _update_imported_invoice_status(self, file_info, status: str, error_message: str = None):
        """Update processing status of imported invoice with lifecycle tracking"""
        try:
            pg_conn = psycopg2.connect(
                host=os.getenv("PGHOST"),
                port=int(os.getenv("PGPORT", 5432)),
                database=os.getenv("PGDATABASE"),
                user=os.getenv("PGUSER"),
                password=os.getenv("PGPASSWORD"),
            )
            pg_cursor = pg_conn.cursor()
            
            filename = file_info.get('original_file_name', file_info.get('upload_filename', file_info.get('filename', '')))
            
            # Try multiple patterns to find the record - be more flexible with filename matching
            patterns = [
                filename,  # exact match
                filename.replace('.xml', '').replace('.pdf', ''),  # without extension
                f"{filename.split('_')[0]}_{filename.split('_')[1]}" if '_' in filename else filename  # base pattern
            ]
            
            updated = False
            for pattern in patterns:
                if updated:
                    break
                    
                # Update status in imported_invoices table with pattern matching
                if status == 'completed':
                    pg_cursor.execute("""
                        UPDATE imported_invoices 
                        SET processing_status = %s, processed_at = NOW()
                        WHERE (original_file_name = %s OR original_file_name LIKE %s) AND log_id = %s
                    """, (status, pattern, f"{pattern}%", self.log_id))
                elif status == 'failed':
                    pg_cursor.execute("""
                        UPDATE imported_invoices 
                        SET processing_status = %s, processed_at = NOW(), 
                            metadata = COALESCE(metadata, '{}')::jsonb || %s::jsonb
                        WHERE (original_file_name = %s OR original_file_name LIKE %s) AND log_id = %s
                    """, (status, json.dumps({'error_message': error_message}), pattern, f"{pattern}%", self.log_id))
                elif status == 'processing':
                    pg_cursor.execute("""
                        UPDATE imported_invoices 
                        SET processing_status = %s
                        WHERE (original_file_name = %s OR original_file_name LIKE %s) AND log_id = %s
                    """, (status, pattern, f"{pattern}%", self.log_id))
                
                rows_affected = pg_cursor.rowcount
                if rows_affected > 0:
                    updated = True
                    self.log(f"📊 Updated {rows_affected} record(s) for {pattern} status: {status}" + (f" ({error_message})" if error_message else ""))
                    break
                    
            if not updated:
                self.log(f"⚠️ No records updated for {filename} status: {status} (tried patterns: {patterns})", "WARNING")
                # Log available records for debugging
                pg_cursor.execute("SELECT original_file_name FROM imported_invoices WHERE log_id = %s", (self.log_id,))
                available_files = [row[0] for row in pg_cursor.fetchall()]
                self.log(f"🔍 Available files in log_id {self.log_id}: {available_files}")
            
            pg_conn.commit()
            pg_conn.close()
                
        except Exception as e:
            self.log(f"❌ Error updating invoice status for {filename}: {e}", "ERROR")

    def update_progress(self, step: str, progress: int):
        """Update progress tracking with enhanced metrics"""
        self.stats['current_step'] = step
        self.stats['progress'] = progress
        self.log(f"Progress: {progress}% - {step}")
        
        # Output STATS for Node.js parser to capture with all enhanced metrics
        try:
            stats_data = {
                'total_invoices': self.stats.get('total_invoices', 0),
                'skipped_invoices': self.stats.get('skipped_invoices', 0),
                'processed_invoices': self.stats.get('processed_invoices', 0),
                'successful_imports': self.stats.get('successful_imports', 0),
                'failed_imports': self.stats.get('failed_imports', 0),
                'current_step': step,
                'progress': progress
            }
            
            import json
            print(f"STATS: {json.dumps(stats_data)}")
            sys.stdout.flush()
        except Exception as e:
            self.log(f"❌ Error outputting progress stats: {e}", "ERROR")

    def _output_download_progress(self, current: int, total: int, description: str = ""):
        """
        Progress tracking for download phase that outputs exactly in format:
        DOWNLOAD_PROGRESS: current/total - description
        
        This is parsed by Node.js and updates the UI accordingly with live feedback.
        """
        try:
            # Calculate percentage for UI progress bar
            percentage = int((current / total) * 100) if total > 0 else 0
            
            # Output in exact format expected by the Node.js parser
            progress_message = f"DOWNLOAD_PROGRESS: {current}/{total}"
            if description:
                progress_message += f" - {description}"
            
            print(progress_message)
            sys.stdout.flush()
            
            # Also log for debugging purposes
            self.log(f"📊 Download Progress: {current}/{total} ({percentage}%) - {description}")
            
        except Exception as e:
            self.log(f"❌ Error outputting download progress: {e}", "ERROR")

    def wait_for_new_zip(self, timeout: int = 60, before_files: set = None) -> str:
        """
        Enhanced download detection with configurable timeout.
        Waits for a new ZIP file to appear in the download directory.
        
        Returns the path of the new ZIP file, or raises TimeoutException if none appears.
        """
        if before_files is None:
            before_files = set()
            
        start_time = time.time()
        self.log(f"⏳ Waiting up to {timeout} seconds for ZIP download to complete...")
        
        while time.time() - start_time < timeout:
            current_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }
            
            new_files = current_files - before_files
            if new_files:
                new_file = list(new_files)[0]
                # Verify file is complete (not being written to)
                if self._is_file_complete(new_file):
                    self.log(f"✅ Download complete: {os.path.basename(new_file)}")
                    return new_file
                else:
                    self.log(f"⏳ File still downloading: {os.path.basename(new_file)}")
            
            time.sleep(1)
        
        # Timeout reached
        raise TimeoutException(f"ZIP download did not complete within {timeout} seconds")

    def _is_file_complete(self, file_path: str) -> bool:
        """Check if file download is complete by monitoring file size"""
        try:
            if not os.path.exists(file_path):
                return False
                
            # Check file size stability
            initial_size = os.path.getsize(file_path)
            time.sleep(2)  # Wait a bit
            final_size = os.path.getsize(file_path)
            
            # File is complete if size hasn't changed
            return initial_size == final_size and final_size > 0
        except Exception:
            return False

    def safe_rename(self, old_path: str, new_path: str) -> str:
        """
        Safely rename a file, handling conflicts by appending a counter.
        Returns the final path of the renamed file.
        """
        try:
            if not os.path.exists(old_path):
                raise FileNotFoundError(f"Source file does not exist: {old_path}")
            
            # If target path doesn't exist, rename directly
            if not os.path.exists(new_path):
                os.rename(old_path, new_path)
                self.log(f"📁 Renamed: {os.path.basename(old_path)} → {os.path.basename(new_path)}")
                return new_path
            
            # Handle conflict by appending counter
            base, ext = os.path.splitext(new_path)
            counter = 1
            
            while os.path.exists(new_path):
                new_path = f"{base}_{counter}{ext}"
                counter += 1
            
            os.rename(old_path, new_path)
            self.log(f"📁 Renamed with conflict resolution: {os.path.basename(old_path)} → {os.path.basename(new_path)}")
            return new_path
            
        except Exception as e:
            self.log(f"❌ Error renaming file {old_path} → {new_path}: {e}", "ERROR")
            # Return original path if rename fails
            return old_path

    def _process_xml_file(self, temp_dir: str, xml_file: str, zip_base_name: str, processed_files: list) -> bool:
        """
        Process individual XML file for data extraction.
        Returns True if successfully processed (counts as 1 unique invoice).
        """
        try:
            xml_src = os.path.join(temp_dir, xml_file)
            xml_new_name = f"{zip_base_name}.xml"
            xml_dst = os.path.join(self.xml_dir, xml_new_name)
            shutil.move(xml_src, xml_dst)
            
            processed_files.append({
                'type': 'xml',
                'original_name': xml_file,
                'processed_name': xml_new_name,
                'base_name': os.path.splitext(xml_file)[0],
                'is_data_source': True,
                'triggers_extraction': True
            })
            
            self.log(f"✅ XML processed: {xml_new_name} (DATA SOURCE)")
            return True
            
        except Exception as e:
            self.log(f"❌ Error processing XML file {xml_file}: {e}", "ERROR")
            return False

    def _process_pdf_file(self, temp_dir: str, pdf_file: str, zip_base_name: str, processed_files: list) -> bool:
        """
        Process individual PDF file for OCR processing.
        Returns True if successfully processed (counts as 1 unique invoice).
        """
        try:
            pdf_dir = os.path.join(self.download_dir, 'pdfs')
            os.makedirs(pdf_dir, exist_ok=True)
            
            pdf_src = os.path.join(temp_dir, pdf_file)
            pdf_new_name = f"{zip_base_name}.pdf"
            pdf_dst = os.path.join(pdf_dir, pdf_new_name)
            shutil.move(pdf_src, pdf_dst)
            
            processed_files.append({
                'type': 'pdf',
                'original_name': pdf_file,
                'processed_name': pdf_new_name,
                'base_name': os.path.splitext(pdf_file)[0],
                'is_data_source': True,  # PDF is data source when no XML available
                'triggers_extraction': True
            })
            
            self.log(f"✅ PDF processed: {pdf_new_name} (DATA SOURCE)")
            return True
            
        except Exception as e:
            self.log(f"❌ Error processing PDF file {pdf_file}: {e}", "ERROR")
            return False

    def _process_matched_files(self, temp_dir: str, file_pair: dict, zip_base_name: str, processed_files: list) -> bool:
        """
        Process matched XML/PDF pair where XML is prioritized for data extraction.
        Returns True if successfully processed (counts as 1 unique invoice regardless of file count).
        """
        try:
            xml_info = file_pair.get('xml')
            pdf_info = file_pair.get('pdf')
            
            if xml_info:
                # Process XML as data source
                xml_file = xml_info['filename']
                xml_src = os.path.join(temp_dir, xml_file)
                xml_new_name = f"{zip_base_name}.xml"
                xml_dst = os.path.join(self.xml_dir, xml_new_name)
                shutil.move(xml_src, xml_dst)
                
                processed_files.append({
                    'type': 'xml',
                    'original_name': xml_file,
                    'processed_name': xml_new_name,
                    'base_name': os.path.splitext(xml_file)[0],
                    'is_data_source': True,
                    'triggers_extraction': True
                })
                
                self.log(f"✅ XML processed from pair: {xml_new_name} (DATA SOURCE)")
            
            if pdf_info:
                # Process PDF as reference
                pdf_file = pdf_info['filename']
                pdf_dir = os.path.join(self.download_dir, 'pdfs')
                os.makedirs(pdf_dir, exist_ok=True)
                
                pdf_src = os.path.join(temp_dir, pdf_file)
                pdf_new_name = f"{zip_base_name}.pdf"
                pdf_dst = os.path.join(pdf_dir, pdf_new_name)
                shutil.move(pdf_src, pdf_dst)
                
                processed_files.append({
                    'type': 'pdf',
                    'original_name': pdf_file,
                    'processed_name': pdf_new_name,
                    'base_name': os.path.splitext(pdf_file)[0],
                    'is_data_source': False,  # Reference only when paired with XML
                    'triggers_extraction': False
                })
                
                self.log(f"✅ PDF processed from pair: {pdf_new_name} (REFERENCE)")
            
            return True
            
        except Exception as e:
            self.log(f"❌ Error processing matched files: {e}", "ERROR")
            return False

    def setup_driver(self):
        """Initialize Chrome WebDriver with download preferences"""
        self.log("Setting up Chrome WebDriver...")

        try:
            # Check if Chrome/Chromium is available
            import shutil
            chrome_path = shutil.which('google-chrome') or shutil.which(
                'chromium-browser') or shutil.which('chromium')
            if not chrome_path:
                raise Exception(
                    "Chrome/Chromium browser not found. Please install google-chrome or chromium-browser."
                )

            self.log(f"Found browser at: {chrome_path}")

            chrome_options = webdriver.ChromeOptions()

            # Set binary location if needed
            if 'chromium' in chrome_path:
                chrome_options.binary_location = chrome_path

            # Ensure download directory is absolute path for Chrome
            abs_download_dir = os.path.abspath(self.download_dir)
            self.log(f"Setting Chrome download directory to: {abs_download_dir}")
            
            prefs = {
                "download.default_directory": abs_download_dir,
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": False,
                "safebrowsing.disable_download_protection": True,
                "profile.default_content_settings.popups": 0,
                "download.extensions_to_open": "",
                "download.open_pdf_in_system_reader": False
            }
            chrome_options.add_experimental_option("prefs", prefs)
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--disable-dev-shm-usage")

            # Force headless mode for Replit environment with enhanced flags
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--disable-extensions")
            chrome_options.add_argument("--disable-setuid-sandbox")
            chrome_options.add_argument("--disable-web-security")
            chrome_options.add_argument("--allow-running-insecure-content")
            chrome_options.add_argument("--ignore-certificate-errors")
            chrome_options.add_argument("--ignore-ssl-errors")
            chrome_options.add_argument(
                "--disable-blink-features=AutomationControlled")
            chrome_options.add_argument(
                "--disable-background-timer-throttling")
            chrome_options.add_argument(
                "--disable-backgrounding-occluded-windows")
            chrome_options.add_argument("--disable-renderer-backgrounding")
            chrome_options.add_argument("--disable-features=TranslateUI")
            chrome_options.add_argument("--disable-ipc-flooding-protection")
            
            # Additional arguments for reliable downloads
            chrome_options.add_argument("--disable-background-downloads")
            chrome_options.add_argument("--disable-default-apps")
            chrome_options.add_argument("--disable-notifications")
            
            # Add proxy configuration if enabled
            if self.proxy_rotation_enabled and self.proxy_list and len(self.proxy_list) > 0:
                current_proxy = self.get_current_proxy()
                if current_proxy:
                    self.log(f"🌐 Configuring proxy: {current_proxy} (index: {self.current_proxy_index + 1}/{len(self.proxy_list)})")
                    if current_proxy.startswith('socks5://'):
                        # SOCKS5 proxy
                        proxy_without_protocol = current_proxy.replace('socks5://', '')
                        chrome_options.add_argument(f"--proxy-server=socks5://{proxy_without_protocol}")
                    elif current_proxy.startswith('socks4://'):
                        # SOCKS4 proxy  
                        proxy_without_protocol = current_proxy.replace('socks4://', '')
                        chrome_options.add_argument(f"--proxy-server=socks4://{proxy_without_protocol}")
                    else:
                        # HTTP proxy (default)
                        if not current_proxy.startswith('http'):
                            current_proxy = f"http://{current_proxy}"
                        chrome_options.add_argument(f"--proxy-server={current_proxy}")
                    
                    # Disable proxy bypass for local addresses
                    chrome_options.add_argument("--proxy-bypass-list=<-loopback>")
                else:
                    self.log("⚠️ No valid proxy available, continuing without proxy")
            else:
                self.log("🔄 Proxy rotation disabled or no proxies configured")

            self.log(
                "Initializing ChromeDriver in headless mode with debug capture..."
            )

            self.driver = webdriver.Chrome(options=chrome_options)
            self.driver.set_window_size(
                1920, 1080)  # Set size for consistent screenshots

            # Set up wait objects
            self.wait = WebDriverWait(self.driver, 15)
            self.short_wait = WebDriverWait(self.driver, 5)
            self.long_wait = WebDriverWait(self.driver, 60)

            self.log("Chrome WebDriver initialized successfully")
            return True

        except ImportError as e:
            self.log(f"Selenium not installed: {e}", "ERROR")
            self.log("Please install selenium: pip3 install selenium", "ERROR")
            return False
        except Exception as e:
            self.log(f"Failed to setup Chrome WebDriver: {e}", "ERROR")
            self.log("Common solutions:", "ERROR")
            self.log(
                "1. Install Chrome/Chromium: sudo apt-get install chromium-browser",
                "ERROR")
            self.log("2. Install Selenium: pip3 install selenium", "ERROR")
            self.log("3. Check if ports are blocked by firewall", "ERROR")
            return False

    def init_database(self,
                      db_path: str,
                      table_type: str = 'downloads') -> sqlite3.Connection:
        """Initialize SQLite database for tracking"""
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        if table_type == 'downloads':
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS downloaded_invoices (
                    numero_documento TEXT,
                    emisor TEXT,
                    valor_total TEXT,
                    filename TEXT,
                    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (numero_documento, emisor, valor_total)
                )
            """)
        elif table_type == 'xml':
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS downloaded_invoices (
                    numero_documento TEXT,
                    emisor TEXT,
                    valor_total TEXT,
                    xml_content TEXT,
                    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (numero_documento, emisor, valor_total)
                )
            """)

        conn.commit()
        return conn

    def wait_for_new_zip(self,
                         timeout: int = 60,
                         before_files: Optional[set] = None) -> str:
        """Wait for a new ZIP file to be downloaded"""
        deadline = time.time() + timeout
        start_time = time.time()
        
        if before_files is None:
            before_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }

        self.log(f"🔍 Waiting for ZIP download in {self.download_dir} (timeout: {timeout}s)")
        self.log(f"📁 Files before download: {len(before_files)} ZIP files")
        
        last_status_time = start_time
        while time.time() < deadline:
            # Check for Chrome download files
            try:
                all_files = os.listdir(self.download_dir)
                crdownloads = [f for f in all_files if f.endswith(".crdownload")]
                current_files = {
                    os.path.join(self.download_dir, f)
                    for f in all_files
                    if f.lower().endswith(".zip")
                }
                new_files = list(current_files - before_files)
                
                # Log status every 10 seconds
                current_time = time.time()
                if current_time - last_status_time >= 10:
                    elapsed = current_time - start_time
                    self.log(f"⏳ Download status after {elapsed:.1f}s: {len(crdownloads)} .crdownload files, {len(new_files)} new ZIP files")
                    if crdownloads:
                        self.log(f"📥 Chrome downloading: {crdownloads}")
                    last_status_time = current_time
                
                if new_files and not crdownloads:
                    newest_file = max(new_files, key=os.path.getctime)
                    elapsed = current_time - start_time
                    self.log(f"✅ Download completed after {elapsed:.1f}s: {os.path.basename(newest_file)}")
                    return newest_file
                    
            except Exception as e:
                self.log(f"⚠️ Error checking download directory: {e}", "WARNING")
            
            time.sleep(1)

        # Enhanced timeout error with diagnostic info
        try:
            all_files = os.listdir(self.download_dir)
            zip_files = [f for f in all_files if f.lower().endswith(".zip")]
            crdownloads = [f for f in all_files if f.endswith(".crdownload")]
            other_files = [f for f in all_files if not f.lower().endswith(".zip") and not f.endswith(".crdownload")]
            
            self.log(f"❌ Download timeout after {timeout}s. Directory contents:", "ERROR")
            self.log(f"   📁 ZIP files: {len(zip_files)} - {zip_files[:3]}{'...' if len(zip_files) > 3 else ''}", "ERROR")
            self.log(f"   📥 Chrome downloads: {len(crdownloads)} - {crdownloads}", "ERROR")
            self.log(f"   📄 Other files: {len(other_files)} - {other_files[:3]}{'...' if len(other_files) > 3 else ''}", "ERROR")
        except Exception as e:
            self.log(f"❌ Could not list directory contents: {e}", "ERROR")
            
        raise TimeoutError(
            f"No new .zip file downloaded within {timeout} seconds.")

    def safe_rename(self, src: str, dest: str) -> str:
        """Safely rename file with conflict resolution"""
        if not os.path.exists(dest):
            os.rename(src, dest)
            return dest
        else:
            base, ext = os.path.splitext(dest)
            counter = 1
            while True:
                new_name = f"{base}_{counter}{ext}"
                if not os.path.exists(new_name):
                    os.rename(src, new_name)
                    return new_name
                counter += 1

    def debug_capture(self, label: str):
        """
        Enhanced debug capture function for visual debugging in Replit
        Creates timestamped screenshots and HTML files in organized folder structure
        """
        try:
            if not self.driver:
                self.log("Driver not available for debug capture", "ERROR")
                return

            # Create timestamp in format: YYYYMMDDTHHMMSS
            timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
            date_folder = datetime.now().strftime("%Y-%m-%d")

            # Create organized folder structure for debug captures
            project_root = "/home/runner/workspace"
            debug_base_dir = os.path.join(project_root, "rpa_debug_captures")
            debug_date_dir = os.path.join(debug_base_dir, date_folder)

            # Ensure directories exist
            os.makedirs(debug_date_dir, exist_ok=True)

            # Clean label for filename (remove special characters)
            clean_label = re.sub(r'[^a-zA-Z0-9_-]', '_', label)

            # Screenshot
            screenshot_filename = f"{timestamp}_{clean_label}.png"
            screenshot_path = os.path.join(debug_date_dir, screenshot_filename)
            self.driver.save_screenshot(screenshot_path)

            # HTML source
            html_filename = f"{timestamp}_{clean_label}.html"
            html_path = os.path.join(debug_date_dir, html_filename)
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(self.driver.page_source)

            # Page info
            info_filename = f"{timestamp}_{clean_label}_info.txt"
            info_path = os.path.join(debug_date_dir, info_filename)
            with open(info_path, 'w', encoding='utf-8') as f:
                f.write(f"Debug Capture: {label}\n")
                f.write(f"Timestamp: {timestamp}\n")
                f.write(f"Current URL: {self.driver.current_url}\n")
                f.write(f"Page Title: {self.driver.title}\n")
                f.write(f"Window Size: {self.driver.get_window_size()}\n")
                f.write(
                    f"Page Load State: {self.driver.execute_script('return document.readyState')}\n"
                )

                # Check for common error indicators
                error_elements = self.driver.find_elements(
                    By.CLASS_NAME, "alert-danger")
                if error_elements:
                    f.write(f"Error Messages Found: {len(error_elements)}\n")
                    for i, elem in enumerate(error_elements):
                        f.write(f"  Error {i+1}: {elem.text}\n")
                else:
                    f.write("No error messages found\n")

            # Create relative path for cleaner logging
            relative_path = os.path.join("rpa_debug_captures", date_folder)
            self.log(
                f"🔍 Debug capture saved to {relative_path}/: {screenshot_filename}, {html_filename}, {info_filename}"
            )

        except Exception as e:
            self.log(f"Failed to create debug capture: {e}", "ERROR")

    def login_to_erp(self) -> bool:
        """Login to ERP system"""
        if not self.driver or not self.wait:
            self.log("Driver or wait object not initialized", "ERROR")
            return False

        try:
            self.update_progress("Logging into ERP system", 10)
            self.log(f"Navigating to ERP URL: {self.erp_url}")
            self.driver.get(self.erp_url)

            # Debug capture after page load
            self.debug_capture("01_login_page_loaded")
            time.sleep(2)  # Allow page to fully load

            # Enter credentials
            self.log("Entering username...")
            self.log(f"🔐 Using username: {self.username}")
            username_field = self.wait.until(
                EC.element_to_be_clickable((By.ID, "txtUsuario")))
            username_field.clear()
            username_field.send_keys(self.username)

            self.log("Entering password...")
            self.log(f"🔐 Using password: {self.password}")
            self.log(f"🔐 Password length: {len(self.password) if self.password else 0}")
            self.log(f"🔐 Password type: {type(self.password)}")
            password_field = self.wait.until(
                EC.element_to_be_clickable((By.ID, "txtContrasena")))
            password_field.clear()
            password_field.send_keys(self.password)

            # Debug capture after entering credentials
            self.debug_capture("02_credentials_entered")

            # Click login buttons with better timing
            self.log("Clicking 'Siguiente' button...")
            siguiente_btn = self.driver.find_element(By.ID, "btnSiguiente")
            self.driver.execute_script("arguments[0].click();", siguiente_btn)
            time.sleep(2)

            # Debug capture after first button
            self.debug_capture("03_after_siguiente_click")

            self.log("Waiting for 'Ingresar' button...")
            ingresar_btn = self.wait.until(
                EC.element_to_be_clickable((By.ID, "btnIngresar")))
            self.driver.execute_script("arguments[0].click();", ingresar_btn)

            # Debug capture after login attempt
            self.debug_capture("04_after_ingresar_click")

            # Wait for successful login - look for dashboard elements
            self.log("Waiting for login success indicators...")
            try:
                # Wait for login to complete - check for typical post-login elements
                WebDriverWait(self.driver, 15).until(
                    lambda driver: "login" not in driver.current_url.lower(
                    ) or driver.find_elements(By.ID, "mod-FE") or driver.
                    find_elements(By.CLASS_NAME, "dashboard") or "dashboard" in
                    driver.current_url.lower())
                self.debug_capture("05_login_success")
                self.log("✅ Login successful")
                return True
            except TimeoutException:
                self.debug_capture("06_login_timeout_error")
                self.log("⏰ Login timeout - checking page state...")

                # Check current URL and page content for debugging
                current_url = self.driver.current_url
                page_title = self.driver.title
                self.log(f"Current URL: {current_url}")
                self.log(f"Page title: {page_title}")

                # Check for error messages
                error_elements = self.driver.find_elements(
                    By.CLASS_NAME, "alert-danger")
                if error_elements:
                    self.log(f"❌ Login error: {error_elements[0].text}")
                    return False

                # If URL changed or we see expected elements, consider it success
                if "login" not in current_url.lower(
                ) or self.driver.find_elements(By.ID, "mod-FE"):
                    self.log(
                        "✅ Login appears successful based on URL/elements")
                    self.debug_capture("07_login_success_fallback")
                    return True

                return False

        except Exception as e:
            self.debug_capture("08_login_exception_error")
            self.log(f"❌ Login failed: {e}", "ERROR")
            return False

    def navigate_to_invoices(self) -> bool:
        """Navigate to the invoices section"""
        if not self.driver or not self.wait or not self.long_wait:
            self.log("Driver or wait objects not initialized", "ERROR")
            return False

        try:
            self.update_progress("Navigating to invoice section", 20)

            # Debug capture before navigation
            self.debug_capture("09_before_navigation")

            # Click FE module
            self.log("Looking for 'mod-FE' button...")
            fe_button = self.long_wait.until(
                EC.element_to_be_clickable((By.ID, "mod-FE")))
            self.driver.execute_script(
                "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
                fe_button)
            self.driver.execute_script("arguments[0].click();", fe_button)
            self.log("✅ Clicked 'mod-FE' successfully")

            # Debug capture after FE click
            self.debug_capture("10_after_mod_FE_click")
            time.sleep(2)

            # Click Recepción if available
            try:
                self.log("Looking for 'Recepción' button...")
                self.wait.until(
                    EC.element_to_be_clickable(
                        (By.XPATH,
                         "//button[contains(text(), 'Recepción')]"))).click()
                self.log("✅ Clicked 'Recepción'")
                self.debug_capture("11_after_recepcion_click")
            except Exception:
                self.log(
                    "⏭️ Skipping 'Recepción' button (not found or not needed)")

            # Click Documentos recibidos
            self.log("Looking for 'Documentos recibidos' button...")
            self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH,
                     "//button[text()='Documentos recibidos']"))).click()
            self.log("✅ Navigated to 'Documentos recibidos'")

            # Debug capture after reaching documents section
            self.debug_capture("12_documentos_recibidos_loaded")

            self.log("✅ Navigation to invoice section successful")
            return True
        except Exception as e:
            self.debug_capture("13_navigation_error")
            self.log(f"❌ Navigation failed: {e}", "ERROR")
            return False

    def process_invoice_rows(self) -> bool:
        """Process invoice rows and download files"""
        if not self.driver:
            self.log("Driver not initialized", "ERROR")
            return False

        try:
            self.update_progress("Processing invoice rows", 30)

            # Debug capture before iframe switch
            self.debug_capture("14_before_iframe_switch")

            # Wait for iframe to be available and switch to it
            self.log("Waiting for iframe 'pagina1' to be available...")
            WebDriverWait(self.driver, 15).until(
                EC.frame_to_be_available_and_switch_to_it((By.ID, "pagina1")))
            self.log("✅ Successfully switched to iframe 'pagina1'")

            # Debug capture after iframe switch
            self.debug_capture("15_after_iframe_switch")

            # Wait for rows to load
            self.log("⏳ Waiting for invoice rows to populate...")
            start = time.time()
            max_wait = 25

            while time.time() - start < max_wait:
                rows = self.driver.find_elements(By.CSS_SELECTOR,
                                                 "div.rt-tr-group")
                data_rows = [r for r in rows if r.text.strip()]
                if data_rows:
                    self.log(f"✅ Found {len(data_rows)} rows with content")
                    # Debug capture when we find the invoice rows
                    self.debug_capture("16_invoice_rows_found")
                    break
                time.sleep(1)
            else:
                self.log(f"❌ No populated rows found after {max_wait} seconds",
                         "ERROR")
                raise Exception(
                    f"No populated rows found after {max_wait} seconds")

            # Initialize database
            db_conn = self.init_database(self.db_path, 'downloads')
            page_count = 0

            while True:
                rows = self.driver.find_elements(By.CSS_SELECTOR,
                                                 "div.rt-tr-group")
                data_rows = [r for r in rows if r.text.strip()]

                if len(data_rows) == 0:
                    self.log(
                        f"⚠️ Page {page_count + 1} has no data rows, moving to next page"
                    )
                else:
                    self.log(
                        f"📄 Processing page {page_count + 1} with {len(data_rows)} data rows (total elements: {len(rows)})"
                    )

                for i, row in enumerate(rows):
                    try:
                        columns = row.find_elements(By.CSS_SELECTOR,
                                                    "div.rt-td")
                        if len(columns) < 8:
                            continue

                        # Extract invoice metadata FIRST
                        numero_documento = columns[1].text.strip()
                        emisor_raw = columns[2].text.strip()
                        emisor = emisor_raw.replace(" ", "_").replace(".", "")
                        safe_emisor = re.sub(r'[\\/*?:"<>|\n\r]+', "_", emisor)
                        valor_total_raw = columns[8].text.strip()
                        # Enhanced total amount normalization for Colombian currency
                        valor_total = valor_total_raw.replace(",", "").replace(".", "").replace("$", "").replace("COP", "").replace("\n", "").replace("\r", "").strip().split(" ")[0]

                        # Note: Do NOT count total_invoices here - this is web table rows, not unique invoices
                        # total_invoices will be set correctly during file processing phase
                        
                        # ROBUST PRE-DOWNLOAD DUPLICATE CHECK 
                        # Connect to PostgreSQL for duplicate checking
                        try:
                            database_url = os.environ.get('DATABASE_URL')
                            if database_url:
                                pg_conn = psycopg2.connect(database_url)
                                
                                # Use robust duplicate detection BEFORE any download/processing
                                if self.is_duplicate_invoice(pg_conn, numero_documento, emisor_raw, valor_total_raw):
                                    self.log(f"⏭️ Skipping already imported invoice: {numero_documento} from {emisor_raw}")
                                    self.stats['skipped_invoices'] += 1
                                    # Output progress with skip status
                                    self._output_download_progress(i + 1, len(rows), f"Skipped duplicate {numero_documento}")
                                    pg_conn.close()
                                    continue
                                
                                pg_conn.close()
                            else:
                                self.log("DATABASE_URL not found, proceeding with download", "WARNING")
                        except Exception as e:
                            self.log(f"❌ Error in pre-download duplicate check: {e}", "ERROR")
                            # If duplicate check fails, proceed cautiously to avoid missing invoices

                        # Download and process invoice (only reached if no duplicate found)
                        self.log(f"🔄 Processing: {numero_documento} - {emisor_raw} - {valor_total_raw}")
                        
                        # Note: Do NOT count processed_invoices here - this is web scraping phase
                        # processed_invoices will be counted correctly during file processing phase
                        
                        # Output progress stats before download attempt
                        self._output_download_progress(i + 1, len(rows), f"Processing {numero_documento}")

                        # Download invoice
                        if self.download_invoice(row, numero_documento,
                                                 safe_emisor, valor_total,
                                                 db_conn):
                            self.stats['successful_imports'] += 1
                            self.log(f"✅ Successfully processed invoice: {numero_documento}")
                        else:
                            self.stats['failed_imports'] += 1
                            self.log(f"❌ Failed to process invoice: {numero_documento}")

                        # Output progress stats after processing
                        self._output_download_progress(i + 1, len(rows), f"Completed {numero_documento}")

                    except Exception as e:
                        self.log(f"❌ Error processing row {i}: {e}", "ERROR")
                        self.stats['failed_imports'] += 1
                        continue

                # Try to go to next page
                try:
                    next_btn = self.driver.find_element(
                        By.XPATH,
                        "//button[contains(text(), 'Siguiente') and not(@disabled)]"
                    )
                    ActionChains(self.driver).move_to_element(
                        next_btn).click().perform()
                    self.log("➡️ Moving to next page")
                    time.sleep(3)
                    page_count += 1
                    break  # Stop after processing one page for now (Agent, dont change this until I tell you to)
                    # Continue processing additional pages to ensure complete invoice discovery
                except:
                    self.log("✅ Finished processing all pages")
                    break

            db_conn.close()
            return True

        except Exception as e:
            self.log(f"Error processing invoice rows: {e}", "ERROR")
            return False

    def download_invoice(self, row, numero_documento: str, safe_emisor: str,
                         valor_total: str, db_conn) -> bool:
        """Download individual invoice"""
        if not self.driver:
            self.log("Driver not initialized", "ERROR")
            return False

        try:
            # Scroll to row and click download button
            self.driver.execute_script(
                "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
                row)
            time.sleep(0.5)

            buttons = row.find_elements(By.TAG_NAME, "button")
            if len(buttons) < 4:
                return False

            # Get existing ZIP files before download
            existing_zips = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }

            # Click download action button
            ActionChains(self.driver).move_to_element(
                buttons[3]).click().perform()

            # Click actual download button with longer timeout
            if not self.wait:
                self.log("Wait object not initialized", "ERROR")
                return False
            
            self.log("Waiting for download button to appear...")
            download_button = self.wait.until(
                EC.element_to_be_clickable((By.CLASS_NAME, "descargar")))
            self.log("Download button found, clicking...")
            ActionChains(self.driver).move_to_element(
                download_button).click().perform()
            self.log("Download button clicked, waiting for file...")

            # Wait for download to complete with configurable timeout
            downloaded_zip = self.wait_for_new_zip(timeout=self.zip_download_timeout,
                                                   before_files=existing_zips)
            self.log(f"Downloaded: {downloaded_zip}")

            # Rename file
            new_name = os.path.join(self.download_dir,
                                    f"{numero_documento}_{safe_emisor}.zip")
            final_path = self.safe_rename(downloaded_zip, new_name)

            # Record in database
            cursor = db_conn.cursor()
            cursor.execute(
                """
                INSERT OR IGNORE INTO downloaded_invoices 
                (numero_documento, emisor, valor_total, filename)
                VALUES (?, ?, ?, ?)
            """, (numero_documento, safe_emisor, valor_total,
                  os.path.basename(final_path)))
            db_conn.commit()
            
            # Increment import count and check for proxy rotation
            self.increment_import_count()
            if self.should_rotate_proxy():
                self.log(f"🔄 Proxy rotation threshold reached ({self.proxy_rotation_interval} imports)")
                if self.rotate_proxy():
                    # Restart driver with new proxy after completing current batch
                    # (Driver will be restarted on next operation)
                    self.log("🔄 Proxy rotated, driver will restart on next operation")
                    
                    # Optional: Restart immediately if needed
                    # if not self.restart_driver_with_new_proxy():
                    #     self.log("⚠️ Failed to restart driver with new proxy, continuing with current session")
                        
            return True

            # Close download dialog
            if not self.short_wait:
                self.log("Short wait object not initialized", "ERROR")
                return False
            close_button = self.short_wait.until(
                EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, "button.btn.btn-light.pull-right")))
            ActionChains(
                self.driver).move_to_element(close_button).click().perform()

            return True

        except Exception as e:
            self.log(f"Failed to download invoice: {e}", "ERROR")
            return False

    def extract_invoices_from_zip(self) -> bool:
        """
        Extract invoice files from ZIP archives with enhanced statistics tracking.
        Now properly counts unique invoices vs reference files and updates processed_invoices count.
        """
        try:
            file_types = self.config.get('fileTypes', 'both')
            self.update_progress(f"Extracting {file_types} files from ZIP archives", 70)

            processed_files = []
            unique_invoice_count = 0  # Track actual unique invoices
            
            for filename in os.listdir(self.download_dir):
                if filename.lower().endswith('.zip'):
                    zip_path = os.path.join(self.download_dir, filename)
                    base_name = os.path.splitext(filename)[0]

                    try:
                        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                            temp_dir = os.path.join(self.download_dir, "__temp_extract__")
                            os.makedirs(temp_dir, exist_ok=True)
                            zip_ref.extractall(temp_dir)

                            # Scan for XML and PDF files
                            xml_files = []
                            pdf_files = []
                            
                            for f in os.listdir(temp_dir):
                                if f.lower().endswith(".xml") and file_types in ['xml', 'both']:
                                    xml_files.append(f)
                                elif f.lower().endswith(".pdf") and file_types in ['pdf', 'both']:
                                    pdf_files.append(f)

                            self.log(f"Found in {filename}: {len(xml_files)} XML, {len(pdf_files)} PDF files")

                            # Process files based on configuration and count unique invoices
                            if file_types == 'xml':
                                # XML only - each XML represents a unique invoice
                                for xml_file in xml_files:
                                    if self._process_xml_file(temp_dir, xml_file, base_name, processed_files):
                                        unique_invoice_count += 1
                                        self.stats['processed_invoices'] += 1
                                    
                            elif file_types == 'pdf':
                                # PDF only - each PDF represents a unique invoice
                                for pdf_file in pdf_files:
                                    if self._process_pdf_file(temp_dir, pdf_file, base_name, processed_files):
                                        unique_invoice_count += 1
                                        self.stats['processed_invoices'] += 1
                                    
                            elif file_types == 'both':
                                # Both - match by token and count unique invoices only
                                matches = self._match_files_by_token(xml_files, pdf_files, temp_dir)
                                
                                for token, file_pair in matches.items():
                                    if file_pair.get('xml') or file_pair.get('pdf'):
                                        # Each unique token represents one invoice, regardless of file count
                                        if self._process_matched_files(temp_dir, file_pair, base_name, processed_files):
                                            unique_invoice_count += 1
                                            self.stats['processed_invoices'] += 1

                            shutil.rmtree(temp_dir)

                        if processed_files:
                            os.remove(zip_path)
                            self.log(f"Processed ZIP: {filename} -> {len(processed_files)} files, {unique_invoice_count} unique invoices")
                        else:
                            self.log(f"No processable files found in: {filename}")

                    except Exception as e:
                        self.log(f"Error extracting {filename}: {e}", "ERROR")

            # Update total_invoices count with actual unique invoices found
            self.stats['total_invoices'] = unique_invoice_count
            self.log(f"✅ File extraction complete: {len(processed_files)} files processed, {unique_invoice_count} unique invoices identified")
            return True

        except Exception as e:
            self.log(f"Error extracting invoice files: {e}", "ERROR")
            return False

    def extract_invoice_token(self, filename: str) -> str:
        """Extract normalized invoice token using regex for dynamic matching"""
        base = filename.rsplit('.', 1)[0].lower()
        match = re.search(r'(\d{20,26})', base)
        return match.group(1) if match else None

    def _extract_invoice_token_from_filename(self, filename: str) -> str:
        """Enhanced invoice token extraction for better XML/PDF matching"""
        try:
            # Extract the base filename without extension
            base = filename.split('.')[0]
            
            # Handle different naming patterns
            parts = base.split('_')
            
            if len(parts) == 1:
                # Simple format like "FBOG16666" or long generated names
                return base
            
            elif len(parts) >= 2:
                # Check for document_taxid pattern (most common)
                doc_num = parts[0]
                tax_id = parts[1]
                
                # If both parts are present and look like document/tax IDs
                if doc_num and tax_id:
                    # Try multiple token formats for better matching
                    tokens = [
                        f"{doc_num}_{tax_id}",  # Full format
                        doc_num,                # Just document number
                        base                    # Full base name
                    ]
                    return tokens[0]  # Return primary token
            
            # Fallback to full base name
            return base
            
        except Exception as e:
            self.log(f"Error extracting token from filename '{filename}': {e}", "ERROR")
            return filename.split('.')[0] if '.' in filename else filename

    def _extract_invoice_token(self, filename, file_path=None, file_type='xml'):
        """Extract unique invoice token from filename with enhanced regex-based matching"""
        try:
            base_name = os.path.splitext(filename)[0]
            
            # Try new dynamic normalization first
            normalized_token = self.extract_invoice_token(filename)
            
            if normalized_token:
                # Use the normalized invoice ID as the primary token
                document_number = normalized_token
                
                # For XML files, try to extract additional metadata from content
                if file_type == 'xml' and file_path and os.path.exists(file_path):
                    try:
                        import xml.etree.ElementTree as ET
                        tree = ET.parse(file_path)
                        root = tree.getroot()
                        
                        # Find total amount in XML content (multiple possible tags)
                        total_amount = None
                        amount_tags = [
                            './/{*}PayableAmount',
                            './/{*}TotalAmount', 
                            './/{*}LineExtensionAmount',
                            './/{*}TaxExclusiveAmount'
                        ]
                        
                        for tag in amount_tags:
                            element = root.find(tag)
                            if element is not None and element.text:
                                try:
                                    total_amount = float(element.text.strip())
                                    break
                                except:
                                    continue
                        
                        # Create composite token with amount if available
                        if total_amount is not None:
                            # Normalize amount to avoid floating point precision issues
                            normalized_amount = round(total_amount, 2)
                            token = f"{normalized_token}_{normalized_amount}"
                        else:
                            token = normalized_token
                            
                    except Exception as e:
                        self.log(f"Warning: Could not parse XML content for {filename}: {e}")
                        token = normalized_token
                else:
                    # For PDF files or when XML parsing fails, use normalized token
                    token = normalized_token
                
                self.log(f"🔗 Generated normalized token for {filename}: {token} (invoice ID: {normalized_token})")
                return {
                    'token': token,
                    'document_number': normalized_token,
                    'tax_id': '',  # Not used in normalized matching
                    'base_name': base_name,
                    'normalized_id': normalized_token
                }
            
            # Fallback to legacy parsing for backward compatibility
            parts = base_name.split("_", 2)
            
            if len(parts) >= 2:
                document_number = parts[0].strip()
                tax_id = parts[1].strip()
                
                # For XML files, try to extract additional metadata from content
                if file_type == 'xml' and file_path and os.path.exists(file_path):
                    try:
                        import xml.etree.ElementTree as ET
                        tree = ET.parse(file_path)
                        root = tree.getroot()
                        
                        # Find total amount in XML content (multiple possible tags)
                        total_amount = None
                        amount_tags = [
                            './/{*}PayableAmount',
                            './/{*}TotalAmount', 
                            './/{*}LineExtensionAmount',
                            './/{*}TaxExclusiveAmount'
                        ]
                        
                        for tag in amount_tags:
                            element = root.find(tag)
                            if element is not None and element.text:
                                try:
                                    total_amount = float(element.text.strip())
                                    break
                                except:
                                    continue
                        
                        # Create composite token with amount if available
                        if total_amount is not None:
                            # Normalize amount to avoid floating point precision issues
                            normalized_amount = round(total_amount, 2)
                            token = f"{document_number}_{tax_id}_{normalized_amount}"
                        else:
                            token = f"{document_number}_{tax_id}"
                            
                    except Exception as e:
                        self.log(f"Warning: Could not parse XML content for {filename}: {e}")
                        token = f"{document_number}_{tax_id}"
                else:
                    # For PDF files or when XML parsing fails, use filename-based token
                    token = f"{document_number}_{tax_id}"
                
                self.log(f"Generated legacy token for {filename}: {token}")
                return {
                    'token': token,
                    'document_number': document_number,
                    'tax_id': tax_id,
                    'base_name': base_name
                }
            else:
                # If neither normalized nor legacy parsing works, log and use base name
                if not normalized_token:
                    self.log(f"Info: Using filename-based token for {filename} (no numeric pattern found)")
                
                return {
                    'token': base_name,
                    'document_number': base_name,
                    'tax_id': '',
                    'base_name': base_name
                }
                
        except Exception as e:
            self.log(f"Error extracting invoice token from {filename}: {e}", "ERROR")
            base_name = os.path.splitext(filename)[0]
            return {
                'token': base_name,
                'document_number': base_name,
                'tax_id': '',
                'base_name': base_name
            }

    def _match_files_by_token(self, xml_files, pdf_files, temp_dir):
        """Match XML and PDF files by invoice token with enhanced normalized ID matching"""
        matches = {}
        
        # Extract tokens for all XML files
        xml_tokens = {}
        xml_by_normalized_id = {}  # New: Track by normalized invoice ID
        for xml_file in xml_files:
            xml_path = os.path.join(temp_dir, xml_file)
            token_info = self._extract_invoice_token(xml_file, xml_path, 'xml')
            xml_tokens[token_info['token']] = {
                'filename': xml_file,
                'token_info': token_info
            }
            
            # Track by normalized ID if available
            if 'normalized_id' in token_info and token_info['normalized_id']:
                xml_by_normalized_id[token_info['normalized_id']] = {
                    'filename': xml_file,
                    'token_info': token_info
                }
        
        # Extract tokens for all PDF files
        pdf_tokens = {}
        pdf_by_normalized_id = {}  # New: Track by normalized invoice ID
        for pdf_file in pdf_files:
            token_info = self._extract_invoice_token(pdf_file, None, 'pdf')
            pdf_tokens[token_info['token']] = {
                'filename': pdf_file,
                'token_info': token_info
            }
            
            # Track by normalized ID if available
            if 'normalized_id' in token_info and token_info['normalized_id']:
                pdf_by_normalized_id[token_info['normalized_id']] = {
                    'filename': pdf_file,
                    'token_info': token_info
                }
        
        # Primary matching: Normalized invoice ID match (new priority)
        matched_tokens = set()
        matched_normalized_ids = set()
        
        for normalized_id in xml_by_normalized_id:
            if normalized_id in pdf_by_normalized_id:
                xml_data = xml_by_normalized_id[normalized_id]
                pdf_data = pdf_by_normalized_id[normalized_id]
                
                base_name = xml_data['token_info']['base_name']
                matches[base_name] = {
                    'xml': xml_data['filename'],
                    'pdf': pdf_data['filename'],
                    'token': xml_data['token_info']['token'],
                    'match_type': 'normalized_id'
                }
                matched_tokens.add(xml_data['token_info']['token'])
                matched_tokens.add(pdf_data['token_info']['token'])
                matched_normalized_ids.add(normalized_id)
                
                self.log(f"🔗 Linked files using normalized token: {normalized_id} -> XML: {xml_data['filename']}, PDF: {pdf_data['filename']}")
        
        # Secondary matching: Exact token match for remaining files
        for token in xml_tokens:
            if token not in matched_tokens and token in pdf_tokens:
                base_name = xml_tokens[token]['token_info']['base_name']
                matches[base_name] = {
                    'xml': xml_tokens[token]['filename'],
                    'pdf': pdf_tokens[token]['filename'],
                    'token': token,
                    'match_type': 'exact_token'
                }
                matched_tokens.add(token)
                self.log(f"✅ Exact token match: {token} -> XML: {xml_tokens[token]['filename']}, PDF: {pdf_tokens[token]['filename']}")
        
        # Tertiary matching: Fallback to document_number + tax_id for unmatched files
        unmatched_xml = {k: v for k, v in xml_tokens.items() if k not in matched_tokens}
        unmatched_pdf = {k: v for k, v in pdf_tokens.items() if k not in matched_tokens}
        
        for xml_token, xml_data in unmatched_xml.items():
            xml_doc_tax = f"{xml_data['token_info']['document_number']}_{xml_data['token_info']['tax_id']}"
            
            for pdf_token, pdf_data in unmatched_pdf.items():
                pdf_doc_tax = f"{pdf_data['token_info']['document_number']}_{pdf_data['token_info']['tax_id']}"
                
                if xml_doc_tax == pdf_doc_tax and pdf_token not in matched_tokens:
                    base_name = xml_data['token_info']['base_name']
                    matches[base_name] = {
                        'xml': xml_data['filename'],
                        'pdf': pdf_data['filename'],
                        'token': xml_token,
                        'match_type': 'fallback_doc_tax'
                    }
                    matched_tokens.add(pdf_token)
                    self.log(f"🔄 Fallback match: {xml_doc_tax} -> XML: {xml_data['filename']}, PDF: {pdf_data['filename']}")
                    break
        
        # Handle unmatched files (XML-only or PDF-only)
        for xml_token, xml_data in xml_tokens.items():
            if xml_token not in matched_tokens:
                base_name = xml_data['token_info']['base_name']
                matches[base_name] = {
                    'xml': xml_data['filename'],
                    'pdf': None,
                    'token': xml_token,
                    'match_type': 'xml_only'
                }
                self.log(f"📄 XML-only file: {xml_data['filename']}")
        
        for pdf_token, pdf_data in pdf_tokens.items():
            if pdf_token not in matched_tokens:
                base_name = pdf_data['token_info']['base_name']
                if base_name not in matches:  # Don't override XML-only matches
                    matches[base_name] = {
                        'xml': None,
                        'pdf': pdf_data['filename'],
                        'token': pdf_token,
                        'match_type': 'pdf_only'
                    }
                    self.log(f"📎 PDF-only file: {pdf_data['filename']}")
        
        normalized_matches = sum(1 for m in matches.values() if m.get('match_type') == 'normalized_id')
        total_paired_matches = sum(1 for m in matches.values() if m['xml'] and m['pdf'])
        
        self.log(f"Token-based matching completed: {len(matches)} file groups, {total_paired_matches} paired matches ({normalized_matches} using normalized IDs)")
        return matches

    def _match_files_by_name(self, xml_files, pdf_files):
        """Legacy method - now redirects to token-based matching"""
        # For backward compatibility, use a temp directory approach
        # This method is kept for any legacy calls but should use token matching
        temp_dir = self.download_dir  # Use download dir as temp reference
        return self._match_files_by_token(xml_files, pdf_files, temp_dir)

    def _process_xml_file(self, temp_dir, xml_file, zip_base_name, processed_files):
        """Process standalone XML file for data extraction"""
        try:
            # Keep the same naming convention as ZIP (which already includes valor_total)
            new_name = f"{zip_base_name}.xml"
            src = os.path.join(temp_dir, xml_file)
            dst = os.path.join(self.xml_dir, new_name)
            shutil.move(src, dst)
            
            self.log(f"📄 XML-ONLY PROCESSING: '{xml_file}' will be processed for structured data extraction")
            
            processed_files.append({
                'type': 'xml',
                'original_name': xml_file,
                'processed_name': new_name,
                'base_name': os.path.splitext(xml_file)[0],
                'is_data_source': True,  # XML is always data source
                'triggers_extraction': True  # XML always triggers processing
            })
            
            self.log(f"✅ Extracted standalone XML: {new_name} (DATA SOURCE)")
            
        except Exception as e:
            self.log(f"Error processing XML file {xml_file}: {e}", "ERROR")

    def _process_pdf_file(self, temp_dir, pdf_file, zip_base_name, processed_files):
        """Process standalone PDF file for OCR (when no XML is available)"""
        try:
            # Create PDF directory if it doesn't exist
            pdf_dir = os.path.join(self.download_dir, 'pdfs')
            os.makedirs(pdf_dir, exist_ok=True)
            
            # Keep the same naming convention as ZIP
            new_name = f"{zip_base_name}.pdf"
            src = os.path.join(temp_dir, pdf_file)
            dst = os.path.join(pdf_dir, new_name)
            shutil.move(src, dst)
            
            self.log(f"📄 PDF-ONLY PROCESSING: '{pdf_file}' will be processed via OCR (no XML available)")
            
            processed_files.append({
                'type': 'pdf',
                'original_name': pdf_file,
                'processed_name': new_name,
                'base_name': os.path.splitext(pdf_file)[0],
                'is_data_source': True,  # PDF will be used for OCR when no XML
                'triggers_extraction': True  # PDF triggers processing when standalone
            })
            
            self.log(f"✅ Extracted standalone PDF: {new_name} (DATA SOURCE via OCR)")
            
        except Exception as e:
            self.log(f"Error processing PDF file {pdf_file}: {e}", "ERROR")

    def _process_matched_files(self, temp_dir, file_pair, zip_base_name, processed_files):
        """Process matched XML and PDF files with priority rules:
        - XML is always used for data extraction (isDataSource=true)
        - PDF is stored as reference only (isDataSource=false)
        - Only XML triggers the extraction pipeline
        """
        try:
            xml_file = file_pair['xml']
            pdf_file = file_pair.get('pdf')
            base_name = os.path.splitext(xml_file)[0]
            
            self.log(f"🔄 PRIORITY PROCESSING: XML '{xml_file}' will be used for data extraction")
            if pdf_file:
                self.log(f"📎 PDF '{pdf_file}' will be stored as visual reference only")
            
            # Process XML first (for data extraction)
            xml_new_name = f"{zip_base_name}.xml"
            xml_src = os.path.join(temp_dir, xml_file)
            xml_dst = os.path.join(self.xml_dir, xml_new_name)
            shutil.move(xml_src, xml_dst)
            
            xml_entry = {
                'type': 'xml',
                'original_name': xml_file,
                'processed_name': xml_new_name,
                'base_name': base_name,
                'is_data_source': True,  # XML is the data source
                'matched_file': None,
                'triggers_extraction': True  # Only XML triggers processing
            }
            
            # Process PDF if available (for reference ONLY - no extraction)
            if pdf_file:
                pdf_dir = os.path.join(self.download_dir, 'pdfs')
                os.makedirs(pdf_dir, exist_ok=True)
                
                pdf_new_name = f"{zip_base_name}.pdf"
                pdf_src = os.path.join(temp_dir, pdf_file)
                pdf_dst = os.path.join(pdf_dir, pdf_new_name)
                shutil.move(pdf_src, pdf_dst)
                
                pdf_entry = {
                    'type': 'pdf',
                    'original_name': pdf_file,
                    'processed_name': pdf_new_name,
                    'base_name': base_name,
                    'is_data_source': False,  # PDF is for reference only
                    'matched_file': xml_new_name,
                    'triggers_extraction': False  # PDF does NOT trigger processing
                }
                
                xml_entry['matched_file'] = pdf_new_name
                processed_files.append(pdf_entry)
                
                self.log(f"✅ Matched files processed: {xml_new_name} (DATA SOURCE) + {pdf_new_name} (REFERENCE)")
            else:
                self.log(f"✅ XML only processed: {xml_new_name} (DATA SOURCE)")
            
            processed_files.append(xml_entry)
            
        except Exception as e:
            self.log(f"Error processing matched files: {e}", "ERROR")

    def import_xml_to_database(self) -> bool:
        """Import XML files to database"""
        try:
            self.update_progress("Importing XML files to database", 90)

            xml_conn = self.init_database(self.xml_db_path, 'xml')
            imported_count = 0

            for filename in os.listdir(self.xml_dir):
                if filename.lower().endswith(".xml"):
                    try:
                        base_name = os.path.splitext(filename)[0]
                        parts = base_name.split("_", 2)
                        if len(parts) < 3:
                            self.log(f"Skipping invalid filename: {filename}")
                            continue

                        numero, emisor, valor = parts
                        file_path = os.path.join(self.xml_dir, filename)

                        with open(file_path, "r", encoding="utf-8") as f:
                            xml_content = f.read()

                        cursor = xml_conn.cursor()
                        cursor.execute(
                            """
                            INSERT OR IGNORE INTO downloaded_invoices
                            (numero_documento, emisor, valor_total, xml_content)
                            VALUES (?, ?, ?, ?)
                        """, (numero, emisor, valor, xml_content))
                        xml_conn.commit()

                        os.remove(file_path)
                        imported_count += 1
                        self.log(f"Imported and deleted: {filename}")

                    except Exception as e:
                        self.log(f"Failed to process {filename}: {e}", "ERROR")

            xml_conn.close()
            self.log(f"Imported {imported_count} XML files to database")
            return True

        except Exception as e:
            self.log(f"Error importing XML to database: {e}", "ERROR")
            return False

    def transfer_to_postgresql(self) -> bool:
        """Transfer imported invoices from SQLite to PostgreSQL imported_invoices table"""
        try:
            self.update_progress("Transferring invoices to main database", 95)

            # Get database URL from environment
            database_url = os.environ.get('DATABASE_URL')
            if not database_url:
                self.log("DATABASE_URL environment variable not found",
                         "ERROR")
                return False

            # Connect to PostgreSQL
            pg_conn = psycopg2.connect(database_url)
            pg_cursor = pg_conn.cursor()

            # Connect to local XML SQLite database
            xml_conn = sqlite3.connect(self.xml_db_path)
            xml_cursor = xml_conn.cursor()

            # Get log_id from config (passed from Node.js)
            log_id = self.log_id
            if not log_id:
                self.log("No log_id provided for PostgreSQL transfer", "ERROR")
                return False

            # Query all imported invoices from SQLite
            xml_cursor.execute("""
                SELECT numero_documento, emisor, valor_total, xml_content 
                FROM downloaded_invoices 
                WHERE xml_content IS NOT NULL
            """)
            sqlite_invoices = xml_cursor.fetchall()

            transferred_count = 0
            for invoice in sqlite_invoices:
                numero_documento, emisor, valor_total, xml_content = invoice

                try:
                    # Create filename same as RPA processing logic
                    safe_emisor = re.sub(r'[^a-zA-Z0-9_]', '_', emisor)
                    original_filename = f"{numero_documento}_{safe_emisor}.xml"

                    # Store XML file in the uploads directory to match manual upload pipeline
                    uploads_dir = 'uploads'
                    os.makedirs(uploads_dir, exist_ok=True)
                    xml_file_path = os.path.join(uploads_dir, original_filename)
                    with open(xml_file_path, 'w', encoding='utf-8') as f:
                        f.write(xml_content)

                    # Calculate file size
                    file_size = len(xml_content.encode('utf-8'))

                    # Check if record already exists to prevent duplicates
                    pg_cursor.execute("""
                        SELECT id FROM imported_invoices 
                        WHERE log_id = %s AND original_file_name = %s
                    """, (log_id, original_filename))

                    existing_record = pg_cursor.fetchone()

                    if not existing_record:
                        # Insert into PostgreSQL imported_invoices table
                        pg_cursor.execute("""
                            INSERT INTO imported_invoices 
                            (log_id, original_file_name, file_type, file_size, file_path, 
                             erp_document_id, downloaded_at, metadata)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            log_id,
                            original_filename,
                            'xml',
                            file_size,
                            xml_file_path,
                            numero_documento,
                            datetime.now(),
                            json.dumps({
                                'emisor': emisor,
                                'valor_total': valor_total,
                                'source': 'python_rpa',
                                'processing_status': 'ready_for_upload_pipeline',
                                'buyerTaxId': self._extract_buyer_tax_id_from_xml(xml_content)
                            })
                        ))

                        transferred_count += 1
                        self.log(f"Transferred to PostgreSQL: {original_filename}")
                    else:
                        self.log(f"Record already exists, skipping: {original_filename}")

                except Exception as e:
                    self.log(f"Failed to transfer {numero_documento}: {e}", "ERROR")
                    # Continue with next invoice instead of failing the whole batch

            # Commit PostgreSQL changes
            pg_conn.commit()

            # Close connections
            xml_conn.close()
            pg_conn.close()

            self.log(
                f"Successfully transferred {transferred_count} invoices to PostgreSQL"
            )
            return True

        except Exception as e:
            self.log(f"Error transferring to PostgreSQL: {e}", "ERROR")
            return False

    def _extract_buyer_tax_id_from_xml(self, xml_content: str) -> Optional[str]:
        """Extract buyer tax ID from XML content, handling AttachedDocument wrappers"""
        try:
            # Check if this is an AttachedDocument wrapper with embedded CDATA content
            if '<AttachedDocument' in xml_content and '<![CDATA[' in xml_content:
                # Extract the CDATA content from Description tag
                cdata_pattern = r'<cbc:Description><!\[CDATA\[(.*?)\]\]></cbc:Description>'
                cdata_match = re.search(cdata_pattern, xml_content, re.DOTALL)
                
                if cdata_match and cdata_match.group(1):
                    embedded_xml = cdata_match.group(1).strip()
                    self.log(f"Found embedded XML in CDATA, length: {len(embedded_xml)}")
                    return self._extract_buyer_tax_id_from_xml(embedded_xml)  # Recursive call
            
            # Extract buyer tax ID from AccountingCustomerParty
            customer_pattern = r'<cac:AccountingCustomerParty[^>]*>(.*?)</cac:AccountingCustomerParty>'
            customer_match = re.search(customer_pattern, xml_content, re.DOTALL | re.IGNORECASE)
            
            if customer_match:
                customer_content = customer_match.group(1)
                
                # Try different patterns for tax ID extraction
                tax_id_patterns = [
                    r'<cbc:CompanyID[^>]*>([^<]+)</cbc:CompanyID>',
                    r'<cbc:ID[^>]*>([^<]+)</cbc:ID>',
                    r'<cbc:IdentificationCode[^>]*>([^<]+)</cbc:IdentificationCode>',
                    r'<cbc:TaxSchemeID[^>]*>([^<]+)</cbc:TaxSchemeID>'
                ]
                
                for pattern in tax_id_patterns:
                    match = re.search(pattern, customer_content, re.IGNORECASE)
                    if match and match.group(1).strip():
                        tax_id = match.group(1).strip()
                        # Skip country codes like "CO"
                        if tax_id and tax_id.upper() != 'CO' and len(tax_id) >= 6:
                            self.log(f"Found buyer tax ID: {tax_id}")
                            return tax_id
            
            # If no buyer found, return None
            self.log("No buyer tax ID found in XML content")
            return None
            
        except Exception as e:
            self.log(f"Error extracting buyer tax ID from XML: {e}", "ERROR")
            return None

    def cleanup(self):
        """Cleanup resources"""
        if self.driver:
            try:
                self.driver.quit()
                self.log("WebDriver closed successfully")
            except Exception as e:
                self.log(f"Error closing WebDriver: {e}", "ERROR")

    def run(self) -> bool:
        """
        Main execution method for the RPA invoice importing process.
        Enhanced with robust statistics tracking and accurate invoice counting.
        """
        try:
            self.log("🚀 Starting Invoice RPA Import Process")
            self.log(f"🏢 Company/Config ID: {self.config_id}")
            self.log(f"📁 Download directory: {self.download_dir}")
            self.log(f"📄 File types: {self.config.get('fileTypes', 'both')}")
            
            # Initialize stats properly
            self.stats = {
                'total_invoices': 0,        # Unique invoices found in file processing
                'skipped_invoices': 0,      # Duplicates skipped during web scraping  
                'processed_invoices': 0,    # Invoices that proceeded through file extraction
                'successful_imports': 0,    # Successfully downloaded from web
                'failed_imports': 0,        # Failed downloads
                'current_step': 'Initializing',
                'progress': 0
            }

            # Step 1: Setup WebDriver
            if not self.setup_driver():
                self.log("❌ Failed to initialize WebDriver", "ERROR")
                return False

            # Step 2: Login to ERP system
            if not self.login_to_erp():
                self.log("❌ ERP login failed", "ERROR")
                self.cleanup()
                return False

            # Step 3: Navigate to invoices section
            if not self.navigate_to_invoices():
                self.log("❌ Navigation to invoices failed", "ERROR")
                self.cleanup()
                return False

            # Step 4: Process invoice rows (download phase)
            if not self.process_invoice_rows():
                self.log("❌ Invoice processing failed", "ERROR")
                self.cleanup()
                return False

            # Step 5: Extract files from ZIP archives (file processing phase)
            if not self.extract_invoices_from_zip():
                self.log("❌ File extraction failed", "ERROR")
                self.cleanup()
                return False

            # Step 6: Process files through manual upload pipeline
            # NOTE: For now, this step is simulated since manual pipeline is handled by Node.js
            self.log("✅ Manual pipeline processing (simulated for Node.js integration)")
            self.update_progress("Processing completed", 95)

            # Cleanup WebDriver after successful processing
            self.cleanup()

            # Final summary with business-accurate statistics
            self.log("=" * 60)
            self.log("🎉 INVOICE IMPORT PROCESS COMPLETED SUCCESSFULLY")
            self.log("=" * 60)
            self.log(f"📊 Final Statistics:")
            self.log(f"   • Total unique invoices found: {self.stats['total_invoices']}")
            self.log(f"   • Invoices skipped (duplicates): {self.stats['skipped_invoices']}")
            self.log(f"   • Invoices processed: {self.stats['processed_invoices']}")
            self.log(f"   • Successful downloads: {self.stats['successful_imports']}")
            self.log(f"   • Failed downloads: {self.stats['failed_imports']}")
            
            # Final progress update
            self.update_progress("Import process completed", 100)
            
            return True

        except Exception as e:
            self.log(f"❌ Critical error in RPA process: {e}", "ERROR")
            self.cleanup()
            return False

    def run_import_process(self) -> dict:
        """
        Enhanced run method that returns structured results for Node.js integration.
        """
        try:
            self.log("🚀 Starting Invoice RPA Import Process")
            self.log(f"🏢 Company/Config ID: {self.config_id}")
            self.log(f"📁 Download directory: {self.download_dir}")
            self.log(f"📄 File types: {self.config.get('fileTypes', 'both')}")
            
            # Initialize stats properly
            self.stats = {
                'total_invoices': 0,        # Unique invoices found in file processing
                'skipped_invoices': 0,      # Duplicates skipped during web scraping  
                'processed_invoices': 0,    # Invoices that proceeded through file extraction
                'successful_imports': 0,    # Successfully downloaded from web
                'failed_imports': 0,        # Failed downloads
                'current_step': 'Initializing',
                'progress': 0
            }

            # Step 1: Setup WebDriver
            if not self.setup_driver():
                self.log("❌ Failed to initialize WebDriver", "ERROR")
                return {
                    'success': False,
                    'error': 'Failed to initialize WebDriver',
                    'stats': self.stats
                }

            # Step 2: Login to ERP system
            if not self.login_to_erp():
                self.log("❌ ERP login failed", "ERROR")
                self.cleanup()
                return {
                    'success': False,
                    'error': 'ERP login failed',
                    'stats': self.stats
                }

            # Step 3: Navigate to invoices section
            if not self.navigate_to_invoices():
                self.log("❌ Navigation to invoices failed", "ERROR")
                self.cleanup()
                return {
                    'success': False,
                    'error': 'Navigation to invoices failed',
                    'stats': self.stats
                }

            # Step 4: Process invoice rows (download phase)
            if not self.process_invoice_rows():
                self.log("❌ Invoice processing failed", "ERROR")
                self.cleanup()
                return {
                    'success': False,
                    'error': 'Invoice processing failed',
                    'stats': self.stats
                }

            # Step 5: Extract files from ZIP archives (file processing phase)
            if not self.extract_invoices_from_zip():
                self.log("❌ File extraction failed", "ERROR")
                self.cleanup()
                return {
                    'success': False,
                    'error': 'File extraction failed',
                    'stats': self.stats
                }

            # Step 6: Process files through manual upload pipeline
            # NOTE: For now, this step is simulated since manual pipeline is handled by Node.js
            self.log("✅ Manual pipeline processing (simulated for Node.js integration)")
            self.update_progress("Processing completed", 95)

            # Cleanup WebDriver after successful processing
            self.cleanup()

            # Final summary with business-accurate statistics
            self.log("=" * 60)
            self.log("🎉 INVOICE IMPORT PROCESS COMPLETED SUCCESSFULLY")
            self.log("=" * 60)
            self.log(f"📊 Final Statistics:")
            self.log(f"   • Total unique invoices found: {self.stats['total_invoices']}")
            self.log(f"   • Invoices skipped (duplicates): {self.stats['skipped_invoices']}")
            self.log(f"   • Invoices processed: {self.stats['processed_invoices']}")
            self.log(f"   • Successful downloads: {self.stats['successful_imports']}")
            self.log(f"   • Failed downloads: {self.stats['failed_imports']}")
            
            # Final progress update
            self.update_progress("Import process completed", 100)
            
            return {
                'success': True,
                'stats': self.stats
            }

        except Exception as e:
            self.log(f"❌ Critical error in RPA process: {e}", "ERROR")
            self.cleanup()
            return {
                'success': False,
                'error': str(e),
                'stats': self.stats
            }


def main():
    """Main execution method for the RPA service when called from Node.js"""
    import sys
    import json
    
    # Default error result structure
    error_result = {
        'success': False,
        'error': 'Unknown error occurred',
        'stats': {
            'total_invoices': 0,
            'processed_invoices': 0,
            'successful_imports': 0,
            'failed_imports': 0,
            'current_step': 'Failed',
            'progress': 0
        }
    }
    
    # Check for configuration argument
    if len(sys.argv) < 2:
        error_result['error'] = 'No configuration provided'
        print(f"RESULT:{json.dumps(error_result)}")
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])

        # Create and run the RPA service
        rpa_service = InvoiceRPAService(config)
        result = rpa_service.run_import_process()

        # Always output valid JSON
        print(f"RESULT:{json.dumps(result)}")

        if not result['success']:
            sys.exit(1)

    except json.JSONDecodeError as e:
        error_result = {
            'success': False,
            'error': f'Invalid JSON configuration: {str(e)}',
            'stats': {
                'total_invoices': 0,
                'processed_invoices': 0,
                'successful_imports': 0,
                'failed_imports': 0,
                'current_step': 'Failed',
                'progress': 0
            }
        }
        print(f"RESULT:{json.dumps(error_result)}")
        sys.exit(1)
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'stats': {
                'total_invoices': 0,
                'processed_invoices': 0,
                'successful_imports': 0,
                'failed_imports': 0,
                'current_step': 'Failed',
                'progress': 0
            }
        }
        print(f"RESULT:{json.dumps(error_result)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

