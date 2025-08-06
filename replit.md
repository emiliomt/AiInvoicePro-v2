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
- **August 2025**: SUCCESSFULLY RESOLVED critical RPA duplicate processing issues
  - **Issue #1 - Duplicate Detection**: Fixed SQL query error preventing duplicate detection entirely
    - Root cause: Query returned 5 columns but code expected 4, completely breaking duplicate checking
    - **CRITICAL FIX**: Moved duplicate checking BEFORE ZIP download to prevent unnecessary downloads
    - **Result**: Invoices with 'completed' status (like FELG2374, NSX001156549) now skipped before download
  - **Issue #2 - Double Counting**: Fixed invoice counting logic that inflated statistics
    - Root cause: XML and PDF files counted separately instead of as one unique invoice
    - **CRITICAL FIX**: Changed from total_processing_items (file count) to total_unique_invoices (invoice count)
    - **Result**: Progress shows correct unique invoice processing, not inflated file counts
  - **Verification**: Comprehensive testing confirms both fixes work correctly
    - Simulation shows FELG2374 and NSX001156549 properly skipped before download
    - Counting logic correctly identifies unique invoices vs individual files
  - **Performance Impact**: Eliminates unnecessary ZIP downloads and prevents duplicate reprocessing
- **Database Updates**: Enhanced imported_invoices table status tracking with lifecycle management
- **RPA Efficiency**: System now processes only genuinely new invoices, skipping completed ones entirely