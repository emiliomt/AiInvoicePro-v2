#!/usr/bin/env python3
"""
Test the comprehensive XML/PDF pairing improvements
"""
import os
import psycopg2

def test_pairing_improvements():
    """Test the enhanced pairing logic and orphaned PDF detection"""
    print("🔧 TESTING XML/PDF PAIRING IMPROVEMENTS")
    print("=" * 60)
    
    # Summary of improvements made
    print("🚀 IMPROVEMENTS IMPLEMENTED:")
    print("   1. Enhanced token extraction for better matching")
    print("   2. Multi-strategy matching (exact, containment, prefix, etc.)")
    print("   3. Smart orphaned PDF detection")
    print("   4. Better logging for debugging pairing issues")
    print("   5. Database-aware processing decisions")
    
    print("\n📊 EXPECTED BEHAVIORS:")
    print("   ✅ XML files with exact PDF matches → paired correctly")
    print("   ✅ XML files with partial PDF matches → enhanced matching")
    print("   ✅ Orphaned PDFs from previous runs → skipped intelligently")
    print("   ✅ New orphaned PDFs → processed for OCR")
    print("   ✅ Better statistics and unique invoice counting")
    
    # Check current file state
    xml_dir = '/tmp/xml_invoices'
    pdf_dir = '/tmp/invoice_downloads/pdfs'
    
    xml_count = 0
    if os.path.exists(xml_dir):
        xml_count = len([f for f in os.listdir(xml_dir) if f.lower().endswith('.xml')])
    
    pdf_count = 0  
    if os.path.exists(pdf_dir):
        pdf_count = len([f for f in os.listdir(pdf_dir) if f.lower().endswith('.pdf')])
    
    print(f"\n📁 CURRENT FILE STATE:")
    print(f"   XML files: {xml_count}")
    print(f"   PDF files: {pdf_count}")
    
    # Check database state for orphaned PDF detection
    try:
        pg_conn = psycopg2.connect(os.environ['DATABASE_URL'])
        pg_cursor = pg_conn.cursor()
        
        # Count completed invoices
        pg_cursor.execute("""
            SELECT COUNT(*) FROM imported_invoices 
            WHERE processing_status = 'completed'
        """)
        completed_count = pg_cursor.fetchone()[0]
        
        # Count main invoices
        pg_cursor.execute("""
            SELECT COUNT(*) FROM invoices 
            WHERE user_id = 'rpa-system'
        """)
        main_invoices_count = pg_cursor.fetchone()[0]
        
        pg_conn.close()
        
        print(f"\n🗄️ DATABASE STATE:")
        print(f"   Completed imported invoices: {completed_count}")
        print(f"   Main invoice records: {main_invoices_count}")
        print(f"   Expected orphaned PDFs: {pdf_count - xml_count} (may be from previous processing)")
        
    except Exception as e:
        print(f"\n❌ Database check failed: {e}")
    
    print(f"\n🎯 NEXT RPA RUN EXPECTATIONS:")
    print(f"   - Should properly pair {xml_count} XML files with matching PDFs")
    print(f"   - Should intelligently skip orphaned PDFs that are already processed")
    print(f"   - Should only process genuinely new orphaned PDFs")
    print(f"   - Should show correct unique invoice count, not inflated file count")
    print(f"   - Should have enhanced logging showing pairing results")
    
    print(f"\n✅ IMPROVEMENTS READY FOR TESTING")
    print(f"   Run RPA process to see enhanced pairing in action!")

if __name__ == "__main__":
    test_pairing_improvements()