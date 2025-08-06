# AI-Powered Invoice Procurement Platform

## Overview
An advanced AI-powered invoice procurement platform that leverages intelligent automation to streamline multilingual financial document processing with enhanced security and robust data extraction capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
Full-stack JavaScript application with React frontend and Express.js backend that includes:

### Core Components
- **React Frontend**: Dynamic invoice management with Tanstack Query
- **Express.js Backend**: Comprehensive security protocols and API endpoints
- **RPA System**: Python-based automated invoice downloading and processing
- **OCR Processing**: Advanced PDF and XML invoice parsing with multi-language support
- **Database**: PostgreSQL with Drizzle ORM for data persistence

### Key Features
- **Intelligent RPA Processing**: Company-based data isolation with browser automation
- **Advanced Token-Based File Matching**: PDF and XML invoice correlation
- **Multi-Language Support**: Adaptive parsing for various invoice formats
- **Comprehensive Status Tracking**: Invoice lifecycle management with duplicate detection
- **Real-Time Progress Updates**: WebSocket-based progress monitoring
- **Secure Authentication**: Token-based security with session management

### Critical System Files
- `server/services/pythonRpaService.py`: Main RPA automation engine
- `server/services/invoiceProcessingService.ts`: Invoice processing pipeline
- `server/services/ocrService.ts`: OCR and document analysis
- `shared/schema.ts`: Database models and types
- `client/src/`: React frontend components

## External Dependencies
- **AI Services**: OpenAI API for intelligent document processing
- **Database**: PostgreSQL for data persistence
- **Automation**: Playwright for browser automation
- **OCR**: Tesseract.js for text extraction
- **Document Processing**: Sharp, pdf2pic for image manipulation

## Recent Changes
- **August 2025**: Fixed critical duplicate detection issue in RPA system
  - **Root Cause**: SQL query error "too many values to unpack (expected 4)" was preventing duplicate detection from working
  - **Critical Fix**: Corrected SQL query in _is_invoice_successfully_processed method to return exactly 4 columns
  - **Status Updates**: Added proper status updates in _process_xml_for_pipeline and _process_pdf_for_pipeline methods
  - **Enhancement**: Improved vendor name normalization and filename pattern matching
  - **Verification**: Comprehensive testing confirms invoices with 'completed' status are now properly skipped
  - **Result**: RPA no longer reprocesses already imported invoices, preventing duplicates and improving efficiency
- **Database Updates**: Enhanced imported_invoices table status tracking with lifecycle management
- **Testing Completed**: Final tests confirm FELG2374 and NSX001156549 will be skipped in future runs