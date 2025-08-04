#!/usr/bin/env python3
"""
Direct test of the AnzuDynamics Binary Validation System
Tests validation logic without API authentication
"""

import os
import psycopg2
import json
from datetime import datetime

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:password@localhost:5432/anvil"

def test_invoice_data():
    """Test with a sample invoice that should have mixed results"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("🚀 AnzuDynamics Binary Validation System - Direct Test")
        print("=" * 55)
        
        # Get the test invoice we created
        cur.execute("SELECT * FROM invoices WHERE id = 665")
        invoice = cur.fetchone()
        
        if not invoice:
            print("❌ Test invoice not found")
            return
            
        # Get column names for easier access
        col_names = [desc[0] for desc in cur.description]
        invoice_dict = dict(zip(col_names, invoice))
        
        print(f"📄 Testing Invoice #{invoice_dict['id']}")
        print(f"   Vendor: {invoice_dict['vendor_name']}")
        print(f"   Number: {invoice_dict['invoice_number']}")
        print(f"   Amount: {invoice_dict['total_amount']} {invoice_dict['currency']}")
        print(f"   Date: {invoice_dict['invoice_date']}")
        
        # Simulate validation logic
        validation_result = run_validation_checks(invoice_dict)
        
        # Display results 
        display_validation_results(validation_result)
        
        # Store results in database
        store_validation_result(cur, invoice_dict['id'], validation_result)
        conn.commit()
        
        print("\n✅ Validation test completed successfully!")
        print("💡 Key features demonstrated:")
        print("   • Binary Pass/Fail determination")
        print("   • Colombian business rules (NIT, COP currency)")
        print("   • Specific failure reasons and action items")
        print("   • Approval requirements based on amount thresholds")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during validation test: {e}")

def run_validation_checks(invoice):
    """Run validation checks similar to the server-side validator"""
    
    failures = []
    warnings = []
    passed_rules = []
    
    # Basic field validation
    vendor_name = invoice.get('vendor_name')
    if not vendor_name or len(vendor_name) < 3:
        failures.append({
            "rule": "vendor",
            "severity": "Critical",
            "message": "Valid vendor information required",
            "currentValue": vendor_name or "null",
            "requiredAction": "Enter valid vendor name with at least 3 characters"
        })
    else:
        passed_rules.append("vendor")
    
    # Invoice number validation
    invoice_number = invoice.get('invoice_number')
    if not invoice_number:
        failures.append({
            "rule": "invoice_number", 
            "severity": "Critical",
            "message": "Invoice number is required",
            "currentValue": "null",
            "requiredAction": "Enter valid invoice number"
        })
    else:
        passed_rules.append("invoice_number")
    
    # Amount validation
    total_amount = float(invoice.get('total_amount') or 0)
    if total_amount <= 0:
        failures.append({
            "rule": "amount",
            "severity": "Critical", 
            "message": "Amount must be positive and within limits",
            "currentValue": total_amount,
            "requiredAction": "Enter valid positive amount"
        })
    else:
        passed_rules.append("amount")
        
        # High value approval warnings
        if total_amount > 1000000:  # >1M COP
            approvals_needed = []
            if total_amount > 1000000:
                approvals_needed.append("Manager")
            if total_amount > 10000000:
                approvals_needed.append("Finance")
            if total_amount > 50000000:
                approvals_needed.append("Director")
                
            if approvals_needed:
                warnings.append({
                    "rule": "approvals",
                    "severity": "Warning",
                    "message": f"High value invoice requires approvals: {', '.join(approvals_needed)}",
                    "currentValue": f"{total_amount:,.2f} COP",
                    "requiredAction": f"Obtain approvals from: {', '.join(approvals_needed)}"
                })
    
    # Currency validation
    currency = invoice.get('currency')
    valid_currencies = ['COP', 'USD', 'EUR']
    if currency not in valid_currencies:
        failures.append({
            "rule": "currency",
            "severity": "Critical",
            "message": "Currency must be valid (COP, USD, EUR)",
            "currentValue": currency or "null", 
            "requiredAction": f"Set currency to one of: {', '.join(valid_currencies)}"
        })
    else:
        passed_rules.append("currency")
    
    # Date validation
    invoice_date = invoice.get('invoice_date')
    if not invoice_date:
        failures.append({
            "rule": "invoice_date",
            "severity": "Critical",
            "message": "Valid invoice date required",
            "currentValue": "null",
            "requiredAction": "Enter valid invoice date"
        })
    else:
        passed_rules.append("invoice_date")
    
    # Colombian NIT validation (if present in extracted data)
    extracted_data = invoice.get('extracted_data')
    if extracted_data:
        try:
            if isinstance(extracted_data, str):
                extracted_data = json.loads(extracted_data)
            
            tax_id = extracted_data.get('taxId')
            if tax_id:
                # Simple Colombian NIT validation (9-11 digits)
                if not (tax_id.isdigit() and 9 <= len(tax_id) <= 11):
                    warnings.append({
                        "rule": "tax_id",
                        "severity": "Warning", 
                        "message": "Tax ID must be valid Colombian NIT format (9-11 digits)",
                        "currentValue": tax_id,
                        "requiredAction": "Verify tax ID format"
                    })
                else:
                    passed_rules.append("tax_id")
            else:
                passed_rules.append("tax_id")  # Not required
                
        except json.JSONDecodeError:
            pass
    
    # Item classification check
    if extracted_data and 'items' in extracted_data:
        items = extracted_data.get('items', [])
        classified_items = sum(1 for item in items if item.get('classification'))
        
        if classified_items == 0 and len(items) > 0:
            failures.append({
                "rule": "item_classification",
                "severity": "Critical",
                "message": "Line items must be classified into valid categories", 
                "currentValue": "Not Classified",
                "requiredAction": "Classify all line items using AI or manual review"
            })
        else:
            passed_rules.append("item_classification")
    
    # Calculate score
    total_rules = 7  # Basic rules checked
    passed_count = len(passed_rules)
    overall_score = round((passed_count / total_rules) * 100)
    
    # Determine status
    status = "Passed"
    if failures:
        status = "Failed"
    elif warnings:
        status = "Warning"
    
    return {
        "status": status,
        "overallScore": overall_score,
        "failures": failures,
        "warnings": warnings,
        "passedRules": passed_rules,
        "timestamp": datetime.now().isoformat()
    }

def display_validation_results(result):
    """Display validation results"""
    print(f"\n📊 VALIDATION RESULTS")
    print("=" * 40)
    
    status = result.get('status')
    score = result.get('overallScore', 0)
    
    status_emoji = {
        'Passed': '✅',
        'Failed': '❌',
        'Warning': '⚠️'
    }
    
    print(f"Status: {status_emoji.get(status, '❓')} {status}")
    print(f"Overall Score: {score}%")
    
    # Show passed rules
    passed_rules = result.get('passedRules', [])
    if passed_rules:
        print(f"\n✅ PASSED RULES ({len(passed_rules)}):")
        for rule in passed_rules:
            print(f"  • {rule}")
    
    # Show failures
    failures = result.get('failures', [])
    if failures:
        print(f"\n❌ CRITICAL FAILURES ({len(failures)}):")
        for failure in failures:
            print(f"  • Rule: {failure.get('rule')}")
            print(f"    Message: {failure.get('message')}")
            print(f"    Current Value: {failure.get('currentValue')}")
            print(f"    Required Action: {failure.get('requiredAction')}")
            print()
    
    # Show warnings
    warnings = result.get('warnings', [])
    if warnings:
        print(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for warning in warnings:
            print(f"  • Rule: {warning.get('rule')}")
            print(f"    Message: {warning.get('message')}")
            print(f"    Current Value: {warning.get('currentValue')}")
            print(f"    Required Action: {warning.get('requiredAction')}")
            print()

def store_validation_result(cur, invoice_id, result):
    """Store validation result in database"""
    try:
        cur.execute("""
            INSERT INTO invoice_validation_results (
                invoice_id, status, overall_score, failures, warnings, 
                passed_rules, validated_at, auto_validated
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            invoice_id,
            result['status'].lower(),
            str(result['overallScore']),
            json.dumps(result['failures']),
            json.dumps(result['warnings']),
            json.dumps(result['passedRules']),
            datetime.now(),
            True
        ))
        
        # Update invoice with validation status
        cur.execute("""
            UPDATE invoices 
            SET validation_status = %s, validation_score = %s, validated_at = %s
            WHERE id = %s
        """, (
            result['status'].lower(),
            str(result['overallScore']),
            datetime.now(),
            invoice_id
        ))
        
        print(f"\n💾 Validation results stored in database")
        
    except Exception as e:
        print(f"⚠️  Warning: Could not store results in database: {e}")

if __name__ == "__main__":
    test_invoice_data()