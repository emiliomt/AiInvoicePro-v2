#!/usr/bin/env python3
"""
Interactive demo script for the Invoice Line Item Classifier

This script provides an interactive demonstration of the classifier functionality.
It can work with or without an OpenAI API key (using mock responses when needed).
"""

import json
import os
from invoice_classifier import InvoiceLineItemClassifier

def load_sample_data():
    """Load sample invoice data from JSON file"""
    try:
        with open('sample_invoice_data.json', 'r') as f:
            data = json.load(f)
            return data.get('line_items', [])
    except FileNotFoundError:
        print("Sample data file not found. Using built-in examples.")
        return [
            {
                "description": "Concrete mixer rental for foundation work - 3 days",
                "amount": 450.00,
                "vendor": "ALUTEMP SAS"
            },
            {
                "description": "Skilled construction workers - 40 hours labor",
                "amount": 2800.00,
                "vendor": "Labor Solutions Inc"
            }
        ]

def demo_without_api():
    """Demo using test classifier without real API calls"""
    print("🔧 Running in demo mode without API calls...")
    print("This demonstrates the classifier structure and functionality.\n")
    
    try:
        # This will fail gracefully without an API key
        classifier = InvoiceLineItemClassifier(api_key="demo-key")
        
        # Show categories
        categories = classifier.validate_categories()
        print("📋 Available Categories:")
        for i, (code, desc) in enumerate(categories.items(), 1):
            print(f"  {i:2d}. {code}: {desc}")
        
        print(f"\n✅ Classifier initialized with {len(categories)} categories")
        print("💡 To use with real OpenAI API, set OPENAI_API_KEY environment variable")
        
    except Exception as e:
        print(f"❌ Demo error: {e}")

def demo_with_api():
    """Demo using real OpenAI API"""
    print("🚀 Running with OpenAI API...")
    
    try:
        classifier = InvoiceLineItemClassifier()
        sample_items = load_sample_data()[:3]  # Use first 3 items for demo
        
        print("📋 Sample Invoice Items:")
        for i, item in enumerate(sample_items, 1):
            print(f"  {i}. {item['description']} (${item['amount']:.2f})")
        
        print("\n🔄 Classifying items...")
        results = classifier.classify_batch(sample_items)
        
        print("\n📊 Classification Results:")
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                print(f"\nItem {i}:")
                print(f"  📝 Description: {result['original_description']}")
                print(f"  📂 Category: {result['category']}")
                print(f"  🎯 Confidence: {result['confidence']:.2f}")
                print(f"  💭 Reasoning: {result['reasoning']}")
                print(f"  🏷️  Keywords: {', '.join(result['keywords'])}")
            else:
                print(f"\nItem {i}: ❌ {result['reasoning']}")
        
        # Generate summary
        summary = classifier.generate_summary_report(results)
        print(f"\n📈 Summary:")
        print(f"  ✅ Success rate: {summary['successful_classifications']}/{summary['total_items']}")
        print(f"  📊 Average confidence: {summary['average_confidence']:.2f}")
        print(f"  📋 Categories used: {len(summary['category_distribution'])}")
        
        # Export results
        filename = classifier.export_results(results, "demo_results.csv")
        print(f"  💾 Results saved to: {filename}")
        
    except ValueError as e:
        if "API key" in str(e):
            print("❌ OpenAI API key not found.")
            print("💡 Set OPENAI_API_KEY environment variable or create .env file")
            return False
        else:
            print(f"❌ Error: {e}")
            return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
    
    return True

def interactive_classify():
    """Interactive classification of user input"""
    print("\n🎯 Interactive Classification")
    print("Enter invoice descriptions to classify (or 'quit' to exit):")
    
    try:
        classifier = InvoiceLineItemClassifier()
        
        while True:
            description = input("\n📝 Invoice description: ").strip()
            
            if description.lower() in ['quit', 'exit', 'q']:
                break
            
            if not description:
                print("❌ Please enter a description")
                continue
            
            # Optional amount and vendor
            amount_input = input("💰 Amount (optional, press Enter to skip): ").strip()
            vendor_input = input("🏢 Vendor (optional, press Enter to skip): ").strip()
            
            amount = None
            if amount_input:
                try:
                    amount = float(amount_input)
                except ValueError:
                    print("⚠️  Invalid amount, ignoring...")
            
            vendor = vendor_input if vendor_input else None
            
            print("\n🔄 Classifying...")
            result = classifier.classify_line_item(description, amount, vendor)
            
            if not result.get('error', False):
                print(f"✅ Category: {result['category']}")
                print(f"🎯 Confidence: {result['confidence']:.2f}")
                print(f"💭 Reasoning: {result['reasoning']}")
                print(f"🏷️  Keywords: {', '.join(result['keywords'])}")
            else:
                print(f"❌ Classification failed: {result['reasoning']}")
    
    except ValueError as e:
        if "API key" in str(e):
            print("❌ OpenAI API key required for interactive mode")
            return False
        else:
            print(f"❌ Error: {e}")
            return False
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def main():
    """Main demo function"""
    print("🧾 Invoice Line Item Classifier - Interactive Demo")
    print("=" * 50)
    
    # Check if API key is available
    api_key = os.getenv('OPENAI_API_KEY')
    
    if api_key:
        print("✅ OpenAI API key found")
        if demo_with_api():
            # Ask if user wants to try interactive mode
            try:
                choice = input("\n❓ Try interactive classification? (y/n): ").strip().lower()
                if choice in ['y', 'yes']:
                    interactive_classify()
            except KeyboardInterrupt:
                print("\n👋 Demo completed!")
    else:
        print("ℹ️  No OpenAI API key found")
        demo_without_api()
        print("\n💡 To enable full functionality:")
        print("  1. Get an OpenAI API key from https://platform.openai.com/")
        print("  2. Set environment variable: export OPENAI_API_KEY='your-key-here'")
        print("  3. Or create a .env file with: OPENAI_API_KEY=your-key-here")
        print("  4. Run this demo again")
    
    print("\n🎉 Demo completed!")
    print("📖 For more examples, run: python example_usage.py")
    print("🧪 For testing, run: python test_classifier.py")

if __name__ == "__main__":
    main()