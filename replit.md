# AnzuDynamics Invoice Procurement Platform

## Overview
An advanced AI-powered invoice procurement platform that leverages intelligent automation to streamline multilingual financial document processing with enhanced security and robust data extraction capabilities. The platform now features a comprehensive binary Pass/Fail validation system specifically tailored for Colombian business requirements, replacing ambiguous "Pending" statuses with clear, actionable validation results.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
A comprehensive full-stack invoice procurement platform built with React frontend, Express.js backend, and PostgreSQL database. The system includes advanced RPA automation, AI-powered processing, and comprehensive validation capabilities.

### Core Components
- **React Frontend**: Dynamic invoice management interface with Tanstack Query
- **Express.js Backend**: RESTful API with comprehensive security protocols
- **PostgreSQL Database**: Robust data persistence with Drizzle ORM
- **Binary Validation System**: Pass/Fail validation engine with Colombian business rules
- **RPA Automation**: Playwright-based browser automation for reliable data extraction
- **AI Processing**: OpenAI integration for invoice data extraction and classification

### Key Features
- **Binary Validation**: Clear Pass/Fail status with specific failure reasons and action items
- **Colombian Business Rules**: COP currency handling, NIT validation, approval thresholds
- **Multi-language Processing**: Adaptive parsing for different invoice formats
- **Token-based Matching**: Advanced PDF and XML invoice matching algorithms
- **Company-based Isolation**: Multi-tenant architecture with data segregation
- **Comprehensive Tracking**: Invoice status monitoring and duplicate detection

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
- **August 2025**: Implemented comprehensive binary Pass/Fail validation system
- **Database Schema**: Added validation_status, validation_score, validated_at columns to invoices table
- **Validation Service**: Created InvoiceValidator class with Colombian business rules
- **API Endpoints**: Added validation APIs for single and batch processing
- **Colombian Rules**: Implemented COP currency handling, NIT validation, approval thresholds
- **Testing**: Created comprehensive validation tests demonstrating binary logic
- **Documentation**: Generated detailed validation system documentation