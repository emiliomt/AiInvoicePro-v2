
#!/usr/bin/env python3
"""
Clear RPA databases and reset system for debugging purposes
Updated to match current RPA system implementation with enhanced XML/PDF processing,
manual pipeline integration, and improved duplicate detection
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
    """Clear PostgreSQL RPA operational tables while preserving all configurations"""
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

        # Clear RPA operational data tables ONLY (preserve ALL user configurations)
        operational_tables = [
            'imported_invoices',           # RPA downloaded/processed files
            'invoice_importer_logs',       # RPA execution logs
            # NOTE: The following tables are INTENTIONALLY PRESERVED:
            # - invoice_importer_configs: ALL RPA task configurations and settings
            # - erp_connections: ERP connection details, credentials, URLs
            # - validation_rules: Custom validation rules
            # - settings: System settings and preferences
        ]

        cleared_count = 0
        for table in operational_tables:
            try:
                # Check if table exists first
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    );
                """, (table,))

                if cursor.fetchone()[0]:
                    # Get count before clearing
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    before_count = cursor.fetchone()[0]

                    cursor.execute(f"DELETE FROM {table}")
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    after_count = cursor.fetchone()[0]
                    records_cleared = before_count - after_count
                    cleared_count += records_cleared

                    print(f"Cleared PostgreSQL table: {table} (removed {records_cleared} records)")
                else:
                    print(f"⚠️  Table {table} does not exist")
            except Exception as e:
                print(f"⚠️  Could not clear table {table}: {e}")

        # Reset operational sequences only (preserve config sequences)
        try:
            cursor.execute("SELECT setval('invoice_importer_logs_id_seq', 1, false)")
            cursor.execute("SELECT setval('imported_invoices_id_seq', 1, false)")
            print("✅ Reset operational PostgreSQL sequences")
        except Exception as e:
            print(f"⚠️  Could not reset sequences: {e}")

        # Clear RPA-generated invoices from main invoices table
        try:
            cursor.execute("SELECT COUNT(*) FROM invoices WHERE user_id = 'rpa-system'")
            rpa_invoice_count = cursor.fetchone()[0]
            if rpa_invoice_count > 0:
                cursor.execute("DELETE FROM invoices WHERE user_id = 'rpa-system'")
                print(f"Cleared {rpa_invoice_count} RPA-generated invoices from main invoices table")
                cleared_count += rpa_invoice_count
        except Exception as e:
            print(f"⚠️  Could not clear RPA invoices from main table: {e}")

        conn.commit()
        conn.close()
        print(f"✅ Cleared PostgreSQL operational data (total records removed: {cleared_count})")

    except Exception as e:
        print(f"❌ Error clearing PostgreSQL tables: {e}")

def clear_files_in_directory(directory, keep_db_files=False, file_patterns=None, description=""):
    """Clear files in a directory with optional pattern filtering"""
    if os.path.exists(directory):
        try:
            files = os.listdir(directory)
            file_count = 0

            for file in files:
                # Skip database files if requested
                if keep_db_files and file.endswith('.db'):
                    continue

                # Check file patterns if specified
                if file_patterns:
                    should_remove = False
                    for pattern in file_patterns:
                        if pattern in file or file.endswith(pattern):
                            should_remove = True
                            break
                    if not should_remove:
                        continue

                file_path = os.path.join(directory, file)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    file_count += 1
                elif os.path.isdir(file_path):
                    # Remove subdirectories recursively
                    shutil.rmtree(file_path)
                    file_count += 1

            desc_text = f" ({description})" if description else ""
            if file_count > 0:
                print(f"🗑️  Removed {file_count} files/folders from {directory}{desc_text}")
            else:
                print(f"ℹ️  No files to remove from {directory}{desc_text}")
        except Exception as e:
            print(f"❌ Error clearing directory {directory}: {e}")
    else:
        print(f"ℹ️  Directory {directory} does not exist")

def clear_rpa_debug_captures():
    """Clear RPA debug captures while preserving directory structure"""
    debug_dir = "rpa_debug_captures"
    if os.path.exists(debug_dir):
        try:
            # Get all subdirectories (dates)
            subdirs = [d for d in os.listdir(debug_dir) if os.path.isdir(os.path.join(debug_dir, d))]
            total_files = 0

            for subdir in subdirs:
                subdir_path = os.path.join(debug_dir, subdir)
                files = os.listdir(subdir_path)
                file_count = len(files)
                total_files += file_count

                # Remove all files in the subdirectory
                for file in files:
                    file_path = os.path.join(subdir_path, file)
                    if os.path.isfile(file_path):
                        os.remove(file_path)

                if file_count > 0:
                    print(f"🗑️  Cleared {file_count} debug files from {subdir_path}")

            if total_files > 0:
                print(f"✅ Cleared {total_files} total RPA debug capture files")
            else:
                print("ℹ️  No debug capture files to clear")

        except Exception as e:
            print(f"❌ Error clearing RPA debug captures: {e}")
    else:
        print(f"ℹ️  RPA debug captures directory does not exist")

def clear_processed_files():
    """Clear files processed through RPA pipeline from uploads directory"""
    try:
        uploads_dir = "uploads"
        if os.path.exists(uploads_dir):
            # Remove RPA-processed files from uploads (XML/PDF files processed through manual pipeline)
            rpa_files = []
            for file in os.listdir(uploads_dir):
                if file.endswith('.xml') or file.endswith('.pdf'):
                    # Check if this looks like an RPA-generated filename pattern
                    # RPA files typically have invoice_number_vendor_id pattern
                    if '_' in file and len(file.split('_')) >= 2:
                        rpa_files.append(file)

            for file in rpa_files:
                file_path = os.path.join(uploads_dir, file)
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"⚠️  Could not remove {file}: {e}")

            if rpa_files:
                print(f"🗑️  Removed {len(rpa_files)} RPA-processed files from uploads directory")
            else:
                print("ℹ️  No RPA-processed files found in uploads directory")
        else:
            print("ℹ️  Uploads directory does not exist")

    except Exception as e:
        print(f"❌ Error clearing processed files: {e}")

def clear_temp_processing_files():
    """Clear temporary RPA processing files with comprehensive patterns"""
    try:
        print("🧹 Clearing RPA-specific temporary files...")
        
        # Clear /tmp directory patterns
        temp_patterns = [
            "invoice_*",        # Invoice processing temp files
            "rpa_*",           # RPA session files
            "sinco_*",         # ERP-specific files
            "*.zip",           # Downloaded ZIP files
            "*.crdownload",    # Chrome incomplete downloads
            "WORKFLOW_RESULT*", # Python automation results
            "STATS*",          # Progress stats files
        ]
        
        if os.path.exists("/tmp"):
            total_removed = 0
            for pattern in temp_patterns:
                files = glob.glob(os.path.join("/tmp", pattern))
                for file_path in files:
                    try:
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            total_removed += 1
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                            total_removed += 1
                    except Exception as e:
                        print(f"⚠️  Could not remove {file_path}: {e}")
            
            if total_removed > 0:
                print(f"🗑️  Removed {total_removed} RPA temp files from /tmp")
            else:
                print("ℹ️  No RPA temp files found in /tmp")

        # Clear specific temp directories used by RPA
        temp_directories = [
            "/tmp/invoice_downloads",
            "/tmp/xml_invoices",
            "/tmp/invoice_downloads/pdfs",
        ]

        for temp_dir in temp_directories:
            clear_files_in_directory(temp_dir, description=f"temp processing files")

    except Exception as e:
        print(f"❌ Error clearing temp processing files: {e}")

def clear_automation_artifacts():
    """Clear automation artifacts and log files from current workflow"""
    try:
        print("🧹 Cleaning up automation artifacts...")
        cleanup_patterns = [
            (".", "*.log"),                    # Log files in root
            (".", "automation_*.json"),        # Automation configs
            (".", "rpa_session_*.json"),       # RPA session files
            (".", "debug_*.html"),             # Debug HTML files
            (".", "screenshot_*.png"),         # Debug screenshots
            (".", "*.crdownload"),             # Chrome incomplete downloads
            (".", "WORKFLOW_RESULT:*"),        # Python automation results
            (".", "STATS:*"),                  # Progress stats files
            (".", "geckodriver.log"),          # Firefox driver logs
            (".", "chromedriver.log"),         # Chrome driver logs
        ]

        total_pattern_files = 0
        for base_dir, pattern in cleanup_patterns:
            if os.path.exists(base_dir):
                files = glob.glob(os.path.join(base_dir, pattern))
                for file_path in files:
                    try:
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            total_pattern_files += 1
                    except Exception as e:
                        print(f"⚠️  Could not remove {file_path}: {e}")

        if total_pattern_files > 0:
            print(f"🗑️  Removed {total_pattern_files} automation artifact files")
        else:
            print("ℹ️  No automation artifacts found")

    except Exception as e:
        print(f"❌ Error clearing automation artifacts: {e}")

def clear_workflow_logs():
    """Clear workflow execution logs but preserve configuration files"""
    try:
        print("🗂️  Clearing workflow execution logs...")
        
        # Clear browser automation logs
        browser_log_patterns = [
            "geckodriver*.log",
            "chromedriver*.log", 
            "selenium*.log",
        ]
        
        log_count = 0
        for pattern in browser_log_patterns:
            files = glob.glob(pattern)
            for file_path in files:
                try:
                    os.remove(file_path)
                    log_count += 1
                except Exception as e:
                    print(f"⚠️  Could not remove {file_path}: {e}")
        
        if log_count > 0:
            print(f"🗑️  Removed {log_count} workflow log files")
        else:
            print("ℹ️  No workflow log files to clear")
            
    except Exception as e:
        print(f"❌ Error clearing workflow logs: {e}")

def main():
    """Main function to clear all RPA operational data while preserving configurations"""
    print("🗑️  Clearing RPA operational data for fresh debugging...")
    print("📋 This will reset duplicate detection and allow re-processing of invoices")
    print("🤖 Updated for current RPA workflow with enhanced processing and real-time progress")
    print("🔒 ALL USER CONFIGURATIONS WILL BE PRESERVED")

    # 1. Clear PostgreSQL operational tables
    print("\n📊 Clearing PostgreSQL operational data...")
    clear_postgresql_tables()

    # 2. Clear local SQLite databases used by Python RPA
    print("\n💾 Clearing local SQLite databases...")
    sqlite_databases = [
        ("/tmp/invoice_downloads/invoices.db", "Invoice tracking"),
        ("/tmp/xml_invoices/invoices_xml.db", "XML processing"),
        ("rpa_automation.db", "Local automation tracking"),
    ]

    for db_path, db_desc in sqlite_databases:
        clear_sqlite_database(db_path, db_desc)

    # 3. Clear downloaded files and processing directories
    print("\n📁 Clearing downloaded files and processing data...")
    processing_directories = [
        ("/tmp/invoice_downloads", "Python RPA downloads"),
        ("/tmp/xml_invoices", "XML processing temp files"),
        ("/tmp/invoice_downloads/pdfs", "PDF files directory"),
    ]

    for directory, description in processing_directories:
        clear_files_in_directory(directory, keep_db_files=False, description=description)

    # 4. Clear processed files from manual pipeline
    print("\n📤 Clearing processed files from manual pipeline...")
    clear_processed_files()

    # 5. Clear RPA debug captures (screenshots, HTML, debug info)
    print("\n📸 Clearing RPA debug captures...")
    clear_rpa_debug_captures()

    # 6. Clear temporary processing files
    print("\n🧹 Clearing temporary processing files...")
    clear_temp_processing_files()

    # 7. Clear automation artifacts
    print("\n🔧 Clearing automation artifacts...")
    clear_automation_artifacts()

    # 8. Clear workflow execution logs
    print("\n📋 Clearing workflow execution logs...")
    clear_workflow_logs()

    # 9. Recreate necessary directories
    print("\n📂 Recreating necessary directories...")
    essential_dirs = [
        "/tmp/invoice_downloads",
        "/tmp/xml_invoices", 
        "/tmp/invoice_downloads/pdfs",
        "uploads",
        "rpa_debug_captures"
    ]

    for directory in essential_dirs:
        os.makedirs(directory, exist_ok=True)
        print(f"📁 Ensured directory exists: {directory}")

    # 10. Create today's debug capture directory
    today = datetime.now().strftime("%Y-%m-%d")
    debug_today_dir = os.path.join("rpa_debug_captures", today)
    os.makedirs(debug_today_dir, exist_ok=True)
    print(f"📁 Created today's debug directory: {debug_today_dir}")

    print("\n" + "="*80)
    print("✅ RPA OPERATIONAL DATA RESET COMPLETE - READY FOR FRESH DEBUGGING!")
    print("="*80)
    
    print("\n🔧 OPERATIONAL DATA CLEARED:")
    print("   • PostgreSQL tables: imported_invoices, invoice_importer_logs")
    print("   • RPA-generated invoices: All invoices with user_id='rpa-system'")
    print("   • SQLite databases: Invoice tracking and XML processing databases") 
    print("   • Downloaded files: ZIP, XML, and PDF files from RPA downloads")
    print("   • Processed files: Files moved through manual upload pipeline")
    print("   • Debug captures: RPA screenshots, HTML snapshots, and automation logs")
    print("   • Temporary files: All RPA processing files and automation artifacts")
    print("   • Workflow logs: Browser automation logs and execution traces")
    print("   • Progress files: Real-time progress tracking and stats files")
    print("   • Database sequences: Reset operational sequences only")
    
    print("\n✅ CONFIGURATIONS PRESERVED:")
    print("   • RPA task configurations: invoice_importer_configs table (ALL settings intact)")
    print("   • ERP connections: erp_connections table with credentials and URLs")
    print("   • User credentials: All stored ERP usernames and passwords")
    print("   • Task settings: RPA schedules, file types, download paths, timeouts")
    print("   • Processing settings: Headless mode, ZIP timeouts, file type preferences")
    print("   • Validation rules: Custom validation rules and business logic")
    print("   • System settings: Application preferences and configurations")
    print("   • Manual uploads: Non-RPA uploaded files remain untouched")
    
    print("\n🔄 SYSTEM READY FOR:")
    print("   • Fresh RPA automation runs with clean operational state")
    print("   • Re-processing invoices that were previously marked as duplicates")
    print("   • Testing enhanced XML/PDF processing and manual pipeline integration")
    print("   • Debugging token-based file matching and duplicate detection")
    print("   • Validating improved processing status lifecycle tracking")
    print("   • Real-time progress monitoring with WebSocket connections")
    
    print("\n🤖 The RPA system will now operate with:")
    print("   • Enhanced duplicate detection using normalized invoice tokens")
    print("   • Improved XML/PDF file pairing with multiple matching strategies")
    print("   • Better processing status tracking (downloaded → processing → completed)")
    print("   • Robust error handling and retry logic for failed invoices")
    print("   • Real-time progress reporting with live statistics updates")
    print("   • Comprehensive debug capture system for troubleshooting")

if __name__ == "__main__":
    main()
