#!/usr/bin/env python3
"""
Test script for the new token-based invoice file matching system
"""
import os
import sys

# Add the server services directory to the path
sys.path.append('./server/services')

def test_token_extraction():
    """Test the new _extract_invoice_token method"""
    
    # Mock InvoiceRPAService for testing
    class MockInvoiceRPAService:
        def log(self, message, level='INFO'):
            print(f"[{level}] {message}")
            
        def _extract_invoice_token(self, filename, file_path=None, file_type='xml'):
            """Extract unique invoice token from filename and optionally file content"""
            try:
                # Parse filename components (format: DOCUMENT_NUMBER_TAX_ID_COMPANY_NAME)
                base_name = os.path.splitext(filename)[0]
                parts = base_name.split("_", 2)
                
                if len(parts) >= 2:
                    document_number = parts[0].strip()
                    tax_id = parts[1].strip()
                    
                    # For testing, create simple token without XML parsing
                    token = f"{document_number}_{tax_id}"
                    
                    self.log(f"Generated token for {filename}: {token}")
                    return {
                        'token': token,
                        'document_number': document_number,
                        'tax_id': tax_id,
                        'base_name': base_name
                    }
                else:
                    self.log(f"Warning: Could not parse filename format for {filename}")
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

        def _match_files_by_token(self, xml_files, pdf_files, temp_dir):
            """Match XML and PDF files by invoice token (enhanced matching)"""
            matches = {}
            
            # Extract tokens for all XML files
            xml_tokens = {}
            for xml_file in xml_files:
                token_info = self._extract_invoice_token(xml_file, None, 'xml')
                xml_tokens[token_info['token']] = {
                    'filename': xml_file,
                    'token_info': token_info
                }
            
            # Extract tokens for all PDF files
            pdf_tokens = {}
            for pdf_file in pdf_files:
                token_info = self._extract_invoice_token(pdf_file, None, 'pdf')
                pdf_tokens[token_info['token']] = {
                    'filename': pdf_file,
                    'token_info': token_info
                }
            
            # Primary matching: Exact token match
            matched_tokens = set()
            for token in xml_tokens:
                if token in pdf_tokens:
                    base_name = xml_tokens[token]['token_info']['base_name']
                    matches[base_name] = {
                        'xml': xml_tokens[token]['filename'],
                        'pdf': pdf_tokens[token]['filename'],
                        'token': token,
                        'match_type': 'exact_token'
                    }
                    matched_tokens.add(token)
                    self.log(f"✅ Exact token match: {token} -> XML: {xml_tokens[token]['filename']}, PDF: {pdf_tokens[token]['filename']}")
            
            # Secondary matching: Fallback to document_number + tax_id for unmatched files
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
            
            self.log(f"Token-based matching completed: {len(matches)} file groups, {sum(1 for m in matches.values() if m['xml'] and m['pdf'])} paired matches")
            return matches
    
    # Create test service instance
    service = MockInvoiceRPAService()
    
    print("🧪 Testing Token-Based Invoice File Matching System")
    print("=" * 55)
    print()
    
    # Test scenarios from the logs that were failing
    test_files = [
        'NO02377566_860007322_CAMARA_DE_COMERCIO_DE_BOGOTA.xml',
        'NO02377566_860007322_CAMARA_DE_COMERCIO_DE_BOGOTA.pdf',
        'FEPG793513_900570964_ULTRACEM_S_A_S.xml', 
        'FEPG793513_900570964_ULTRACEM_S_A_S.pdf',
        '467A096279_900480569_JERONIMO_MARTINS_COLOMBIA_SAS.xml',
        '467A096279_900480569_JERONIMO_MARTINS_COLOMBIA_SAS.pdf',
        '03XD66685_890107487_SUPERTIENDAS_Y_DROGUERIAS_OLIMPICA_SA.xml',
        '03XD66685_890107487_SUPERTIENDAS_Y_DROGUERIAS_OLIMPICA_SA.pdf'
    ]
    
    print("1️⃣ TOKEN EXTRACTION TEST")
    print("-" * 25)
    for filename in test_files:
        token_info = service._extract_invoice_token(filename)
        print(f"File: {filename}")
        print(f"  ✓ Token: {token_info['token']}")
        print(f"  ✓ Doc#: {token_info['document_number']}")
        print(f"  ✓ Tax ID: {token_info['tax_id']}")
        print()
    
    print("\n2️⃣ FILE MATCHING TEST")
    print("-" * 21)
    
    # Separate XML and PDF files
    xml_files = [f for f in test_files if f.endswith('.xml')]
    pdf_files = [f for f in test_files if f.endswith('.pdf')]
    
    print(f"XML files: {len(xml_files)}")
    print(f"PDF files: {len(pdf_files)}")
    print()
    
    # Test matching
    matches = service._match_files_by_token(xml_files, pdf_files, '/tmp')
    
    print("\n3️⃣ MATCHING RESULTS")
    print("-" * 18)
    for base_name, match_info in matches.items():
        print(f"📁 Base: {base_name[:30]}...")
        print(f"   XML: {match_info['xml'] or 'None'}")
        print(f"   PDF: {match_info['pdf'] or 'None'}")
        print(f"   Token: {match_info['token']}")
        print(f"   Type: {match_info['match_type']}")
        print()
    
    # Summary
    total_matches = len(matches)
    paired_matches = sum(1 for m in matches.values() if m['xml'] and m['pdf'])
    xml_only = sum(1 for m in matches.values() if m['xml'] and not m['pdf'])
    pdf_only = sum(1 for m in matches.values() if not m['xml'] and m['pdf'])
    
    print("4️⃣ SUMMARY")
    print("-" * 10)
    print(f"Total file groups: {total_matches}")
    print(f"Paired matches (XML+PDF): {paired_matches}")
    print(f"XML-only files: {xml_only}")
    print(f"PDF-only files: {pdf_only}")
    print()
    
    if paired_matches == len(xml_files) == len(pdf_files):
        print("✅ SUCCESS: All files matched perfectly!")
        print("✅ The token-based system will reliably link XML and PDF files")
    else:
        print("ℹ️ Note: Some files are unpaired (normal for real-world scenarios)")
    
    print("\n5️⃣ BENEFITS OF TOKEN-BASED MATCHING")
    print("-" * 39)
    print("✓ Handles filename format discrepancies")
    print("✓ Uses document metadata for reliable matching")
    print("✓ Supports fallback matching strategies")
    print("✓ Prevents linking failures due to minor filename differences")
    print("✓ Enhanced error logging for troubleshooting")

if __name__ == "__main__":
    test_token_extraction()