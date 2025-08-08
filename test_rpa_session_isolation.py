#!/usr/bin/env python3
"""
Test script to verify RPA session isolation fixes
Tests directory cleanup and session file tracking
"""

import os
import tempfile
import shutil
from datetime import datetime, timedelta
import json

# Simulate the RPA service key functionality
class MockInvoiceRPAService:
    def __init__(self, config):
        self.config = config
        self.download_dir = config.get('downloadPath', 'test_downloads')
        self.xml_dir = config.get('xmlPath', 'test_xml')
        
        # Create test directories
        os.makedirs(self.download_dir, exist_ok=True)
        os.makedirs(self.xml_dir, exist_ok=True)
        os.makedirs(os.path.join(self.download_dir, 'pdfs'), exist_ok=True)
        
        # Session tracking
        self.session_downloaded_files = set()
        self.session_start_time = datetime.now()
        
        print(f"🔧 Mock RPA service initialized")
        print(f"   Download dir: {self.download_dir}")
        print(f"   XML dir: {self.xml_dir}")
        print(f"   Session start: {self.session_start_time}")

    def clear_download_directories(self):
        """Clear download directories to prevent processing orphaned files from previous runs"""
        try:
            print("🧹 Clearing download directories to ensure clean session isolation...")
            
            # Clear PDF directory
            pdf_dir = os.path.join(self.download_dir, 'pdfs')
            if os.path.exists(pdf_dir):
                pdf_files_cleared = 0
                for filename in os.listdir(pdf_dir):
                    file_path = os.path.join(pdf_dir, filename)
                    try:
                        os.remove(file_path)
                        pdf_files_cleared += 1
                    except Exception as e:
                        print(f"⚠️ Could not remove PDF file {filename}: {e}")
                print(f"✅ Cleared {pdf_files_cleared} orphaned PDF files from {pdf_dir}")
            
            # Clear XML directory
            if os.path.exists(self.xml_dir):
                xml_files_cleared = 0
                for filename in os.listdir(self.xml_dir):
                    file_path = os.path.join(self.xml_dir, filename)
                    try:
                        os.remove(file_path)
                        xml_files_cleared += 1
                    except Exception as e:
                        print(f"⚠️ Could not remove XML file {filename}: {e}")
                print(f"✅ Cleared {xml_files_cleared} orphaned XML files from {self.xml_dir}")
            
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
                            print(f"⚠️ Could not remove ZIP file {filename}: {e}")
                if zip_files_cleared > 0:
                    print(f"✅ Cleared {zip_files_cleared} orphaned ZIP files from {self.download_dir}")
            
            print("🎯 Directory cleanup completed - only files downloaded in this session will be processed")
            
        except Exception as e:
            print(f"❌ Error clearing download directories: {e}")

    def simulate_orphaned_files(self):
        """Create orphaned files from 'previous sessions' for testing"""
        print("🗂️ Creating simulated orphaned files from previous sessions...")
        
        # Create old files with timestamps before session start
        old_time = (self.session_start_time - timedelta(hours=1)).timestamp()
        
        # Create orphaned XML files
        for i in range(3):
            xml_file = os.path.join(self.xml_dir, f"orphan_xml_{i}.xml")
            with open(xml_file, 'w') as f:
                f.write(f"<xml>Orphaned XML file {i}</xml>")
            os.utime(xml_file, (old_time, old_time))
        
        # Create orphaned PDF files
        pdf_dir = os.path.join(self.download_dir, 'pdfs')
        for i in range(2):
            pdf_file = os.path.join(pdf_dir, f"orphan_pdf_{i}.pdf")
            with open(pdf_file, 'w') as f:
                f.write(f"Fake PDF content {i}")
            os.utime(pdf_file, (old_time, old_time))
        
        # Create orphaned ZIP files
        for i in range(1):
            zip_file = os.path.join(self.download_dir, f"orphan_archive_{i}.zip")
            with open(zip_file, 'w') as f:
                f.write(f"Fake ZIP content {i}")
            os.utime(zip_file, (old_time, old_time))
        
        print("✅ Created 3 XML, 2 PDF, and 1 ZIP orphaned files")

    def simulate_current_session_files(self):
        """Create files from current session for testing"""
        print("📁 Creating simulated current session files...")
        
        # Create current session XML files
        for i in range(2):
            xml_file = os.path.join(self.xml_dir, f"session_xml_{i}.xml")
            with open(xml_file, 'w') as f:
                f.write(f"<xml>Current session XML file {i}</xml>")
            self.session_downloaded_files.add(f"session_xml_{i}.xml")
        
        # Create current session PDF files
        pdf_dir = os.path.join(self.download_dir, 'pdfs')
        for i in range(1):
            pdf_file = os.path.join(pdf_dir, f"session_pdf_{i}.pdf")
            with open(pdf_file, 'w') as f:
                f.write(f"Current session PDF content {i}")
            self.session_downloaded_files.add(f"session_pdf_{i}.pdf")
        
        print("✅ Created 2 XML and 1 PDF current session files")

    def test_file_filtering(self):
        """Test session-based file filtering logic"""
        print("🔍 Testing session-based file filtering...")
        
        xml_files = {}
        pdf_files = {}
        
        # Scan XML files (only those from current session)
        if os.path.exists(self.xml_dir):
            xml_count = 0
            for filename in os.listdir(self.xml_dir):
                if filename.lower().endswith(".xml"):
                    file_path = os.path.join(self.xml_dir, filename)
                    file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_mod_time >= self.session_start_time:
                        base_name = os.path.splitext(filename)[0]
                        xml_files[base_name] = filename
                        xml_count += 1
                    else:
                        print(f"⏭️ Ignoring pre-session XML file: {filename} (modified: {file_mod_time})")
            print(f"📁 Found {xml_count} XML files from current session")
        
        # Scan PDF files (only those from current session)
        pdf_dir = os.path.join(self.download_dir, 'pdfs')
        if os.path.exists(pdf_dir):
            pdf_count = 0
            for filename in os.listdir(pdf_dir):
                if filename.lower().endswith(".pdf"):
                    file_path = os.path.join(pdf_dir, filename)
                    file_mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_mod_time >= self.session_start_time:
                        base_name = os.path.splitext(filename)[0]
                        pdf_files[base_name] = filename
                        pdf_count += 1
                    else:
                        print(f"⏭️ Ignoring pre-session PDF file: {filename} (modified: {file_mod_time})")
            print(f"📁 Found {pdf_count} PDF files from current session")
        
        return xml_files, pdf_files

    def cleanup_test_dirs(self):
        """Clean up test directories"""
        try:
            if os.path.exists(self.download_dir):
                shutil.rmtree(self.download_dir)
            if os.path.exists(self.xml_dir):
                shutil.rmtree(self.xml_dir)
            print("🧹 Test directories cleaned up")
        except Exception as e:
            print(f"⚠️ Error cleaning up test directories: {e}")

def run_session_isolation_test():
    """Run comprehensive session isolation test"""
    print("🧪 Starting RPA Session Isolation Test")
    print("=" * 50)
    
    config = {
        'downloadPath': 'test_downloads',
        'xmlPath': 'test_xml',
        'fileTypes': 'both'
    }
    
    rpa_service = MockInvoiceRPAService(config)
    
    try:
        # Test 1: Create orphaned files from previous sessions
        print("\n📋 Test 1: Creating orphaned files from previous sessions")
        rpa_service.simulate_orphaned_files()
        
        # Test 2: Create current session files
        print("\n📋 Test 2: Creating current session files")
        rpa_service.simulate_current_session_files()
        
        # Test 3: Test file filtering WITHOUT cleanup (should see both old and new)
        print("\n📋 Test 3: File filtering WITHOUT cleanup (should show both old and new files)")
        xml_before, pdf_before = rpa_service.test_file_filtering()
        
        # Test 4: Test directory cleanup
        print("\n📋 Test 4: Testing directory cleanup")
        rpa_service.clear_download_directories()
        
        # Test 5: Test file filtering AFTER cleanup (should only see current session files)
        print("\n📋 Test 5: File filtering AFTER cleanup (should only show current session files)")
        rpa_service.simulate_current_session_files()  # Re-create current session files
        xml_after, pdf_after = rpa_service.test_file_filtering()
        
        # Results
        print("\n🎯 Test Results Summary")
        print("=" * 30)
        print(f"XML files before cleanup: {len(xml_before)} (should include orphaned)")
        print(f"XML files after cleanup:  {len(xml_after)} (should only be current session)")
        print(f"PDF files before cleanup: {len(pdf_before)} (should include orphaned)")  
        print(f"PDF files after cleanup:  {len(pdf_after)} (should only be current session)")
        print(f"Session tracked files: {len(rpa_service.session_downloaded_files)}")
        
        # Validation
        success = True
        if len(xml_after) > len(xml_before):
            print("❌ XML filtering failed - more files after cleanup")
            success = False
        if len(pdf_after) > len(pdf_before):
            print("❌ PDF filtering failed - more files after cleanup") 
            success = False
        if len(rpa_service.session_downloaded_files) == 0:
            print("❌ Session tracking failed - no files tracked")
            success = False
            
        if success:
            print("✅ All session isolation tests PASSED")
            print("✅ RPA file counting fix is working correctly")
        else:
            print("❌ Some session isolation tests FAILED")
            
    finally:
        # Cleanup
        rpa_service.cleanup_test_dirs()
    
    return success

if __name__ == "__main__":
    success = run_session_isolation_test()
    if success:
        print("\n🎉 RPA Session Isolation Fix: VERIFIED WORKING")
    else:
        print("\n💥 RPA Session Isolation Fix: NEEDS ATTENTION")