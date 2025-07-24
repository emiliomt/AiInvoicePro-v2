
#!/usr/bin/env python3
"""
Clear RPA databases and reset system for debugging purposes
Updated to match current RPA system implementation
"""

import os
import sqlite3
import sys
import glob
import shutil
from datetime import datetime

def clear_sqlite_database(db_path, db_type):
    """Clear a SQLite database"""
    try:
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get table names
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            if tables:
                for table in tables:
                    table_name = table[0]
                    cursor.execute(f"DELETE FROM {table_name}")
                    print(f"Cleared SQLite table: {table_name}")
                
                conn.commit()
                print(f"✅ Cleared {db_type} SQLite database: {db_path}")
            else:
                print(f"ℹ️  No tables found in {db_type} database: {db_path}")
            
            conn.close()
        else:
            print(f"⚠️  SQLite database not found: {db_path}")
            
    except Exception as e:
        print(f"❌ Error clearing {db_type} SQLite database: {e}")

def clear_postgresql_tables():
    """Clear PostgreSQL RPA tables"""
    try:
        # Try psycopg2 first, then fall back to environment check
        try:
            import psycopg2
            psycopg2_available = True
        except ImportError:
            psycopg2_available = False
            print("⚠️  psycopg2 not available - skipping PostgreSQL cleanup")
            return
        
        # Get DATABASE_URL from environment
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            print("⚠️  DATABASE_URL not found - skipping PostgreSQL cleanup")
            return
            
        # Connect to PostgreSQL
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Clear RPA operational data tables (preserve user configurations)
        tables_to_clear = [
            'imported_invoices',           # Child table first
            'invoice_importer_logs',       # Parent of imported_invoices
            # NOTE: invoice_importer_configs is preserved to keep user RPA settings
        ]
        
        for table in tables_to_clear:
            try:
                # Check if table exists first
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    );
                """, (table,))
                
                if cursor.fetchone()[0]:
                    cursor.execute(f"DELETE FROM {table}")
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cursor.fetchone()[0]
                    print(f"Cleared PostgreSQL table: {table} (remaining rows: {count})")
                else:
                    print(f"⚠️  Table {table} does not exist")
            except Exception as e:
                print(f"⚠️  Could not clear table {table}: {e}")
        
        # Reset sequences to start from 1 (preserve configs sequence)
        try:
            # NOTE: invoice_importer_configs_id_seq is preserved to maintain user settings
            cursor.execute("SELECT setval('invoice_importer_logs_id_seq', 1, false)")
            cursor.execute("SELECT setval('imported_invoices_id_seq', 1, false)")
            print("✅ Reset PostgreSQL sequences (preserved configs)")
        except Exception as e:
            print(f"⚠️  Could not reset sequences: {e}")
        
        conn.commit()
        conn.close()
        print("✅ Cleared PostgreSQL RPA tables")
        
    except Exception as e:
        print(f"❌ Error clearing PostgreSQL tables: {e}")

def clear_files_in_directory(directory, keep_db_files=False):
    """Clear files in a directory"""
    if os.path.exists(directory):
        try:
            files = os.listdir(directory)
            file_count = 0
            
            for file in files:
                # Skip database files if requested
                if keep_db_files and file.endswith('.db'):
                    continue
                    
                file_path = os.path.join(directory, file)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    file_count += 1
                elif os.path.isdir(file_path):
                    # Remove subdirectories recursively
                    shutil.rmtree(file_path)
                    file_count += 1
                    
            print(f"🗑️  Removed {file_count} files/folders from {directory}")
        except Exception as e:
            print(f"❌ Error clearing directory {directory}: {e}")
    else:
        print(f"ℹ️  Directory {directory} does not exist")

def main():
    """Main function to clear all RPA databases and files"""
    print("🗑️  Clearing RPA databases and files for debugging...")
    print("📋 This will reset the duplicate detection system and allow re-processing of invoices")
    
    # 1. Clear PostgreSQL tables
    print("\n📊 Clearing PostgreSQL RPA tables...")
    clear_postgresql_tables()
    
    # 2. Clear local SQLite databases used by Python RPA
    print("\n💾 Clearing local SQLite databases...")
    sqlite_databases = [
        "/tmp/invoice_downloads/invoices.db",    # Main invoice tracking
        "/tmp/xml_invoices/invoices_xml.db"      # XML-specific tracking
    ]
    
    for db_path in sqlite_databases:
        db_name = os.path.basename(db_path)
        clear_sqlite_database(db_path, db_name)
    
    # 3. Clear downloaded files and debug captures
    print("\n📁 Clearing downloaded files and debug data...")
    directories_to_clear = [
        "/tmp/invoice_downloads",     # Python RPA downloads
        "/tmp/xml_invoices",         # XML processing temp files
        "uploads",                   # Manual invoice uploads
        "rpa_debug_captures"         # RPA debug screenshots and HTML
    ]
    
    for directory in directories_to_clear:
        clear_files_in_directory(directory, keep_db_files=False)
    
    # 4. Clear specific file patterns that might remain
    print("\n🧹 Cleaning up specific file patterns...")
    cleanup_patterns = [
        ("/tmp", "*.zip"),           # Downloaded ZIP files
        ("/tmp", "*.xml"),           # Extracted XML files
        ("/tmp", "*.pdf"),           # Extracted PDF files
        (".", "*.log"),              # Log files in root
    ]
    
    for base_dir, pattern in cleanup_patterns:
        if os.path.exists(base_dir):
            files = glob.glob(os.path.join(base_dir, pattern))
            for file_path in files:
                try:
                    os.remove(file_path)
                    print(f"🗑️  Removed: {file_path}")
                except Exception as e:
                    print(f"⚠️  Could not remove {file_path}: {e}")
    
    # 5. Recreate necessary directories
    print("\n📂 Recreating necessary directories...")
    essential_dirs = [
        "/tmp/invoice_downloads",
        "/tmp/xml_invoices", 
        "uploads",
        "rpa_debug_captures"
    ]
    
    for directory in essential_dirs:
        os.makedirs(directory, exist_ok=True)
        print(f"📁 Ensured directory exists: {directory}")
    
    # 6. Create today's debug capture directory
    today = datetime.now().strftime("%Y-%m-%d")
    debug_today_dir = os.path.join("rpa_debug_captures", today)
    os.makedirs(debug_today_dir, exist_ok=True)
    print(f"📁 Created today's debug directory: {debug_today_dir}")
    
    print("\n✅ RPA database and file reset complete - ready for fresh debugging!")
    print("\n🔧 What was cleared:")
    print("   • PostgreSQL tables: imported_invoices, invoice_importer_logs")
    print("   • SQLite databases: /tmp/invoice_downloads/invoices.db, /tmp/xml_invoices/invoices_xml.db") 
    print("   • Downloaded files: ZIP, XML, and PDF files from RPA downloads")
    print("   • Uploaded files: Manual invoice uploads")
    print("   • Debug captures: RPA screenshots and HTML snapshots")
    print("   • Temporary files: All temp processing files")
    print("   • Database sequences: Reset operational sequences only")
    print("\n✅ What was preserved:")
    print("   • RPA configurations: invoice_importer_configs table (user settings intact)")
    print("   • ERP connections: All connection settings maintained")
    print("\n🔄 The RPA system will now re-process invoices that were previously skipped as duplicates")

if __name__ == "__main__":
    main()
