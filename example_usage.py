#!/usr/bin/env python3
"""
Example usage script for the Invoice Line Item Classifier

This script demonstrates how to use the InvoiceLineItemClassifier class
with different types of invoice data.
"""

import json
from invoice_classifier import InvoiceLineItemClassifier

def example_single_classification():
    """Example of classifying a single line item"""
    print("=== Single Line Item Classification ===")
    
    try:
        classifier = InvoiceLineItemClassifier()
        
        # Single line item example
        result = classifier.classify_line_item(
            description="Professional plumbing services for bathroom renovation",
            amount=1250.00,
            vendor="ABC Plumbing Solutions"
        )
        
        print(f"Description: {result['original_description']}")
        print(f"Category: {result['category']}")
        print(f"Confidence: {result['confidence']:.2f}")
        print(f"Reasoning: {result['reasoning']}")
        print(f"Keywords: {', '.join(result['keywords'])}")
        print()
        
    except Exception as e:
        print(f"Error: {e}")

def example_batch_classification():
    """Example of batch classification with various invoice types"""
    print("=== Batch Classification Examples ===")
    
    try:
        classifier = InvoiceLineItemClassifier()
        
        # Mixed invoice line items for testing
        test_items = [
            {
                "description": "Construction workers - Site preparation and excavation",
                "amount": 3500.00,
                "vendor": "BuildCorp Labor"
            },
            {
                "description": "Portland cement - 50 bags for foundation",
                "amount": 485.00,
                "vendor": "Materials Plus"
            },
            {
                "description": "Crane rental - 8 hours for steel beam installation",
                "amount": 1200.00,
                "vendor": "Heavy Equipment Rentals"
            },
            {
                "description": "Electrical subcontractor - Complete wiring installation",
                "amount": 8750.00,
                "vendor": "PowerLine Electric"
            },
            {
                "description": "Business liability insurance premium - Q1 2024",
                "amount": 2400.00,
                "vendor": "SecureShield Insurance"
            },
            {
                "description": "Monthly office rent - Main headquarters",
                "amount": 4500.00,
                "vendor": "Downtown Properties LLC"
            },
            {
                "description": "Flight tickets for project site visit - Chicago to Denver",
                "amount": 650.00,
                "vendor": "American Airlines"
            },
            {
                "description": "Copy paper, pens, and office supplies",
                "amount": 127.50,
                "vendor": "Office Supply Store"
            },
            {
                "description": "Monthly electricity bill - Manufacturing facility",
                "amount": 1850.00,
                "vendor": "City Power Company"
            },
            {
                "description": "Building permit fees - Commercial construction",
                "amount": 875.00,
                "vendor": "City Building Department"
            }
        ]
        
        # Classify all items
        results = classifier.classify_batch(test_items)
        
        # Display results
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                print(f"Item {i}:")
                print(f"  Description: {result['original_description']}")
                print(f"  Amount: ${result['original_amount']:,.2f}")
                print(f"  Vendor: {result['original_vendor']}")
                print(f"  Category: {result['category']}")
                print(f"  Confidence: {result['confidence']:.2f}")
                print(f"  Reasoning: {result['reasoning']}")
                print()
            else:
                print(f"Item {i}: Classification failed - {result['reasoning']}")
                print()
        
        # Generate and display summary
        summary = classifier.generate_summary_report(results)
        print("=== Summary Report ===")
        print(f"Total items: {summary['total_items']}")
        print(f"Successful classifications: {summary['successful_classifications']}")
        print(f"Error rate: {summary['error_rate']:.1f}%")
        print(f"Average confidence: {summary['average_confidence']:.2f}")
        print(f"High confidence items (≥0.8): {summary['high_confidence_items']}")
        print(f"Low confidence items (<0.6): {summary['low_confidence_items']}")
        print("\nCategory Distribution:")
        for category, count in summary['category_distribution'].items():
            print(f"  {category}: {count}")
        
        # Export results
        filename = classifier.export_results(results, "example_classification_results.csv")
        print(f"\nResults exported to: {filename}")
        
    except Exception as e:
        print(f"Error: {e}")

def example_categories_info():
    """Display available categories and their descriptions"""
    print("=== Available Categories ===")
    
    try:
        classifier = InvoiceLineItemClassifier()
        categories = classifier.validate_categories()
        
        for code, description in categories.items():
            print(f"{code}:")
            print(f"  {description}")
            print()
            
    except Exception as e:
        print(f"Error: {e}")

def load_sample_from_json(filename):
    """Load sample data from JSON file"""
    try:
        with open(filename, 'r') as file:
            data = json.load(file)
            return data.get('line_items', [])
    except FileNotFoundError:
        print(f"Sample file {filename} not found. Using built-in examples.")
        return []
    except json.JSONDecodeError:
        print(f"Error parsing {filename}. Using built-in examples.")
        return []

def main():
    """Run all examples"""
    print("Invoice Line Item Classification - Example Usage\n")
    
    # Show available categories
    example_categories_info()
    
    # Single classification example
    example_single_classification()
    
    # Batch classification example
    example_batch_classification()

if __name__ == "__main__":
    main()