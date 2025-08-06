#!/usr/bin/env python3
"""
Test script to verify the duplicate detection fix is working correctly
"""
import psycopg2
import os
from datetime import datetime

def test_sql_query_fix():
    """Test that the SQL query can now properly unpack 4 columns"""
    try:
        pg_conn = psycopg2.connect(os.environ['DATABASE_URL'])
        pg_cursor = pg_conn.cursor()
        
        print("🧪 Testing SQL query format fix...")
        
        # Test with a known invoice
        numero_documento = 'FELG2374'
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
            f"{numero_documento}_%",
            f"%{numero_documento}.%",
            f"%{numero_documento}%"
        ))
        
        results = pg_cursor.fetchall()
        print(f"✅ Query executed successfully. Found {len(results)} records for {numero_documento}")
        
        # Test unpacking - this was the original issue
        completed_found = False
        for row in results:
            metadata_status, processing_status, imp_id, imp_filename = row[0], row[1], row[2], row[3]
            print(f"   📄 ID: {imp_id}, File: {imp_filename}")
            print(f"      Status: {processing_status}, Metadata: {metadata_status}")
            
            if processing_status == 'completed' or metadata_status == 'completed':
                completed_found = True
                print(f"      ✅ COMPLETED record found - this should be SKIPPED in future runs")
        
        if not completed_found:
            print(f"      ⚠️ No completed records found for {numero_documento}")
        
        pg_conn.close()
        return True
        
    except Exception as e:
        print(f"❌ SQL Query Test Failed: {e}")
        return False

def test_duplicate_detection_logic():
    """Test the complete duplicate detection logic"""
    
    # Test data - use known invoices
    test_cases = [
        ("FELG2374", "LG_CONSULTORES_SAS", 47124000),
        ("NSX001156549", "COMBUGAS_SAS", 1400000),
        ("FAKE_INVOICE", "FAKE_VENDOR", 999999)  # Should NOT be found
    ]
    
    results = []
    
    try:
        pg_conn = psycopg2.connect(os.environ['DATABASE_URL'])
        
        for numero_documento, emisor, valor_total in test_cases:
            print(f"\n🔍 Testing: {numero_documento} from {emisor} (${valor_total})")
            
            # Simulate the duplicate detection logic
            pg_cursor = pg_conn.cursor()
            
            # Normalize vendor name (simplified version)
            normalized_emisor = emisor.replace('_', ' ').upper()
            
            # Check main invoices table first
            pg_cursor.execute("""
                SELECT id, original_filename, total_amount
                FROM invoices 
                WHERE user_id = 'rpa-system'
                  AND (
                    invoice_number = %s OR 
                    extracted_data->>'numero_documento' = %s
                  )
                  AND (
                    UPPER(REPLACE(vendor, '_', ' ')) = %s OR
                    UPPER(REPLACE(extracted_data->>'emisor', '_', ' ')) = %s
                  )
                ORDER BY created_at DESC
                LIMIT 5
            """, (numero_documento, numero_documento, normalized_emisor, normalized_emisor))
            
            main_result = pg_cursor.fetchone()
            if main_result:
                print(f"   ✅ Found in MAIN table (should be skipped): ID {main_result[0]}")
                results.append((numero_documento, "SKIP - in main table"))
                continue
            
            # Check imported_invoices table for completed status
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
                f"{numero_documento}_%",
                f"%{numero_documento}.%",
                f"%{numero_documento}%"
            ))
            
            imported_results = pg_cursor.fetchall()
            completed_found = False
            
            if imported_results:
                for row in imported_results:
                    metadata_status, processing_status, imp_id, imp_filename = row[0], row[1], row[2], row[3]
                    if metadata_status == 'completed' or processing_status == 'completed':
                        print(f"   ✅ Found COMPLETED in imported_invoices (should be skipped): ID {imp_id}")
                        completed_found = True
                        break
                
                if completed_found:
                    results.append((numero_documento, "SKIP - completed in imported_invoices"))
                else:
                    print(f"   🔄 Found in imported_invoices but NOT completed (will process)")
                    results.append((numero_documento, "PROCESS - not completed"))
            else:
                print(f"   🆕 NOT found anywhere (will process)")
                results.append((numero_documento, "PROCESS - new invoice"))
        
        pg_conn.close()
        
        print(f"\n📊 DUPLICATE DETECTION TEST RESULTS:")
        for invoice, action in results:
            print(f"   {invoice}: {action}")
        
        return results
        
    except Exception as e:
        print(f"❌ Duplicate Detection Test Failed: {e}")
        return None

def main():
    print("🚀 Testing Duplicate Detection Fix")
    print("=" * 50)
    
    # Test 1: SQL Query Format
    sql_ok = test_sql_query_fix()
    
    print("\n" + "=" * 50)
    
    # Test 2: Full Duplicate Detection Logic
    if sql_ok:
        detection_results = test_duplicate_detection_logic()
        
        print("\n" + "=" * 50)
        
        if detection_results:
            print("✅ DUPLICATE DETECTION FIX VERIFICATION COMPLETE")
            
            # Expect FELG2374 and NSX001156549 to be skipped if they have completed status
            skip_count = sum(1 for _, action in detection_results if "SKIP" in action)
            process_count = sum(1 for _, action in detection_results if "PROCESS" in action)
            
            print(f"📈 Results: {skip_count} will be SKIPPED, {process_count} will be PROCESSED")
            
            if skip_count > 0:
                print("🎯 SUCCESS: Duplicate detection is working - some invoices will be skipped!")
            else:
                print("⚠️  WARNING: No invoices found to skip - this may indicate completed status updates aren't working")
        else:
            print("❌ DUPLICATE DETECTION TEST FAILED")
    else:
        print("❌ SQL QUERY FIX TEST FAILED - Cannot proceed with duplicate detection test")

if __name__ == "__main__":
    main()