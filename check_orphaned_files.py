
#!/usr/bin/env python3
"""
Check for orphaned PDF and XML files in the databases
This script analyzes both the file system and database records to identify:
1. Files on disk that have no corresponding database records
2. Database records that reference missing files
3. Incomplete file pairings (XML without PDF or vice versa)
"""

import os
import psycopg2
import json
from datetime import datetime

def check_orphaned_files():
    """Check for orphaned files in the system"""
    print("🔍 CHECKING FOR ORPHANED PDF AND XML FILES")
    print("=" * 60)
    
    try:
        # Connect to PostgreSQL
        database_url = os.environ.get('DATABASE_URL')
        if not database_url:
            print("❌ DATABASE_URL environment variable not found")
            return False
            
        pg_conn = psycopg2.connect(database_url)
        pg_cursor = pg_conn.cursor()
        
        # Check file system state
        print("📁 CHECKING FILE SYSTEM STATE")
        print("-" * 40)
        
        # XML files
        xml_dir = '/tmp/xml_invoices'
        xml_files = []
        if os.path.exists(xml_dir):
            xml_files = [f for f in os.listdir(xml_dir) if f.lower().endswith('.xml')]
        
        # PDF files  
        pdf_dir = '/tmp/invoice_downloads/pdfs'
        pdf_files = []
        if os.path.exists(pdf_dir):
            pdf_files = [f for f in os.listdir(pdf_dir) if f.lower().endswith('.pdf')]
            
        # Uploaded files
        uploads_dir = 'uploads'
        uploaded_xml = []
        uploaded_pdf = []
        if os.path.exists(uploads_dir):
            uploaded_xml = [f for f in os.listdir(uploads_dir) if f.lower().endswith('.xml')]
            uploaded_pdf = [f for f in os.listdir(uploads_dir) if f.lower().endswith('.pdf')]
        
        print(f"   XML files in temp directory: {len(xml_files)}")
        print(f"   PDF files in temp directory: {len(pdf_files)}")
        print(f"   XML files in uploads: {len(uploaded_xml)}")
        print(f"   PDF files in uploads: {len(uploaded_pdf)}")
        
        # Check database records
        print(f"\n🗄️  CHECKING DATABASE RECORDS")
        print("-" * 40)
        
        # Check imported_invoices table
        pg_cursor.execute("""
            SELECT COUNT(*), file_type, processing_status 
            FROM imported_invoices 
            GROUP BY file_type, processing_status
            ORDER BY file_type, processing_status
        """)
        imported_records = pg_cursor.fetchall()
        
        print("   imported_invoices table:")
        for count, file_type, status in imported_records:
            print(f"     {file_type}: {count} records with status '{status}'")
            
        # Check main invoices table for RPA records
        pg_cursor.execute("""
            SELECT COUNT(*) FROM invoices 
            WHERE user_id = 'rpa-system'
        """)
        rpa_invoices = pg_cursor.fetchone()[0]
        print(f"   Main invoices (RPA): {rpa_invoices} records")
        
        # Check for orphaned files in imported_invoices
        print(f"\n🔍 CHECKING FOR ORPHANED FILES IN IMPORTED_INVOICES")
        print("-" * 50)
        
        pg_cursor.execute("""
            SELECT id, original_file_name, file_type, file_path, processing_status, 
                   created_at, metadata
            FROM imported_invoices 
            ORDER BY created_at DESC
        """)
        all_imported = pg_cursor.fetchall()
        
        orphaned_db_records = []
        valid_records = []
        
        for record in all_imported:
            record_id, filename, file_type, file_path, status, created_at, metadata = record
            
            # Check if file actually exists
            file_exists = False
            if file_path and os.path.exists(file_path):
                file_exists = True
            
            if file_exists:
                valid_records.append(record)
            else:
                orphaned_db_records.append(record)
                
        print(f"   Valid records (file exists): {len(valid_records)}")
        print(f"   Orphaned records (file missing): {len(orphaned_db_records)}")
        
        if orphaned_db_records:
            print("\n   📋 ORPHANED DATABASE RECORDS (file missing):")
            for record in orphaned_db_records[:10]:  # Show first 10
                record_id, filename, file_type, file_path, status, created_at, metadata = record
                print(f"     ID {record_id}: {filename} ({file_type}) - {status}")
                print(f"       Path: {file_path}")
                print(f"       Created: {created_at}")
                
        # Check for orphaned files on disk
        print(f"\n📂 CHECKING FOR ORPHANED FILES ON DISK")
        print("-" * 45)
        
        # Get all file paths from database
        pg_cursor.execute("""
            SELECT DISTINCT file_path FROM imported_invoices 
            WHERE file_path IS NOT NULL
        """)
        db_file_paths = set(row[0] for row in pg_cursor.fetchall())
        
        # Check temp XML files
        orphaned_temp_xml = []
        for xml_file in xml_files:
            xml_path = os.path.join(xml_dir, xml_file)
            if xml_path not in db_file_paths:
                orphaned_temp_xml.append(xml_file)
                
        # Check temp PDF files  
        orphaned_temp_pdf = []
        for pdf_file in pdf_files:
            pdf_path = os.path.join(pdf_dir, pdf_file)
            if pdf_path not in db_file_paths:
                orphaned_temp_pdf.append(pdf_file)
                
        # Check uploaded files
        orphaned_uploaded_xml = []
        for xml_file in uploaded_xml:
            xml_path = os.path.join(uploads_dir, xml_file)
            if xml_path not in db_file_paths:
                orphaned_uploaded_xml.append(xml_file)
                
        orphaned_uploaded_pdf = []
        for pdf_file in uploaded_pdf:
            pdf_path = os.path.join(uploads_dir, pdf_file)
            if pdf_path not in db_file_paths:
                orphaned_uploaded_pdf.append(pdf_file)
        
        print(f"   Orphaned temp XML files: {len(orphaned_temp_xml)}")
        if orphaned_temp_xml:
            for xml_file in orphaned_temp_xml[:5]:  # Show first 5
                print(f"     - {xml_file}")
                
        print(f"   Orphaned temp PDF files: {len(orphaned_temp_pdf)}")
        if orphaned_temp_pdf:
            for pdf_file in orphaned_temp_pdf[:5]:  # Show first 5
                print(f"     - {pdf_file}")
                
        print(f"   Orphaned uploaded XML files: {len(orphaned_uploaded_xml)}")
        if orphaned_uploaded_xml:
            for xml_file in orphaned_uploaded_xml[:5]:  # Show first 5
                print(f"     - {xml_file}")
                
        print(f"   Orphaned uploaded PDF files: {len(orphaned_uploaded_pdf)}")
        if orphaned_uploaded_pdf:
            for pdf_file in orphaned_uploaded_pdf[:5]:  # Show first 5
                print(f"     - {pdf_file}")
                
        # Check for incomplete pairings
        print(f"\n🔗 CHECKING FOR INCOMPLETE FILE PAIRINGS")
        print("-" * 45)
        
        # Analyze pairings in imported_invoices
        pg_cursor.execute("""
            SELECT base_file_name, file_type, COUNT(*) as count
            FROM imported_invoices 
            WHERE base_file_name IS NOT NULL
            GROUP BY base_file_name, file_type
            ORDER BY base_file_name
        """)
        pairing_data = pg_cursor.fetchall()
        
        # Group by base name
        pairing_groups = {}
        for base_name, file_type, count in pairing_data:
            if base_name not in pairing_groups:
                pairing_groups[base_name] = {}
            pairing_groups[base_name][file_type] = count
            
        complete_pairs = 0
        xml_only = 0
        pdf_only = 0
        
        for base_name, types in pairing_groups.items():
            has_xml = 'xml' in types
            has_pdf = 'pdf' in types
            
            if has_xml and has_pdf:
                complete_pairs += 1
            elif has_xml:
                xml_only += 1
            elif has_pdf:
                pdf_only += 1
                
        print(f"   Complete pairs (XML + PDF): {complete_pairs}")
        print(f"   XML only: {xml_only}")
        print(f"   PDF only: {pdf_only}")
        
        # Summary and recommendations
        print(f"\n📊 SUMMARY AND RECOMMENDATIONS")
        print("=" * 50)
        
        total_orphaned_files = (len(orphaned_temp_xml) + len(orphaned_temp_pdf) + 
                              len(orphaned_uploaded_xml) + len(orphaned_uploaded_pdf))
        total_orphaned_records = len(orphaned_db_records)
        
        print(f"✅ Valid database records: {len(valid_records)}")
        print(f"⚠️  Orphaned database records: {total_orphaned_records}")
        print(f"📁 Orphaned files on disk: {total_orphaned_files}")
        print(f"🔗 Complete file pairs: {complete_pairs}")
        print(f"📄 Incomplete pairings: {xml_only + pdf_only}")
        
        if total_orphaned_files > 0 or total_orphaned_records > 0:
            print(f"\n🧹 CLEANUP RECOMMENDATIONS:")
            if total_orphaned_files > 0:
                print(f"   - Run clear_rpa_databases.py to clean orphaned files")
            if total_orphaned_records > 0:
                print(f"   - Clean up orphaned database records")
            if xml_only > 0 or pdf_only > 0:
                print(f"   - Review incomplete file pairings")
        else:
            print(f"\n✅ NO CLEANUP NEEDED - System is clean!")
            
        # Generate detailed report
        report = {
            'timestamp': datetime.now().isoformat(),
            'file_system': {
                'temp_xml': len(xml_files),
                'temp_pdf': len(pdf_files),
                'uploaded_xml': len(uploaded_xml),
                'uploaded_pdf': len(uploaded_pdf),
                'orphaned_temp_xml': len(orphaned_temp_xml),
                'orphaned_temp_pdf': len(orphaned_temp_pdf),
                'orphaned_uploaded_xml': len(orphaned_uploaded_xml),
                'orphaned_uploaded_pdf': len(orphaned_uploaded_pdf)
            },
            'database': {
                'valid_records': len(valid_records),
                'orphaned_records': len(orphaned_db_records),
                'rpa_invoices': rpa_invoices,
                'complete_pairs': complete_pairs,
                'xml_only': xml_only,
                'pdf_only': pdf_only
            },
            'cleanup_needed': total_orphaned_files > 0 or total_orphaned_records > 0
        }
        
        # Save report
        with open('orphaned_files_report.json', 'w') as f:
            json.dump(report, f, indent=2)
            
        print(f"\n📄 Detailed report saved to: orphaned_files_report.json")
        
        pg_conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error checking orphaned files: {e}")
        return False

if __name__ == "__main__":
    check_orphaned_files()
