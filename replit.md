# Invoice Line Item Classifier - AI-Powered Classification System

## Overview
The Invoice Line Item Classifier is a Python application that uses OpenAI's GPT-4 API to automatically categorize invoice descriptions into predefined business expense categories. This tool helps organizations classify expenses with confidence scores and detailed reasoning, supporting both single-item and batch processing capabilities. The system provides comprehensive error handling, CSV export functionality, and detailed reporting features.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The Invoice Line Item Classifier is a standalone Python application that leverages OpenAI's GPT-4 API for intelligent expense categorization. The system includes:

### Core Components
- **InvoiceLineItemClassifier**: Main classification engine using OpenAI GPT-4
- **Classification Categories**: 12 predefined business expense categories (LABOR, MATERIALS, EQUIPMENT, etc.)
- **Batch Processing**: Handle multiple invoice items simultaneously
- **Export System**: CSV export functionality with comprehensive data formatting
- **Error Handling**: Robust fallback mechanisms for API failures

### Key Features
- **AI-Powered Classification**: Uses OpenAI GPT-4 for intelligent categorization
- **Confidence Scoring**: Returns confidence levels (0.0-1.0) for each classification
- **Detailed Results**: Includes reasoning and keywords for each classification
- **Summary Reports**: Generate classification statistics and distribution reports
- **Environment Configuration**: Support for .env files and environment variables

### Files Structure
- `invoice_classifier.py`: Main classifier implementation
- `example_usage.py`: Comprehensive usage examples
- `test_classifier.py`: Test suite with mocked API responses
- `sample_invoice_data.json`: Sample data for testing
- `.env.example`: Environment configuration template
- `README.md`: Comprehensive documentation

## External Dependencies
*   **AI Services**: OpenAI API (GPT-4 for classification)
*   **Python Libraries**: 
    - openai>=1.98.0 (OpenAI API client)
    - pandas>=2.3.1 (Data processing and CSV export)
    - python-dotenv>=1.0.0 (Environment variable management)
    - typing-extensions>=4.0.0 (Type annotations support)

## Recent Changes
- **January 2025**: Created standalone Python invoice classification application
- **Core Features**: Implemented AI-powered classification with 12 expense categories
- **Testing**: Added comprehensive test suite with mocked API responses
- **Documentation**: Created detailed README and usage examples
- **Sample Data**: Provided sample invoice data for testing and demonstration