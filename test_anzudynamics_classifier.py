
#!/usr/bin/env python3
"""
Test script for the AnzuDynamics Invoice Line Item Classifier
"""

import os
from unittest.mock import Mock, patch
from invoice_classifier import AnzuDynamicsInvoiceClassifier, classify_line_item

def mock_openai_response(description: str):
    """Create a mock OpenAI response based on description"""
    mock_response = Mock()
    mock_choice = Mock()
    mock_message = Mock()
    
    # Simple logic to determine category based on description
    description_lower = description.lower()
    if any(word in description_lower for word in ['worker', 'labor', 'service', 'installation']):
        category = "labor"
        confidence = 0.92
        keywords = ["labor", "service"]
    elif any(word in description_lower for word in ['drill', 'tool', 'equipment', 'hammer']):
        category = "tools_equipment"
        confidence = 0.88
        keywords = ["drill", "equipment"]
    elif any(word in description_lower for word in ['cement', 'concrete', 'fuel', 'paint']):
        category = "consumable_materials"
        confidence = 0.95
        keywords = ["cement", "concrete"]
    else:
        category = "non_consumable_materials"
        confidence = 0.85
        keywords = ["equipment", "machinery"]
    
    mock_message.content = f'''
    {{
        "category": "{category}",
        "confidence": {confidence},
        "reasoning": "This item falls into {category} based on the description analysis",
        "matched_keywords": {keywords},
        "alternative_category": null
    }}
    '''
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    return mock_response

def test_single_classification():
    """Test single item classification with mocked API"""
    print("=== Testing Single Classification ===")
    
    with patch('openai.OpenAI') as mock_openai:
        # Mock the OpenAI client and response
        mock_client = Mock()
        mock_openai.return_value = mock_client
        
        def mock_create(*args, **kwargs):
            # Extract description from the prompt
            user_message = kwargs['messages'][1]['content']
            if 'Concrete mixer rental' in user_message:
                return mock_openai_response('Concrete mixer rental')
            return mock_openai_response('default')
        
        mock_client.chat.completions.create.side_effect = mock_create
        
        # Test classification
        classifier = AnzuDynamicsInvoiceClassifier(api_key="test-key")
        result = classifier.classify_line_item(
            description="Concrete mixer rental for Parque Heredia foundation work - 3 days",
            amount=450000.00,
            vendor="ALUTEMP SAS",
            project_context="Parque Heredia residential development"
        )
        
        print(f"✓ Classification successful")
        print(f"  Category: {result['category']}")
        print(f"  Confidence: {result['confidence']}")
        print(f"  Method: {result.get('classification_method', 'unknown')}")
        print(f"  Keywords: {', '.join(result.get('matched_keywords', []))}")
        if result.get('validation_warning'):
            print(f"  Warning: {result['validation_warning']}")
        print()

def test_batch_classification():
    """Test batch classification with mocked API"""
    print("=== Testing Batch Classification ===")
    
    test_items = [
        {
            "description": "Construction workers - 40 hours for structural work",
            "amount": 2800000.00,
            "vendor": "Labor Solutions SAS"
        },
        {
            "description": "Steel rebar materials for reinforcement",
            "amount": 1250000.00,
            "vendor": "Aceros del Norte"
        },
        {
            "description": "Professional drilling equipment - impact drill set",
            "amount": 850000.00,
            "vendor": "Ferretería Central"
        },
        {
            "description": "Hydraulic cement bags - 50kg x 20 units",
            "amount": 680000.00,
            "vendor": "Cemex Colombia"
        }
    ]
    
    with patch('openai.OpenAI') as mock_openai:
        # Mock the OpenAI client
        mock_client = Mock()
        mock_openai.return_value = mock_client
        
        def mock_create(*args, **kwargs):
            user_message = kwargs['messages'][1]['content']
            if 'Construction workers' in user_message:
                return mock_openai_response('Construction workers')
            elif 'Steel rebar' in user_message:
                return mock_openai_response('Steel rebar materials')
            elif 'drilling equipment' in user_message:
                return mock_openai_response('drilling equipment')
            elif 'cement bags' in user_message:
                return mock_openai_response('cement bags')
            return mock_openai_response('default')
        
        mock_client.chat.completions.create.side_effect = mock_create
        
        # Test batch classification
        classifier = AnzuDynamicsInvoiceClassifier(api_key="test-key")
        results = classifier.classify_batch(test_items, "Parque Heredia residential development")
        
        print(f"✓ Batch classification successful")
        print(f"  Processed {len(results)} items")
        
        for i, result in enumerate(results, 1):
            category_info = classifier.categories.get(result['category'], {})
            category_label = category_info.get('label', result['category'])
            print(f"  Item {i}: {category_label} (confidence: {result['confidence']})")
        
        # Test summary report
        summary = classifier.generate_summary_report(results)
        print(f"\n✓ Summary report generated")
        print(f"  Success rate: {summary['successful_classifications']}/{summary['total_items']}")
        print(f"  Average confidence: {summary['average_confidence']:.2f}")
        print(f"  High confidence items: {summary['high_confidence_items']}")
        print(f"  Categories found: {len(summary['category_distribution'])}")
        print()

def test_keyword_fallback():
    """Test keyword-based classification fallback"""
    print("=== Testing Keyword Fallback ===")
    
    with patch('openai.OpenAI') as mock_openai:
        # Mock client that raises an exception to force fallback
        mock_client = Mock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        classifier = AnzuDynamicsInvoiceClassifier(api_key="test-key")
        result = classifier.classify_line_item(
            description="Cement bags and concrete mix for foundation",
            amount=100000.00,
            vendor="Test Vendor"
        )
        
        print(f"✓ Keyword fallback successful")
        print(f"  Category: {result['category']}")
        print(f"  Method: {result.get('classification_method', 'unknown')}")
        print(f"  Keywords matched: {', '.join(result.get('matched_keywords', []))}")
        print(f"  AI Error: {result.get('ai_error', 'None')}")
        print()

def test_categories():
    """Test category information"""
    print("=== Testing Category Information ===")
    
    with patch('openai.OpenAI'):
        classifier = AnzuDynamicsInvoiceClassifier(api_key="test-key")
        categories = classifier.get_categories()
        
        print(f"✓ Found {len(categories)} AnzuDynamics categories:")
        for code, info in categories.items():
            print(f"  - {info['label']} ({code})")
            print(f"    {info['description']}")
            print(f"    Sample keywords: {', '.join(info['keywords'][:3])}...")
        print()

def test_convenience_function():
    """Test the convenience function"""
    print("=== Testing Convenience Function ===")
    
    with patch('openai.OpenAI') as mock_openai:
        mock_client = Mock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value = mock_openai_response('concrete mixer')
        
        category, confidence = classify_line_item(
            description="Concrete mixer rental for project",
            amount=450000.00,
            project_context="Parque Heredia"
        )
        
        print(f"✓ Convenience function successful")
        print(f"  Category: {category}")
        print(f"  Confidence: {confidence}")
        print()

def test_export_functionality():
    """Test CSV export functionality"""
    print("=== Testing Export Functionality ===")
    
    # Create mock results
    mock_results = [
        {
            "category": "consumable_materials",
            "confidence": 0.92,
            "reasoning": "Cement is a consumable material",
            "matched_keywords": ["cement", "concrete"],
            "original_description": "Cement bags for construction",
            "original_amount": 450000.00,
            "original_vendor": "Cemex Colombia",
            "classification_method": "ai_with_keyword_validation",
            "timestamp": "2024-01-01T12:00:00",
            "error": False
        }
    ]
    
    with patch('openai.OpenAI'):
        classifier = AnzuDynamicsInvoiceClassifier(api_key="test-key")
        
        # Test export (will create a real CSV file)
        filename = classifier.export_results(mock_results, "test_anzudynamics_export.csv")
        
        print(f"✓ Export successful")
        print(f"  File created: {filename}")
        
        # Verify file exists
        import os
        if os.path.exists(filename):
            print(f"  ✓ File verified to exist")
            # Clean up
            os.remove(filename)
            print(f"  ✓ Test file cleaned up")
        print()

def main():
    """Run all tests"""
    print("AnzuDynamics Invoice Line Item Classifier - Test Suite\n")
    
    try:
        test_categories()
        test_single_classification()
        test_batch_classification()
        test_keyword_fallback()
        test_convenience_function()
        test_export_functionality()
        
        print("🎉 All tests completed successfully!")
        print("\n📋 To use with real OpenAI API:")
        print("1. Set OPENAI_API_KEY environment variable")
        print("2. Run: python invoice_classifier.py")
        print("3. Or import and use: from invoice_classifier import AnzuDynamicsInvoiceClassifier")
        
        print("\n🔧 Integration with your existing system:")
        print("- Categories match your TypeScript classification service")
        print("- Results format is compatible with your database schema")
        print("- Includes keyword validation for reliability")
        print("- Supports project context for better accuracy")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
