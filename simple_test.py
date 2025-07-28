import os
import json
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# Simple models without complex validation
class SimpleInvoiceData(BaseModel):
    vendor_name: str
    invoice_number: str  
    total_amount: float
    currency: str = "USD"
    items: List[Dict[str, Any]] = []

def test_simple_extraction():
    """Test a simple AI extraction without complex workflow"""
    print("🧪 Testing Simple AI Extraction")
    print("=" * 40)

    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Test with simple prompt (no structured output)
        print("📝 Testing basic chat completion...")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are an invoice processing assistant. Extract key information from invoice text."
                },
                {
                    "role": "user", 
                    "content": "Extract vendor name, invoice number, and total amount from this sample invoice: ACME Construction Services, Invoice #INV-2024-001, Total: $1,250.00"
                }
            ],
            max_tokens=150
        )

        print("✅ Basic chat completion successful")
        print(f"Response: {response.choices[0].message.content}")

        # Test with structured output (simplified)
        print("\n🏗️ Testing structured extraction...")
        structured_response = client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "Extract invoice data and return as structured JSON."
                },
                {
                    "role": "user",
                    "content": "Extract data from: ACME Construction Services, Invoice #INV-2024-001, Total: $1,250.00, Items: 2x Concrete blocks ($500), 1x Labor hours ($750)"
                }
            ],
            response_format=SimpleInvoiceData
        )

        result = structured_response.choices[0].message.parsed
        print("✅ Structured extraction successful")
        print(f"Vendor: {result.vendor_name}")
        print(f"Invoice #: {result.invoice_number}")
        print(f"Amount: ${result.total_amount}")
        print(f"Items: {len(result.items)} items")

        return True

    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def test_workflow_simulation():
    """Simulate the full workflow with mock data"""
    print("\n🔄 Testing Workflow Simulation")
    print("=" * 40)

    # Mock workflow steps
    steps = [
        "ERP Import",
        "OCR Processing", 
        "AI Extraction",
        "Validation",
        "Project Matching",
        "PO Matching",
        "Classification",
        "Approval Workflow",
        "Final Validation",
        "Petty Cash Check"
    ]

    results = {}

    for i, step in enumerate(steps, 1):
        print(f"Step {i}: {step}...")

        # Simulate processing time
        import time
        time.sleep(0.2)

        # Mock results
        if step == "AI Extraction":
            results[step] = {
                "vendor_name": "ACME Construction",
                "invoice_number": "INV-2024-001", 
                "total_amount": 1250.00,
                "success": True
            }
        elif step == "Validation":
            results[step] = {
                "is_valid": True,
                "violations": [],
                "score": 0.95
            }
        elif step == "Project Matching":
            results[step] = {
                "best_match": "Project Alpha",
                "confidence": 0.87,
                "matches_found": 3
            }
        else:
            results[step] = {
                "status": "completed",
                "success": True
            }

        print(f"   ✅ {step} completed")

    print(f"\n🎉 Workflow simulation completed!")
    print(f"📊 {len([r for r in results.values() if r.get('success', True)])} of {len(steps)} steps successful")

    return results

def main():
    """Main test function"""
    print("🚀 ANZU DYNAMICS - SIMPLE INVOICE TEST")
    print("=" * 50)

    # Check environment
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not found")
        return

    print("✅ Environment setup OK")

    # Run tests
    ai_test_passed = test_simple_extraction()
    workflow_results = test_workflow_simulation()

    # Summary
    print(f"\n📋 TEST SUMMARY")
    print("=" * 30)
    print(f"AI Extraction Test: {'✅ PASSED' if ai_test_passed else '❌ FAILED'}")
    print(f"Workflow Simulation: ✅ COMPLETED")
    print(f"Total Steps: {len(workflow_results)}")

    if ai_test_passed:
        print(f"\n🎯 Ready to run full automation!")
        print(f"Next step: python invoice_automation.py")
    else:
        print(f"\n🔧 Fix AI extraction issues first")

if __name__ == "__main__":
    main()