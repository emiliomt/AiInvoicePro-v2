#!/usr/bin/env python3
"""
Simple non-interactive demo of the Invoice Line Item Classifier
"""

import os
from invoice_classifier import InvoiceLineItemClassifier

def main():
    """Simple demo without user interaction"""
    print("Invoice Line Item Classifier - Simple Demo")
    print("=" * 45)
    
    # Sample data
    sample_items = [
        {
            "description": "Concrete mixer rental for foundation work - 3 days",
            "amount": 450.00,
            "vendor": "ALUTEMP SAS"
        },
        {
            "description": "Professional plumbing installation services",
            "amount": 1200.00,
            "vendor": "AquaPro Services"
        },
        {
            "description": "Monthly office space rental - downtown location",
            "amount": 2500.00,
            "vendor": "Downtown Properties"
        }
    ]
    
    try:
        # Initialize classifier
        classifier = InvoiceLineItemClassifier()
        
        print(f"Processing {len(sample_items)} invoice items...")
        print()
        
        # Classify items
        results = classifier.classify_batch(sample_items)
        
        # Display results
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                print(f"Item {i}:")
                print(f"  Description: {result['original_description']}")
                print(f"  Category: {result['category']}")
                print(f"  Confidence: {result['confidence']:.2f}")
                print(f"  Reasoning: {result['reasoning']}")
                print()
            else:
                print(f"Item {i}: Classification failed - {result['reasoning']}")
                print()
        
        # Summary
        summary = classifier.generate_summary_report(results)
        print("Summary:")
        print(f"  Success rate: {summary['successful_classifications']}/{summary['total_items']}")
        print(f"  Average confidence: {summary['average_confidence']:.2f}")
        print(f"  Categories found: {list(summary['category_distribution'].keys())}")
        
        # Export
        filename = classifier.export_results(results, "simple_demo_results.csv")
        print(f"  Results saved to: {filename}")
        
    except ValueError as e:
        if "API key" in str(e):
            print("Error: OpenAI API key not found.")
            print("Please set OPENAI_API_KEY environment variable")
            print("Example: export OPENAI_API_KEY='your-key-here'")
        else:
            print(f"Error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    main()