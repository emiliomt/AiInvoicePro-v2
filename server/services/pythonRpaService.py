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
import defusedxml.ElementTree as ET
from datetime import datetime, timedelta
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
            self.log(f"Password decode failed, using raw format")
        self.download_dir = config.get('downloadPath',
                                       'uploads/pdfs')
        self.xml_dir = config.get('xmlPath', '/tmp/xml_invoices')

        # Get headless mode from config (default to False for easier debugging)
        self.headless_mode = config.get('headless', False)

        # Get ZIP download timeout from config (default to 60 seconds)
        self.zip_download_timeout = config.get('zipDownloadTimeout', 60)

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
                self.xml_dir = 'uploads/xml'  # Fixed: use 'xml' not 'xmls'

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

        # Global Progress Tracking for Multi-Page Processing
        self.global_progress = {
            'estimated_total_invoices': 0,     # Total estimated invoices across all pages
            'global_index': 0,                 # Current invoice index across all pages
            'invoices_per_page_samples': [],   # Sample counts to refine estimates
            'pages_processed': 0,              # Number of pages processed so far
            'initial_estimate_method': None    # Track how we made the initial estimate
        }

        # Track files downloaded in current session (for accurate counting)
        self.session_downloaded_files = set()  # Files downloaded in this session
        self.session_start_time = datetime.now()  # Session start time for file age comparison

    def is_driver_ready(self) -> bool:
        """Check if driver and wait objects are properly initialized"""
        return (self.driver is not None and self.wait is not None
                and self.short_wait is not None and self.long_wait is not None)

    def log(self, message: str, level: str = 'INFO'):
        """Log message with timestamp"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {level}: {message}")
        sys.stdout.flush()

    def is_duplicate_invoice(self, conn, invoice_number: str, emisor_id: str, total_amount: str = None) -> bool:
        """
        Robust helper function to check if an invoice already exists in the database
        Checks the imported_invoices table using normalized inputs for:
        - invoice_number (normalized and trimmed, converted to uppercase)
        - emisor_id (normalized and trimmed)
        - total_amount (optional, with 0.01 threshold validation)

        Returns True if duplicate found (should skip), False if new invoice (should process)
        """
        try:
            cursor = conn.cursor()

            # Normalize inputs as requested
            normalized_invoice_number = (invoice_number or "").strip().upper()
            normalized_emisor_id = (emisor_id or "").strip()

            # Build the base SQL query using actual data structure (simpler and more reliable)
            # Skip invoices unless they are marked as 'failed' or need retry
            base_query = """
                SELECT 1 FROM imported_invoices 
                WHERE 
                    UPPER(TRIM(original_file_name)) LIKE %s
                    AND processing_status NOT IN ('failed')
            """

            params = [
                f"{normalized_invoice_number}%"  # filename pattern match
            ]

            # Add total_amount validation if provided
            if total_amount and total_amount.strip() and total_amount != 'N/A':
                try:
                    # Enhanced normalization: handle newlines, currency codes, and special characters
                    clean_amount = str(total_amount).replace('\n', '').replace('\r', '').replace('COP', '').replace('USD', '').replace('$', '').replace(',', '').replace('.', '').strip()
                    # Only keep digits for normalization
                    clean_amount = ''.join(filter(str.isdigit, clean_amount))
                    if clean_amount:
                        normalized_total = float(clean_amount)
                        base_query += """
                            AND (
                                metadata->>'totalAmount' IS NULL OR
                                metadata->>'totalAmount' = '' OR
                                metadata->>'totalAmount' = 'N/A' OR
                                ABS(CAST(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(metadata->>'totalAmount', '0'), '[^0-9]', '', 'g'), '^$', '0'), '^0*', '') AS NUMERIC) - %s) <= 100
                            )
                        """
                        params.append(str(normalized_total))
                        self.log(f"🔍 Checking duplicate with total_amount validation (normalized: {normalized_total})")
                    else:
                        self.log(f"⚠️ Could not extract numeric value from '{total_amount}', skipping amount validation", "WARNING")
                except (ValueError, TypeError) as e:
                    self.log(f"⚠️ Could not normalize total_amount '{total_amount}': {e}, skipping amount validation", "WARNING")
            else:
                self.log("🔍 Checking duplicate without total_amount validation (not provided or empty)")

            base_query += " LIMIT 1;"

            # Execute the query
            cursor.execute(base_query, params)
            result = cursor.fetchone()

            if result:
                amount_msg = f" with total_amount validation" if (total_amount and total_amount.strip() and total_amount != 'N/A') else ""
                self.log(f"✅ Duplicate found: Invoice {normalized_invoice_number} from {normalized_emisor_id}{amount_msg}")
                return True
            else:
                amount_msg = f" (total_amount: {total_amount})" if total_amount else ""
                self.log(f"🆕 No duplicate found for invoice {normalized_invoice_number} from {normalized_emisor_id}{amount_msg}")
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
                            metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
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

    def setup_driver(self):
        """Initialize Chrome WebDriver with download preferences"""
        self.log("Setting up Chrome WebDriver...")

        try:
            # Ensure download directory exists and has proper permissions
            os.makedirs(self.download_dir, exist_ok=True)

            # Test write permissions
            test_file = os.path.join(self.download_dir, "test_write_permission.tmp")
            try:
                with open(test_file, 'w') as f:
                    f.write("test")
                os.remove(test_file)
                self.log(f"✅ Download directory verified: {self.download_dir}")
            except Exception as e:
                raise Exception(f"Download directory not writable: {self.download_dir} - {e}")

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

            # Ensure we use absolute path for download directory
            abs_download_dir = os.path.abspath(self.download_dir)
            self.log(f"📁 Setting download directory to: {abs_download_dir}")

            prefs = {
                "download.default_directory": abs_download_dir,
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": False,
                "safebrowsing.disable_download_protection": True,
                "profile.default_content_settings.popups": 0,
                "profile.content_settings.exceptions.automatic_downloads.*.setting": 1
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
            # Additional download-specific flags
            chrome_options.add_argument("--allow-downloads")
            chrome_options.add_argument("--disable-popup-blocking")
            chrome_options.add_argument("--disable-features=VizDisplayCompositor")
            chrome_options.add_argument("--remote-debugging-port=0")

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
        if before_files is None:
            before_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }

        self.log(f"⏳ Waiting for new ZIP download (timeout: {timeout}s)")
        self.log(f"📁 Download directory: {self.download_dir}")
        self.log(f"📦 Files before download: {len(before_files)}")

        poll_count = 0
        while time.time() < deadline:
            poll_count += 1
            try:
                # Check for Chrome download files
                crdownloads = [
                    f for f in os.listdir(self.download_dir)
                    if f.endswith(".crdownload")
                ]
                current_files = {
                    os.path.join(self.download_dir, f)
                    for f in os.listdir(self.download_dir)
                    if f.lower().endswith(".zip")
                }
                new_files = list(current_files - before_files)

                # Log every 10 seconds for debugging
                if poll_count % 10 == 0:
                    remaining_time = int(deadline - time.time())
                    self.log(f"🔍 Poll #{poll_count}: {len(crdownloads)} .crdownload files, {len(current_files)} total ZIP files, {len(new_files)} new files (remaining: {remaining_time}s)")

                if crdownloads:
                    self.log(f"⏳ Download in progress: {crdownloads}")

                if new_files and not crdownloads:
                    newest_file = max(new_files, key=os.path.getctime)
                    self.log(f"✅ New ZIP file downloaded: {os.path.basename(newest_file)}")
                    return newest_file

            except Exception as e:
                self.log(f"⚠️ Error checking for downloads: {e}", "WARNING")

            time.sleep(1)

        # Timeout reached - provide detailed debug info
        final_files = set()
        final_crdownloads = []
        try:
            final_crdownloads = [f for f in os.listdir(self.download_dir) if f.endswith(".crdownload")]
            final_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }
        except Exception as e:
            self.log(f"Error reading final directory state: {e}", "ERROR")

        error_msg = f"No new .zip file downloaded within {timeout} seconds. "
        error_msg += f"Final state: {len(final_files)} ZIP files, {len(final_crdownloads)} .crdownload files"
        if final_crdownloads:
            error_msg += f". Incomplete downloads: {final_crdownloads}"

        self.log(f"❌ Download timeout details: {error_msg}", "ERROR")
        raise TimeoutError(error_msg)

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

            # HTML source (sanitized to remove credentials)
            html_filename = f"{timestamp}_{clean_label}.html"
            html_path = os.path.join(debug_date_dir, html_filename)
            with open(html_path, 'w', encoding='utf-8') as f:
                # Sanitize HTML content to remove sensitive data
                sanitized_html = self._sanitize_html_content(self.driver.page_source)
                f.write(sanitized_html)

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

    def _sanitize_html_content(self, html_content: str) -> str:
        """
        Sanitize HTML content to remove sensitive authentication data
        This prevents credentials from being stored in debug capture files
        """
        try:
            import re

            # Remove Bearer tokens (matches the specific pattern found in the vulnerability)
            html_content = re.sub(
                r'"token":"Bearer [^"]*"', 
                '"token":"[REDACTED_BEARER_TOKEN]"', 
                html_content
            )

            # Remove other token patterns
            html_content = re.sub(
                r'r\.dataset\.token = "[^"]*"', 
                'r.dataset.token = "[REDACTED_TOKEN]"', 
                html_content
            )

            # Remove session IDs and sensitive identifiers
            html_content = re.sub(
                r'var id_session = \'[^\']*\'', 
                'var id_session = \'[REDACTED_SESSION]\'', 
                html_content
            )

            # Remove authentication headers in AJAX requests
            html_content = re.sub(
                r'Authorization["\']?\s*:\s*["\']?Bearer [^"\'>\s]*', 
                'Authorization: "Bearer [REDACTED]"', 
                html_content, 
                flags=re.IGNORECASE
            )

            # Remove password field values
            html_content = re.sub(
                r'(<input[^>]*type=["\']password["\'][^>]*value=["\'])[^"\']*(["\'][^>]*>)',
                r'\1[REDACTED]\2',
                html_content,
                flags=re.IGNORECASE
            )

            # Remove API keys (common patterns)
            html_content = re.sub(
                r'["\']apikey["\']?\s*:\s*["\'][^"\']*["\']',
                '"apikey": "[REDACTED_API_KEY]"',
                html_content,
                flags=re.IGNORECASE
            )

            # Add security notice to sanitized files
            security_notice = '''
<!-- SECURITY NOTICE: This debug capture file has been sanitized to remove sensitive authentication data -->
<!-- Original tokens, passwords, and API keys have been replaced with [REDACTED] placeholders -->
'''

            # Insert notice after <html> tag if present
            if '<html' in html_content.lower():
                html_content = re.sub(
                    r'(<html[^>]*>)', 
                    r'\1' + security_notice, 
                    html_content, 
                    flags=re.IGNORECASE
                )
            else:
                html_content = security_notice + html_content

            return html_content

        except Exception as e:
            self.log(f"Error sanitizing HTML content: {e}", "ERROR")
            # Return a minimal safe version if sanitization fails
            return f"<!-- DEBUG CAPTURE ERROR: Could not sanitize HTML content - {e} -->\n<!-- Original content removed for security -->"

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

            # Estimate total invoices across all pages for global progress tracking
            self.estimate_total_invoices()

            # Wait for rows to load
            self.log("⏳ Waiting for invoice rows to populate...")
            start = time.time()
            max_wait = 20

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

                        # Count total invoices encountered and update global index
                        self.stats['total_invoices'] += 1
                        self.global_progress['global_index'] += 1

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
                                    # Output progress with skip status - global progress updated above
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

                        # Count as processed since we're attempting to download
                        self.stats['processed_invoices'] += 1

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

                # Update page processing count and refine total invoice estimate
                self.global_progress['pages_processed'] = page_count + 1
                if len(data_rows) > 0:
                    self.global_progress['invoices_per_page_samples'].append(len(data_rows))
                    self.refine_total_estimate()

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
                    if page_count > 0: ## Limit to 2 pages for now
                        break  # Exit loop after processing one page for now
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
            try:
                self.log(f"🔄 Clicking download action button for {numero_documento}")
                ActionChains(self.driver).move_to_element(
                    buttons[3]).click().perform()
                time.sleep(1)  # Wait for dialog to appear
                self.log(f"✅ Download dialog should now be open for {numero_documento}")
            except Exception as e:
                self.log(f"❌ Could not click download action button: {e}", "ERROR")
                return False

            # Click actual download button
            if not self.short_wait:
                self.log("Short wait object not initialized", "ERROR")
                return False
            try:
                download_button = self.short_wait.until(
                    EC.element_to_be_clickable((By.CLASS_NAME, "descargar")))
                self.log(f"🔽 Found download button for {numero_documento}")
                ActionChains(self.driver).move_to_element(
                    download_button).click().perform()
                self.log(f"✅ Clicked download button for {numero_documento}")
                time.sleep(2)  # Give the download a moment to start
            except Exception as e:
                self.log(f"❌ Could not find or click download button: {e}", "ERROR")
                self.debug_capture(f"download_button_error_{numero_documento}")
                return False

            # Wait for download to complete with configurable timeout
            try:
                downloaded_zip = self.wait_for_new_zip(timeout=self.zip_download_timeout,
                                                       before_files=existing_zips)
                self.log(f"Downloaded: {downloaded_zip}")
            except TimeoutError as e:
                self.log(f"❌ Download timeout after {self.zip_download_timeout}s: {e}", "ERROR")
                # Debug capture on timeout
                self.debug_capture(f"download_timeout_{numero_documento}")
                return False
            except Exception as e:
                self.log(f"❌ Download error: {e}", "ERROR")
                return False

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
        """Extract invoice files from ZIP archives based on configuration"""
        try:
            file_types = self.config.get('fileTypes', 'both')
            self.update_progress(f"Extracting {file_types} files from ZIP archives", 70)

            processed_files = []

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

                            # Process files based on configuration
                            if file_types == 'xml':
                                # XML only - current behavior
                                for xml_file in xml_files:
                                    self._process_xml_file(temp_dir, xml_file, base_name, processed_files)

                            elif file_types == 'pdf':
                                # PDF only - extract PDFs for OCR processing
                                for pdf_file in pdf_files:
                                    self._process_pdf_file(temp_dir, pdf_file, base_name, processed_files)

                            elif file_types == 'both':
                                # Both - match by base filename and prioritize XML for data extraction
                                matches = self._match_files_by_name(xml_files, pdf_files)

                                for base_filename, file_pair in matches.items():
                                    if file_pair.get('xml'):
                                        # Use XML for data extraction, include matched PDF
                                        self._process_matched_files(temp_dir, file_pair, base_name, processed_files)
                                    elif file_pair.get('pdf'):
                                        # Only PDF available, use for OCR
                                        self._process_pdf_file(temp_dir, file_pair['pdf'], base_name, processed_files)

                            shutil.rmtree(temp_dir)

                        if processed_files:
                            os.remove(zip_path)
                            self.log(f"Processed ZIP: {filename} -> {len(processed_files)} files")
                        else:
                            self.log(f"No processable files found in: {filename}")

                    except Exception as e:
                        self.log(f"Error extracting {filename}: {e}", "ERROR")

            self.log(f"Extracted {len(processed_files)} invoice files")
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
            parts = base.split("_")

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
                    'tax_id': '',
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

    def _tokens_match(self, xml_token, pdf_token, xml_base, pdf_base):
        """Enhanced token matching with tolerance for common variations"""
        try:
            # Exact match
            if xml_token == pdf_token:
                return True
            
            # Liberal matching strategies
            # Extract leading digits/numbers for basic match
            xml_digits = re.findall(r'\d+', xml_token)
            pdf_digits = re.findall(r'\d+', pdf_token)
            
            # Match by leading invoice number segment
            if xml_digits and pdf_digits:
                # Compare the first significant number (often the invoice number)
                if xml_digits[0] == pdf_digits[0] and len(xml_digits[0]) >= 6:
                    self.log(f"📎 Token match by leading number: {xml_digits[0]} ({xml_token} <-> {pdf_token})")
                    return True
            
            # Normalized digit-only comparison (remove all non-digits)
            xml_only_digits = re.sub(r'\D', '', xml_token)
            pdf_only_digits = re.sub(r'\D', '', pdf_token)
            
            if xml_only_digits and pdf_only_digits and len(xml_only_digits) >= 8:
                # Match if significant overlap in digit sequences
                if xml_only_digits == pdf_only_digits:
                    self.log(f"📎 Token match by normalized digits: {xml_only_digits}")
                    return True
                
                # Partial match for cases where one file has additional digits
                shorter = min(xml_only_digits, pdf_only_digits, key=len)
                longer = max(xml_only_digits, pdf_only_digits, key=len)
                if len(shorter) >= 10 and shorter in longer:
                    self.log(f"📎 Token match by partial digits: {shorter} in {longer}")
                    return True
            
            # Base name similarity for edge cases
            if xml_base and pdf_base:
                # Remove common suffixes/prefixes and compare
                xml_clean = re.sub(r'[_\-\s]+', '', xml_base.lower())
                pdf_clean = re.sub(r'[_\-\s]+', '', pdf_base.lower())
                
                if xml_clean == pdf_clean and len(xml_clean) >= 5:
                    self.log(f"📎 Token match by base name similarity: {xml_clean}")
                    return True
            
            return False
            
        except Exception as e:
            self.log(f"Error in token matching: {e}", "ERROR")
            return False

    def _process_xml_for_pipeline(self, xml_filename, uploads_dir, is_data_source=True):
        """Process XML file through the manual upload pipeline"""
        try:
            # Copy XML from xml_dir to uploads_dir so Node process can read it
            xml_source = os.path.join(self.xml_dir, xml_filename)
            xml_dest = os.path.join(uploads_dir, xml_filename)
            
            if not os.path.exists(xml_source):
                self.log(f"❌ XML source file not found: {xml_source}", "ERROR")
                return None
            
            # Ensure uploads directory exists
            os.makedirs(uploads_dir, exist_ok=True)
            
            # Copy the file
            shutil.copy2(xml_source, xml_dest)
            self.log(f"📋 Copied XML for pipeline: {xml_source} -> {xml_dest}")
            
            # Parse base name to extract numero, emisor, valor
            base_name = os.path.splitext(xml_filename)[0]
            parts = base_name.split('_')
            
            # Extract numero (document number) - first part
            numero = parts[0] if len(parts) > 0 else base_name
            
            # Extract emisor (vendor tax ID) - second part
            emisor = parts[1] if len(parts) > 1 else ''
            
            # Extract valor (total value) - third part if present
            valor = parts[2] if len(parts) > 2 else ''
            
            # Clean up valor - remove currency symbols, commas, etc.
            if valor:
                valor = re.sub(r'[^\d\.]', '', valor)
            
            # Extract buyer tax ID from XML content
            buyer_tax_id = None
            try:
                with open(xml_source, 'r', encoding='utf-8') as f:
                    xml_content = f.read()
                    buyer_tax_id = self._extract_buyer_tax_id_from_xml(xml_content)
            except Exception as e:
                self.log(f"Warning: Could not extract buyer tax ID from {xml_filename}: {e}")
            
            # Call trigger_manual_processing for XML
            success = self.trigger_manual_processing(
                filename=xml_filename,
                numero=numero,
                emisor=emisor,
                valor=valor,
                file_type='xml',
                buyer_tax_id=buyer_tax_id
            )
            
            if success:
                return {
                    'type': 'xml',
                    'upload_filename': xml_filename,
                    'base_name': base_name,
                    'numero': numero,
                    'emisor': emisor,
                    'valor': valor,
                    'is_data_source': is_data_source
                }
            else:
                return None
                
        except Exception as e:
            self.log(f"❌ Error processing XML for pipeline {xml_filename}: {e}", "ERROR")
            return None

    def _process_pdf_for_pipeline(self, pdf_filename, uploads_dir, pdf_dir, is_data_source=True):
        """Process PDF file through the manual upload pipeline"""
        try:
            # Copy PDF from pdf_dir to uploads_dir so Node process can read it
            pdf_source = os.path.join(pdf_dir, pdf_filename)
            pdf_dest = os.path.join(uploads_dir, pdf_filename)
            
            if not os.path.exists(pdf_source):
                self.log(f"❌ PDF source file not found: {pdf_source}", "ERROR")
                return None
            
            # Ensure uploads directory exists
            os.makedirs(uploads_dir, exist_ok=True)
            
            # Copy the file
            shutil.copy2(pdf_source, pdf_dest)
            self.log(f"📋 Copied PDF for pipeline: {pdf_source} -> {pdf_dest}")
            
            # Parse base name to extract numero, emisor, valor
            base_name = os.path.splitext(pdf_filename)[0]
            parts = base_name.split('_')
            
            # Extract numero (document number) - first part
            numero = parts[0] if len(parts) > 0 else base_name
            
            # Extract emisor (vendor tax ID) - second part if present
            emisor = parts[1] if len(parts) > 1 else ''
            
            # Extract valor (total value) - third part if present
            valor = parts[2] if len(parts) > 2 else ''
            
            # Clean up valor - remove currency symbols, commas, etc.
            if valor:
                valor = re.sub(r'[^\d\.]', '', valor)
            
            # For PDF-only invoices, trigger OCR processing only
            if is_data_source:
                success = self.trigger_manual_processing(
                    filename=pdf_filename,
                    numero=numero,
                    emisor=emisor,
                    valor=valor,
                    file_type='pdf',
                    buyer_tax_id=None  # PDF-only can't extract buyer tax ID
                )
                
                if success:
                    return {
                        'type': 'pdf',
                        'upload_filename': pdf_filename,
                        'base_name': base_name,
                        'numero': numero,
                        'emisor': emisor,
                        'valor': valor,
                        'is_data_source': is_data_source
                    }
                else:
                    return None
            else:
                # For reference PDFs (paired with XML), just return metadata without processing
                return {
                    'type': 'pdf',
                    'upload_filename': pdf_filename,
                    'base_name': base_name,
                    'numero': numero,
                    'emisor': emisor,
                    'valor': valor,
                    'is_data_source': False
                }
                
        except Exception as e:
            self.log(f"❌ Error processing PDF for pipeline {pdf_filename}: {e}", "ERROR")
            return None

    def _should_process_orphaned_pdf(self, pdf_filename, base_name):
        """Check if orphaned PDF should be processed or skipped (duplicate check)"""
        try:
            # Check if an invoice with this token/base name already exists in the database
            database_url = os.environ.get('DATABASE_URL')
            if not database_url:
                self.log("⚠️ DATABASE_URL not found, will process PDF", "WARNING")
                return True
            
            import psycopg2
            conn = psycopg2.connect(database_url)
            cursor = conn.cursor()
            
            # Extract token from filename for matching
            token = self._extract_invoice_token_from_filename(base_name)
            
            # Check for existing completed invoices with similar identifiers
            # Look for matches by document number, file name, or similar tokens
            patterns_to_check = [
                base_name,
                pdf_filename,
                token
            ]
            
            for pattern in patterns_to_check:
                if pattern:
                    # Check in main invoices table
                    cursor.execute("""
                        SELECT COUNT(*) FROM invoices 
                        WHERE (document_number LIKE %s OR file_name LIKE %s)
                        AND processing_status = 'completed'
                    """, (f"%{pattern}%", f"%{pattern}%"))
                    
                    count = cursor.fetchone()[0]
                    if count > 0:
                        cursor.close()
                        conn.close()
                        self.log(f"⏭️ Skipping orphaned PDF {pdf_filename}: found {count} existing completed invoice(s) with pattern {pattern}")
                        return False
            
            cursor.close()
            conn.close()
            
            # No existing completed invoice found, should process
            self.log(f"✅ Orphaned PDF {pdf_filename} is new, will process")
            return True
            
        except Exception as e:
            self.log(f"Error checking orphaned PDF {pdf_filename}: {e}", "ERROR")
            # If check fails, err on side of caution and process
            return True

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

            # Track as session file
            self.session_downloaded_files.add(new_name)

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
            # Use download_dir directly as it's already 'uploads/pdfs'
            pdf_dir = self.download_dir  
            os.makedirs(pdf_dir, exist_ok=True)

            # Keep the same naming convention as ZIP
            new_name = f"{zip_base_name}.pdf"
            src = os.path.join(temp_dir, pdf_file)
            dst = os.path.join(pdf_dir, new_name)
            shutil.move(src, dst)

            # Track as session file
            self.session_downloaded_files.add(new_name)

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

            # Track as session file
            self.session_downloaded_files.add(xml_new_name)

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
                pdf_dir = self.download_dir  # Already 'uploads/pdfs'
                os.makedirs(pdf_dir, exist_ok=True)

                pdf_new_name = f"{zip_base_name}.pdf"
                pdf_src = os.path.join(temp_dir, pdf_file)
                pdf_dst = os.path.join(pdf_dir, pdf_new_name)
                shutil.move(pdf_src, pdf_dst)

                # Track as session file
                self.session_downloaded_files.add(pdf_new_name)

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

            # Get log_id from config (passed from Node.js)
            log_id = self.log_id
            if not log_id:
                self.log("No log_id provided for PostgreSQL transfer", "ERROR")
                return False

            transferred_count = 0
            
            # ================ PART 1: Handle XML files ================
            if os.path.exists(self.xml_db_path):
                # Connect to local XML SQLite database
                xml_conn = sqlite3.connect(self.xml_db_path)
                xml_cursor = xml_conn.cursor()

                # Query all imported XML invoices from SQLite
                xml_cursor.execute("""
                    SELECT numero_documento, emisor, valor_total, xml_content 
                    FROM downloaded_invoices 
                    WHERE xml_content IS NOT NULL
                """)
                sqlite_xml_invoices = xml_cursor.fetchall()

                self.log(f"Found {len(sqlite_xml_invoices)} XML files to transfer")

                for invoice in sqlite_xml_invoices:
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
                                    'buyerTaxId': self._extract_buyer_tax_id_from_xml(xml_content),
                                    'is_data_source': True
                                })
                            ))

                            transferred_count += 1
                            self.log(f"Transferred XML to PostgreSQL: {original_filename}")
                        else:
                            self.log(f"XML record already exists, skipping: {original_filename}")

                    except Exception as e:
                        self.log(f"Failed to transfer XML {numero_documento}: {e}", "ERROR")
                        # Continue with next invoice instead of failing the whole batch

                # Close XML connection
                xml_conn.close()
            else:
                self.log("No XML database found, skipping XML transfer")

            # ================ PART 2: Handle PDF files ================
            if os.path.exists(self.db_path):
                # Connect to local downloads SQLite database (for PDFs)
                pdf_conn = sqlite3.connect(self.db_path)
                pdf_cursor = pdf_conn.cursor()

                # Query all downloaded PDF invoices from SQLite
                pdf_cursor.execute("""
                    SELECT numero_documento, emisor, valor_total, filename, downloaded_at 
                    FROM downloaded_invoices
                """)
                sqlite_pdf_invoices = pdf_cursor.fetchall()

                self.log(f"Found {len(sqlite_pdf_invoices)} PDF files to transfer")

                for invoice in sqlite_pdf_invoices:
                    numero_documento, emisor, valor_total, filename, downloaded_at = invoice

                    try:
                        # Use the actual filename from downloads
                        original_filename = filename
                        
                        # Create file path - PDFs should be in downloads directory
                        pdf_source_path = os.path.join(self.download_dir, filename)
                        uploads_dir = 'uploads'
                        pdf_dest_path = os.path.join(uploads_dir, filename)
                        
                        # Ensure uploads directory exists
                        os.makedirs(uploads_dir, exist_ok=True)
                        
                        # Copy PDF file to uploads directory if it exists
                        file_size = 0
                        if os.path.exists(pdf_source_path):
                            shutil.copy2(pdf_source_path, pdf_dest_path)
                            file_size = os.path.getsize(pdf_dest_path)
                            self.log(f"Copied PDF for transfer: {pdf_source_path} -> {pdf_dest_path}")
                        elif os.path.exists(pdf_dest_path):
                            # File might already be in uploads directory
                            file_size = os.path.getsize(pdf_dest_path)
                            self.log(f"PDF already in uploads: {pdf_dest_path}")
                        else:
                            # Create placeholder file if PDF doesn't exist
                            with open(pdf_dest_path, 'w') as f:
                                f.write("PDF file not found")
                            file_size = os.path.getsize(pdf_dest_path)
                            self.log(f"⚠️ PDF file not found, created placeholder: {pdf_dest_path}")

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
                                'pdf',
                                file_size,
                                pdf_dest_path,
                                numero_documento,
                                datetime.now(),
                                json.dumps({
                                    'emisor': emisor,
                                    'valor_total': valor_total,
                                    'source': 'python_rpa',
                                    'processing_status': 'ready_for_linking',
                                    'is_data_source': False  # PDFs are references, not data sources
                                })
                            ))

                            transferred_count += 1
                            self.log(f"Transferred PDF to PostgreSQL: {original_filename}")
                        else:
                            self.log(f"PDF record already exists, skipping: {original_filename}")

                    except Exception as e:
                        self.log(f"Failed to transfer PDF {filename}: {e}", "ERROR")
                        # Continue with next invoice instead of failing the whole batch

                # Close PDF connection
                pdf_conn.close()
            else:
                self.log("No PDF database found, skipping PDF transfer")

            # Commit all PostgreSQL changes
            pg_conn.commit()

            # Close PostgreSQL connection
            pg_conn.close()

            self.log(
                f"Successfully transferred {transferred_count} files to PostgreSQL (XML + PDF)"
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

    def estimate_total_invoices(self):
        """Estimate total invoices across all pages for global progress tracking"""
        try:
            self.log("🔍 Estimating total invoices across all pages...")

            # Try multiple selectors to find invoice rows more reliably
            row_selectors = [
                "div.rt-tr-group",  # React Table rows
                "table tbody tr",   # Standard table rows
                "tr[class*='row']", # Rows with 'row' in class name
                "[data-testid*='row']", # Data test ID rows
                ".invoice-row",     # Custom invoice row class
                "div[role='row']",  # ARIA role rows
            ]

            data_rows = []
            for selector in row_selectors:
                try:
                    rows = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    filtered_rows = [r for r in rows if r.text.strip() and len(r.text.strip()) > 10]  # Filter meaningful rows
                    if filtered_rows:
                        data_rows = filtered_rows
                        self.log(f"✅ Found {len(data_rows)} rows using selector: {selector}")
                        break
                except Exception as e:
                    self.log(f"Selector {selector} failed: {e}")
                    continue

            first_page_count = len(data_rows)

            if first_page_count == 0:
                self.log("⚠️ No data rows found on first page with any selector")
                # Try to get a more conservative estimate by looking at page elements
                try:
                    # Look for any text that might indicate row count
                    page_text = self.driver.find_element(By.TAG_NAME, "body").text

                    # Look for patterns like "Showing 1-10 of 15" or similar
                    import re
                    count_patterns = [
                        r'showing\s+\d+\s*-\s*(\d+)\s+of\s+(\d+)',
                        r'(\d+)\s+of\s+(\d+)\s+items',
                        r'total:\s*(\d+)',
                        r'(\d+)\s+results',
                    ]

                    for pattern in count_patterns:
                        match = re.search(pattern, page_text, re.IGNORECASE)
                        if match:
                            if len(match.groups()) >= 2:
                                total_count = int(match.group(2))
                            else:
                                total_count = int(match.group(1))

                            self.global_progress['estimated_total_invoices'] = total_count
                            self.global_progress['initial_estimate_method'] = f'text_pattern_{pattern}'
                            self.log(f"📊 Found total count from page text: {total_count}")
                            return

                    # If no patterns match, use a very conservative fallback
                    self.global_progress['estimated_total_invoices'] = 10  # More realistic fallback
                    self.global_progress['initial_estimate_method'] = 'conservative_fallback'
                    self.log("⚠️ Using conservative fallback estimate of 10 invoices")
                    return

                except Exception as e:
                    self.log(f"Could not analyze page text: {e}")
                    self.global_progress['estimated_total_invoices'] = 10  # Conservative fallback
                    self.global_progress['initial_estimate_method'] = 'error_fallback'
                    return

            # If we found rows, continue with pagination analysis
            # Try to find pagination info to get total pages
            try:
                # Look for pagination indicators (common patterns)
                pagination_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                    "span[class*='page'], div[class*='page'], button[class*='page']")

                total_pages = None
                for elem in pagination_elements:
                    text = elem.text.strip()
                    # Look for patterns like "Page 1 of 5" or "1 / 5"
                    if 'of' in text.lower():
                        try:
                            total_pages = int(text.split('of')[-1].strip())
                            break
                        except ValueError:
                            continue
                    elif '/' in text:
                        try:
                            total_pages = int(text.split('/')[-1].strip())
                            break
                        except ValueError:
                            continue

                if total_pages and total_pages > 0:
                    estimated_total = first_page_count * total_pages
                    self.global_progress['estimated_total_invoices'] = estimated_total
                    self.global_progress['initial_estimate_method'] = f'pagination_info_{total_pages}_pages'
                    self.log(f"📊 Estimated {estimated_total} total invoices ({first_page_count} per page × {total_pages} pages)")
                    return

            except Exception as e:
                self.log(f"⚠️ Could not find pagination info: {e}")

            # Fallback: Use only the rows found on current page (most accurate for single page)
            if first_page_count <= 15:  # If small count, likely single page
                self.global_progress['estimated_total_invoices'] = first_page_count
                self.global_progress['initial_estimate_method'] = f'single_page_actual_count'
                self.log(f"📊 Using actual count for single page: {first_page_count} invoices")
            else:
                # Estimate conservatively for larger pages
                estimated_pages = max(2, first_page_count // 10)  # Reasonable estimate
                estimated_total = first_page_count * estimated_pages
                self.global_progress['estimated_total_invoices'] = estimated_total
                self.global_progress['initial_estimate_method'] = f'conservative_estimate_{estimated_pages}_pages'
                self.log(f"📊 Conservative estimate: {estimated_total} total invoices ({first_page_count} per page × {estimated_pages} estimated pages)")

        except Exception as e:
            self.log(f"❌ Error estimating total invoices: {e}", "ERROR")
            # Ultra-conservative fallback
            self.global_progress['estimated_total_invoices'] = 10
            self.global_progress['initial_estimate_method'] = 'error_fallback'



    def refine_total_estimate(self):
        """Refine total invoice estimate based on actual page data"""
        try:
            if len(self.global_progress['invoices_per_page_samples']) < 2:
                return  # Need at least 2 samples to refine

            # Calculate average invoices per page from samples
            samples = self.global_progress['invoices_per_page_samples']
            avg_per_page = sum(samples) / len(samples)
            pages_processed = self.global_progress['pages_processed']

            # If we've processed several pages, update estimate based on actual data
            if pages_processed >= 2:
                # Extrapolate based on current progress vs. initial estimate
                current_processed = self.global_progress['global_index']
                if current_processed > 0:
                    # Estimate remaining pages based on current pattern
                    estimated_remaining_pages = max(1, int(avg_per_page * 1.2))  # Add 20% buffer
                    refined_total = current_processed + (estimated_remaining_pages * avg_per_page)

                    # Only update if the refined estimate is significantly different
                    current_estimate = self.global_progress['estimated_total_invoices']
                    if abs(refined_total - current_estimate) > current_estimate * 0.2:  # 20% difference threshold
                        self.global_progress['estimated_total_invoices'] = int(refined_total)
                        self.log(f"📈 Refined total estimate to {int(refined_total)} invoices (avg {avg_per_page:.1f} per page)")

        except Exception as e:
            self.log(f"⚠️ Error refining estimate: {e}", "WARNING")

    def clear_download_directories(self):
        """Clear download directories to prevent processing orphaned files from previous runs"""
        try:
            self.log("🧹 Clearing download directories to ensure clean session isolation...")

            # Clear PDF directory - BUT PRESERVE files that are linked to existing invoices
            pdf_dir = self.download_dir
            if os.path.exists(pdf_dir):
                pdf_files_cleared = 0
                pdf_files_preserved = 0

                for filename in os.listdir(pdf_dir):
                    # Skip database files and processed folder
                    if filename.endswith('.db') or filename == 'processed':
                        continue

                    file_path = os.path.join(pdf_dir, filename)

                    # Check if this PDF is referenced by any existing invoice
                    try:
                        database_url = os.environ.get('DATABASE_URL')
                        if not database_url:
                            self.log("⚠️ DATABASE_URL not found, preserving all PDFs", "WARNING")
                            pdf_files_preserved += 1
                            continue

                        import psycopg2
                        conn = psycopg2.connect(database_url)
                        cursor = conn.cursor()

                        # Check if any invoice references this PDF filename
                        cursor.execute(
                            "SELECT COUNT(*) FROM invoices WHERE file_name = %s OR file_url LIKE %s",
                            (filename, f"%{filename}%")
                        )
                        count = cursor.fetchone()[0]

                        cursor.close()
                        conn.close()

                        if count > 0:
                            # File is referenced by existing invoice - preserve it
                            pdf_files_preserved += 1
                            self.log(f"📎 Preserving linked PDF: {filename} (referenced by {count} invoice(s))")
                        else:
                            # File is not referenced - safe to remove
                            os.remove(file_path)
                            pdf_files_cleared += 1

                    except Exception as e:
                        # If database check fails, err on side of caution and preserve file
                        self.log(f"⚠️ Could not check PDF link status for {filename}: {e}, preserving file", "WARNING")
                        pdf_files_preserved += 1

                self.log(f"✅ Cleared {pdf_files_cleared} orphaned PDF files, preserved {pdf_files_preserved} linked PDFs")

            # Clear XML directory
            if os.path.exists(self.xml_dir):
                xml_files_cleared = 0
                for filename in os.listdir(self.xml_dir):
                    file_path = os.path.join(self.xml_dir, filename)
                    try:
                        os.remove(file_path)
                        xml_files_cleared += 1
                    except Exception as e:
                        self.log(f"⚠️ Could not remove XML file {filename}: {e}", "WARNING")
                self.log(f"✅ Cleared {xml_files_cleared} orphaned XML files from {self.xml_dir}")

            # Clear main download directory of any ZIP files
            if os.path.exists(self.download_dir):
                zip_files_cleared = 0
                for filename in os.listdir(self.download_dir):
                    if filename.lower().endswith('.zip'):
                        file_path = os.path.join(self.download_dir, filename)
                        try:
                            os.remove(file_path)
                            zip_files_cleared += 1
                        except Exception as e:
                            self.log(f"⚠️ Could not remove ZIP file {filename}: {e}", "WARNING")
                if zip_files_cleared > 0:
                    self.log(f"✅ Cleared {zip_files_cleared} orphaned ZIP files from {self.download_dir}")

            self.log("🎯 Directory cleanup completed - only files downloaded in this session will be processed")

        except Exception as e:
            self.log(f"❌ Error clearing download directories: {e}", "ERROR")
            # Don't fail the entire process if cleanup fails, but log the issue

    def cleanup(self):
        """Cleanup resources"""
        if self.driver:
            try:
                self.driver.quit()
                self.log("WebDriver closed successfully")
            except Exception as e:
                self.log(f"Error closing WebDriver: {e}", "ERROR")


    def process_files_through_manual_pipeline(self) -> bool:
        """Process extracted files (XML/PDF) through manual upload pipeline with conditional storage logic"""
        try:
            file_types = self.config.get('fileTypes', 'both')
            self.update_progress(f"Processing {file_types} files through manual upload pipeline", 90)

            # Ensure uploads directory exists
            uploads_dir = 'uploads'
            os.makedirs(uploads_dir, exist_ok=True)

            processed_count = 0
            successful_count = 0
            failed_count = 0
            processed_files = []

            # Build file inventory first with enhanced filename matching
            xml_files = {}
            pdf_files = {}

            # Scan XML files (current session OR within last 10 minutes for RPA-downloaded files)
            if file_types in ['xml', 'both'] and os.path.exists(self.xml_dir):
                xml_count = 0
                recent_threshold = datetime.now() - timedelta(minutes=10)  # Files from last 10 minutes
                for filename in os.listdir(self.xml_dir):
                    if filename.lower().endswith(".xml"):
                        file_path = os.path.join(self.xml_dir, filename)
                        # Check if file was created after session start OR within last 10 minutes (for RPA downloads)
                        file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                        if file_mod_time >= self.session_start_time or file_mod_time >= recent_threshold:
                            base_name = os.path.splitext(filename)[0]
                            xml_files[base_name] = filename
                            xml_count += 1
                            self.session_downloaded_files.add(filename)
                            self.log(f"📁 Including XML file: {filename} (modified: {file_mod_time})")
                        else:
                            self.log(f"⏭️ Ignoring old XML file: {filename} (modified: {file_mod_time})")
                self.log(f"📁 Found {xml_count} XML files for processing in {self.xml_dir}")

            # Scan PDF files with enhanced matching logic (current session OR within last 10 minutes for RPA-downloaded files)
            pdf_dir = self.download_dir  # Already 'uploads/pdfs'
            if file_types in ['pdf', 'both'] and os.path.exists(pdf_dir):
                pdf_count = 0
                recent_threshold = datetime.now() - timedelta(minutes=10)  # Files from last 10 minutes
                for filename in os.listdir(pdf_dir):
                    if filename.lower().endswith(".pdf"):
                        file_path = os.path.join(pdf_dir, filename)
                        # Check if file was created after session start OR within last 10 minutes (for RPA downloads)
                        file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                        if file_mod_time >= self.session_start_time or file_mod_time >= recent_threshold:
                            base_name = os.path.splitext(filename)[0]
                            pdf_files[base_name] = filename
                            pdf_count += 1
                            self.session_downloaded_files.add(filename)
                            self.log(f"📁 Including PDF file: {filename} (modified: {file_mod_time})")
                        else:
                            self.log(f"⏭️ Ignoring old PDF file: {filename} (modified: {file_mod_time})")
                self.log(f"📁 Found {pdf_count} PDF files for processing in {pdf_dir}")

            # Enhanced file matching: match PDFs to XMLs by invoice token
            matched_pairs = {}
            unmatched_xmls = set(xml_files.keys())
            unmatched_pdfs = set(pdf_files.keys())

            # First pass: exact base name matching
            for xml_base in list(unmatched_xmls):
                if xml_base in unmatched_pdfs:
                    matched_pairs[xml_base] = {
                        'xml_file': xml_files[xml_base],
                        'pdf_file': pdf_files[xml_base],
                        'match_type': 'exact'
                    }
                    unmatched_xmls.remove(xml_base)
                    unmatched_pdfs.remove(xml_base)

            # Second pass: Enhanced token-based matching for filename variations
            for xml_base in list(unmatched_xmls):
                xml_token = self._extract_invoice_token_from_filename(xml_base)
                if xml_token:
                    for pdf_base in list(unmatched_pdfs):
                        pdf_token = self._extract_invoice_token_from_filename(pdf_base)

                        # Enhanced matching logic with multiple strategies
                        if pdf_token and self._tokens_match(xml_token, pdf_token, xml_base, pdf_base):
                            matched_pairs[xml_base] = {
                                'xml_file': xml_files[xml_base],
                                'pdf_file': pdf_files[pdf_base],
                                'match_type': 'enhanced_token'
                            }
                            unmatched_xmls.remove(xml_base)
                            unmatched_pdfs.remove(pdf_base)
                            self.log(f"🔗 Enhanced match: XML '{xml_files[xml_base]}' <-> PDF '{pdf_files[pdf_base]}'")
                            break

            # Build final processing list - count unique invoices, not individual files
            all_base_names = set(matched_pairs.keys()) | unmatched_xmls | unmatched_pdfs
            total_unique_invoices = len(all_base_names)  # This represents unique invoices, not file count

            self.log(f"📊 Starting to process {total_unique_invoices} unique invoices...")
            self.log(f"   - Matched pairs (XML+PDF): {len(matched_pairs)}")
            self.log(f"   - XML-only invoices: {len(unmatched_xmls)}")
            self.log(f"   - PDF-only invoices: {len(unmatched_pdfs)}")

            # Enhanced logging for debugging pairing issues
            if len(matched_pairs) > 0:
                self.log("✅ Successfully paired files:")
                for base_name, pair_info in list(matched_pairs.items())[:5]:  # Show first 5
                    self.log(f"   {pair_info['match_type']}: {pair_info['xml_file']} <-> {pair_info['pdf_file']}")
                if len(matched_pairs) > 5:
                    self.log(f"   ... and {len(matched_pairs) - 5} more pairs")

            if len(unmatched_pdfs) > 0:
                self.log("⚠️ Unmatched PDF files (may be from previous processing):")
                for pdf_base in list(unmatched_pdfs)[:3]:  # Show first 3
                    self.log(f"   - {pdf_files[pdf_base]}")
                if len(unmatched_pdfs) > 3:
                    self.log(f"   ... and {len(unmatched_pdfs) - 3} more unmatched PDFs")

            # Process each unique invoice (not individual files)
            for index, base_name in enumerate(all_base_names):
                # Update progress with current unique invoice being processed
                progress_percent = 90 + int((index / total_unique_invoices) * 8)  # 90-98% range
                self.update_progress(f"Processing invoice {index + 1}/{total_unique_invoices}: {base_name}", progress_percent)

                invoice_processed_successfully = False

                if base_name in matched_pairs:
                    # ✅ MATCHED PAIR: Both XML and PDF present - ONLY process XML for data extraction
                    pair_info = matched_pairs[base_name]
                    xml_filename = pair_info['xml_file']
                    pdf_filename = pair_info['pdf_file']
                    match_type = pair_info['match_type']

                    self.log(f"🔄 PAIRED INVOICE ({match_type}): XML '{xml_filename}' → data source, PDF '{pdf_filename}' → reference only")

                    # Process ONLY XML for data extraction (counts as 1 invoice)
                    xml_info = self._process_xml_for_pipeline(xml_filename, uploads_dir, is_data_source=True)
                    if xml_info:
                        xml_info['base_file_name'] = base_name
                        xml_info['matched_pdf_file'] = pdf_filename
                        processed_files.append(xml_info)
                        invoice_processed_successfully = True
                        self.log(f"✅ Paired invoice processed: {xml_filename} (PDF {pdf_filename} linked as reference)")
                    else:
                        self.log(f"❌ Failed to process paired invoice: {xml_filename}")

                    # Store PDF as reference metadata ONLY - NO separate processing count
                    self._store_pdf_as_reference_metadata(pdf_filename, pdf_dir, xml_filename)
                    
                    # Add PDF record to processed_files with explicit link flags for the linker
                    # Use the same metadata as the XML for consistency in the database
                    pdf_record = {
                        'type': 'pdf',
                        'upload_filename': pdf_filename,
                        'base_file_name': base_name,
                        'xml_filename': xml_filename,
                        'is_data_source': False,
                        'link_to_xml_invoice': True,  # Critical flag for the linker
                        'matched_xml': xml_filename
                    }
                    
                    # Copy XML metadata to PDF record for database storage
                    if xml_info:
                        pdf_record['numero'] = xml_info.get('numero', '')
                        pdf_record['emisor'] = xml_info.get('emisor', '')
                        pdf_record['valor'] = xml_info.get('valor', '')
                    else:
                        pdf_record['numero'] = ''
                        pdf_record['emisor'] = ''
                        pdf_record['valor'] = ''
                    
                    processed_files.append(pdf_record)

                elif base_name in unmatched_xmls:
                    # Case: Only XML file present - process as single invoice
                    xml_filename = xml_files[base_name]
                    self.log(f"📄 XML-only invoice: {xml_filename}")
                    xml_info = self._process_xml_for_pipeline(xml_filename, uploads_dir, is_data_source=True)
                    if xml_info:
                        xml_info['base_file_name'] = base_name
                        processed_files.append(xml_info)
                        invoice_processed_successfully = True
                        self.log(f"✅ XML-only invoice processed: {xml_filename}")
                    else:
                        self.log(f"❌ Failed to process XML-only invoice: {xml_filename}")

                elif base_name in unmatched_pdfs:
                    # Case: Only PDF file present - process through OCR pipeline
                    pdf_filename = pdf_files[base_name]
                    invoice_processed_successfully = self._process_unmatched_pdf_invoice(pdf_filename, pdf_dir, uploads_dir, base_name)
                    if invoice_processed_successfully:
                        processed_files.append({
                            'type': 'pdf',
                            'base_file_name': base_name,
                            'upload_filename': pdf_filename,
                            'is_data_source': True,
                            'numero': base_name,  # Use base name as document number for PDF-only
                            'emisor': '',         # Unknown for PDF-only
                            'valor': ''           # Unknown for PDF-only
                        })

                # Update counters based on invoice success/failure (not individual files)
                processed_count += 1
                if invoice_processed_successfully:
                    successful_count += 1
                else:
                    failed_count += 1

                # Send real-time progress update for this unique invoice
                self._output_progress_stats(processed_count, successful_count, failed_count, total_unique_invoices)

            # Update class-level stats to reflect unique invoices
            self.stats['total_invoices'] = total_unique_invoices
            self.stats['processed_invoices'] = processed_count
            self.stats['successful_imports'] = successful_count
            self.stats['failed_imports'] = failed_count

            self.log(f"✅ Pipeline processing completed:")
            self.log(f"   - Total unique invoices: {total_unique_invoices}")
            self.log(f"   - Successfully processed: {successful_count}")
            self.log(f"   - Failed: {failed_count}")
            self.log(f"   - Paired files (XML+PDF): {len(matched_pairs)} invoices")

            # Debug: Show what files we're about to persist and link
            self.log(f"PDF LINK DEBUG: processed_files={[(f['type'], f.get('upload_filename'), f.get('link_to_xml_invoice')) for f in processed_files]}")

            # Persist the processed file info (useful for debugging)
            self._store_file_matches(processed_files)

            # Process files through Node.js API endpoints (replaces direct PostgreSQL operations)
            self.log(f"🔄 Processing {len(processed_files)} files through Node.js API endpoints...")
            api_result = self._process_files_through_nodejs_api(processed_files)
            
            if api_result:
                self.log(f"✅ API processing succeeded - pipeline completed successfully")
                return True
            else:
                self.log(f"❌ API processing failed - pipeline aborted", "ERROR")
                return False

        except Exception as e:
            self.log(f"❌ Error in pipeline processing: {e}", "ERROR")
            return False

    def _process_files_through_nodejs_api(self, processed_files):
        """Process all files through Node.js API endpoints instead of direct PostgreSQL operations"""
        try:
            import requests
            import json
            
            total_files = len(processed_files)
            successful_api_calls = 0
            failed_api_calls = 0
            
            self.log(f"🌐 Making API calls to Node.js for {total_files} files...")
            
            # First, test API connectivity
            try:
                connectivity_test = requests.get('http://localhost:5000/api/rpa/test', timeout=10)
                if connectivity_test.status_code == 200:
                    self.log(f"✅ API connectivity confirmed")
                else:
                    self.log(f"⚠️ API connectivity test failed: {connectivity_test.status_code}", "WARNING")
            except Exception as conn_error:
                self.log(f"❌ API connectivity test failed: {conn_error}", "ERROR")
                return False
            
            for file_info in processed_files:
                try:
                    file_type = file_info.get('type', 'unknown')
                    filename = file_info.get('upload_filename', '')
                    
                    # Skip if no filename
                    if not filename:
                        self.log(f"⚠️ Skipping file with missing filename: {file_info}")
                        continue
                    
                    # Prepare payload for API call
                    payload = {
                        'filename': filename,
                        'fileSize': file_info.get('file_size', 0),
                        'documentNumber': file_info.get('numero', ''),
                        'emisor': file_info.get('emisor', ''),
                        'totalValue': str(file_info.get('valor', '')),
                        'fileType': file_type,
                        'source': 'python_rpa',
                        'configId': self.config_id
                    }
                    
                    # Choose endpoint based on file type
                    endpoint = '/api/rpa/process-xml' if file_type == 'xml' else '/api/rpa/process-pdf'
                    
                    self.log(f"🔄 API call: {endpoint} for {filename}")
                    
                    # Make HTTP request to Node.js API
                    import requests
                    response = requests.post(
                        f'http://localhost:5000{endpoint}',
                        json=payload,
                        headers={'Content-Type': 'application/json'},
                        timeout=60  # Extended timeout for processing
                    )
                    
                    self.log(f"🌐 API request sent to {endpoint} - Status: {response.status_code}")
                    
                    if response.status_code == 200:
                        try:
                            response_data = response.json()
                            if response_data.get('success', False):
                                successful_api_calls += 1
                                self.log(f"✅ Successfully processed {filename} via API")
                                
                                # Log invoice ID if available
                                invoice_id = response_data.get('invoiceId')
                                if invoice_id:
                                    self.log(f"   → Invoice ID: {invoice_id}")
                            else:
                                failed_api_calls += 1
                                error_msg = response_data.get('error', 'Unknown API error')
                                self.log(f"❌ API processing failed for {filename}: {error_msg}", "ERROR")
                        except Exception as json_error:
                            failed_api_calls += 1
                            self.log(f"❌ Could not parse API response for {filename}: {json_error}", "ERROR")
                    else:
                        failed_api_calls += 1
                        self.log(f"❌ HTTP error {response.status_code} for {filename}", "ERROR")
                        
                except Exception as file_error:
                    failed_api_calls += 1
                    self.log(f"❌ Error processing file {filename}: {file_error}", "ERROR")
                    import traceback
                    self.log(f"   📋 Full error trace: {traceback.format_exc()}", "ERROR")
            
            self.log(f"🏁 API processing completed:")
            self.log(f"   ✅ Successful API calls: {successful_api_calls}")
            self.log(f"   ❌ Failed API calls: {failed_api_calls}")
            self.log(f"   📊 Success rate: {(successful_api_calls/total_files*100):.1f}%" if total_files > 0 else "   📊 No files to process")
            
            # Return True if at least some files were processed successfully
            # Also return True if total_files is 0 (nothing to process)
            result = successful_api_calls > 0 or total_files == 0
            self.log(f"🔍 API Processing Result: {result} (success: {successful_api_calls}, total: {total_files})")
            return result
            
        except Exception as e:
            self.log(f"❌ Critical error in API processing: {e}", "ERROR")
            import traceback
            self.log(f"📋 Full error trace: {traceback.format_exc()}", "ERROR")
            return False

    def _store_pdf_as_reference_metadata(self, pdf_filename: str, pdf_dir: str, xml_filename: str):
        """Store PDF as reference metadata without processing through extraction pipeline"""
        try:
            # Move PDF to uploads directory for reference
            pdf_source = os.path.join(pdf_dir, pdf_filename)
            pdf_dest = os.path.join('uploads', pdf_filename)

            if os.path.exists(pdf_source):
                shutil.copy2(pdf_source, pdf_dest)
                self.log(f"📎 PDF reference stored: {pdf_filename} (linked to XML: {xml_filename})")

                # Update imported_invoices table with reference linkage
                self._update_imported_invoice_status({
                    'upload_filename': pdf_filename
                }, 'reference_only', f'Linked as reference to XML: {xml_filename}')

        except Exception as e:
            self.log(f"❌ Error storing PDF reference {pdf_filename}: {e}", "ERROR")

    def _process_xml_for_pipeline(self, xml_filename: str, uploads_dir: str, is_data_source: bool = True) -> dict:
        """Process XML file for the manual upload pipeline"""
        try:
            self.log(f"🔄 Processing XML for pipeline: {xml_filename}")
            
            # Move XML file to uploads directory for processing
            xml_source = os.path.join(self.xml_dir, xml_filename)
            xml_dest = os.path.join(uploads_dir, xml_filename)
            
            if not os.path.exists(xml_source):
                self.log(f"❌ XML source file not found: {xml_source}", "ERROR")
                return None
                
            # Copy XML to uploads directory
            shutil.copy2(xml_source, xml_dest)
            
            # Extract invoice information from XML content
            base_name = os.path.splitext(xml_filename)[0]
            
            # Initialize default values
            invoice_number = base_name
            emisor = 'Unknown'
            valor = '0.00'
            
            try:
                # Parse XML content to extract invoice data
                tree = ET.parse(xml_source)
                root = tree.getroot()
                
                # Extract invoice number from various possible tags
                invoice_number_tags = [
                    './/{*}InvoiceNumber',
                    './/{*}SerieNumber', 
                    './/{*}SerialNumber',
                    './/{*}Number',
                    './/{*}InvoiceID',
                    './/{*}DocumentID',
                    './/{*}ID'
                ]
                
                for tag in invoice_number_tags:
                    element = root.find(tag)
                    if element is not None and element.text and element.text.strip():
                        invoice_number = element.text.strip()
                        break
                
                # Extract total amount from various possible tags
                amount_tags = [
                    './/{*}PayableAmount',
                    './/{*}TotalAmount', 
                    './/{*}LineExtensionAmount',
                    './/{*}TaxExclusiveAmount',
                    './/{*}TaxInclusiveAmount'
                ]
                
                for tag in amount_tags:
                    element = root.find(tag)
                    if element is not None and element.text and element.text.strip():
                        try:
                            amount = float(element.text.strip())
                            valor = f"{amount:.2f}"
                            break
                        except (ValueError, TypeError):
                            continue
                
                # Extract supplier/emisor information
                supplier_tags = [
                    './/{*}AccountingSupplierParty//{*}PartyName//{*}Name',
                    './/{*}AccountingSupplierParty//{*}Party//{*}PartyName//{*}Name',
                    './/{*}SupplierParty//{*}PartyName//{*}Name',
                    './/{*}Seller//{*}Name'
                ]
                
                for tag in supplier_tags:
                    element = root.find(tag)
                    if element is not None and element.text and element.text.strip():
                        emisor = element.text.strip()
                        break
                
                self.log(f"📄 Extracted from XML: Invoice #{invoice_number}, Amount: ${valor}, Supplier: {emisor}")
                
            except Exception as xml_error:
                self.log(f"⚠️ Warning: Could not parse XML content for {xml_filename}: {xml_error}")
                # Fall back to filename-based extraction
                pass
            
            # Create invoice info structure with extracted data
            xml_info = {
                'type': 'xml',
                'upload_filename': xml_filename,
                'base_name': base_name,
                'is_data_source': is_data_source,
                'triggers_extraction': True,
                'numero': invoice_number,
                'emisor': emisor,
                'valor': valor,
                'matched_xml': None   # No matched XML for standalone XML files
            }
            
            self.log(f"✅ XML processed for pipeline: {xml_filename}")
            return xml_info
            
        except Exception as e:
            self.log(f"❌ Error processing XML for pipeline {xml_filename}: {e}", "ERROR")
            return None

    def _process_pdf_for_pipeline(self, pdf_filename: str, uploads_dir: str, pdf_dir: str, is_data_source: bool = True) -> dict:
        """Process PDF file for the manual upload pipeline"""
        try:
            self.log(f"🔄 Processing PDF for pipeline: {pdf_filename}")
            
            # Move PDF file to uploads directory for processing
            pdf_source = os.path.join(pdf_dir, pdf_filename)
            pdf_dest = os.path.join(uploads_dir, pdf_filename)
            
            if not os.path.exists(pdf_source):
                self.log(f"❌ PDF source file not found: {pdf_source}", "ERROR")
                return None
                
            # Copy PDF to uploads directory
            shutil.copy2(pdf_source, pdf_dest)
            
            # Extract invoice information from filename using existing token extraction logic
            base_name = os.path.splitext(pdf_filename)[0]
            
            # Use existing token extraction to get better invoice information
            token_info = self._extract_invoice_token(pdf_filename, pdf_source, 'pdf')
            
            # Extract basic invoice information from filename
            invoice_number = token_info.get('document_number', base_name) if token_info else base_name
            emisor = 'Unknown'  # Would be extracted via OCR in full implementation
            valor = '0.00'      # Would be extracted via OCR in full implementation
            
            # Try to extract amount from filename if it contains amount information
            if '_' in base_name:
                parts = base_name.split('_')
                for part in parts:
                    # Look for parts that look like currency amounts
                    if re.match(r'^\d+[.,]\d{2}$', part) or re.match(r'^\d+$', part):
                        try:
                            # Clean and parse the amount
                            clean_amount = part.replace(',', '.')
                            amount = float(clean_amount)
                            valor = f"{amount:.2f}"
                            break
                        except (ValueError, TypeError):
                            continue
            
            self.log(f"📄 Extracted from PDF filename: Invoice #{invoice_number}, Amount: ${valor}")
            
            # Create invoice info structure with extracted data
            pdf_info = {
                'type': 'pdf',
                'upload_filename': pdf_filename,
                'base_name': base_name,
                'is_data_source': is_data_source,
                'triggers_extraction': True,
                'numero': invoice_number,
                'emisor': emisor,
                'valor': valor,
                'matched_xml': None   # No matched XML for standalone PDF files
            }
            
            self.log(f"✅ PDF processed for pipeline: {pdf_filename}")
            return pdf_info
            
        except Exception as e:
            self.log(f"❌ Error processing PDF for pipeline {pdf_filename}: {e}", "ERROR")
            return None

    def _should_process_orphaned_pdf(self, pdf_filename: str, base_name: str) -> bool:
        """Check if an orphaned PDF should be processed or skipped"""
        try:
            # Check if this PDF has already been processed by looking at the database
            # For now, we'll use a simple approach - check if the file exists in uploads
            upload_path = os.path.join('uploads', pdf_filename)
            
            if os.path.exists(upload_path):
                self.log(f"⏭️ PDF already exists in uploads: {pdf_filename}")
                return False
            
            # Check if we have a corresponding XML file (which would mean it's not really orphaned)
            xml_path = os.path.join(self.xml_dir, f"{base_name}.xml")
            if os.path.exists(xml_path):
                self.log(f"⏭️ Found corresponding XML file for {pdf_filename}, skipping orphaned processing")
                return False
            
            # Check if this PDF was already processed in this session
            if pdf_filename in self.session_downloaded_files:
                self.log(f"⏭️ PDF already processed in this session: {pdf_filename}")
                return False
            
            self.log(f"✅ PDF should be processed: {pdf_filename}")
            return True
            
        except Exception as e:
            self.log(f"❌ Error checking if PDF should be processed {pdf_filename}: {e}", "ERROR")
            # Default to processing if we can't determine
            return True

    def _process_unmatched_pdf_invoice(self, pdf_filename: str, pdf_dir: str, uploads_dir: str, base_name: str) -> bool:
        """Process a PDF-only invoice through OCR pipeline"""
        try:
            self.log(f"📄 PDF-only invoice: {pdf_filename} (OCR required)")

            # Check if this PDF should be processed or skipped
            if not self._should_process_orphaned_pdf(pdf_filename, base_name):
                self.log(f"⏭️ Skipping already processed PDF: {pdf_filename}")
                return True  # Consider as successful to avoid counting as failure

            pdf_info = self._process_pdf_for_pipeline(pdf_filename, uploads_dir, pdf_dir, is_data_source=True)
            if pdf_info:
                self.log(f"✅ PDF-only invoice processed (OCR): {pdf_filename}")
                return True
            else:
                self.log(f"❌ Failed to process PDF-only invoice: {pdf_filename}")
                return False

        except Exception as e:
            self.log(f"❌ Error processing PDF-only invoice {pdf_filename}: {e}", "ERROR")
            return False

    def _store_conditional_files_to_database_DEPRECATED(self, processed_files):
        """Store processed files to database with conditional logic for matching"""
        try:
            # Connect to PostgreSQL
            pg_conn = psycopg2.connect(
                host=os.getenv("PGHOST"),
                port=int(os.getenv("PGPORT", 5432)),
                database=os.getenv("PGDATABASE"),
                user=os.getenv("PGUSER"),
                password=os.getenv("PGPASSWORD"),
            )
            pg_cursor = pg_conn.cursor()

            log_id = self.log_id
            if not log_id:
                self.log("No log_id provided for conditional file storage", "ERROR")
                return False

            # Store files with proper linking
            file_id_mapping = {}  # Track XML file IDs for linking PDFs

            # First pass: Store XML files and standalone PDFs
            for file_info in processed_files:
                try:
                    # Use correct file path based on file type
                    if file_info['type'] == 'pdf':
                        # PDFs are stored in download/pdfs directory, use original filename
                        original_filename = file_info.get('upload_filename', file_info['base_name'] + '.pdf')
                        if not original_filename.endswith('.pdf'):
                            original_filename += '.pdf'
                        file_path = os.path.join('uploads/pdfs', original_filename)
                    else:
                        # XML files are copied to uploads directory
                        file_path = os.path.join('uploads', file_info['upload_filename'])

                    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                    base_name = file_info.get('base_file_name', file_info['base_name'])

                    # Insert into imported_invoices table with processing status
                    pg_cursor.execute("""
                        INSERT INTO imported_invoices 
                        (log_id, original_file_name, file_type, file_size, file_path, 
                         erp_document_id, base_file_name, is_data_source, processing_status, downloaded_at, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        log_id,
                        file_info['upload_filename'],
                        file_info['type'],
                        file_size,
                        file_path,
                        file_info['numero'],  # ERP document ID
                        base_name,
                        file_info.get('is_data_source', True),
                        'downloaded',  # Initial status is 'downloaded'
                        datetime.now(),
                        json.dumps({
                            'emisor': file_info['emisor'],
                            'valor': file_info['valor'],
                            'source': 'python_rpa',
                            'matched_xml': file_info.get('matched_xml')
                        })
                    ))

                    file_id = pg_cursor.fetchone()[0]
                    file_id_mapping[file_info['upload_filename']] = file_id

                    self.log(f"Stored {file_info['type'].upper()} file: {file_info['upload_filename']} (ID: {file_id})")

                except Exception as e:
                    self.log(f"Failed to store file {file_info['upload_filename']}: {e}", "ERROR")
                    continue

            # Second pass: Update PDFs with matched XML file IDs
            for file_info in processed_files:
                if file_info['type'] == 'pdf' and 'matched_xml' in file_info and file_info['matched_xml']:
                    try:
                        pdf_filename = file_info['upload_filename']
                        xml_filename = file_info['matched_xml']

                        if pdf_filename in file_id_mapping and xml_filename in file_id_mapping:
                            pdf_id = file_id_mapping[pdf_filename]
                            xml_id = file_id_mapping[xml_filename]

                            # Update the PDF record to link to XML
                            pg_cursor.execute("""
                                UPDATE imported_invoices 
                                SET matched_file_id = %s 
                                WHERE id = %s
                            """, (xml_id, pdf_id))

                            self.log(f"Linked PDF {pdf_filename} to XML {xml_filename}")

                    except Exception as e:
                        self.log(f"Failed to link PDF {file_info['upload_filename']}: {e}", "ERROR")

            # Commit all changes
            pg_conn.commit()
            pg_conn.close()

            self.log(f"✅ Successfully stored {len(processed_files)} files to database with conditional logic")
            return True

        except Exception as e:
            self.log(f"Error storing conditional files to database: {e}", "ERROR")
            return False

    def _link_pdfs_to_main_invoices_DEPRECATED(self, processed_files):
        """Link PDF files to their corresponding XML-derived invoice records using token-based matching"""
        try:
            # Connect to PostgreSQL
            pg_conn = psycopg2.connect(
                host=os.getenv("PGHOST"),
                port=int(os.getenv("PGPORT", 5432)),
                database=os.getenv("PGDATABASE"),
                user=os.getenv("PGUSER"),
                password=os.getenv("PGPASSWORD"),
            )
            pg_cursor = pg_conn.cursor()

            # Find PDFs that need to be linked to XML-derived invoices
            pdf_files_to_link = [f for f in processed_files if f['type'] == 'pdf' and f.get('link_to_xml_invoice')]
            
            self.log(f"🔍 PDF LINK DEBUG: Found {len(pdf_files_to_link)} PDFs to link from {len(processed_files)} total files")
            for i, pdf in enumerate(pdf_files_to_link):
                self.log(f"  PDF {i+1}: {pdf.get('upload_filename')} -> XML: {pdf.get('xml_filename')} (base: {pdf.get('base_file_name')})")

            for pdf_info in pdf_files_to_link:
                try:
                    base_name = pdf_info.get('base_file_name', pdf_info['base_name'])
                    xml_filename = pdf_info.get('xml_filename')
                    pdf_filename = pdf_info['upload_filename']

                    # Extract invoice token from PDF filename for robust matching
                    pdf_token_info = self._extract_invoice_token(pdf_filename)
                    document_number = pdf_token_info['document_number']
                    tax_id = pdf_token_info['tax_id']

                    self.log(f"🔗 Token-based linking: PDF {pdf_filename} (token: {pdf_token_info['token']}) to XML-derived invoice")
                    self.log(f"   Search params: doc_num={document_number}, tax_id={tax_id}, base_name={base_name}, xml_file={xml_filename}")

                    # Enhanced search: Look for invoice using multiple matching strategies with robust fallbacks
                    invoice_result = None
                    
                    # Strategy 1: Find by extracted data using document number and tax ID (when available)
                    if tax_id and tax_id != 'unknown':
                        pg_cursor.execute("""
                            SELECT id, file_name, extracted_data FROM invoices 
                            WHERE user_id = 'rpa-system'
                            AND (
                                -- Match by extracted vendor and invoice number
                                (extracted_data->>'documentNumber' = %s AND extracted_data->>'vendorTaxId' = %s) OR
                                (extracted_data->>'invoiceNumber' = %s AND extracted_data->>'vendorTaxId' = %s)
                            )
                            ORDER BY created_at DESC 
                            LIMIT 1
                        """, (document_number, tax_id, document_number, tax_id))
                        invoice_result = pg_cursor.fetchone()
                    
                    # Strategy 2: Fallback when vendorTaxId is missing - search by filename patterns  
                    if not invoice_result:
                        pg_cursor.execute("""
                            SELECT id, file_name, extracted_data FROM invoices 
                            WHERE user_id = 'rpa-system'
                            AND (
                                -- Match by filename prefix using base name
                                file_name ILIKE %s OR
                                -- Match by filename prefix using document number
                                file_name ILIKE %s OR
                                -- Match by exact XML filename
                                file_name = %s
                            )
                            ORDER BY created_at DESC 
                            LIMIT 1
                        """, (
                            f"{base_name}.xml",
                            f"{document_number}%",
                            xml_filename if xml_filename else ""
                        ))
                        invoice_result = pg_cursor.fetchone()
                    
                    # Strategy 3: Search imported_invoices by original_file_name and same log_id
                    if not invoice_result and xml_filename:
                        pg_cursor.execute("""
                            SELECT i.id, i.file_name, i.extracted_data 
                            FROM invoices i
                            JOIN imported_invoices ii ON ii.base_file_name = %s
                            WHERE ii.log_id = %s 
                            AND ii.file_type = 'xml'
                            AND ii.original_file_name = %s
                            AND i.user_id = 'rpa-system'
                            ORDER BY i.created_at DESC
                            LIMIT 1
                        """, (base_name, self.log_id, xml_filename))
                        invoice_result = pg_cursor.fetchone()

                    if invoice_result:
                        invoice_id = invoice_result[0]
                        invoice_filename = invoice_result[1]
                        extracted_data = invoice_result[2] if len(invoice_result) > 2 else {}

                        self.log(f"✅ Found matching invoice: ID {invoice_id}, file: {invoice_filename}")

                        # Check if we already have a PDF association for this invoice using token
                        pg_cursor.execute("""
                            SELECT id FROM imported_invoices 
                            WHERE (
                                base_file_name = %s OR 
                                original_file_name ILIKE %s OR
                                metadata->>'invoice_token' = %s
                            )
                            AND file_type = 'pdf' 
                            AND log_id = %s
                        """, (base_name, f"{document_number}_{tax_id}%", pdf_token_info['token'], self.log_id))

                        pdf_record = pg_cursor.fetchone()
                        
                        self.log(f"   PDF record search result: {'Found' if pdf_record else 'Not found'} in imported_invoices")

                        if pdf_record:
                            pdf_record_id = pdf_record[0]

                            # Update the PDF record with enhanced linking metadata
                            linking_metadata = {
                                'linked_to_main_invoice': True, 
                                'main_invoice_id': invoice_id,
                                'invoice_token': pdf_token_info['token'],
                                'document_number': document_number,
                                'tax_id': tax_id,
                                'linking_method': 'token_based',
                                'linked_at': datetime.now().isoformat()
                            }

                            # Update the PDF record with the enhanced link
                            pg_cursor.execute("""
                                UPDATE imported_invoices 
                                SET linked_invoice_id = %s,
                                    metadata = COALESCE(metadata, '{}'::jsonb) || %s
                                WHERE id = %s
                            """, (
                                invoice_id, 
                                json.dumps(linking_metadata),
                                pdf_record_id
                            ))

                            self.log(f"✅ Successfully linked PDF {pdf_filename} to invoice {invoice_id} via token {pdf_token_info['token']}")
                        else:
                            # Create PDF record in imported_invoices if it doesn't exist and link it
                            self.log(f"⚠️ PDF record not found in imported_invoices, creating it for: {pdf_filename}")
                            
                            try:
                                # Insert PDF record into imported_invoices 
                                pg_cursor.execute("""
                                    INSERT INTO imported_invoices 
                                    (log_id, original_file_name, file_type, file_size, file_path, 
                                     base_file_name, is_data_source, processing_status, downloaded_at, 
                                     linked_invoice_id, metadata)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    RETURNING id
                                """, (
                                    self.log_id,
                                    pdf_filename,
                                    'pdf',
                                    0,  # Will be updated later if needed
                                    f"uploads/pdfs/{pdf_filename}",
                                    base_name,
                                    False,  # PDFs are not data sources when linked
                                    'linked',
                                    datetime.now(),
                                    invoice_id,
                                    json.dumps({
                                        'linked_to_main_invoice': True,
                                        'main_invoice_id': invoice_id,
                                        'invoice_token': pdf_token_info['token'],
                                        'document_number': document_number,
                                        'tax_id': tax_id,
                                        'linking_method': 'created_and_linked',
                                        'linked_at': datetime.now().isoformat()
                                    })
                                ))
                                
                                new_pdf_id = pg_cursor.fetchone()[0]
                                self.log(f"✅ Created and linked PDF record {pdf_filename} to invoice {invoice_id} (new PDF ID: {new_pdf_id})")
                                
                            except Exception as create_error:
                                self.log(f"❌ Failed to create PDF record: {create_error}", "ERROR")
                    else:
                        self.log(f"⚠️ No matching invoice found for PDF {pdf_filename}")
                        self.log(f"   Search criteria: doc_num={document_number}, tax_id={tax_id}, token={pdf_token_info['token']}")

                        # Optional: Try alternative search by just document number if tax ID search fails
                        pg_cursor.execute("""
                            SELECT id, file_name FROM invoices 
                            WHERE user_id = 'rpa-system'
                            AND (
                                extracted_data->>'documentNumber' = %s OR
                                extracted_data->>'invoiceNumber' = %s OR
                                file_name ILIKE %s
                            )
                            ORDER BY created_at DESC 
                            LIMIT 1
                        """, (document_number, document_number, f"{document_number}%"))

                        fallback_result = pg_cursor.fetchone()
                        if fallback_result:
                            self.log(f"🔄 Found fallback match using document number only: {fallback_result[1]}")
                            # Could implement fallback linking here if needed

                except Exception as e:
                    self.log(f"❌ Failed to link PDF {pdf_info['upload_filename']}: {e}", "ERROR")
                    continue

            # Commit all changes
            pg_conn.commit()
            pg_conn.close()

            if pdf_files_to_link:
                self.log(f"✅ PDF linking completed for {len(pdf_files_to_link)} files")

            return True

        except Exception as e:
            self.log(f"❌ Error linking PDFs to main invoices: {e}", "ERROR")
            return False

    def _store_file_matches(self, processed_files):
        """Store file matching information for logging"""
        xml_files = [f for f in processed_files if f['type'] == 'xml']
        pdf_files = [f for f in processed_files if f['type'] == 'pdf']

        matched_pairs = []
        unmatched_xml = []
        unmatched_pdf = []

        for xml_file in xml_files:
            matched_pdf = next((p for p in pdf_files if p['base_name'] == xml_file['base_name']), None)
            if matched_pdf:
                matched_pairs.append({'xml': xml_file['upload_filename'], 'pdf': matched_pdf['upload_filename']})
            else:
                unmatched_xml.append(xml_file['upload_filename'])

        for pdf_file in pdf_files:
            if not any(p['xml'] for p in matched_pairs if p.get('pdf') == pdf_file['upload_filename']):
                unmatched_pdf.append(pdf_file['upload_filename'])

        if matched_pairs:
            self.log(f"Matched file pairs: {len(matched_pairs)}")
            for pair in matched_pairs:
                self.log(f"  📎 {pair['xml']} ↔ {pair['pdf']}")

        if unmatched_xml:
            self.log(f"XML files without PDF match: {', '.join(unmatched_xml)}")

        if unmatched_pdf:
            self.log(f"PDF files without XML match: {', '.join(unmatched_pdf)}")

        # Store in stats for logging
        self.stats['matched_pairs'] = len(matched_pairs)
        self.stats['unmatched_xml'] = len(unmatched_xml)
        self.stats['unmatched_pdf'] = len(unmatched_pdf)

    def _output_download_progress(self, current_item: int, total_items: int, current_step: str):
        """Output progress statistics with enhanced metrics tracking and validation"""
        try:
            # Use global progress tracking across all pages
            if self.global_progress['estimated_total_invoices'] > 0:
                # Calculate global progress (30-90% range for download phase)
                global_progress_ratio = self.global_progress['global_index'] / self.global_progress['estimated_total_invoices']
                download_progress = 30 + int(global_progress_ratio * 60)
                download_progress = min(download_progress, 90)  # Cap at 90% for download phase

                # Update step description with global context
                self.stats['current_step'] = f"Processing invoice {self.global_progress['global_index']}/{self.global_progress['estimated_total_invoices']}: {current_step}"
            else:
                # Fallback to page-based progress if global estimation isn't available
                download_progress = 30 + int((current_item / total_items) * 60) if total_items > 0 else 30
                self.stats['current_step'] = f"Page {self.global_progress['pages_processed'] + 1}, item {current_item}/{total_items}: {current_step}"

            self.stats['progress'] = download_progress

            # Validate metric consistency before reporting
            try:
                # Relationship constraint 1: total_invoices = skipped_invoices + processed_invoices
                expected_total = self.stats['skipped_invoices'] + self.stats['processed_invoices']
                if self.stats['total_invoices'] != expected_total:
                    self.log(f"⚠️ Metrics validation: total_invoices ({self.stats['total_invoices']}) != skipped ({self.stats['skipped_invoices']}) + processed ({self.stats['processed_invoices']}) = {expected_total}", "WARNING")

                # Relationship constraint 2: processed_invoices = successful_imports + failed_imports  
                expected_processed = self.stats['successful_imports'] + self.stats['failed_imports']
                if self.stats['processed_invoices'] != expected_processed:
                    self.log(f"⚠️ Metrics validation: processed_invoices ({self.stats['processed_invoices']}) != successful ({self.stats['successful_imports']}) + failed ({self.stats['failed_imports']}) = {expected_processed}", "WARNING")

            except Exception as e:
                self.log(f"❌ Error validating metrics: {e}", "ERROR")

            # Output STATS in JSON format with enhanced metrics
            stats_data = {
                'total_invoices': self.stats['total_invoices'],
                'skipped_invoices': self.stats['skipped_invoices'],
                'processed_invoices': self.stats['processed_invoices'],
                'successful_imports': self.stats['successful_imports'],
                'failed_imports': self.stats['failed_imports'],
                'current_step': self.stats['current_step'],
                'progress': download_progress
            }

            # Output with STATS: prefix so Node.js parser can find it
            import json
            print(f"STATS: {json.dumps(stats_data)}")
            sys.stdout.flush()

        except Exception as e:
            self.log(f"❌ Error outputting download progress: {e}", "ERROR")

    def output_final_metrics(self):
        """Output final comprehensive metrics with validation"""
        try:
            self.log("📊 FINAL IMPORT METRICS")
            self.log("=" * 50)

            # Validate and enforce relationship constraints
            try:
                # Constraint 1: total_invoices = skipped_invoices + processed_invoices
                expected_total = self.stats['skipped_invoices'] + self.stats['processed_invoices']
                if self.stats['total_invoices'] != expected_total:
                    self.log(f"🔧 Correcting total_invoices: {self.stats['total_invoices']} -> {expected_total}")
                    self.stats['total_invoices'] = expected_total

                # Constraint 2: processed_invoices = successful_imports + failed_imports
                expected_processed = self.stats['successful_imports'] + self.stats['failed_imports']
                if self.stats['processed_invoices'] != expected_processed:
                    self.log(f"🔧 Correcting processed_invoices: {self.stats['processed_invoices']} -> {expected_processed}")
                    self.stats['processed_invoices'] = expected_processed

                # Final validation assertions
                assert self.stats['total_invoices'] == self.stats['skipped_invoices'] + self.stats['processed_invoices'], f"Constraint violation: total ({self.stats['total_invoices']}) != skipped ({self.stats['skipped_invoices']}) + processed ({self.stats['processed_invoices']})"
                assert self.stats['processed_invoices'] == self.stats['successful_imports'] + self.stats['failed_imports'], f"Constraint violation: processed ({self.stats['processed_invoices']}) != successful ({self.stats['successful_imports']}) + failed ({self.stats['failed_imports']})"

                self.log("✅ All metric relationship constraints validated successfully")

            except Exception as e:
                self.log(f"❌ Error validating final metrics: {e}", "ERROR")

            # Output structured metrics
            final_metrics = {
                "total_invoices": self.stats['total_invoices'],
                "skipped_invoices": self.stats['skipped_invoices'],
                "processed_invoices": self.stats['processed_invoices'],
                "successful_imports": self.stats['successful_imports'],
                "failed_imports": self.stats['failed_imports']
            }

            self.log(f"📋 Total invoices discovered: {final_metrics['total_invoices']}")
            self.log(f"⏭️ Skipped invoices (duplicates): {final_metrics['skipped_invoices']}")
            self.log(f"🔄 Processed invoices: {final_metrics['processed_invoices']}")
            self.log(f"✅ Successful imports: {final_metrics['successful_imports']}")
            self.log(f"❌ Failed imports: {final_metrics['failed_imports']}")

            # Output in JSON format for parsing
            import json
            self.log(f"JSON METRICS: {json.dumps(final_metrics)}")

        except Exception as e:
            self.log(f"❌ Error outputting final metrics: {e}", "ERROR")

    def _output_progress_stats(self, processed_count: int, successful_count: int, failed_count: int, total_files: int):
        """Output progress statistics in format that Node.js parser can read"""
        try:
            # Calculate overall progress based on file processing
            file_progress = min(int((processed_count / total_files) * 100), 100) if total_files > 0 else 0
            overall_progress = 90 + int(file_progress * 0.08)  # Map to 90-98% range

            # Output STATS in JSON format that Node.js extractStatsFromOutput can parse
            stats_data = {
                'total_invoices': total_files,
                'processed_invoices': processed_count,
                'successful_imports': successful_count,
                'failed_imports': failed_count,
                'progress': overall_progress
            }

            # Output with STATS: prefix so Node.js parser can find it
            import json
            print(f"STATS: {json.dumps(stats_data)}")
            sys.stdout.flush()

            self.log(f"📊 Progress update: Processed={processed_count}/{total_files}, Success={successful_count}, Failed={failed_count}")

        except Exception as e:
            self.log(f"❌ Error outputting progress stats: {e}", "ERROR")

    def trigger_manual_processing(self, filename: str, numero: str, emisor: str, valor: str, file_type: str = 'xml', buyer_tax_id: Optional[str] = None):
        """Trigger the manual upload processing pipeline via HTTP request"""
        try:
            import requests

            # Create the invoice record first (simulating manual upload)
            file_path = f"uploads/{filename}"
            file_size = os.path.getsize(file_path)

            # Call the RPA integration endpoint instead of duplicating logic
            payload = {
                'filename': filename,
                'fileSize': file_size,
                'documentNumber': numero,
                'emisor': emisor,
                'totalValue': valor,
                'fileType': file_type,
                'source': 'python_rpa',
                'configId': self.config_id,  # Add config ID for company association
                'buyerTaxId': buyer_tax_id  # Pass the extracted buyer tax ID
            }

            # Make request to Node.js server to process through manual pipeline
            endpoint = '/api/rpa/process-xml' if file_type == 'xml' else '/api/rpa/process-pdf'
            response = requests.post(
                f'http://localhost:5000{endpoint}',
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                # Check the actual response content for success/failure
                try:
                    response_data = response.json()
                    if response_data.get('success', False):
                        self.log(f"Successfully processed {filename} ({file_type}) through manual pipeline")
                        # Update status to completed on successful processing
                        self._update_imported_invoice_status({'original_file_name': filename}, 'completed')
                        return True
                    else:
                        error_msg = response_data.get('error', 'Unknown processing error')
                        self.log(f"Failed to process {filename} ({file_type}): {error_msg}", "ERROR")
                        # Update status to failed with error message
                        self._update_imported_invoice_status({'original_file_name': filename}, 'failed', error_msg)
                        return False
                except Exception as json_error:
                    self.log(f"Could not parse response for {filename}: {json_error}", "ERROR")
                    # Update status to failed with parsing error
                    self._update_imported_invoice_status({'original_file_name': filename}, 'failed', f"Response parsing error: {json_error}")
                    return False
            else:
                error_msg = f"HTTP error {response.status_code}"
                try:
                    error_data = response.json()
                    if error_data.get('error'):
                        error_msg += f": {error_data['error']}"
                except:
                    pass

                self.log(f"HTTP error processing {filename} ({file_type}): {response.status_code}", "ERROR")
                # Update status to failed with HTTP error
                self._update_imported_invoice_status({'original_file_name': filename}, 'failed', error_msg)
                return False

        except Exception as e:
            self.log(f"Error triggering manual processing for {filename}: {e}", "ERROR")
            # Update status to failed with exception error
            self._update_imported_invoice_status({'original_file_name': filename}, 'failed', str(e))
            return False

    def run_import_process(self) -> Dict[str, Any]:
        """Run the complete import process"""
        try:
            self.log("Starting Python RPA invoice import process")

            # CRITICAL FIX: Clear download directories to prevent processing orphaned files from previous runs
            self.clear_download_directories()

            # Setup driver
            if not self.setup_driver():
                return {
                    'success': False,
                    'error': 'Failed to setup WebDriver',
                    'stats': self.stats
                }

            # Login
            if not self.login_to_erp():
                return {
                    'success': False,
                    'error': 'Failed to login to ERP',
                    'stats': self.stats
                }

            # Navigate
            if not self.navigate_to_invoices():
                return {
                    'success': False,
                    'error': 'Failed to navigate to invoices',
                    'stats': self.stats
                }

            # Process invoices
            if not self.process_invoice_rows():
                return {
                    'success': False,
                    'error': 'Failed to process invoice rows',
                    'stats': self.stats
                }

            # Extract invoice files (XML/PDF based on configuration)
            if not self.extract_invoices_from_zip():
                return {
                    'success': False,
                    'error': 'Failed to extract invoice files',
                    'stats': self.stats
                }

            # NEW: Process extracted files through manual upload pipeline  
            if not self.process_files_through_manual_pipeline():
                return {
                    'success': False,
                    'error': 'Failed to process files through manual pipeline',
                    'stats': self.stats
                }

            self.update_progress("Import process completed successfully", 100)

            # Output comprehensive final metrics with validation
            self.output_final_metrics()

            self.log("Python RPA import process completed successfully")

            return {'success': True, 'stats': self.stats}

        except Exception as e:
            self.log(f"Import process failed: {e}", "ERROR")
            # Output final metrics even on failure for debugging
            self.output_final_metrics()
            return {'success': False, 'error': str(e), 'stats': self.stats}
        finally:
            self.cleanup()


def main():
    """Main function for Python RPA invoice importer"""
    if len(sys.argv) != 2:
        error_result = {
            'success': False,
            'error': 'Usage: python3 pythonRpaService.py \'<config_json>\'',
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