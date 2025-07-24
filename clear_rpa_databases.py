
#!/usr/bin/env python3
"""
Clear RPA databases and reset system for debugging purposes
"""

import os
import sqlite3
import sys
import psycopg2
from urllib.parse import urlparse

def clear_sqlite_database(db_path, db_type):
    """Clear a SQLite database"""
    try:
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get table names
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            for table in tables:
                table_name = table[0]
                cursor.execute(f"DELETE FROM {table_name}")
                print(f"Cleared SQLite table: {table_name}")
            
            conn.commit()
            conn.close()
            print(f"✅ Cleared {db_type} SQLite database: {db_path}")
        else:
            print(f"⚠️  SQLite database not found: {db_path}")
            
    except Exception as e:
        print(f"❌ Error clearing {db_type} SQLite database: {e}")

def clear_postgresql_tables():
    """Clear PostgreSQL RPA tables"""
    try:
        # Get DATABASE_URL from environment
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            print("⚠️  DATABASE_URL not found - skipping PostgreSQL cleanup")
            return
            
        # Connect to PostgreSQL
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Clear RPA tables in correct order (due to foreign keys)
        tables_to_clear = [
            'imported_invoices',
            'invoice_importer_logs', 
            'invoice_importer_configs'
        ]
        
        for table in tables_to_clear:
            try:
                cursor.execute(f"DELETE FROM {table}")
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"Cleared PostgreSQL table: {table} (remaining rows: {count})")
            except Exception as e:
                print(f"⚠️  Could not clear table {table}: {e}")
        
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
                    import shutil
                    shutil.rmtree(file_path)
                    file_count += 1
                    
            print(f"🗑️  Removed {file_count} files/folders from {directory}")
        except Exception as e:
            print(f"❌ Error clearing directory {directory}: {e}")

def main():
    """Main function to clear all RPA databases and files"""
    print("🗑️  Clearing RPA databases and files for debugging...")
    
    # 1. Clear PostgreSQL tables
    print("\n📊 Clearing PostgreSQL RPA tables...")
    clear_postgresql_tables()
    
    # 2. Clear local SQLite databases
    print("\n💾 Clearing local SQLite databases...")
    sqlite_databases = [
        "/tmp/invoice_downloads/invoices.db",
        "/tmp/xml_invoices/invoices_xml.db"
    ]
    
    for db_path in sqlite_databases:
        db_name = os.path.basename(db_path)
        clear_sqlite_database(db_path, db_name)
    
    # 3. Clear downloaded files
    print("\n📁 Clearing downloaded files...")
    directories_to_clear = [
        "/tmp/invoice_downloads",
        "/tmp/xml_invoices",
        "uploads",  # Clear uploaded invoices
        "rpa_debug_captures"  # Clear debug screenshots
    ]
    
    for directory in directories_to_clear:
        clear_files_in_directory(directory, keep_db_files=False)
    
    # 4. Recreate necessary directories
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
    
    print("\n✅ RPA database and file reset complete - ready for fresh debugging!")
    print("\n🔧 What was cleared:")
    print("   • PostgreSQL tables: imported_invoices, invoice_importer_logs, invoice_importer_configs")
    print("   • SQLite databases: /tmp/invoice_downloads/invoices.db, /tmp/xml_invoices/invoices_xml.db") 
    print("   • Downloaded files: ZIP and XML files from RPA downloads")
    print("   • Uploaded files: Manual invoice uploads")
    print("   • Debug captures: RPA screenshots and HTML snapshots")

if __name__ == "__main__":
    main()
