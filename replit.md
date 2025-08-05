# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform for invoice processing and procurement management. It streamlines invoice approval and reduces manual data entry through AI-powered OCR, automated data extraction, and intelligent validation. The platform aims to provide a comprehensive solution for efficient invoice management, enhancing business vision with improved operational efficiency and reduced errors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
InvoicePro is built as a full-stack web application.

### Frontend
- **Framework**: React 18 with TypeScript.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query.
- **Routing**: Wouter.
- **Form Handling**: React Hook Form with Zod.
- **Build Tool**: Vite.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ESM.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Replit Auth with session-based authentication and Passport.js.
- **File Processing**: Multer for uploads, Tesseract.js for OCR.
- **AI Integration**: OpenAI API for intelligent data extraction.
- **Process Automation**: Enhanced Python-based workflow engine with fallback mechanisms and extended timeout support (4-minute processing windows).
- **XML Processing**: Advanced XML2JS-based parser with UBL format support and Colombian tax validation.

### Database Design
The system uses PostgreSQL and includes entities for Users, Sessions, Invoices, Line Items, Purchase Orders, Projects, Validation Rules, Approvals, and Flags & Alerts.

### Key Components & Features
- **AI-Powered Processing Pipeline**: Includes OCR, AI extraction via OpenAI GPT with fallback mechanisms, a rule-based validation engine, discrepancy detection, and predictive analytics.
- **Enhanced RPA Invoice Importer**: Automated invoice downloading from ERP systems with improved retry logic, real-time WebSocket progress tracking, batch processing, and comprehensive error handling.
- **XML Invoice Extraction System** (New - Jan 2025): Advanced XML parser for UBL Invoice format with Colombian specifications, including AttachedDocument wrapper detection, multi-namespace support, Colombian NIT validation with check digit verification, enhanced amount parsing with currency handling, and AI extraction fallback for non-XML content.
- **Enhanced Timeout Management**: Fixed processing timeout issues by rebuilding corrupted pythonRpaService.ts, increasing Python script timeout from 20 seconds to 4 minutes, and adding multiple timeout protection layers with proper error handling.
- **Authentication & Security**: Replit Auth integration with Passport.js, session-based authentication with proper claims extraction, protected API routes, and file upload security.
- **Data Processing Workflow**: Invoice upload, OCR, AI extraction with fallbacks, validation, PO matching, project assignment, approval workflow, discrepancy flagging, and secure data storage.
- **Real-time Progress Tracking**: WebSocket-based progress updates with connection management, task completion notifications, and timeout handling.
- **User Interface**: Dashboard, Invoice Management, Approval Workflow, PO Matching, Project Validation, Reporting, and Configuration sections with proper user information display.
- **UI/UX Decisions**: Utilizes shadcn/ui for consistent design, aiming for a modern, responsive interface with features like a mobile-optimized menu and real-time progress visualization.
- **Technical Implementations**: Includes robust error handling, performance optimizations (batch processing, reduced API calls), comprehensive credential management, and enhanced database schema synchronization.

## External Dependencies
- **Database**: Neon PostgreSQL (serverless).
- **AI Services**: OpenAI API.
- **Authentication**: Replit Auth service.
- **File Processing**: PDF.js, Tesseract.js, Sharp, XML2JS for structured document parsing.
- **UI Components**: Radix UI primitives (via shadcn/ui).

## Recent Changes (January 2025)

### Timeout Resolution & XML Processing System
- **Fixed processing timeout issues**: Rebuilt corrupted `pythonRpaService.ts` file with proper class structure and increased timeout from 20 seconds to 240 seconds (4 minutes)
- **Implemented XML Invoice Extraction System**: Created comprehensive XML parser with UBL format support, Colombian NIT validation, and AI extraction fallback
- **Added new API endpoints**:
  - `POST /api/rpa/process-xml` - Process individual XML invoice files
  - `POST /api/invoices/python-rpa-process` - Direct Python RPA processing with extended timeout
  - `POST /api/rpa/process-xml-batch` - Batch XML processing with progress tracking
  - `GET /api/rpa/test-environment` - Test Python RPA environment
  - `GET /api/rpa/progress/:taskId` - Get RPA processing progress
- **Enhanced error handling**: Added TypeScript-compatible error handling throughout the system
- **Performance improvements**: Multiple timeout protection layers and better error recovery mechanisms

### XML Parser Features
- **UBL Invoice format support** with Colombian specifications
- **AttachedDocument wrapper detection** and CDATA extraction
- **Multi-namespace support** (cac, cbc, Invoice, CreditNote)
- **Colombian NIT validation** with check digit verification
- **Enhanced amount parsing** with currency handling (default: COP)
- **Project name extraction** from multiple XML sources with pattern matching
- **Line item processing** with classification support
- **95% confidence score** for XML parsing vs 85% for AI extraction fallback

### System Architecture Updates
- **Improved timeout management**: 4-minute Python script timeout with 4.5-minute API timeout
- **Enhanced progress tracking**: Real-time WebSocket updates for XML processing workflows
- **Better error recovery**: Fallback from XML parsing to AI extraction to manual processing
- **Database integration**: Automatic invoice storage with extracted data and line items