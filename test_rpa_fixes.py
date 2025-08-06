#!/usr/bin/env python3
"""
Test script to verify both RPA fixes:
1. Duplicate detection happens BEFORE downloading
2. Invoice counting is correct (unique invoices, not individual files)
"""
import psycopg2
import os

def test_expected_behavior():
    """Test that shows what the fixed behavior should be"""
    try:
        pg_conn = psycopg2.connect(os.environ['DATABASE_URL'])
        pg_cursor = pg_conn.cursor()
        
        print("🔧 TESTING EXPECTED RPA BEHAVIOR AFTER FIXES")
        print("=" * 60)
        
        # Test 1: Invoices with completed status should be skipped BEFORE download
        print("\n1. 📋 DUPLICATE DETECTION TEST")
        print("   Testing invoices that should be SKIPPED before download:")
        
        test_invoices = [
            ("FELG2374", "LG_CONSULTORES_SAS"),
            ("NSX001156549", "COMBUGAS_SAS")
        ]
        
        for numero, emisor in test_invoices:
            # Check if invoice has completed status
            pg_cursor.execute("""
                SELECT COUNT(*) as completed_count
                FROM imported_invoices 
                WHERE (
                    original_file_name LIKE %s OR 
                    original_file_name LIKE %s OR
                    original_file_name LIKE %s
                )
                AND processing_status = 'completed'
            """, (f"{numero}_%", f"%{numero}.%", f"%{numero}%"))
            
            completed_count = pg_cursor.fetchone()[0]
            
            if completed_count > 0:
                print(f"   ✅ {numero}: HAS {completed_count} completed records → SHOULD BE SKIPPED")
                print(f"      Expected log: '⏭️ Skipping successfully processed: {numero} - {emisor}'")
                print(f"      Expected behavior: ZIP download SKIPPED")
            else:
                print(f"   🆕 {numero}: NO completed records → WILL BE PROCESSED")
        
        # Test 2: Invoice counting should be unique (not double-counting XML+PDF)
        print(f"\n2. 📊 INVOICE COUNTING TEST")
        print("   Expected counting behavior:")
        print("   - If ZIP contains XML + PDF for same invoice → count as 1 invoice")
        print("   - Progress should show unique invoices, not file count")
        print("   - Statistics should reflect unique invoice processing")
        
        # Show current database state
        pg_cursor.execute("""
            SELECT 
                processing_status,
                COUNT(*) as count
            FROM imported_invoices 
            GROUP BY processing_status 
            ORDER BY count DESC
        """)
        
        status_counts = pg_cursor.fetchall()
        print(f"\n   📈 Current imported_invoices status distribution:")
        for status, count in status_counts:
            print(f"      {status}: {count} records")
        
        # Calculate expected unique invoices if RPA ran again
        pg_cursor.execute("""
            SELECT COUNT(DISTINCT 
                CASE 
                    WHEN original_file_name ~ '^[^_]+_[^_]+' 
                    THEN split_part(original_file_name, '_', 1) || '_' || split_part(original_file_name, '_', 2)
                    ELSE original_file_name
                END
            ) as unique_invoice_identifiers
            FROM imported_invoices 
            WHERE processing_status = 'downloaded'
        """)
        
        unique_downloaded = pg_cursor.fetchone()[0]
        
        pg_cursor.execute("""
            SELECT COUNT(DISTINCT 
                CASE 
                    WHEN original_file_name ~ '^[^_]+_[^_]+' 
                    THEN split_part(original_file_name, '_', 1) || '_' || split_part(original_file_name, '_', 2)
                    ELSE original_file_name
                END
            ) as unique_invoice_identifiers
            FROM imported_invoices 
            WHERE processing_status = 'completed'
        """)
        
        unique_completed = pg_cursor.fetchone()[0]
        
        print(f"\n   🎯 Expected next RPA run behavior:")
        print(f"      - Unique invoices to skip: ~{unique_completed} (have completed status)")
        print(f"      - Unique invoices to process: ~{unique_downloaded} (still 'downloaded' status)")
        print(f"      - Total unique invoices encountered: ~{unique_completed + unique_downloaded}")
        
        print(f"\n   ❌ WRONG behavior (before fixes):")
        print(f"      - Would show total_invoices = file_count (XML + PDF counted separately)")
        print(f"      - Would download ZIP files even for completed invoices")
        print(f"      - Would reprocess everything")
        
        print(f"\n   ✅ CORRECT behavior (after fixes):")
        print(f"      - Will show total_invoices = unique_invoice_count")
        print(f"      - Will skip downloads for completed invoices")
        print(f"      - Will only process genuinely new/incomplete invoices")
        
        pg_conn.close()
        
        print(f"\n" + "=" * 60)
        print("🚀 READY TO TEST - Run RPA to verify fixes work!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")

def main():
    test_expected_behavior()

if __name__ == "__main__":
    main()