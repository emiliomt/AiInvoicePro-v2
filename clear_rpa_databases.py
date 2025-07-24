
#!/usr/bin/env python3
"""
Clear RPA SQLite databases to allow fresh imports
Updated to match the exact paths used by PythonRPAService
"""

import os
import sqlite3
import sys
import shutil

def clear_database(db_path, db_type):
    """Clear a SQLite database"""
    try:
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get table name - should be 'downloaded_invoices' for both databases
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            for table in tables:
                table_name = table[0]
                if table_name != 'sqlite_sequence':  # Skip SQLite internal table
                    cursor.execute(f"DELETE FROM {table_name}")
                    record_count = cursor.rowcount
                    print(f"Cleared table: {table_name} ({record_count} records)")
            
            conn.commit()
            conn.close()
            print(f"✅ Cleared {db_type} database: {db_path}")
        else:
            print(f"⚠️  Database not found: {db_path}")
            # Create the directory structure if it doesn't exist
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            print(f"📁 Created directory: {os.path.dirname(db_path)}")
            
    except Exception as e:
        print(f"❌ Error clearing {db_type} database: {e}")

def clear_directory_files(directory, keep_db_files=True):
    """Clear all files from directory except database files if specified"""
    if not os.path.exists(directory):
        print(f"📁 Creating directory: {directory}")
        os.makedirs(directory, exist_ok=True)
        return 0
    
    try:
        files = os.listdir(directory)
        file_count = 0
        for file in files:
            file_path = os.path.join(directory, file)
            if os.path.isfile(file_path):
                # Skip database files if keep_db_files is True
                if keep_db_files and (file.endswith('.db') or file.endswith('.sqlite')):
                    continue
                os.remove(file_path)
                file_count += 1
            elif os.path.isdir(file_path):
                # Remove subdirectories and their contents
                shutil.rmtree(file_path)
                file_count += 1
        
        return file_count
    except Exception as e:
        print(f"❌ Error clearing directory {directory}: {e}")
        return 0

def main():
    """Main function to clear RPA databases"""
    print("🗑️  Clearing RPA SQLite databases...")
    
    # Database paths as used by PythonRPAService
    downloads_db = "/tmp/invoice_downloads/invoices.db"
    xml_db = "/tmp/xml_invoices/invoices_xml.db"
    
    # Clear downloads database
    clear_database(downloads_db, "downloads")
    
    # Clear XML database  
    clear_database(xml_db, "XML")
    
    # Clear downloaded files but keep database files
    downloads_dir = "/tmp/invoice_downloads"
    xml_dir = "/tmp/xml_invoices"
    
    print("🗑️  Clearing downloaded files...")
    
    # Clear ZIP files and other downloads (but keep the database)
    downloads_count = clear_directory_files(downloads_dir, keep_db_files=True)
    print(f"🗑️  Removed {downloads_count} files from {downloads_dir}")
    
    # Clear XML files and temp extraction folders (but keep the database)
    xml_count = clear_directory_files(xml_dir, keep_db_files=True)
    print(f"🗑️  Removed {xml_count} files from {xml_dir}")
    
    # Also clear any temporary extraction directories that might be left over
    temp_extract_dir = os.path.join(downloads_dir, "__temp_extract__")
    if os.path.exists(temp_extract_dir):
        try:
            shutil.rmtree(temp_extract_dir)
            print(f"🗑️  Removed temporary extraction directory: {temp_extract_dir}")
        except Exception as e:
            print(f"❌ Error removing temp directory: {e}")
    
    print("✅ RPA database reset complete - ready for fresh imports!")
    print("📋 Summary:")
    print(f"   - Downloads DB: {downloads_db}")
    print(f"   - XML DB: {xml_db}")
    print(f"   - Downloads directory: {downloads_dir}")
    print(f"   - XML directory: {xml_dir}")

if __name__ == "__main__":
    main()
