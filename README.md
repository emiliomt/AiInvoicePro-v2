# Invoice Line Item Classifier

An advanced Python application for automated invoice line item classification using OpenAI's GPT-4 API. This tool helps categorize invoice descriptions into predefined business expense categories with confidence scores and detailed reasoning.

## Features

- **AI-Powered Classification**: Uses OpenAI GPT-4 for intelligent categorization
- **Predefined Categories**: 12 standard business expense categories
- **Confidence Scoring**: Returns confidence levels (0.0-1.0) for each classification
- **Batch Processing**: Handle multiple invoice items simultaneously
- **Detailed Results**: Includes reasoning and keywords for each classification
- **Export Functionality**: Save results to CSV format
- **Summary Reports**: Generate classification statistics and distribution reports
- **Error Handling**: Robust error handling with fallback responses

## Categories

The system classifies expenses into these categories:

- **LABOR**: Direct labor costs including wages, salaries, overtime
- **MATERIALS**: Raw materials, supplies, components, and physical goods
- **EQUIPMENT**: Machinery, tools, vehicles, and equipment purchases/rentals
- **SERVICES**: Professional services, consulting, maintenance, repairs
- **UTILITIES**: Electricity, water, gas, telecommunications
- **TRAVEL**: Transportation, accommodation, meals, travel expenses
- **OFFICE_SUPPLIES**: Stationery, office equipment, software licenses
- **RENT_FACILITIES**: Facility rent, property leases, real estate expenses
- **INSURANCE**: Insurance premiums, coverage, risk management
- **TAXES_FEES**: Government taxes, permits, licenses, regulatory fees
- **SUBCONTRACTOR**: Third-party contractor and subcontractor payments
- **OTHER**: Expenses that don't fit into standard categories

## Installation

1. Install required dependencies:
```bash
pip install openai pandas python-dotenv
```

2. Set up your OpenAI API key:
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
```

Or create a `.env` file:
```
OPENAI_API_KEY=your-openai-api-key-here
```

## Usage

### Basic Usage

```python
from invoice_classifier import InvoiceLineItemClassifier

# Initialize the classifier
classifier = InvoiceLineItemClassifier()

# Classify a single item
result = classifier.classify_line_item(
    description="Concrete mixer rental for foundation work - 3 days",
    amount=450.00,
    vendor="Equipment Rentals Inc"
)

print(f"Category: {result['category']}")
print(f"Confidence: {result['confidence']}")
print(f"Reasoning: {result['reasoning']}")
```

### Batch Processing

```python
# Sample invoice line items
line_items = [
    {
        "description": "Skilled construction workers - 40 hours labor",
        "amount": 2800.00,
        "vendor": "Labor Solutions Inc"
    },
    {
        "description": "Steel rebar 20mm diameter - 500 meters",
        "amount": 1250.00,
        "vendor": "Steel Supply Co"
    }
]

# Classify batch
results = classifier.classify_batch(line_items)

# Generate summary report
summary = classifier.generate_summary_report(results)
print(f"Average confidence: {summary['average_confidence']:.2f}")

# Export results
filename = classifier.export_results(results)
print(f"Results saved to: {filename}")
```

## Example Scripts

### Run the Demo
```bash
python invoice_classifier.py
```

### Run Extended Examples
```bash
python example_usage.py
```

### Using Sample Data
```bash
python -c "
import json
from invoice_classifier import InvoiceLineItemClassifier

with open('sample_invoice_data.json', 'r') as f:
    data = json.load(f)

classifier = InvoiceLineItemClassifier()
results = classifier.classify_batch(data['line_items'])
classifier.export_results(results, 'sample_results.csv')
"
```

## API Reference

### InvoiceLineItemClassifier

#### Methods

- `__init__(api_key=None, model="gpt-4")`: Initialize classifier
- `classify_line_item(description, amount=None, vendor=None)`: Classify single item
- `classify_batch(line_items)`: Classify multiple items
- `export_results(results, filename=None)`: Export to CSV
- `generate_summary_report(results)`: Generate statistics
- `validate_categories()`: Get available categories

#### Response Format

```python
{
    "category": "EQUIPMENT",
    "confidence": 0.95,
    "reasoning": "Item clearly describes equipment rental for construction work",
    "keywords": ["concrete", "mixer", "rental", "foundation"],
    "timestamp": "2024-01-15T10:30:00",
    "model_used": "gpt-4",
    "original_description": "Concrete mixer rental for foundation work - 3 days"
}
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: Model to use (default: gpt-4)
- `LOG_LEVEL`: Logging level (default: INFO)

### Model Options

- `gpt-4`: Most accurate, higher cost
- `gpt-3.5-turbo`: Faster, lower cost, slightly less accurate

## Error Handling

The system includes comprehensive error handling:

- **API Errors**: Network issues, rate limits, invalid keys
- **JSON Parsing**: Malformed responses from OpenAI
- **Empty Descriptions**: Blank or whitespace-only descriptions
- **Invalid Categories**: Unknown categories are mapped to "OTHER"

All errors return a fallback result with error information.

## Performance Notes

- **Rate Limits**: Respects OpenAI API rate limits
- **Batch Processing**: Processes items sequentially to avoid rate limiting
- **Temperature**: Uses low temperature (0.1) for consistent results
- **Token Usage**: Optimized prompts to minimize token consumption

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
1. Check the error logs for API key and connection issues
2. Verify your OpenAI API key has sufficient credits
3. Review the sample data format for proper input structure