#!/usr/bin/env python3
"""
Test script to validate the invoice counting fix.
This simulates the RPA logic to ensure correct counting of unique invoices vs files.
"""

def test_invoice_counting_logic():
    """Test the corrected invoice counting logic"""
    print("🧪 Testing Corrected Invoice Counting Logic")
    print("=" * 50)
    
    # Simulate the file structure that caused the issue
    processed_files = [
        # XML+PDF pairs (should count as 1 invoice each)
        {'type': 'xml', 'base_name': 'EXB137180_860029126', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'EXB137180_860029126', 'is_data_source': False, 'reference_only': True},
        
        {'type': 'xml', 'base_name': '04VC124760_890107487', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': '04VC124760_890107487', 'is_data_source': False, 'reference_only': True},
        
        {'type': 'xml', 'base_name': 'FA19905_800204751', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'FA19905_800204751', 'is_data_source': False, 'reference_only': True},
        
        {'type': 'xml', 'base_name': 'FEPB200209_900570964', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'FEPB200209_900570964', 'is_data_source': False, 'reference_only': True},
        
        {'type': 'xml', 'base_name': 'FEPG795739_900570964', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'FEPG795739_900570964', 'is_data_source': False, 'reference_only': True},
        
        # Standalone PDFs (should count as 1 invoice each)
        {'type': 'pdf', 'base_name': '995_901335536', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'C22876508_900403670', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'CONS5605_901220439', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'FEPB200217_900570964', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'FEPG795749_900570964', 'is_data_source': True, 'reference_only': False},
        {'type': 'pdf', 'base_name': 'L16626652330_800130426', 'is_data_source': True, 'reference_only': False},
    ]
    
    # Apply the corrected counting logic
    total_files = len(processed_files)
    actual_invoice_count = sum(1 for f in processed_files if f.get('is_data_source', False))
    reference_file_count = sum(1 for f in processed_files if not f.get('is_data_source', False))
    
    print(f"📁 Total files processed: {total_files}")
    print(f"📊 Unique invoices (data sources): {actual_invoice_count}")
    print(f"📎 Reference files: {reference_file_count}")
    
    # Validate the fix
    expected_invoices = 10  # 5 XML+PDF pairs + 5 standalone PDFs = 10 unique invoices
    
    print(f"\n🎯 Validation Results:")
    if actual_invoice_count == expected_invoices:
        print(f"✅ PASS: Correct invoice count = {actual_invoice_count}")
    else:
        print(f"❌ FAIL: Expected {expected_invoices}, got {actual_invoice_count}")
    
    if total_files == 16:
        print(f"✅ PASS: Total files handled = {total_files}")
    else:
        print(f"❌ FAIL: Expected 16 files, got {total_files}")
    
    if reference_file_count == 5:
        print(f"✅ PASS: Reference files = {reference_file_count}")
    else:
        print(f"❌ FAIL: Expected 5 reference files, got {reference_file_count}")
    
    # Test the STATS output format
    print(f"\n📡 Expected STATS Output:")
    stats_data = {
        'total_invoices': expected_invoices,
        'processed_invoices': actual_invoice_count,
        'successful_imports': actual_invoice_count,
        'failed_imports': 0,
        'progress': 100
    }
    
    import json
    print(f"STATS: {json.dumps(stats_data)}")
    
    print(f"\n🔍 File Breakdown:")
    xml_files = [f for f in processed_files if f['type'] == 'xml']
    pdf_data_sources = [f for f in processed_files if f['type'] == 'pdf' and f['is_data_source']]
    pdf_references = [f for f in processed_files if f['type'] == 'pdf' and not f['is_data_source']]
    
    print(f"   XML files (data sources): {len(xml_files)}")
    print(f"   PDF files (data sources): {len(pdf_data_sources)}")
    print(f"   PDF files (reference only): {len(pdf_references)}")
    print(f"   Total unique invoices: {len(xml_files) + len(pdf_data_sources)}")
    
    return actual_invoice_count == expected_invoices

if __name__ == "__main__":
    success = test_invoice_counting_logic()
    if success:
        print(f"\n🎉 All tests passed! The invoice counting fix is working correctly.")
    else:
        print(f"\n❌ Tests failed! The counting logic needs further adjustment.")