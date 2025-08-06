#!/usr/bin/env python3
"""
Test the enhanced pairing logic with actual files from the system
"""
import os
import sys

# Add current directory to Python path for imports
sys.path.append('/home/runner/AI-Powered-Invoice-Procurement-Platform')

class RealFilePairingTest:
    def __init__(self):
        self.xml_dir = '/tmp/xml_invoices'
        self.pdf_dir = '/tmp/invoice_downloads/pdfs'
    
    def _extract_invoice_token_from_filename(self, filename: str) -> str:
        """Enhanced invoice token extraction for better XML/PDF matching"""
        try:
            base = filename.split('.')[0]
            parts = base.split('_')
            
            if len(parts) == 1:
                return base
            elif len(parts) >= 2:
                doc_num = parts[0]
                tax_id = parts[1]
                if doc_num and tax_id:
                    return f"{doc_num}_{tax_id}"
            return base
        except Exception as e:
            print(f"Error extracting token from filename '{filename}': {e}")
            return filename.split('.')[0] if '.' in filename else filename

    def _tokens_match(self, xml_token: str, pdf_token: str, xml_base: str, pdf_base: str) -> bool:
        """Enhanced token matching with multiple strategies"""
        try:
            if xml_token == pdf_token:
                return True
            if xml_token in pdf_token or pdf_token in xml_token:
                return True
            
            xml_parts = xml_token.split('_')
            pdf_parts = pdf_token.split('_')
            if xml_parts[0] == pdf_parts[0] and xml_parts[0]:
                return True
            
            if xml_base in pdf_base or pdf_base in xml_base:
                return True
            
            min_length = min(len(xml_token), len(pdf_token))
            if min_length >= 8:
                common_length = 0
                for i in range(min_length):
                    if xml_token[i] == pdf_token[i]:
                        common_length += 1
                    else:
                        break
                if common_length >= min_length * 0.7:
                    return True
            
            return False
        except Exception as e:
            print(f"Error in token matching: {e}")
            return False

    def test_real_files(self):
        """Test with actual XML and PDF files from the system"""
        print("🔍 TESTING WITH REAL FILES FROM SYSTEM")
        print("=" * 60)
        
        # Get actual files
        xml_files = {}
        pdf_files = {}
        
        if os.path.exists(self.xml_dir):
            for filename in os.listdir(self.xml_dir):
                if filename.lower().endswith(".xml"):
                    base_name = os.path.splitext(filename)[0]
                    xml_files[base_name] = filename
        
        if os.path.exists(self.pdf_dir):
            for filename in os.listdir(self.pdf_dir):
                if filename.lower().endswith(".pdf"):
                    base_name = os.path.splitext(filename)[0]
                    pdf_files[base_name] = filename
        
        print(f"📁 Found {len(xml_files)} XML files and {len(pdf_files)} PDF files")
        print()
        
        # Test pairing
        matched_pairs = {}
        unmatched_xmls = set(xml_files.keys())
        unmatched_pdfs = set(pdf_files.keys())
        
        # First pass: exact base name matching
        print("🔍 Phase 1: Exact base name matching")
        for xml_base in list(unmatched_xmls):
            if xml_base in unmatched_pdfs:
                matched_pairs[xml_base] = {
                    'xml_file': xml_files[xml_base],
                    'pdf_file': pdf_files[xml_base],
                    'match_type': 'exact'
                }
                unmatched_xmls.remove(xml_base)
                unmatched_pdfs.remove(xml_base)
                print(f"   ✅ Exact: {xml_files[xml_base]} <-> {pdf_files[xml_base]}")
        
        # Second pass: enhanced token matching
        print(f"\n🔍 Phase 2: Enhanced token-based matching")
        for xml_base in list(unmatched_xmls):
            xml_token = self._extract_invoice_token_from_filename(xml_base)
            if xml_token:
                for pdf_base in list(unmatched_pdfs):
                    pdf_token = self._extract_invoice_token_from_filename(pdf_base)
                    
                    if pdf_token and self._tokens_match(xml_token, pdf_token, xml_base, pdf_base):
                        matched_pairs[xml_base] = {
                            'xml_file': xml_files[xml_base],
                            'pdf_file': pdf_files[pdf_base],
                            'match_type': 'enhanced_token'
                        }
                        unmatched_xmls.remove(xml_base)
                        unmatched_pdfs.remove(pdf_base)
                        print(f"   ✅ Token: {xml_files[xml_base]} <-> {pdf_files[pdf_base]}")
                        print(f"      XML token: {xml_token}")
                        print(f"      PDF token: {pdf_token}")
                        break
        
        # Results summary
        print(f"\n📊 PAIRING RESULTS:")
        print(f"   Matched pairs: {len(matched_pairs)}")
        print(f"   Unmatched XMLs: {len(unmatched_xmls)}")
        print(f"   Unmatched PDFs: {len(unmatched_pdfs)}")
        
        # Show match details
        if matched_pairs:
            print(f"\n✅ SUCCESSFUL MATCHES:")
            for i, (base_name, pair_info) in enumerate(matched_pairs.items(), 1):
                print(f"   {i}. {pair_info['xml_file']} <-> {pair_info['pdf_file']} ({pair_info['match_type']})")
        
        # Show unmatched files
        if unmatched_xmls:
            print(f"\n❓ UNMATCHED XML FILES:")
            for xml_base in unmatched_xmls:
                print(f"   - {xml_files[xml_base]}")
        
        if unmatched_pdfs:
            print(f"\n❓ UNMATCHED PDF FILES:")
            for pdf_base in list(unmatched_pdfs)[:10]:  # Show first 10
                print(f"   - {pdf_files[pdf_base]}")
            if len(unmatched_pdfs) > 10:
                print(f"   ... and {len(unmatched_pdfs) - 10} more")
        
        # Calculate improvement
        total_files = len(xml_files) + len(pdf_files)
        paired_files = len(matched_pairs) * 2  # Each pair contains 2 files
        pairing_rate = (paired_files / total_files * 100) if total_files > 0 else 0
        
        print(f"\n🎯 IMPROVEMENT ANALYSIS:")
        print(f"   Before fix: Low pairing rate, many PDFs unmatched")
        print(f"   After fix: {pairing_rate:.1f}% of files properly paired")
        print(f"   Unique invoices identified: {len(matched_pairs) + len(unmatched_xmls) + len(unmatched_pdfs)}")
        
        return len(matched_pairs), len(unmatched_xmls), len(unmatched_pdfs)

def main():
    tester = RealFilePairingTest()
    tester.test_real_files()

if __name__ == "__main__":
    main()