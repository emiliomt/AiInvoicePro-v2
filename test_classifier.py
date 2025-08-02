#!/usr/bin/env python3
"""
Test script for the Invoice Line Item Classifier

This script tests the classifier functionality without requiring an OpenAI API key
by mocking the responses. Useful for development and testing.
"""

import json
from unittest.mock import Mock, patch
from invoice_classifier import InvoiceLineItemClassifier

def mock_openai_response():
    """Create a mock OpenAI response"""
    mock_response = Mock()
    mock_choice = Mock()
    mock_message = Mock()
    mock_message.content = '''
    {
        "category": "EQUIPMENT",
        "confidence": 0.92,
        "reasoning": "This item describes equipment rental for construction work",
        "keywords": ["concrete", "mixer", "rental", "construction"]
    }
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
        mock_client.chat.completions.create.return_value = mock_openai_response()
        
        # Test classification
        classifier = InvoiceLineItemClassifier(api_key="test-key")
        result = classifier.classify_line_item(
            description="Concrete mixer rental for foundation work - 3 days",
            amount=450.00,
            vendor="Equipment Rentals Inc"
        )
        
        print(f"✓ Classification successful")
        print(f"  Category: {result['category']}")
        print(f"  Confidence: {result['confidence']}")
        print(f"  Reasoning: {result['reasoning']}")
        print(f"  Keywords: {', '.join(result['keywords'])}")
        print()

def test_batch_classification():
    """Test batch classification with mocked API"""
    print("=== Testing Batch Classification ===")
    
    test_items = [
        {
            "description": "Construction workers - 40 hours",
            "amount": 2800.00,
            "vendor": "Labor Solutions"
        },
        {
            "description": "Steel rebar materials",
            "amount": 1250.00,
            "vendor": "Steel Supply Co"
        }
    ]
    
    with patch('openai.OpenAI') as mock_openai:
        # Mock the OpenAI client
        mock_client = Mock()
        mock_openai.return_value = mock_client
        
        # Create different responses for different items
        def side_effect(*args, **kwargs):
            if "Construction workers" in str(kwargs):
                mock_response = Mock()
                mock_choice = Mock()
                mock_message = Mock()
                mock_message.content = '''
                {
                    "category": "LABOR",
                    "confidence": 0.95,
                    "reasoning": "This clearly describes labor costs for construction work",
                    "keywords": ["construction", "workers", "labor", "hours"]
                }
                '''
                mock_choice.message = mock_message
                mock_response.choices = [mock_choice]
                return mock_response
            else:
                mock_response = Mock()
                mock_choice = Mock()
                mock_message = Mock()
                mock_message.content = '''
                {
                    "category": "MATERIALS",
                    "confidence": 0.88,
                    "reasoning": "Steel rebar is a construction material",
                    "keywords": ["steel", "rebar", "materials", "construction"]
                }
                '''
                mock_choice.message = mock_message
                mock_response.choices = [mock_choice]
                return mock_response
        
        mock_client.chat.completions.create.side_effect = side_effect
        
        # Test batch classification
        classifier = InvoiceLineItemClassifier(api_key="test-key")
        results = classifier.classify_batch(test_items)
        
        print(f"✓ Batch classification successful")
        print(f"  Processed {len(results)} items")
        
        for i, result in enumerate(results, 1):
            print(f"  Item {i}: {result['category']} (confidence: {result['confidence']})")
        
        # Test summary report
        summary = classifier.generate_summary_report(results)
        print(f"\n✓ Summary report generated")
        print(f"  Success rate: {summary['successful_classifications']}/{summary['total_items']}")
        print(f"  Average confidence: {summary['average_confidence']:.2f}")
        print()

def test_categories():
    """Test category validation"""
    print("=== Testing Category Validation ===")
    
    with patch('openai.OpenAI'):
        classifier = InvoiceLineItemClassifier(api_key="test-key")
        categories = classifier.validate_categories()
        
        print(f"✓ Found {len(categories)} categories:")
        for code in categories.keys():
            print(f"  - {code}")
        print()

def test_error_handling():
    """Test error handling"""
    print("=== Testing Error Handling ===")
    
    with patch('openai.OpenAI') as mock_openai:
        # Mock client that raises an exception
        mock_client = Mock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        classifier = InvoiceLineItemClassifier(api_key="test-key")
        result = classifier.classify_line_item(
            description="Test item",
            amount=100.00,
            vendor="Test Vendor"
        )
        
        print(f"✓ Error handling successful")
        print(f"  Error result category: {result['category']}")
        print(f"  Error flag: {result.get('error', False)}")
        print(f"  Reasoning: {result['reasoning']}")
        print()

def test_export_functionality():
    """Test CSV export functionality"""
    print("=== Testing Export Functionality ===")
    
    # Create mock results
    mock_results = [
        {
            "category": "EQUIPMENT",
            "confidence": 0.92,
            "reasoning": "Equipment rental",
            "keywords": ["equipment", "rental"],
            "original_description": "Test equipment",
            "original_amount": 450.00,
            "original_vendor": "Test Vendor",
            "timestamp": "2024-01-01T12:00:00",
            "error": False
        }
    ]
    
    with patch('openai.OpenAI'):
        classifier = InvoiceLineItemClassifier(api_key="test-key")
        
        # Test export (will create a real CSV file)
        filename = classifier.export_results(mock_results, "test_export.csv")
        
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
    print("Invoice Line Item Classifier - Test Suite\n")
    
    try:
        test_categories()
        test_single_classification()
        test_batch_classification()
        test_error_handling()
        test_export_functionality()
        
        print("🎉 All tests completed successfully!")
        print("\nTo use with real OpenAI API:")
        print("1. Set OPENAI_API_KEY environment variable")
        print("2. Run: python invoice_classifier.py")
        print("3. Or run: python example_usage.py")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())