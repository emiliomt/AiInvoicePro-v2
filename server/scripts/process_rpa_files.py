#!/usr/bin/env python3
"""
Batch processor for RPA downloaded files
Processes files without full RPA workflow - just transfers to manual pipeline
"""
import os
import sys
import json
import shutil
import requests
from datetime import datetime

class RPAFileProcessor:
    def __init__(self):
        self.extracted_dir = '../uploads/pdfs/__temp_extract__'
        self.uploads_dir = '../uploads'
        self.stats = {
            'total_files': 0,
            'processed_files': 0,
            'successful_transfers': 0,
            'failed_transfers': 0,
            'errors': []
        }
    
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
    
    def extract_file_metadata(self, filename):
        """Extract metadata from filename"""
        base_name = os.path.splitext(filename)[0]
        parts = base_name.split('_')
        
        # For XML files, try to extract invoice number (first part)
        numero = parts[0] if len(parts) > 0 else base_name
        emisor = parts[1] if len(parts) > 1 else ''
        valor = parts[2] if len(parts) > 2 else ''
        
        return numero, emisor, valor
    
    def trigger_manual_processing(self, filename, numero, emisor, valor, file_type='xml'):
        """Transfer file to manual processing via API"""
        try:
            # Copy file to uploads directory
            source_path = os.path.join(self.extracted_dir, filename)
            dest_path = os.path.join(self.uploads_dir, filename)
            
            if not os.path.exists(source_path):
                self.log(f"❌ Source file not found: {source_path}", "ERROR")
                return False
            
            # Ensure uploads directory exists
            os.makedirs(self.uploads_dir, exist_ok=True)
            
            # Copy file
            shutil.copy2(source_path, dest_path)
            self.log(f"📋 Copied: {filename}")
            
            # Prepare API payload
            payload = {
                'filename': filename,
                'documentNumber': numero,
                'emisor': emisor,
                'totalValue': valor,
                'configId': 5,  # Use existing config
                'fileType': file_type,
                'source': 'python_rpa_batch'
            }
            
            # Call API
            response = requests.post(
                'http://localhost:5000/api/rpa/process-pdf',
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                response_data = response.json()
                if response_data.get('success', False):
                    self.log(f"✅ Processed: {filename} -> Invoice ID: {response_data.get('invoiceId')}")
                    self.stats['successful_transfers'] += 1
                    return True
                else:
                    error_msg = response_data.get('error', 'Unknown error')
                    self.log(f"❌ API Error for {filename}: {error_msg}", "ERROR")
                    self.stats['failed_transfers'] += 1
                    return False
            else:
                self.log(f"❌ HTTP {response.status_code} for {filename}", "ERROR")
                self.stats['failed_transfers'] += 1
                return False
                
        except Exception as e:
            self.log(f"❌ Error processing {filename}: {e}", "ERROR")
            self.stats['failed_transfers'] += 1
            self.stats['errors'].append(f"{filename}: {str(e)}")
            return False
    
    def process_all_files(self):
        """Process all downloaded XML and PDF files"""
        self.log("🚀 Starting batch RPA file processing...")
        
        if not os.path.exists(self.extracted_dir):
            self.log(f"❌ Extract directory not found: {self.extracted_dir}", "ERROR")
            return False
        
        # Get all XML and PDF files
        all_files = []
        for filename in os.listdir(self.extracted_dir):
            if filename.lower().endswith(('.xml', '.pdf')):
                all_files.append(filename)
        
        self.stats['total_files'] = len(all_files)
        self.log(f"📊 Found {len(all_files)} files to process")
        
        # Process each file
        for filename in sorted(all_files):
            self.log(f"🔄 Processing: {filename}")
            
            # Extract metadata
            numero, emisor, valor = self.extract_file_metadata(filename)
            
            # Determine file type
            file_type = 'xml' if filename.lower().endswith('.xml') else 'pdf'
            
            # Process file
            success = self.trigger_manual_processing(filename, numero, emisor, valor, file_type)
            
            self.stats['processed_files'] += 1
            
            # Progress update
            progress = (self.stats['processed_files'] / self.stats['total_files']) * 100
            self.log(f"📈 Progress: {self.stats['processed_files']}/{self.stats['total_files']} ({progress:.1f}%)")
        
        # Final summary
        self.log("📋 BATCH PROCESSING COMPLETE!")
        self.log(f"   📊 Total Files: {self.stats['total_files']}")
        self.log(f"   ✅ Successful: {self.stats['successful_transfers']}")
        self.log(f"   ❌ Failed: {self.stats['failed_transfers']}")
        self.log(f"   📈 Success Rate: {(self.stats['successful_transfers']/self.stats['total_files']*100):.1f}%")
        
        return self.stats['successful_transfers'] > 0

def main():
    processor = RPAFileProcessor()
    success = processor.process_all_files()
    
    # Output results
    result = {
        'success': success,
        'stats': processor.stats
    }
    
    print(f"RESULT:{json.dumps(result)}")
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())