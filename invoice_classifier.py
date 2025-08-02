import openai
import json
import pandas as pd
from typing import List, Dict, Optional
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

class InvoiceLineItemClassifier:
    """
    A class to classify invoice line items using OpenAI's API
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4"):
        """
        Initialize the classifier with OpenAI API key and model
        
        Args:
            api_key (Optional[str]): OpenAI API key (if None, will try to get from environment)
            model (str): OpenAI model to use (default: gpt-4)
        """
        if api_key is None:
            api_key = os.getenv('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OpenAI API key not provided and not found in environment variables. Please set OPENAI_API_KEY environment variable or pass api_key parameter.")
        
        self.client = openai.OpenAI(api_key=api_key)
        self.model = model
        
        # Define standard categories for classification
        self.categories = {
            "LABOR": "Direct labor costs including wages, salaries, overtime, and labor-related expenses",
            "MATERIALS": "Raw materials, supplies, components, and physical goods used in production",
            "EQUIPMENT": "Machinery, tools, vehicles, and equipment purchases or rentals",
            "SERVICES": "Professional services, consulting, maintenance, repairs, and contracted work",
            "UTILITIES": "Electricity, water, gas, telecommunications, and other utility expenses",
            "TRAVEL": "Transportation, accommodation, meals, and travel-related expenses",
            "OFFICE_SUPPLIES": "Stationery, office equipment, software licenses, and administrative supplies",
            "RENT_FACILITIES": "Facility rent, property leases, and real estate expenses",
            "INSURANCE": "Insurance premiums, coverage, and risk management expenses",
            "TAXES_FEES": "Government taxes, permits, licenses, and regulatory fees",
            "SUBCONTRACTOR": "Third-party contractor and subcontractor payments",
            "OTHER": "Expenses that don't fit into standard categories"
        }
    
    def create_classification_prompt(self, description: str, amount: Optional[float] = None, vendor: Optional[str] = None) -> str:
        """
        Create a detailed prompt for OpenAI API to classify the line item
        
        Args:
            description (str): Invoice line item description
            amount (Optional[float]): Line item amount
            vendor (Optional[str]): Vendor name
            
        Returns:
            str: Formatted prompt for classification
        """
        categories_list = "\n".join([f"- {code}: {desc}" for code, desc in self.categories.items()])
        
        prompt = f"""
You are an expert invoice line item classifier for construction and business expenses. 
Analyze the following invoice line item and classify it into ONE of the predefined categories.

INVOICE LINE ITEM DETAILS:
Description: "{description}"
Amount: {amount if amount else "Not provided"}
Vendor: {vendor if vendor else "Not provided"}

AVAILABLE CATEGORIES:
{categories_list}

CLASSIFICATION RULES:
1. Choose the MOST SPECIFIC category that fits the description
2. If the description mentions multiple types, choose the PRIMARY purpose
3. For construction projects, prioritize LABOR, MATERIALS, EQUIPMENT, and SUBCONTRACTOR categories
4. Use OTHER only if no other category fits

RESPONSE FORMAT:
Return a JSON object with the following structure:
{{
    "category": "CATEGORY_CODE",
    "confidence": 0.95,
    "reasoning": "Brief explanation of why this category was chosen",
    "keywords": ["key", "words", "that", "influenced", "decision"]
}}

Confidence should be between 0.0 and 1.0, where:
- 0.9-1.0: Very confident in classification
- 0.7-0.9: Confident but some ambiguity
- 0.5-0.7: Moderate confidence, multiple possibilities
- 0.0-0.5: Low confidence, unclear classification
"""
        return prompt
    
    def classify_line_item(self, description: str, amount: Optional[float] = None, vendor: Optional[str] = None) -> Dict:
        """
        Classify a single invoice line item using OpenAI API
        
        Args:
            description (str): Invoice line item description
            amount (Optional[float]): Line item amount
            vendor (Optional[str]): Vendor name
            
        Returns:
            Dict: Classification result with category, confidence, reasoning, and keywords
        """
        try:
            prompt = self.create_classification_prompt(description, amount, vendor)
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert invoice classifier. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent results
                max_tokens=500
            )
            
            # Extract and parse the JSON response
            content = response.choices[0].message.content
            if content is None:
                raise ValueError("Empty response from OpenAI API")
            content = content.strip()
            
            # Clean up the response to ensure valid JSON
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            
            result = json.loads(content)
            
            # Validate the result
            if "category" not in result:
                raise ValueError("Missing 'category' in response")
            
            if result["category"] not in self.categories:
                logger.warning(f"Unknown category returned: {result['category']}")
                result["category"] = "OTHER"
            
            # Add metadata
            result["timestamp"] = datetime.now().isoformat()
            result["model_used"] = self.model
            result["original_description"] = description
            
            logger.info(f"Classified '{description[:50]}...' as {result['category']} (confidence: {result.get('confidence', 'N/A')})")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            return self._create_fallback_result(description, "JSON_PARSE_ERROR")
        
        except Exception as e:
            logger.error(f"Error classifying line item: {e}")
            return self._create_fallback_result(description, "API_ERROR")
    
    def _create_fallback_result(self, description: str, error_type: str) -> Dict:
        """Create a fallback result when classification fails"""
        return {
            "category": "OTHER",
            "confidence": 0.0,
            "reasoning": f"Classification failed due to {error_type}",
            "keywords": [],
            "timestamp": datetime.now().isoformat(),
            "model_used": self.model,
            "original_description": description,
            "error": True
        }
    
    def classify_batch(self, line_items: List[Dict]) -> List[Dict]:
        """
        Classify multiple line items in batch
        
        Args:
            line_items (List[Dict]): List of line items with 'description', optional 'amount' and 'vendor'
            
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
            
            if not description.strip():
                logger.warning(f"Empty description for item {i}, skipping")
                results.append(self._create_fallback_result("", "EMPTY_DESCRIPTION"))
                continue
            
            result = self.classify_line_item(description, amount, vendor)
            
            # Add original item data to result
            result.update({
                "item_index": i,
                "original_amount": amount,
                "original_vendor": vendor
            })
            
            results.append(result)
        
        logger.info(f"Completed batch classification. Success rate: {sum(1 for r in results if not r.get('error', False))}/{total_items}")
        
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
            filename = f"invoice_classification_results_{timestamp}.csv"
        
        # Flatten the results for CSV export
        flattened_results = []
        for result in results:
            flattened = {
                "original_description": result.get("original_description", ""),
                "category": result.get("category", ""),
                "confidence": result.get("confidence", 0),
                "reasoning": result.get("reasoning", ""),
                "keywords": ", ".join(result.get("keywords", [])),
                "amount": result.get("original_amount", ""),
                "vendor": result.get("original_vendor", ""),
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
        Generate a summary report of classification results
        
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
        
        for result in successful_classifications:
            category = result.get('category', 'OTHER')
            category_counts[category] = category_counts.get(category, 0) + 1
            confidence_scores.append(result.get('confidence', 0))
        
        summary = {
            "total_items": total_items,
            "successful_classifications": len(successful_classifications),
            "error_rate": (total_items - len(successful_classifications)) / total_items * 100 if total_items > 0 else 0,
            "average_confidence": sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0,
            "category_distribution": category_counts,
            "high_confidence_items": len([c for c in confidence_scores if c >= 0.8]),
            "low_confidence_items": len([c for c in confidence_scores if c < 0.6])
        }
        
        return summary
    
    def validate_categories(self) -> Dict[str, str]:
        """
        Return the available categories and their descriptions
        
        Returns:
            Dict[str, str]: Categories with descriptions
        """
        return self.categories.copy()


def main():
    """
    Example usage of the InvoiceLineItemClassifier
    """
    try:
        # Initialize classifier
        classifier = InvoiceLineItemClassifier()
        
        # Sample invoice line items for testing
        sample_line_items = [
            {
                "description": "Concrete mixer rental for foundation work - 3 days",
                "amount": 450.00,
                "vendor": "ALUTEMP SAS"
            },
            {
                "description": "Skilled construction workers - 40 hours labor",
                "amount": 2800.00,
                "vendor": "Labor Solutions Inc"
            },
            {
                "description": "Steel rebar 20mm diameter - 500 meters",
                "amount": 1250.00,
                "vendor": "Steel Supply Co"
            },
            {
                "description": "Electrical installation subcontractor services",
                "amount": 5600.00,
                "vendor": "ElectroWork Ltd"
            },
            {
                "description": "Office supplies and printing materials",
                "amount": 125.50,
                "vendor": "Office Depot"
            }
        ]
        
        print("=== Invoice Line Item Classification Demo ===")
        print(f"Classifying {len(sample_line_items)} line items...\n")
        
        # Classify batch of items
        results = classifier.classify_batch(sample_line_items)
        
        # Display results
        for i, result in enumerate(results):
            if not result.get('error', False):
                print(f"Item {i+1}:")
                print(f"  Description: {result['original_description']}")
                print(f"  Category: {result['category']}")
                print(f"  Confidence: {result['confidence']:.2f}")
                print(f"  Reasoning: {result['reasoning']}")
                print(f"  Keywords: {', '.join(result['keywords'])}")
                print()
            else:
                print(f"Item {i+1}: ERROR - {result['reasoning']}")
                print()
        
        # Generate summary report
        summary = classifier.generate_summary_report(results)
        print("=== Classification Summary ===")
        print(f"Total items processed: {summary['total_items']}")
        print(f"Successful classifications: {summary['successful_classifications']}")
        print(f"Average confidence: {summary['average_confidence']:.2f}")
        print(f"Category distribution: {summary['category_distribution']}")
        
        # Export results
        filename = classifier.export_results(results)
        print(f"\nResults exported to: {filename}")
        
    except ValueError as e:
        print(f"Error: {e}")
        print("\nPlease set your OpenAI API key as an environment variable:")
        print("export OPENAI_API_KEY='your-api-key-here'")
        print("\nOr create a .env file with:")
        print("OPENAI_API_KEY=your-api-key-here")


if __name__ == "__main__":
    main()