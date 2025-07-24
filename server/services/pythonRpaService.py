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
from datetime import datetime
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
                decoded_password = base64.b64decode(raw_password).decode('utf-8')
                self.password = decoded_password
                self.log(f"Password decoded successfully")
            else:
                self.password = raw_password
        except Exception as e:
            # If decoding fails, use the raw password
            self.password = raw_password
            self.log(f"Using raw password (decode failed: {e})")
        self.download_dir = config.get('downloadPath', '/tmp/invoice_downloads')
        self.xml_dir = config.get('xmlPath', '/tmp/xml_invoices')

        # Get headless mode from config (default to False for easier debugging)
        self.headless_mode = config.get('headless', False)

        # Validate required config values early
        if not self.erp_url:
            raise ValueError("Missing required config: 'erpUrl' must be provided")
        if not self.username:
            raise ValueError("Missing required config: 'erpUsername' must be provided")
        if not self.password:
            raise ValueError("Missing required config: 'erpPassword' must be provided")

        self.db_path = os.path.join(self.download_dir, 'invoices.db')
        self.xml_db_path = os.path.join(self.xml_dir, 'invoices_xml.db')

        # Ensure directories exist (convert Windows paths to Linux paths in Replit)
        if os.name == 'posix':  # Linux/Unix (Replit environment)
            # Convert Windows paths to temp directories
            if self.download_dir.startswith('C:\\'):
                self.download_dir = '/tmp/invoice_downloads'
            if self.xml_dir.startswith('C:\\'):
                self.xml_dir = '/tmp/xml_invoices'
        
        os.makedirs(self.download_dir, exist_ok=True)
        os.makedirs(self.xml_dir, exist_ok=True)
        
        self.log(f"Download directory: {self.download_dir}")
        self.log(f"XML directory: {self.xml_dir}")

        # Initialize driver
        self.driver = None
        self.wait = None
        self.short_wait = None
        self.long_wait = None

        # Statistics
        self.stats = {
            'total_invoices': 0,
            'processed_invoices': 0,
            'successful_imports': 0,
            'failed_imports': 0,
            'current_step': 'Initializing',
            'progress': 0
        }

    def is_driver_ready(self) -> bool:
        """Check if driver and wait objects are properly initialized"""
        return (self.driver is not None and 
                self.wait is not None and 
                self.short_wait is not None and 
                self.long_wait is not None)

    def log(self, message: str, level: str = 'INFO'):
        """Log message with timestamp"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {level}: {message}")
        sys.stdout.flush()

    def update_progress(self, step: str, progress: int):
        """Update progress tracking with structured output for backend parsing"""
        self.stats['current_step'] = step
        self.stats['progress'] = progress
        
        # Log for visual tracking
        self.log(f"Progress: {progress}% - {step}")
        
        # Emit structured progress data that backend can parse via stdout
        progress_data = {
            "current_step": step,
            "progress": progress,
            "total_invoices": self.stats.get('total_invoices', 0),
            "processed_invoices": self.stats.get('processed_invoices', 0),
            "successful_imports": self.stats.get('successful_imports', 0),
            "failed_imports": self.stats.get('failed_imports', 0),
            "timestamp": datetime.now().isoformat()
        }
        
        # Print structured data for backend WebSocket streaming
        print(f"PROGRESS:{json.dumps(progress_data)}")
        sys.stdout.flush()  # Ensure immediate output
        sys.stdout.flush()  # Ensure immediate output

    def setup_driver(self):
        """Initialize Chrome WebDriver with download preferences"""
        self.log("Setting up Chrome WebDriver...")

        try:
            # Check if Chrome/Chromium is available
            import shutil
            chrome_path = shutil.which('google-chrome') or shutil.which('chromium-browser') or shutil.which('chromium')
            if not chrome_path:
                raise Exception("Chrome/Chromium browser not found. Please install google-chrome or chromium-browser.")

            self.log(f"Found browser at: {chrome_path}")

            chrome_options = webdriver.ChromeOptions()

            # Set binary location if needed
            if 'chromium' in chrome_path:
                chrome_options.binary_location = chrome_path

            prefs = {
                "download.default_directory": self.download_dir,
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": False,
                "safebrowsing.disable_download_protection": True,
                "profile.default_content_settings.popups": 0
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
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument("--disable-background-timer-throttling")
            chrome_options.add_argument("--disable-backgrounding-occluded-windows")
            chrome_options.add_argument("--disable-renderer-backgrounding")
            chrome_options.add_argument("--disable-features=TranslateUI")
            chrome_options.add_argument("--disable-ipc-flooding-protection")

            self.log("Initializing ChromeDriver in headless mode with debug capture...")

            self.driver = webdriver.Chrome(options=chrome_options)
            self.driver.set_window_size(1920, 1080)  # Set size for consistent screenshots

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
            self.log("1. Install Chrome/Chromium: sudo apt-get install chromium-browser", "ERROR")
            self.log("2. Install Selenium: pip3 install selenium", "ERROR")
            self.log("3. Check if ports are blocked by firewall", "ERROR")
            return False

    def init_database(self, db_path: str, table_type: str = 'downloads') -> sqlite3.Connection:
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

    def wait_for_new_zip(self, timeout: int = 60, before_files: Optional[set] = None) -> str:
        """Wait for a new ZIP file to be downloaded"""
        deadline = time.time() + timeout
        if before_files is None:
            before_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }

        while time.time() < deadline:
            # Check for Chrome download files
            crdownloads = [f for f in os.listdir(self.download_dir) if f.endswith(".crdownload")]
            current_files = {
                os.path.join(self.download_dir, f)
                for f in os.listdir(self.download_dir)
                if f.lower().endswith(".zip")
            }
            new_files = list(current_files - before_files)
            if new_files and not crdownloads:
                return max(new_files, key=os.path.getctime)
            time.sleep(1)

        raise TimeoutError(f"No new .zip file downloaded within {timeout} seconds.")

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
            
            # HTML source
            html_filename = f"{timestamp}_{clean_label}.html"
            html_path = os.path.join(debug_date_dir, html_filename)
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(self.driver.page_source)
            
            # Page info
            info_filename = f"{timestamp}_{clean_label}_info.txt"
            info_path = os.path.join(debug_date_dir, info_filename)
            with open(info_path, 'w', encoding='utf-8') as f:
                f.write(f"Debug Capture: {label}\n")
                f.write(f"Timestamp: {timestamp}\n")
                f.write(f"Current URL: {self.driver.current_url}\n")
                f.write(f"Page Title: {self.driver.title}\n")
                f.write(f"Window Size: {self.driver.get_window_size()}\n")
                f.write(f"Page Load State: {self.driver.execute_script('return document.readyState')}\n")
                
                # Check for common error indicators
                error_elements = self.driver.find_elements(By.CLASS_NAME, "alert-danger")
                if error_elements:
                    f.write(f"Error Messages Found: {len(error_elements)}\n")
                    for i, elem in enumerate(error_elements):
                        f.write(f"  Error {i+1}: {elem.text}\n")
                else:
                    f.write("No error messages found\n")
            
            # Create relative path for cleaner logging
            relative_path = os.path.join("rpa_debug_captures", date_folder)
            self.log(f"🔍 Debug capture saved to {relative_path}/: {screenshot_filename}, {html_filename}, {info_filename}")
            
        except Exception as e:
            self.log(f"Failed to create debug capture: {e}", "ERROR")

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
            username_field = self.wait.until(EC.element_to_be_clickable((By.ID, "txtUsuario")))
            username_field.clear()
            username_field.send_keys(self.username)
            
            self.log("Entering password...")
            password_field = self.wait.until(EC.element_to_be_clickable((By.ID, "txtContrasena")))
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
            ingresar_btn = self.wait.until(EC.element_to_be_clickable((By.ID, "btnIngresar")))
            self.driver.execute_script("arguments[0].click();", ingresar_btn)
            
            # Debug capture after login attempt
            self.debug_capture("04_after_ingresar_click")
            
            # Wait for successful login - look for dashboard elements
            self.log("Waiting for login success indicators...")
            try:
                # Wait for login to complete - check for typical post-login elements
                WebDriverWait(self.driver, 15).until(
                    lambda driver: "login" not in driver.current_url.lower() or 
                                 driver.find_elements(By.ID, "mod-FE") or
                                 driver.find_elements(By.CLASS_NAME, "dashboard") or
                                 "dashboard" in driver.current_url.lower()
                )
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
                error_elements = self.driver.find_elements(By.CLASS_NAME, "alert-danger")
                if error_elements:
                    self.log(f"❌ Login error: {error_elements[0].text}")
                    return False
                
                # If URL changed or we see expected elements, consider it success
                if "login" not in current_url.lower() or self.driver.find_elements(By.ID, "mod-FE"):
                    self.log("✅ Login appears successful based on URL/elements")
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
            fe_button = self.long_wait.until(EC.element_to_be_clickable((By.ID, "mod-FE")))
            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", fe_button)
            self.driver.execute_script("arguments[0].click();", fe_button)
            self.log("✅ Clicked 'mod-FE' successfully")
            
            # Debug capture after FE click
            self.debug_capture("10_after_mod_FE_click")
            time.sleep(2)

            # Click Recepción if available
            try:
                self.log("Looking for 'Recepción' button...")
                self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Recepción')]"))).click()
                self.log("✅ Clicked 'Recepción'")
                self.debug_capture("11_after_recepcion_click")
            except Exception:
                self.log("⏭️ Skipping 'Recepción' button (not found or not needed)")

            # Click Documentos recibidos
            self.log("Looking for 'Documentos recibidos' button...")
            self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[text()='Documentos recibidos']"))).click()
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
            self.update_progress("Accessing invoice data frame", 35)
            WebDriverWait(self.driver, 15).until(EC.frame_to_be_available_and_switch_to_it((By.ID, "pagina1")))
            self.log("✅ Successfully switched to iframe 'pagina1'")
            
            # Debug capture after iframe switch
            self.debug_capture("15_after_iframe_switch")

            # Wait for rows to load
            self.log("⏳ Waiting for invoice rows to populate...")
            start = time.time()
            max_wait = 20

            while time.time() - start < max_wait:
                rows = self.driver.find_elements(By.CSS_SELECTOR, "div.rt-tr-group")
                data_rows = [r for r in rows if r.text.strip()]
                if data_rows:
                    self.log(f"✅ Found {len(data_rows)} rows with content")
                    self.update_progress(f"Found {len(data_rows)} invoices to process", 40)
                    # Debug capture when we find the invoice rows
                    self.debug_capture("16_invoice_rows_found")
                    break
                time.sleep(1)
            else:
                self.log(f"❌ No populated rows found after {max_wait} seconds", "ERROR")
                raise Exception(f"No populated rows found after {max_wait} seconds")

            # Initialize database
            db_conn = self.init_database(self.db_path, 'downloads')
            page_count = 0

            while True:
                rows = self.driver.find_elements(By.CSS_SELECTOR, "div.rt-tr-group")
                data_rows = [r for r in rows if r.text.strip()]

                if len(data_rows) == 0:
                    self.log(f"⚠️ Page {page_count + 1} has no data rows, moving to next page")
                else:
                    self.log(f"📄 Processing page {page_count + 1} with {len(data_rows)} data rows (total elements: {len(rows)})")

                for i, row in enumerate(rows):
                    try:
                        columns = row.find_elements(By.CSS_SELECTOR, "div.rt-td")
                        if len(columns) < 8:
                            continue

                        numero_documento = columns[1].text.strip()
                        emisor = columns[2].text.strip().replace(" ", "_").replace(".", "")
                        safe_emisor = re.sub(r'[\\/*?:"<>|\n\r]+', "_", emisor)
                        valor_total = columns[8].text.strip().replace(",", "").replace(".", "").split(" ")[0]

                        # Check if already downloaded
                        cursor = db_conn.cursor()
                        cursor.execute("""
                            SELECT 1 FROM downloaded_invoices 
                            WHERE numero_documento = ? AND emisor = ? AND valor_total = ?
                        """, (numero_documento, safe_emisor, valor_total))

                        if cursor.fetchone():
                            self.log(f"⏭️ Skipping duplicate: {numero_documento} - {safe_emisor}")
                            continue

                        self.log(f"🔍 Processing: {numero_documento} - {emisor} - {valor_total}")
                        self.stats['total_invoices'] += 1

                        # Download invoice
                        if self.download_invoice(row, numero_documento, safe_emisor, valor_total, db_conn):
                            self.stats['successful_imports'] += 1
                            self.log(f"✅ Successfully processed invoice: {numero_documento}")
                        else:
                            self.stats['failed_imports'] += 1
                            self.log(f"❌ Failed to process invoice: {numero_documento}")

                        self.stats['processed_invoices'] += 1
                        
                        # Update progress based on processed invoices with more granular updates
                        if self.stats['total_invoices'] > 0:
                            invoice_progress = (self.stats['processed_invoices'] / self.stats['total_invoices']) * 40
                            total_progress = 40 + int(invoice_progress)
                            
                            # Update progress every invoice for real-time feedback
                            step_message = f"Processing invoice {self.stats['processed_invoices']}/{self.stats['total_invoices']}: {numero_documento}"
                            self.update_progress(step_message, total_progress)
                            
                            # Additional progress update every 5 invoices or at specific milestones
                            if self.stats['processed_invoices'] % 5 == 0 or total_progress in [45, 50, 55, 60, 65, 70, 75]:
                                milestone_message = f"Processed {self.stats['processed_invoices']} invoices successfully"
                                self.update_progress(milestone_message, total_progress)

                    except Exception as e:
                        self.log(f"❌ Error processing row {i}: {e}", "ERROR")
                        self.stats['failed_imports'] += 1
                        continue

                # Try to go to next page
                try:
                    next_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Siguiente') and not(@disabled)]")
                    ActionChains(self.driver).move_to_element(next_btn).click().perform()
                    self.log("➡️ Moving to next page")
                    time.sleep(3)
                    page_count += 1
                except:
                    self.log("✅ Finished processing all pages")
                    break

            db_conn.close()
            return True

        except Exception as e:
            self.log(f"Error processing invoice rows: {e}", "ERROR")
            return False

    def download_invoice(self, row, numero_documento: str, safe_emisor: str, valor_total: str, db_conn) -> bool:
        """Download individual invoice"""
        if not self.driver:
            self.log("Driver not initialized", "ERROR")
            return False

        try:
            # Scroll to row and click download button
            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", row)
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
            ActionChains(self.driver).move_to_element(buttons[3]).click().perform()

            # Click actual download button  
            if not self.short_wait:
                self.log("Short wait object not initialized", "ERROR")
                return False
            download_button = self.short_wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "descargar")))
            ActionChains(self.driver).move_to_element(download_button).click().perform()

            # Wait for download to complete
            downloaded_zip = self.wait_for_new_zip(timeout=60, before_files=existing_zips)
            self.log(f"Downloaded: {downloaded_zip}")

            # Rename file
            new_name = os.path.join(self.download_dir, f"{numero_documento}_{safe_emisor}.zip")
            final_path = self.safe_rename(downloaded_zip, new_name)

            # Record in database
            cursor = db_conn.cursor()
            cursor.execute("""
                INSERT OR IGNORE INTO downloaded_invoices 
                (numero_documento, emisor, valor_total, filename)
                VALUES (?, ?, ?, ?)
            """, (numero_documento, safe_emisor, valor_total, os.path.basename(final_path)))
            db_conn.commit()

            # Close download dialog
            if not self.short_wait:
                self.log("Short wait object not initialized", "ERROR")
                return False
            close_button = self.short_wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn.btn-light.pull-right")))
            ActionChains(self.driver).move_to_element(close_button).click().perform()

            return True

        except Exception as e:
            self.log(f"Failed to download invoice: {e}", "ERROR")
            return False

    def extract_xml_files(self) -> bool:
        """Extract XML files from downloaded ZIPs"""
        try:
            self.update_progress("Extracting XML files from ZIPs", 70)
            
            # Track extraction progress
            extracted_count = 0
            total_zips = len([f for f in os.listdir(self.download_dir) if f.lower().endswith(".zip")])
            for filename in os.listdir(self.download_dir):
                if filename.lower().endswith(".zip"):
                    zip_path = os.path.join(self.download_dir, filename)
                    base_name = os.path.splitext(filename)[0]

                    try:
                        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                            temp_dir = os.path.join(self.download_dir, "__temp_extract__")
                            os.makedirs(temp_dir, exist_ok=True)
                            zip_ref.extractall(temp_dir)

                            xml_found = False
                            for f in os.listdir(temp_dir):
                                if f.lower().endswith(".xml"):
                                    new_name = f"{base_name}.xml"
                                    src = os.path.join(temp_dir, f)
                                    dst = os.path.join(self.xml_dir, new_name)
                                    shutil.move(src, dst)
                                    xml_found = True
                                    extracted_count += 1
                                    self.log(f"Extracted XML: {new_name}")
                                    
                                    # Update progress during extraction
                                    if total_zips > 0:
                                        extract_progress = 70 + int((extracted_count / total_zips) * 15)
                                        self.update_progress(f"Extracted {extracted_count}/{total_zips} XML files", extract_progress)
                                    break

                            shutil.rmtree(temp_dir)

                        if xml_found:
                            os.remove(zip_path)
                            self.log(f"Deleted ZIP: {filename}")
                        else:
                            self.log(f"No XML found in: {filename}")

                    except Exception as e:
                        self.log(f"Error extracting {filename}: {e}", "ERROR")

            self.log(f"Extracted {extracted_count} XML files")
            return True

        except Exception as e:
            self.log(f"Error extracting XML files: {e}", "ERROR")
            return False

    def import_xml_to_database(self) -> bool:
        """Import XML files to database"""
        try:
            self.update_progress("Importing XML files to database", 90)

            xml_conn = self.init_database(self.xml_db_path, 'xml')
            imported_count = 0
            total_xmls = len([f for f in os.listdir(self.xml_dir) if f.lower().endswith(".xml")])

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
                        cursor.execute("""
                            INSERT OR IGNORE INTO downloaded_invoices
                            (numero_documento, emisor, valor_total, xml_content)
                            VALUES (?, ?, ?, ?)
                        """, (numero, emisor, valor, xml_content))
                        xml_conn.commit()

                        os.remove(file_path)
                        imported_count += 1
                        self.log(f"Imported and deleted: {filename}")
                        
                        # Update progress during import
                        if total_xmls > 0:
                            import_progress = 90 + int((imported_count / total_xmls) * 8)
                            self.update_progress(f"Imported {imported_count}/{total_xmls} XML files to database", import_progress)

                    except Exception as e:
                        self.log(f"Failed to process {filename}: {e}", "ERROR")

            xml_conn.close()
            self.log(f"Imported {imported_count} XML files to database")
            return True

        except Exception as e:
            self.log(f"Error importing XML to database: {e}", "ERROR")
            return False

    def cleanup(self):
        """Cleanup resources"""
        if self.driver:
            try:
                self.driver.quit()
                self.log("WebDriver closed successfully")
            except Exception as e:
                self.log(f"Error closing WebDriver: {e}", "ERROR")

    def run_import_process(self) -> Dict[str, Any]:
        """Run the complete import process"""
        try:
            self.log("Starting Python RPA invoice import process")

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

            # Extract XML files
            if not self.extract_xml_files():
                return {
                    'success': False,
                    'error': 'Failed to extract XML files',
                    'stats': self.stats
                }

            # Import to database
            if not self.import_xml_to_database():
                return {
                    'success': False,
                    'error': 'Failed to import XML to database',
                    'stats': self.stats
                }

            self.update_progress("Import process completed successfully", 100)
            self.log("Python RPA import process completed successfully")

            return {
                'success': True,
                'stats': self.stats
            }

        except Exception as e:
            self.log(f"Import process failed: {e}", "ERROR")
            return {
                'success': False,
                'error': str(e),
                'stats': self.stats
            }
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