#!/usr/bin/env python3
"""
Test the enhanced XML/PDF file pairing logic
"""
import re

class FilePairingTester:
    def _extract_invoice_token_from_filename(self, filename: str) -> str:
        """Enhanced invoice token extraction for better XML/PDF matching"""
        try:
            # Extract the base filename without extension
            base = filename.split('.')[0]
            
            # Handle different naming patterns
            parts = base.split('_')
            
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
            print(f"Error extracting token from filename '{filename}': {e}")
            return filename.split('.')[0] if '.' in filename else filename

    def _tokens_match(self, xml_token: str, pdf_token: str, xml_base: str, pdf_base: str) -> bool:
        """Enhanced token matching with multiple strategies"""
        try:
            # Strategy 1: Exact token match
            if xml_token == pdf_token:
                print(f"    ✅ Exact match: {xml_token}")
                return True
            
            # Strategy 2: Check if one token is contained in the other
            if xml_token in pdf_token or pdf_token in xml_token:
                print(f"    ✅ Containment match: '{xml_token}' <-> '{pdf_token}'")
                return True
            
            # Strategy 3: Check for document number match (first part)
            xml_parts = xml_token.split('_')
            pdf_parts = pdf_token.split('_')
            
            if xml_parts[0] == pdf_parts[0] and xml_parts[0]:
                print(f"    ✅ Document number match: {xml_parts[0]}")
                return True
            
            # Strategy 4: Handle cases where PDF has extra company name
            if xml_base in pdf_base or pdf_base in xml_base:
                print(f"    ✅ Base filename match: '{xml_base}' <-> '{pdf_base}'")
                return True
            
            # Strategy 5: Check for common prefixes of significant length
            min_length = min(len(xml_token), len(pdf_token))
            if min_length >= 8:  # Only for reasonably long tokens
                common_length = 0
                for i in range(min_length):
                    if xml_token[i] == pdf_token[i]:
                        common_length += 1
                    else:
                        break
                
                # If they share at least 70% of characters from start
                if common_length >= min_length * 0.7:
                    print(f"    ✅ Prefix match: {common_length}/{min_length} chars ({common_length/min_length*100:.1f}%)")
                    return True
            
            print(f"    ❌ No match: '{xml_token}' <-> '{pdf_token}'")
            return False
            
        except Exception as e:
            print(f"    ❌ Error in token matching: {e}")
            return False

    def test_pairing_logic(self):
        """Test the pairing logic with real filename patterns"""
        print("🔍 TESTING ENHANCED XML/PDF PAIRING LOGIC")
        print("=" * 60)
        
        # Test cases based on actual files observed
        test_cases = [
            # Exact matches (should work)
            {
                'xml': 'ad086003979402725232120250805164559816.xml',
                'pdf': 'ad086003979402725232120250805164559816.pdf',
                'expected': True
            },
            {
                'xml': 'CTG12018_900525717_ALMACENES_LCC_SAS.xml',
                'pdf': 'CTG12018_900525717_ALMACENES_LCC_SAS.pdf',
                'expected': True
            },
            
            # PDF with extra company info (current issue)
            {
                'xml': 'CTG12018_900525717.xml',  # Hypothetical simpler XML name
                'pdf': 'CTG12018_900525717_ALMACENES_LCC_SAS.pdf',
                'expected': True
            },
            {
                'xml': 'E03115922_860039794.xml',
                'pdf': 'E03115922_860039794_CALYPSO_BARRANQUILLA_SAS.pdf',
                'expected': True
            },
            
            # Simple vs complex patterns
            {
                'xml': 'FBOG16666.xml',
                'pdf': 'FBOG16666_830505144_MEMORY_CORP_SAS.pdf',
                'expected': True  # Should match by document number
            },
            
            # Different patterns that shouldn't match
            {
                'xml': 'CTG12018_900525717.xml',
                'pdf': 'E03115922_860039794_CALYPSO.pdf',
                'expected': False
            },
            
            # Complex generated names
            {
                'xml': 'z00087298800002500026782.xml',
                'pdf': 'z00087298800002500026782.pdf',
                'expected': True
            }
        ]
        
        total_tests = len(test_cases)
        passed_tests = 0
        
        for i, case in enumerate(test_cases, 1):
            print(f"\n📋 Test {i}/{total_tests}:")
            print(f"   XML: {case['xml']}")
            print(f"   PDF: {case['pdf']}")
            
            xml_base = case['xml'].split('.')[0]
            pdf_base = case['pdf'].split('.')[0]
            
            xml_token = self._extract_invoice_token_from_filename(case['xml'])
            pdf_token = self._extract_invoice_token_from_filename(case['pdf'])
            
            print(f"   XML token: {xml_token}")
            print(f"   PDF token: {pdf_token}")
            
            result = self._tokens_match(xml_token, pdf_token, xml_base, pdf_base)
            expected = case['expected']
            
            if result == expected:
                print(f"   🎯 PASS: Expected {expected}, got {result}")
                passed_tests += 1
            else:
                print(f"   ❌ FAIL: Expected {expected}, got {result}")
        
        print(f"\n📊 SUMMARY: {passed_tests}/{total_tests} tests passed ({passed_tests/total_tests*100:.1f}%)")
        
        if passed_tests == total_tests:
            print("🎉 All tests passed! Enhanced pairing logic should work correctly.")
        else:
            print("⚠️  Some tests failed. Logic may need further refinement.")

def main():
    tester = FilePairingTester()
    tester.test_pairing_logic()

if __name__ == "__main__":
    main()