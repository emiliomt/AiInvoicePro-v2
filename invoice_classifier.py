
import openai
import json
import pandas as pd
from typing import List, Dict, Optional, Tuple
import re
from datetime import datetime
import logging
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnzuDynamicsInvoiceClassifier:
    """
    AI-powered invoice line item classifier for AnzuDynamics construction projects
    Matches the existing TypeScript classification system categories
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        """
        Initialize the classifier with OpenAI API key and model
        
        Args:
            api_key (Optional[str]): OpenAI API key (if None, will try to get from environment)
            model (str): OpenAI model to use (default: gpt-4o-mini for cost efficiency)
        """
        if api_key is None:
            api_key = os.getenv('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OpenAI API key not provided. Please set OPENAI_API_KEY environment variable.")
        
        self.client = openai.OpenAI(api_key=api_key)
        self.model = model
        
        # AnzuDynamics classification categories (matching TypeScript system)
        self.categories = {
            "consumable_materials": {
                "label": "Consumable Materials",
                "description": "Materials that are used up during construction/operations (cement, sand, fuel, paint, etc.)",
                "keywords": [
                    'cement', 'concrete', 'sand', 'gravel', 'steel bars', 'rebar', 'wire', 'nails', 'screws', 'bolts',
                    'paint', 'primer', 'adhesive', 'glue', 'sealant', 'caulk', 'tape', 'plastic sheeting', 'lumber',
                    'wood', 'plywood', 'drywall', 'insulation', 'roofing material', 'shingles', 'tiles', 'piping',
                    'electrical wire', 'conduit', 'fuel', 'gasoline', 'diesel', 'oil', 'grease', 'welding rods',
                    'consumables', 'supplies', 'materials', 'aggregate', 'mortar', 'brick', 'block'
                ]
            },
            "non_consumable_materials": {
                "label": "Non-Consumable Materials",
                "description": "Durable materials and equipment that are reusable (machinery, equipment, assets)",
                "keywords": [
                    'equipment', 'machinery', 'generator', 'compressor', 'pump', 'motor', 'engine', 'transmission',
                    'gearbox', 'hydraulic', 'pneumatic', 'electrical panel', 'transformer', 'switch', 'breaker',
                    'control system', 'sensor', 'instrument', 'meter', 'gauge', 'valve', 'fitting', 'coupling',
                    'bearing', 'seal', 'gasket', 'filter', 'radiator', 'cooler', 'heater', 'fan', 'blower',
                    'conveyor', 'crane', 'hoist', 'winch', 'cable', 'chain', 'rope', 'asset', 'capital'
                ]
            },
            "labor": {
                "label": "Labor",
                "description": "Human resources and professional services (workers, consultants, services)",
                "keywords": [
                    'labor', 'labour', 'worker', 'technician', 'engineer', 'operator', 'mechanic', 'electrician',
                    'welder', 'supervisor', 'foreman', 'manager', 'inspector', 'consultant', 'contractor',
                    'subcontractor', 'service', 'installation', 'maintenance', 'repair', 'overhaul', 'inspection',
                    'commissioning', 'testing', 'calibration', 'training', 'hours', 'overtime', 'shift',
                    'personnel', 'manpower', 'workforce', 'professional services', 'consulting', 'engineering'
                ]
            },
            "tools_equipment": {
                "label": "Tools & Equipment",
                "description": "Tools, machinery, and equipment for construction work",
                "keywords": [
                    'drill', 'hammer', 'wrench', 'screwdriver', 'saw', 'grinder', 'welder', 'torch', 'cutter',
                    'pliers', 'clamp', 'vise', 'level', 'measure', 'ruler', 'caliper', 'multimeter', 'tester',
                    'oscilloscope', 'analyzer', 'scanner', 'camera', 'computer', 'laptop', 'tablet', 'software',
                    'tool', 'toolkit', 'toolbox', 'scaffolding', 'ladder', 'platform', 'safety equipment',
                    'protective gear', 'helmet', 'harness', 'gloves', 'boots', 'glasses', 'respirator', 'mask'
                ]
            }
        }
    
    def create_classification_prompt(self, description: str, amount: Optional[float] = None, 
                                   vendor: Optional[str] = None, project_context: Optional[str] = None) -> str:
        """
        Create a detailed prompt for OpenAI API to classify the line item
        
        Args:
            description (str): Invoice line item description
            amount (Optional[float]): Line item amount
            vendor (Optional[str]): Vendor name
            project_context (Optional[str]): Project context for better classification
            
        Returns:
            str: Formatted prompt for classification
        """
        categories_desc = "\n".join([
            f"- {code}: {info['description']}"
            for code, info in self.categories.items()
        ])
        
        context_info = f"\nProject Context: {project_context}" if project_context else ""
        
        prompt = f"""
You are an expert construction invoice line item classifier for AnzuDynamics. 
Analyze the following invoice line item and classify it into ONE of the predefined categories.

INVOICE LINE ITEM DETAILS:
Description: "{description}"
Amount: {amount if amount else "Not provided"}
Vendor: {vendor if vendor else "Not provided"}{context_info}

AVAILABLE CATEGORIES:
{categories_desc}

CLASSIFICATION RULES:
1. Choose the MOST SPECIFIC category that fits the description
2. For construction projects, prioritize based on how the item is used:
   - If it gets consumed/used up during work → consumable_materials
   - If it's reusable equipment/machinery → non_consumable_materials or tools_equipment
   - If it's human work/services → labor
3. Consider the project context if provided
4. Use keyword matching as a secondary validation

RESPONSE FORMAT:
Return a JSON object with the following structure:
{{
    "category": "category_code",
    "confidence": 0.95,
    "reasoning": "Brief explanation of why this category was chosen",
    "matched_keywords": ["key", "words", "from", "description"],
    "alternative_category": "second_best_option_if_applicable"
}}

Confidence should be between 0.0 and 1.0, where:
- 0.9-1.0: Very confident in classification
- 0.7-0.9: Confident but some ambiguity
- 0.5-0.7: Moderate confidence, multiple possibilities
- 0.0-0.5: Low confidence, unclear classification
"""
        return prompt
    
    def classify_line_item(self, description: str, amount: Optional[float] = None, 
                          vendor: Optional[str] = None, project_context: Optional[str] = None) -> Dict:
        """
        Classify a single invoice line item using OpenAI API with keyword validation
        
        Args:
            description (str): Invoice line item description
            amount (Optional[float]): Line item amount
            vendor (Optional[str]): Vendor name
            project_context (Optional[str]): Project context
            
        Returns:
            Dict: Classification result with category, confidence, reasoning, and keywords
        """
        try:
            # First, try keyword-based classification as fallback/validation
            keyword_result = self._classify_with_keywords(description)
            
            # Use AI for primary classification
            prompt = self.create_classification_prompt(description, amount, vendor, project_context)
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are an expert construction invoice classifier. Always respond with valid JSON matching the exact format requested."
                    },
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,  # Low temperature for consistent results
                max_tokens=500
            )
            
            # Extract and parse the JSON response
            content = response.choices[0].message.content
            if content is None:
                raise ValueError("Empty response from OpenAI API")
            
            result = json.loads(content.strip())
            
            # Validate the result
            if "category" not in result or result["category"] not in self.categories:
                logger.warning(f"Invalid category returned: {result.get('category')}")
                result["category"] = keyword_result["category"]
            
            # Add metadata and validation info
            result.update({
                "timestamp": datetime.now().isoformat(),
                "model_used": self.model,
                "original_description": description,
                "keyword_validation": keyword_result,
                "classification_method": "ai_with_keyword_validation"
            })
            
            # Cross-validate with keyword classification
            if keyword_result["confidence"] > 0.7 and result["category"] != keyword_result["category"]:
                result["validation_warning"] = f"AI classified as {result['category']} but keywords suggest {keyword_result['category']}"
            
            logger.info(f"Classified '{description[:50]}...' as {result['category']} (confidence: {result.get('confidence', 'N/A')})")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            return self._create_fallback_result(description, "JSON_PARSE_ERROR", keyword_result)
        
        except Exception as e:
            logger.error(f"Error classifying line item: {e}")
            keyword_result = self._classify_with_keywords(description)
            return self._create_fallback_result(description, "API_ERROR", keyword_result)
    
    def _classify_with_keywords(self, description: str) -> Dict:
        """
        Classify using keyword matching (fallback method)
        
        Args:
            description (str): Item description
            
        Returns:
            Dict: Classification result
        """
        description_lower = description.lower()
        category_scores = {}
        
        for category, info in self.categories.items():
            score = 0
            matched_keywords = []
            
            for keyword in info["keywords"]:
                if keyword.lower() in description_lower:
                    # Weight longer keywords higher
                    weight = len(keyword.split()) * 2 if len(keyword.split()) > 1 else 1
                    score += weight
                    matched_keywords.append(keyword)
            
            if score > 0:
                category_scores[category] = {
                    "score": score,
                    "matched_keywords": matched_keywords
                }
        
        if not category_scores:
            return {
                "category": "consumable_materials",  # Default fallback
                "confidence": 0.1,
                "matched_keywords": [],
                "method": "keyword_fallback"
            }
        
        # Find best match
        best_category = max(category_scores.keys(), key=lambda k: category_scores[k]["score"])
        best_score = category_scores[best_category]["score"]
        
        # Calculate confidence based on score
        confidence = min(best_score / 10, 1.0)  # Normalize to 0-1 range
        
        return {
            "category": best_category,
            "confidence": confidence,
            "matched_keywords": category_scores[best_category]["matched_keywords"],
            "method": "keyword_based"
        }
    
    def _create_fallback_result(self, description: str, error_type: str, keyword_result: Dict = None) -> Dict:
        """Create a fallback result when AI classification fails"""
        if keyword_result:
            return {
                **keyword_result,
                "reasoning": f"AI classification failed ({error_type}), using keyword classification",
                "timestamp": datetime.now().isoformat(),
                "original_description": description,
                "classification_method": "keyword_fallback",
                "ai_error": error_type
            }
        
        return {
            "category": "consumable_materials",
            "confidence": 0.0,
            "reasoning": f"Classification failed due to {error_type}",
            "matched_keywords": [],
            "timestamp": datetime.now().isoformat(),
            "model_used": self.model,
            "original_description": description,
            "classification_method": "fallback",
            "error": True
        }
    
    def classify_batch(self, line_items: List[Dict], project_context: Optional[str] = None) -> List[Dict]:
        """
        Classify multiple line items in batch
        
        Args:
            line_items (List[Dict]): List of line items with 'description', optional 'amount' and 'vendor'
            project_context (Optional[str]): Project context for all items
            
        Returns:
            List[Dict]: List of classification results
        """
        results = []
        total_items = len(line_items)
        
        logger.info(f"Starting batch classification of {total_items} items")
        
        for i, item in enumerate(line_items, 1):
            logger.info(f"Processing item {i}/{total_items}")
            
            description = item.get('description', '')
            amount = item.get('amount')
            vendor = item.get('vendor')
            item_project_context = item.get('project_context', project_context)
            
            if not description.strip():
                logger.warning(f"Empty description for item {i}, skipping")
                results.append(self._create_fallback_result("", "EMPTY_DESCRIPTION"))
                continue
            
            result = self.classify_line_item(description, amount, vendor, item_project_context)
            
            # Add original item data to result
            result.update({
                "item_index": i,
                "original_amount": amount,
                "original_vendor": vendor
            })
            
            results.append(result)
        
        success_count = sum(1 for r in results if not r.get('error', False))
        logger.info(f"Completed batch classification. Success rate: {success_count}/{total_items}")
        
        return results
    
    def export_results(self, results: List[Dict], filename: Optional[str] = None) -> str:
        """
        Export classification results to CSV file
        
        Args:
            results (List[Dict]): Classification results
            filename (str, optional): Output filename
            
        Returns:
            str: Path to exported file
        """
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"anzudynamics_classification_results_{timestamp}.csv"
        
        # Flatten the results for CSV export
        flattened_results = []
        for result in results:
            flattened = {
                "original_description": result.get("original_description", ""),
                "category": result.get("category", ""),
                "category_label": self.categories.get(result.get("category", ""), {}).get("label", ""),
                "confidence": result.get("confidence", 0),
                "reasoning": result.get("reasoning", ""),
                "matched_keywords": ", ".join(result.get("matched_keywords", [])),
                "amount": result.get("original_amount", ""),
                "vendor": result.get("original_vendor", ""),
                "classification_method": result.get("classification_method", ""),
                "validation_warning": result.get("validation_warning", ""),
                "timestamp": result.get("timestamp", ""),
                "error": result.get("error", False)
            }
            flattened_results.append(flattened)
        
        df = pd.DataFrame(flattened_results)
        df.to_csv(filename, index=False)
        
        logger.info(f"Results exported to {filename}")
        return filename
    
    def generate_summary_report(self, results: List[Dict]) -> Dict:
        """
        Generate a comprehensive summary report of classification results
        
        Args:
            results (List[Dict]): Classification results
            
        Returns:
            Dict: Summary statistics
        """
        total_items = len(results)
        successful_classifications = [r for r in results if not r.get('error', False)]
        
        # Category distribution
        category_counts = {}
        confidence_scores = []
        method_counts = {}
        
        for result in successful_classifications:
            category = result.get('category', 'unknown')
            category_counts[category] = category_counts.get(category, 0) + 1
            confidence_scores.append(result.get('confidence', 0))
            
            method = result.get('classification_method', 'unknown')
            method_counts[method] = method_counts.get(method, 0) + 1
        
        # Add category labels for better reporting
        category_distribution = {}
        for category, count in category_counts.items():
            label = self.categories.get(category, {}).get('label', category)
            category_distribution[f"{label} ({category})"] = count
        
        summary = {
            "total_items": total_items,
            "successful_classifications": len(successful_classifications),
            "error_rate": (total_items - len(successful_classifications)) / total_items * 100 if total_items > 0 else 0,
            "average_confidence": sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0,
            "category_distribution": category_distribution,
            "classification_methods": method_counts,
            "high_confidence_items": len([c for c in confidence_scores if c >= 0.8]),
            "medium_confidence_items": len([c for c in confidence_scores if 0.6 <= c < 0.8]),
            "low_confidence_items": len([c for c in confidence_scores if c < 0.6]),
            "validation_warnings": len([r for r in results if r.get('validation_warning')])
        }
        
        return summary
    
    def get_categories(self) -> Dict[str, Dict]:
        """
        Return the available categories and their information
        
        Returns:
            Dict[str, Dict]: Categories with descriptions and keywords
        """
        return self.categories.copy()


# Convenience functions for direct use
def classify_line_item(description: str, amount: Optional[float] = None, 
                      vendor: Optional[str] = None, project_context: Optional[str] = None) -> Tuple[str, float]:
    """
    Classify a single line item and return category and confidence
    
    Args:
        description (str): Item description
        amount (Optional[float]): Item amount
        vendor (Optional[str]): Vendor name
        project_context (Optional[str]): Project context
        
    Returns:
        Tuple[str, float]: (category, confidence_score)
    """
    classifier = AnzuDynamicsInvoiceClassifier()
    result = classifier.classify_line_item(description, amount, vendor, project_context)
    return result['category'], result['confidence']


def main():
    """
    Example usage of the AnzuDynamics Invoice Classifier
    """
    try:
        # Initialize classifier
        classifier = AnzuDynamicsInvoiceClassifier()
        
        # Sample AnzuDynamics invoice line items for testing
        sample_line_items = [
            {
                "description": "Concrete mixer rental for Parque Heredia foundation work - 3 days",
                "amount": 450000.00,  # Colombian Pesos
                "vendor": "ALUTEMP SAS",
                "project_context": "Parque Heredia residential development"
            },
            {
                "description": "Skilled construction workers - 40 hours labor for structural work",
                "amount": 2800000.00,
                "vendor": "Labor Solutions SAS",
                "project_context": "Parque Heredia residential development"
            },
            {
                "description": "Steel rebar 20mm diameter - 500 meters for reinforcement",
                "amount": 1250000.00,
                "vendor": "Aceros del Norte",
                "project_context": "Parque Heredia residential development"
            },
            {
                "description": "Professional drilling equipment - Makita impact drill set",
                "amount": 850000.00,
                "vendor": "Ferretería Central",
                "project_context": "Parque Heredia residential development"
            },
            {
                "description": "Hydraulic cement bags - 50kg x 20 units for foundation",
                "amount": 680000.00,
                "vendor": "Cemex Colombia",
                "project_context": "Parque Heredia residential development"
            }
        ]
        
        print("=== AnzuDynamics Invoice Line Item Classification Demo ===")
        print(f"Classifying {len(sample_line_items)} line items...\n")
        
        # Classify batch of items
        results = classifier.classify_batch(sample_line_items, "Parque Heredia residential development")
        
        # Display results
        for i, result in enumerate(results):
            if not result.get('error', False):
                category_info = classifier.categories[result['category']]
                print(f"Item {i+1}:")
                print(f"  Description: {result['original_description']}")
                print(f"  Category: {category_info['label']} ({result['category']})")
                print(f"  Confidence: {result['confidence']:.2f}")
                print(f"  Method: {result.get('classification_method', 'unknown')}")
                print(f"  Reasoning: {result['reasoning']}")
                if result.get('matched_keywords'):
                    print(f"  Keywords: {', '.join(result['matched_keywords'])}")
                if result.get('validation_warning'):
                    print(f"  ⚠️  Warning: {result['validation_warning']}")
                print()
            else:
                print(f"Item {i+1}: ERROR - {result['reasoning']}")
                print()
        
        # Generate comprehensive summary report
        summary = classifier.generate_summary_report(results)
        print("=== Classification Summary ===")
        print(f"Total items processed: {summary['total_items']}")
        print(f"Successful classifications: {summary['successful_classifications']}")
        print(f"Average confidence: {summary['average_confidence']:.2f}")
        print(f"High confidence items (≥0.8): {summary['high_confidence_items']}")
        print(f"Medium confidence items (0.6-0.8): {summary['medium_confidence_items']}")
        print(f"Low confidence items (<0.6): {summary['low_confidence_items']}")
        
        if summary['validation_warnings'] > 0:
            print(f"⚠️  Items with validation warnings: {summary['validation_warnings']}")
        
        print(f"\nCategory distribution:")
        for category, count in summary['category_distribution'].items():
            print(f"  - {category}: {count}")
        
        print(f"\nClassification methods used:")
        for method, count in summary['classification_methods'].items():
            print(f"  - {method}: {count}")
        
        # Export results
        filename = classifier.export_results(results)
        print(f"\nResults exported to: {filename}")
        
        # Show available categories
        print(f"\n=== Available Categories ===")
        categories = classifier.get_categories()
        for code, info in categories.items():
            print(f"{info['label']} ({code}):")
            print(f"  {info['description']}")
            print(f"  Keywords: {', '.join(info['keywords'][:5])}..." if len(info['keywords']) > 5 else f"  Keywords: {', '.join(info['keywords'])}")
            print()
        
    except ValueError as e:
        print(f"Error: {e}")
        print("\nPlease set your OpenAI API key as an environment variable:")
        print("export OPENAI_API_KEY='your-api-key-here'")
        print("\nOr create a .env file with:")
        print("OPENAI_API_KEY=your-api-key-here")


if __name__ == "__main__":
    main()
