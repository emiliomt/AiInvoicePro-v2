#!/usr/bin/env python3
"""
Test script to validate the invoice counting fix
This verifies that the RPA system correctly counts unique invoices, not individual files.
"""

import os

def analyze_current_file_structure():
    """Analyze the current file structure and determine correct invoice count"""
    print("🔍 Invoice Counting Validation Test")
    print("=" * 50)
    
    # Collect files from both directories
    pdf_files = []
    xml_files = []
    
    # Check uploads directory
    if os.path.exists('uploads'):
        for file in os.listdir('uploads'):
            if file.endswith('.pdf'):
                pdf_files.append(('uploads', file))
            elif file.endswith('.xml'):
                xml_files.append(('uploads', file))
    
    # Check pdfs subdirectory
    pdf_dir = 'uploads/pdfs'
    if os.path.exists(pdf_dir):
        for file in os.listdir(pdf_dir):
            if file.endswith('.pdf'):
                pdf_files.append(('uploads/pdfs', file))
    
    # Also check the nested pdfs/pdfs directory (these are the REAL paired PDFs)
    nested_pdf_dir = 'uploads/pdfs/pdfs'
    if os.path.exists(nested_pdf_dir):
        for file in os.listdir(nested_pdf_dir):
            if file.endswith('.pdf'):
                pdf_files.append(('uploads/pdfs/pdfs', file))
    
    # Check nested pdfs/pdfs directory (duplicates to exclude)
    nested_pdf_dir = 'uploads/pdfs/pdfs'
    nested_pdfs = []
    if os.path.exists(nested_pdf_dir):
        for file in os.listdir(nested_pdf_dir):
            if file.endswith('.pdf'):
                nested_pdfs.append(file)
    
    print(f"📁 Found {len(pdf_files)} PDF files in main directories")
    print(f"📁 Found {len(xml_files)} XML files")
    print(f"📁 Found {len(nested_pdfs)} duplicate PDFs in nested directory (should be excluded)")
    
    # Extract base names for pairing analysis
    pdf_bases = {}
    xml_bases = {}
    
    for location, filename in pdf_files:            
        base_name = extract_base_name(filename)
        
        # Prefer files from nested directory (more complete filenames)
        if base_name not in pdf_bases or location == 'uploads/pdfs/pdfs':
            pdf_bases[base_name] = (location, filename)
    
    for location, filename in xml_files:
        base_name = extract_base_name(filename)
        xml_bases[base_name] = filename
    
    print(f"\n📊 Analysis Results:")
    print(f"   Unique PDF bases: {len(pdf_bases)}")
    print(f"   Unique XML bases: {len(xml_bases)}")
    
    # Find pairs and standalone files
    all_bases = set(pdf_bases.keys()) | set(xml_bases.keys())
    pairs = []
    standalone_pdfs = []
    standalone_xmls = []
    
    for base in all_bases:
        has_pdf = base in pdf_bases
        has_xml = base in xml_bases
        
        if has_pdf and has_xml:
            pdf_info = pdf_bases[base]
            pdf_location, pdf_filename = pdf_info
            pairs.append((base, pdf_filename, xml_bases[base]))
        elif has_pdf:
            pdf_info = pdf_bases[base] 
            pdf_location, pdf_filename = pdf_info
            standalone_pdfs.append((base, pdf_filename))
        elif has_xml:
            standalone_xmls.append((base, xml_bases[base]))
    
    print(f"\n📋 Invoice Classification:")
    print(f"   XML+PDF pairs: {len(pairs)} (each counts as 1 invoice)")
    print(f"   Standalone PDFs: {len(standalone_pdfs)} (each counts as 1 invoice)")
    print(f"   Standalone XMLs: {len(standalone_xmls)} (each counts as 1 invoice)")
    
    total_invoices = len(pairs) + len(standalone_pdfs) + len(standalone_xmls)
    print(f"\n✅ CORRECT TOTAL INVOICES: {total_invoices}")
    
    print("\n📝 Detailed Breakdown:")
    if pairs:
        print("   Pairs (XML+PDF = 1 invoice each):")
        for i, (base, pdf, xml) in enumerate(pairs, 1):
            print(f"     {i}. {base}: {xml} + {pdf}")
    
    if standalone_pdfs:
        print("   Standalone PDFs (1 invoice each):")
        for i, (base, pdf) in enumerate(standalone_pdfs, 1):
            print(f"     {len(pairs) + i}. {base}: {pdf}")
    
    if standalone_xmls:
        print("   Standalone XMLs (1 invoice each):")
        for i, (base, xml) in enumerate(standalone_xmls, 1):
            print(f"     {len(pairs) + len(standalone_pdfs) + i}. {base}: {xml}")
    
    return total_invoices, pairs, standalone_pdfs, standalone_xmls

def extract_base_name(filename):
    """Extract base name from filename for pairing"""
    # Remove extension
    base = os.path.splitext(filename)[0]
    
    # For XML files like "EXB137180_860029126.xml", base is the full name
    # For PDF files like "EXB137180_860029126_JARDINES_DE_PAZ_SA.pdf", extract matching part
    parts = base.split('_')
    
    # If filename has 3+ parts, it's likely a PDF with company name
    # Take first two parts to match with XML: "EXB137180_860029126"
    if len(parts) >= 2:
        # Check if this matches an XML pattern (document_number + tax_id)
        potential_base = '_'.join(parts[:2])
        return potential_base
    
    return base

def validate_against_database_count():
    """Compare our analysis with database records"""
    try:
        import psycopg2
        import os
        
        database_url = os.environ.get('DATABASE_URL')
        if not database_url:
            print("⚠️ DATABASE_URL not available for validation")
            return
        
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Get the latest import log
        cursor.execute("""
            SELECT total_invoices, processed_invoices, successful_imports
            FROM invoice_importer_logs 
            ORDER BY id DESC 
            LIMIT 1
        """)
        
        result = cursor.fetchone()
        if result:
            db_total, db_processed, db_successful = result
            print(f"\n📊 Database Reports:")
            print(f"   Total invoices: {db_total}")
            print(f"   Processed invoices: {db_processed}")
            print(f"   Successful imports: {db_successful}")
            
            return db_total, db_processed, db_successful
        
        conn.close()
        
    except Exception as e:
        print(f"⚠️ Could not validate against database: {e}")
        return None

if __name__ == "__main__":
    # Analyze file structure
    correct_count, pairs, standalone_pdfs, standalone_xmls = analyze_current_file_structure()
    
    # Validate against database
    db_result = validate_against_database_count()
    
    print("\n" + "=" * 50)
    print("🎯 VALIDATION SUMMARY")
    print("=" * 50)
    
    print(f"✅ Correct invoice count: {correct_count}")
    
    if db_result:
        db_total, db_processed, db_successful = db_result
        if db_processed == correct_count:
            print(f"✅ Database count matches: {db_processed} = {correct_count}")
        else:
            print(f"❌ Database count incorrect: {db_processed} ≠ {correct_count}")
            print(f"   The RPA counting logic still needs fixing!")
    
    print(f"\n💡 Expected RPA behavior:")
    print(f"   - Should process {len(pairs)} XML+PDF pairs (count as {len(pairs)} invoices)")
    print(f"   - Should process {len(standalone_pdfs)} standalone PDFs (count as {len(standalone_pdfs)} invoices)")
    print(f"   - Should process {len(standalone_xmls)} standalone XMLs (count as {len(standalone_xmls)} invoices)")
    print(f"   - TOTAL: {correct_count} processed invoices")
    
    if correct_count == 10:
        print("\n🎉 User was correct: exactly 10 invoices should be processed!")
    else:
        print(f"\n⚠️ Unexpected count: {correct_count} invoices found")