#!/usr/bin/env python3
"""
AI-powered Line Item Classification System for AnzuDynamics
Integrates with OpenAI API for intelligent invoice line item categorization
"""

import os
import sys
import json
import re
import argparse
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import openai
from difflib import SequenceMatcher

# Categories mapping to match TypeScript enum
CLASSIFICATION_CATEGORIES = {
    'materials_supplies': 'Raw materials, supplies, and consumable items',
    'equipment_tools': 'Tools, machinery, equipment, and hardware for operations',
    'services_labor': 'Professional services, labor, consulting, and expertise',
    'utilities_facilities': 'Utilities, facility costs, and operational overhead',
    'food_beverages': 'Food, beverages, and related consumables',
    'transportation_logistics': 'Transportation, shipping, logistics, and related services',
    'technology_software': 'Technology, software, digital services, and IT solutions',
    'marketing_advertising': 'Marketing, advertising, promotional materials and services',
    'consumable_materials': 'Materials that are consumed during production',
    'non_consumable_materials': 'Durable materials that are not consumed',
    'labor': 'Direct and indirect labor costs',
    'tools_equipment': 'Tools and equipment for operations',
    'other': 'Items that don\'t fit into standard business categories'
}

@dataclass
class LineItem:
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    unit: Optional[str] = None
    raw_text: Optional[str] = None

@dataclass 
class ClassificationResult:
    category: str
    confidence: float
    method: str
    subcategory: Optional[str] = None
    reasoning: Optional[str] = None
    keywords_matched: Optional[List[str]] = None

class AILineItemClassifier:
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the classifier with OpenAI API key"""
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self.use_ai = bool(self.api_key)
        
        if self.use_ai:
            openai.api_key = self.api_key
        
        # Keyword mappings for fallback classification
        self.keyword_mappings = self._load_keyword_mappings()
    
    def _load_keyword_mappings(self) -> Dict[str, List[str]]:
        """Load keyword mappings for each category"""
        return {
            'materials_supplies': [
                'cemento', 'cement', 'acero', 'steel', 'hierro', 'iron', 'madera', 'wood',
                'arena', 'sand', 'grava', 'gravel', 'pintura', 'paint', 'material',
                'supplies', 'suministros', 'materiales', 'varilla', 'rebar', 'concreto',
                'concrete', 'ladrillo', 'brick', 'tubería', 'pipe', 'cable', 'alambre'
            ],
            'equipment_tools': [
                'taladro', 'drill', 'martillo', 'hammer', 'sierra', 'saw', 'equipo',
                'equipment', 'herramienta', 'tool', 'máquina', 'machine', 'motor',
                'engine', 'generador', 'generator', 'bomba', 'pump', 'compresor',
                'compressor', 'soldadora', 'welder', 'grúa', 'crane'
            ],
            'services_labor': [
                'consultoría', 'consulting', 'asesoría', 'advisory', 'servicio', 'service',
                'labor', 'trabajo', 'mano de obra', 'manpower', 'instalación',
                'installation', 'mantenimiento', 'maintenance', 'reparación', 'repair',
                'ingeniería', 'engineering', 'diseño', 'design', 'supervisión',
                'supervision', 'capacitación', 'training'
            ],
            'utilities_facilities': [
                'electricidad', 'electricity', 'agua', 'water', 'gas', 'internet',
                'teléfono', 'phone', 'alquiler', 'rent', 'arriendo', 'lease',
                'servicios públicos', 'utilities', 'energía', 'energy', 'combustible',
                'fuel', 'gasolina', 'gasoline', 'diesel'
            ],
            'food_beverages': [
                'comida', 'food', 'bebida', 'beverage', 'café', 'coffee', 'agua',
                'water', 'refrescos', 'soft drinks', 'almuerzo', 'lunch', 'desayuno',
                'breakfast', 'cena', 'dinner', 'snacks', 'refrigerio'
            ],
            'transportation_logistics': [
                'transporte', 'transport', 'flete', 'freight', 'envío', 'shipping',
                'logística', 'logistics', 'delivery', 'entrega', 'combustible',
                'fuel', 'gasolina', 'gasoline', 'peaje', 'toll', 'estacionamiento',
                'parking', 'viaje', 'travel'
            ],
            'technology_software': [
                'software', 'licencia', 'license', 'computadora', 'computer',
                'laptop', 'tablet', 'teléfono', 'phone', 'impresora', 'printer',
                'tecnología', 'technology', 'sistema', 'system', 'aplicación',
                'application', 'cloud', 'nube', 'hosting', 'servidor', 'server'
            ],
            'marketing_advertising': [
                'publicidad', 'advertising', 'marketing', 'promoción', 'promotion',
                'banner', 'cartel', 'poster', 'folleto', 'brochure', 'campaña',
                'campaign', 'diseño gráfico', 'graphic design', 'logo', 'marca',
                'brand', 'redes sociales', 'social media'
            ]
        }
    
    def classify_line_item(self, line_item: LineItem, vendor_context: Optional[Dict] = None) -> ClassificationResult:
        """Classify a single line item"""
        if self.use_ai:
            try:
                return self._classify_with_ai(line_item, vendor_context)
            except Exception as e:
                print(f"AI classification failed: {e}", file=sys.stderr)
                return self._classify_with_keywords(line_item)
        else:
            return self._classify_with_keywords(line_item)
    
    def classify_batch(self, line_items: List[LineItem], vendor_context: Optional[Dict] = None) -> List[ClassificationResult]:
        """Classify multiple line items"""
        results = []
        for item in line_items:
            results.append(self.classify_line_item(item, vendor_context))
        return results
    
    def _classify_with_ai(self, line_item: LineItem, vendor_context: Optional[Dict] = None) -> ClassificationResult:
        """Use OpenAI API for classification"""
        
        # Prepare context information
        context_info = ""
        if vendor_context:
            vendor_name = vendor_context.get('vendorName', '')
            industry = vendor_context.get('industry', '')
            business_type = vendor_context.get('businessType', '')
            
            if vendor_name:
                context_info += f"Vendor: {vendor_name}\n"
            if industry:
                context_info += f"Industry: {industry}\n"
            if business_type:
                context_info += f"Business Type: {business_type}\n"
        
        # Build item info
        item_info = f"Description: {line_item.description}\n"
        if line_item.quantity:
            item_info += f"Quantity: {line_item.quantity}\n"
        if line_item.unit_price:
            item_info += f"Unit Price: {line_item.unit_price}\n"
        if line_item.total_price:
            item_info += f"Total Price: {line_item.total_price}\n"
        if line_item.unit:
            item_info += f"Unit: {line_item.unit}\n"
        if line_item.raw_text and line_item.raw_text != line_item.description:
            item_info += f"Raw Text: {line_item.raw_text}\n"
        
        # Create categories list for prompt
        categories_text = "\n".join([f"- {cat}: {desc}" for cat, desc in CLASSIFICATION_CATEGORIES.items()])
        
        prompt = f"""You are an expert invoice line item classifier for business procurement. 
        
Classify the following line item into one of these categories:
{categories_text}

Context Information:
{context_info}

Line Item Information:
{item_info}

Requirements:
1. Choose the MOST appropriate category from the list above
2. Provide a confidence score between 0.0 and 1.0
3. Explain your reasoning briefly
4. If relevant, suggest a subcategory

Respond in valid JSON format:
{{
    "category": "category_name",
    "confidence": 0.85,
    "reasoning": "Brief explanation",
    "subcategory": "optional subcategory"
}}"""

        try:
            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert business expense classifier. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.2
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON response
            try:
                result_data = json.loads(result_text)
                
                # Validate category
                category = result_data.get('category', 'other')
                if category not in CLASSIFICATION_CATEGORIES:
                    category = 'other'
                
                confidence = float(result_data.get('confidence', 0.7))
                confidence = max(0.0, min(1.0, confidence))  # Clamp between 0 and 1
                
                return ClassificationResult(
                    category=category,
                    confidence=confidence,
                    method='ai',
                    subcategory=result_data.get('subcategory'),
                    reasoning=result_data.get('reasoning', 'AI classification')
                )
                
            except json.JSONDecodeError:
                # Fallback parsing if JSON is malformed
                return self._parse_ai_text_response(result_text, line_item)
                
        except Exception as e:
            print(f"OpenAI API error: {e}", file=sys.stderr)
            raise e
    
    def _parse_ai_text_response(self, text: str, line_item: LineItem) -> ClassificationResult:
        """Parse AI response if JSON parsing fails"""
        text_lower = text.lower()
        
        # Try to extract category from text
        best_category = 'other'
        best_confidence = 0.5
        
        for category in CLASSIFICATION_CATEGORIES.keys():
            if category in text_lower:
                best_category = category
                best_confidence = 0.7
                break
        
        # Try to extract confidence score
        confidence_match = re.search(r'(\d+\.?\d*)', text)
        if confidence_match:
            try:
                confidence = float(confidence_match.group(1))
                if confidence > 1:
                    confidence = confidence / 100  # Convert percentage
                best_confidence = max(0.0, min(1.0, confidence))
            except:
                pass
        
        return ClassificationResult(
            category=best_category,
            confidence=best_confidence,
            method='ai',
            reasoning=f"Parsed from AI response: {text[:100]}..."
        )
    
    def _classify_with_keywords(self, line_item: LineItem) -> ClassificationResult:
        """Fallback keyword-based classification"""
        description = line_item.description.lower()
        best_category = 'other'
        best_confidence = 0.1
        matched_keywords = []
        
        for category, keywords in self.keyword_mappings.items():
            category_score = 0
            category_matches = []
            
            for keyword in keywords:
                if keyword.lower() in description:
                    # Calculate match strength
                    match_strength = len(keyword) / len(description)
                    match_strength *= SequenceMatcher(None, keyword.lower(), description).ratio()
                    category_score += match_strength
                    category_matches.append(keyword)
            
            if category_score > best_confidence:
                best_confidence = category_score
                best_category = category
                matched_keywords = category_matches
        
        # Normalize confidence to reasonable range
        best_confidence = min(0.9, max(0.1, best_confidence * 2))
        
        return ClassificationResult(
            category=best_category,
            confidence=best_confidence,
            method='keyword',
            reasoning=f"Matched keywords: {', '.join(matched_keywords[:3])}" if matched_keywords else "No strong keyword matches",
            keywords_matched=matched_keywords
        )

def main():
    """Main entry point for command line usage"""
    parser = argparse.ArgumentParser(description='Classify invoice line items')
    parser.add_argument('--classify', action='store_true', help='Classify line items from stdin')
    parser.add_argument('--test', action='store_true', help='Run test classification')
    args = parser.parse_args()
    
    classifier = AILineItemClassifier()
    
    if args.classify:
        # Read input from stdin
        try:
            input_data = json.loads(sys.stdin.read())
            line_items_data = input_data.get('line_items', [])
            vendor_context = input_data.get('vendor_context', {})
            
            # Convert to LineItem objects
            line_items = []
            for item_data in line_items_data:
                line_items.append(LineItem(
                    description=item_data['description'],
                    quantity=item_data.get('quantity'),
                    unit_price=item_data.get('unitPrice'),
                    total_price=item_data.get('totalPrice'),
                    unit=item_data.get('unit'),
                    raw_text=item_data.get('rawText')
                ))
            
            # Classify items
            results = classifier.classify_batch(line_items, vendor_context)
            
            # Convert results to JSON
            output = []
            for result in results:
                output.append({
                    'category': result.category,
                    'confidence': result.confidence,
                    'method': result.method,
                    'subcategory': result.subcategory,
                    'reasoning': result.reasoning,
                    'keywords_matched': result.keywords_matched
                })
            
            print(json.dumps(output))
            
        except Exception as e:
            print(f"Error processing input: {e}", file=sys.stderr)
            sys.exit(1)
    
    elif args.test:
        # Test with sample data
        test_items = [
            LineItem("Cemento portland 50kg", quantity=10, unit="sacos"),
            LineItem("Servicios de consultoría ingeniería", unit_price=150000),
            LineItem("Laptop Dell Inspiron", quantity=1),
            LineItem("Combustible diesel", quantity=100, unit="litros"),
            LineItem("C S IND MUROPLACA 4")
        ]
        
        results = classifier.classify_batch(test_items)
        
        for i, (item, result) in enumerate(zip(test_items, results)):
            print(f"\nItem {i+1}: {item.description}")
            print(f"Category: {result.category}")
            print(f"Confidence: {result.confidence:.2f}")
            print(f"Method: {result.method}")
            print(f"Reasoning: {result.reasoning}")
    
    else:
        parser.print_help()

if __name__ == '__main__':
    main()