
#!/usr/bin/env python3
"""
Clear RPA SQLite databases to allow fresh imports
"""

import os
import sqlite3
import sys

def clear_database(db_path, db_type):
    """Clear a SQLite database"""
    try:
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get table name
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            for table in tables:
                table_name = table[0]
                cursor.execute(f"DELETE FROM {table_name}")
                print(f"Cleared table: {table_name}")
            
            conn.commit()
            conn.close()
            print(f"✅ Cleared {db_type} database: {db_path}")
        else:
            print(f"⚠️  Database not found: {db_path}")
            
    except Exception as e:
        print(f"❌ Error clearing {db_type} database: {e}")

def main():
    """Main function to clear RPA databases"""
    print("🗑️  Clearing RPA SQLite databases...")
    
    # Clear downloads database
    downloads_db = "/tmp/invoice_downloads/invoices.db"
    clear_database(downloads_db, "downloads")
    
    # Clear XML database  
    xml_db = "/tmp/xml_invoices/invoices_xml.db"
    clear_database(xml_db, "XML")
    
    # Also clear any downloaded files
    downloads_dir = "/tmp/invoice_downloads"
    xml_dir = "/tmp/xml_invoices"
    
    for directory in [downloads_dir, xml_dir]:
        if os.path.exists(directory):
            try:
                files = os.listdir(directory)
                file_count = 0
                for file in files:
                    if file != "invoices.db" and file != "invoices_xml.db":
                        file_path = os.path.join(directory, file)
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            file_count += 1
                print(f"🗑️  Removed {file_count} files from {directory}")
            except Exception as e:
                print(f"❌ Error clearing directory {directory}: {e}")
    
    print("✅ RPA database reset complete - ready for fresh imports!")

if __name__ == "__main__":
    main()
