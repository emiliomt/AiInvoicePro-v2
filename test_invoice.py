from process_automation import process_invoice_workflow
import json

def test_invoice_processing():
    """Test the invoice processing workflow with sample data"""
    print("🧾 Testing invoice processing workflow...")

    # For testing purposes, we'll simulate a file path
    # In production, this would be a real uploaded file
    test_invoice_path = "/tmp/test_invoice.pdf"
    test_user_id = "test_user_123"

    try:
        # Process the invoice workflow
        result = process_invoice_workflow(test_invoice_path, test_user_id)

        print("\n📊 Processing Results:")
        print("=" * 50)
        print(f"Processing Complete: {result.get('processing_complete', False)}")
        print(f"Invoice ID: {result.get('invoice_id', 'N/A')}")

        if result.get('error'):
            print(f"❌ Error: {result['error']}")
        else:
            print("\n📋 Stage Results:")
            for stage, stage_result in result.items():
                if stage not in ['invoice_id', 'processing_complete', 'error']:
                    print(f"\n{stage.upper().replace('_', ' ')}:")
                    if isinstance(stage_result, dict):
                        for key, value in stage_result.items():
                            print(f"  {key}: {value}")
                    else:
                        print(f"  {stage_result}")

    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    test_invoice_processing()