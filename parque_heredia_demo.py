
#!/usr/bin/env python3
"""
Parque Heredia Project - Invoice Classification Demo
Demonstrates AI-powered classification for the Parque Heredia residential development
"""

import os
from invoice_classifier import AnzuDynamicsInvoiceClassifier

def main():
    """Demo classification for Parque Heredia project invoices"""
    print("🏗️  Parque Heredia Project - Invoice Classification Demo")
    print("=" * 55)
    
    # Real Parque Heredia invoice items (sample data)
    parque_heredia_items = [
        {
            "description": "Concrete mixer rental for Parque Heredia foundation work - 3 days",
            "amount": 450000.00,  # Colombian Pesos
            "vendor": "ALUTEMP SAS"
        },
        {
            "description": "Hydraulic cement Portland Type I - 50kg bags x 30 units",
            "amount": 780000.00,
            "vendor": "CEMEX Colombia"
        },
        {
            "description": "Steel reinforcement bars #4 (12mm) - 200 meters",
            "amount": 1250000.00,
            "vendor": "Aceros del Norte"
        },
        {
            "description": "Construction labor - Mason and helpers 8 hours/day x 5 days",
            "amount": 2800000.00,
            "vendor": "Constructora Heredia"
        },
        {
            "description": "Professional engineering consultation - structural analysis",
            "amount": 1500000.00,
            "vendor": "Ingeniería Especializada SAS"
        },
        {
            "description": "Heavy duty impact drill set - Makita professional series",
            "amount": 850000.00,
            "vendor": "Ferretería El Constructor"
        },
        {
            "description": "Excavator rental CAT 320D - 2 days for foundation excavation",
            "amount": 2400000.00,
            "vendor": "Maquinaria y Equipos Ltda"
        },
        {
            "description": "Fine sand for concrete mix - 10 cubic meters delivered",
            "amount": 650000.00,
            "vendor": "Agregados del Valle"
        },
        {
            "description": "Safety equipment - helmets, harnesses, boots for 10 workers",
            "amount": 950000.00,
            "vendor": "Seguridad Industrial Colombia"
        },
        {
            "description": "Electrical installation materials - copper wire 12 AWG x 500m",
            "amount": 1100000.00,
            "vendor": "Eléctricos Bogotá"
        }
    ]
    
    project_context = "Parque Heredia residential development - Multi-family housing project in Bogotá"
    
    try:
        # Initialize classifier
        print("🤖 Initializing AI classifier...")
        classifier = AnzuDynamicsInvoiceClassifier()
        
        print(f"📊 Processing {len(parque_heredia_items)} Parque Heredia invoice items...")
        print(f"🏘️  Project Context: {project_context}")
        print()
        
        # Classify items
        results = classifier.classify_batch(parque_heredia_items, project_context)
        
        # Display detailed results
        total_amount = 0
        category_totals = {}
        
        print("📋 CLASSIFICATION RESULTS:")
        print("-" * 80)
        
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                category_info = classifier.categories[result['category']]
                amount = result.get('original_amount', 0)
                total_amount += amount
                
                # Track category totals
                if result['category'] not in category_totals:
                    category_totals[result['category']] = {'amount': 0, 'count': 0}
                category_totals[result['category']]['amount'] += amount
                category_totals[result['category']]['count'] += 1
                
                print(f"[{i:2d}] {category_info['label'].upper()}")
                print(f"     💰 ${amount:,.0f} COP - {result['original_vendor']}")
                print(f"     📝 {result['original_description']}")
                print(f"     🎯 Confidence: {result['confidence']:.1%} | Method: {result.get('classification_method', 'unknown')}")
                
                if result.get('matched_keywords'):
                    print(f"     🔍 Keywords: {', '.join(result['matched_keywords'][:3])}")
                
                if result.get('validation_warning'):
                    print(f"     ⚠️  {result['validation_warning']}")
                
                print()
            else:
                print(f"[{i:2d}] ❌ ERROR: {result['reasoning']}")
                print()
        
        # Summary analysis
        print("📊 PARQUE HEREDIA PROJECT ANALYSIS:")
        print("=" * 50)
        print(f"💰 Total Invoice Amount: ${total_amount:,.0f} COP")
        print(f"📦 Total Items Processed: {len(results)}")
        
        # Category breakdown
        print(f"\n🏗️  EXPENSE BREAKDOWN BY CATEGORY:")
        for category, data in sorted(category_totals.items(), key=lambda x: x[1]['amount'], reverse=True):
            category_info = classifier.categories[category]
            percentage = (data['amount'] / total_amount) * 100
            print(f"   {category_info['label']}")
            print(f"   └── ${data['amount']:,.0f} COP ({percentage:.1f}%) - {data['count']} items")
        
        # Generate comprehensive summary
        summary = classifier.generate_summary_report(results)
        print(f"\n📈 CLASSIFICATION QUALITY METRICS:")
        print(f"   ✅ Success Rate: {summary['successful_classifications']}/{summary['total_items']} ({(summary['successful_classifications']/summary['total_items']*100):.1f}%)")
        print(f"   🎯 Average Confidence: {summary['average_confidence']:.1%}")
        print(f"   🟢 High Confidence (≥80%): {summary['high_confidence_items']} items")
        print(f"   🟡 Medium Confidence (60-80%): {summary['medium_confidence_items']} items")
        print(f"   🔴 Low Confidence (<60%): {summary['low_confidence_items']} items")
        
        if summary['validation_warnings'] > 0:
            print(f"   ⚠️  Validation Warnings: {summary['validation_warnings']} items")
        
        # Export results
        filename = classifier.export_results(results, "parque_heredia_classification.csv")
        print(f"\n💾 Results exported to: {filename}")
        
        # Project-specific insights
        print(f"\n🏘️  PARQUE HEREDIA PROJECT INSIGHTS:")
        
        # Calculate material vs labor vs equipment ratios
        material_categories = ['Consumable Materials', 'Non-Consumable Materials']
        material_total = sum(category_totals.get(cat, {}).get('amount', 0) for cat in material_categories)
        labor_total = category_totals.get('Labor', {}).get('amount', 0)
        equipment_total = category_totals.get('Tools & Equipment', {}).get('amount', 0)
        
        print(f"   🧱 Materials: ${material_total:,.0f} COP ({(material_total/total_amount)*100:.1f}%)")
        print(f"   👷 Labor: ${labor_total:,.0f} COP ({(labor_total/total_amount)*100:.1f}%)")
        print(f"   🔧 Tools/Equipment: ${equipment_total:,.0f} COP ({(equipment_total/total_amount)*100:.1f}%)")
        
        # Cost per square meter estimate (assuming typical residential project)
        estimated_area = 2000  # m² - typical for multi-family housing
        cost_per_m2 = total_amount / estimated_area
        print(f"   📐 Estimated Cost/m²: ${cost_per_m2:,.0f} COP/m² (assuming {estimated_area:,}m²)")
        
        print(f"\n✅ Parque Heredia classification completed successfully!")
        print(f"📁 Classification data ready for integration with AnzuDynamics system")
        
    except ValueError as e:
        if "API key" in str(e):
            print("❌ Error: OpenAI API key not found.")
            print("🔑 Please set your OPENAI_API_KEY environment variable:")
            print("   export OPENAI_API_KEY='your-key-here'")
            print("\n💡 Or create a .env file with:")
            print("   OPENAI_API_KEY=your-key-here")
        else:
            print(f"❌ Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
