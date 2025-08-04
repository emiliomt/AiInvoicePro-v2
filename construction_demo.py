
#!/usr/bin/env python3
"""
AnzuDynamics Construction Invoice Classification Demo
Demonstrates AI-powered classification for construction project invoices
with exact output format matching your requirements
"""

import os
from invoice_classifier import AnzuDynamicsInvoiceClassifier
from anzudynamics_config import AnzuDynamicsConfig

def classify_single_item_demo():
    """Demo for single item classification with your exact format"""
    print("=== Single Item Classification Demo ===")
    
    # Your exact example from the input structure
    line_item = {
        "description": "Steel rebar 20mm - 500 meters for foundation",
        "amount": 1250.00,
        "vendor": "ALUTEMP SAS",
        "project_context": "Parque Heredia B - Construction Project"
    }
    
    try:
        classifier = AnzuDynamicsInvoiceClassifier()
        result = classifier.classify_line_item(
            description=line_item["description"],
            amount=line_item["amount"],
            vendor=line_item["vendor"],
            project_context=line_item["project_context"]
        )
        
        # Format output to match your requirements
        output = {
            "category": result["category"],
            "confidence": result.get("confidence", 0.0),
            "reasoning": result.get("reasoning", ""),
            "suggested_keywords": result.get("suggested_keywords", []),
            "requires_review": result.get("requires_review", True)
        }
        
        print(f"Input: {line_item['description']}")
        print(f"Output: {output}")
        print()
        
    except Exception as e:
        print(f"Error: {e}")

def batch_classification_demo():
    """Demo for batch processing construction items"""
    print("=== Batch Classification Demo ===")
    
    # Construction examples to handle
    construction_items = [
        {
            "description": "Concrete mix 25MPa - 50 cubic meters",
            "amount": 2500000.00,
            "vendor": "CEMEX Colombia",
            "project_context": "Parque Heredia B - Construction Project"
        },
        {
            "description": "Excavator rental - 3 days", 
            "amount": 1800000.00,
            "vendor": "Maquinaria del Valle",
            "project_context": "Parque Heredia B - Construction Project"
        },
        {
            "description": "Skilled mason labor - 40 hours",
            "amount": 1600000.00,
            "vendor": "Constructora Heredia",
            "project_context": "Parque Heredia B - Construction Project"
        },
        {
            "description": "Steel beams 6m length - permanent installation",
            "amount": 3200000.00,
            "vendor": "Aceros del Norte",
            "project_context": "Parque Heredia B - Construction Project"
        },
        {
            "description": "Welding services and installation",
            "amount": 900000.00,
            "vendor": "Soldaduras Especializadas",
            "project_context": "Parque Heredia B - Construction Project"
        },
        {
            "description": "Safety equipment and hardhats",
            "amount": 450000.00,
            "vendor": "Seguridad Industrial",
            "project_context": "Parque Heredia B - Construction Project"
        }
    ]
    
    try:
        classifier = AnzuDynamicsInvoiceClassifier()
        results = classifier.classify_batch(construction_items)
        
        print(f"Processed {len(results)} construction items:")
        print()
        
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                # Check auto-approval
                confidence = result.get('confidence', 0.0)
                auto_approve = AnzuDynamicsConfig.should_auto_approve(confidence)
                requires_review = AnzuDynamicsConfig.requires_manual_review(confidence)
                
                print(f"Item {i}: {result['original_description']}")
                print(f"  Category: {result['category']}")
                print(f"  Confidence: {confidence:.2f}")
                print(f"  Auto-approve: {auto_approve}")
                print(f"  Requires review: {requires_review}")
                print(f"  Keywords: {', '.join(result.get('suggested_keywords', [])[:5])}")
                print()
        
        # Generate summary with confidence-based routing
        high_confidence = [r for r in results if r.get('confidence', 0) >= AnzuDynamicsConfig.get_auto_approve_threshold()]
        medium_confidence = [r for r in results if AnzuDynamicsConfig.get_confidence_threshold() <= r.get('confidence', 0) < AnzuDynamicsConfig.get_auto_approve_threshold()]
        low_confidence = [r for r in results if r.get('confidence', 0) < AnzuDynamicsConfig.get_confidence_threshold()]
        
        print("=== Confidence-Based Routing ===")
        print(f"Auto-approve (≥{AnzuDynamicsConfig.get_auto_approve_threshold()}): {len(high_confidence)} items")
        print(f"Standard review ({AnzuDynamicsConfig.get_confidence_threshold()}-{AnzuDynamicsConfig.get_auto_approve_threshold()}): {len(medium_confidence)} items") 
        print(f"Manual review (<{AnzuDynamicsConfig.get_confidence_threshold()}): {len(low_confidence)} items")
        print()
        
    except Exception as e:
        print(f"Error: {e}")

def spanish_language_demo():
    """Demo for Spanish language descriptions (Colombian invoices)"""
    print("=== Spanish Language Demo ===")
    
    spanish_items = [
        {
            "description": "Cemento Portland Tipo I - 50 sacos de 50kg",
            "amount": 780000.00,
            "vendor": "CEMEX Colombia",
            "project_context": "Proyecto Parque Heredia B - Construcción residencial"
        },
        {
            "description": "Mano de obra especializada - albañil y ayudantes 8 horas",
            "amount": 320000.00,
            "vendor": "Constructora Heredia",
            "project_context": "Proyecto Parque Heredia B - Construcción residencial"
        },
        {
            "description": "Alquiler de retroexcavadora CAT 320D - 2 días",
            "amount": 960000.00,
            "vendor": "Maquinaria y Equipos Ltda",
            "project_context": "Proyecto Parque Heredia B - Construcción residencial"
        },
        {
            "description": "Equipos de seguridad - cascos, arneses, botas para 10 trabajadores",
            "amount": 450000.00,
            "vendor": "Seguridad Industrial Colombia",
            "project_context": "Proyecto Parque Heredia B - Construcción residencial"
        }
    ]
    
    try:
        classifier = AnzuDynamicsInvoiceClassifier()
        results = classifier.classify_batch(spanish_items)
        
        print("Spanish language classification results:")
        print()
        
        for i, result in enumerate(results, 1):
            if not result.get('error', False):
                print(f"Item {i}: {result['original_description']}")
                print(f"  Categoría: {result['category']}")
                print(f"  Confianza: {result.get('confidence', 0):.2f}")
                print(f"  Palabras clave: {', '.join(result.get('suggested_keywords', [])[:3])}")
                print()
        
    except Exception as e:
        print(f"Error: {e}")

def main():
    """Run all construction-specific demos"""
    print("🏗️  AnzuDynamics Construction Invoice Classification System")
    print("=" * 60)
    print()
    
    try:
        classify_single_item_demo()
        batch_classification_demo()
        spanish_language_demo()
        
        print("✅ All demos completed successfully!")
        print()
        print("📋 Integration Notes:")
        print("- Categories use full labels as requested")
        print("- Output format matches your exact requirements")
        print("- Confidence-based routing implemented")
        print("- Spanish language support included")
        print("- Construction project context awareness")
        print("- Batch processing capabilities")
        
    except ValueError as e:
        if "API key" in str(e):
            print("❌ Error: OpenAI API key not found.")
            print("🔑 Please set your OPENAI_API_KEY environment variable:")
            print("   export OPENAI_API_KEY='your-key-here'")
        else:
            print(f"❌ Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
