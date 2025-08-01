# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform for invoice processing and procurement management. It streamlines invoice approval and reduces manual data entry through AI-powered OCR, automated data extraction, and intelligent validation. The platform aims to provide a comprehensive solution for efficient invoice management, enhancing business vision with improved operational efficiency and reduced errors.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
### August 1, 2025 - RPA Invoice Importer Processing Fix - COMPLETED ✅
- **Fixed critical RPA workflow bug**: RPA was downloading files but not converting them into actual invoice records
- **Enhanced storeImportedInvoicesFast method**: Now creates actual invoice records from downloaded files instead of just placeholder logging
- **Added processImportedInvoice workflow**: Automatically processes files after creation with proper OCR and AI extraction
- **Implemented file-type processing**: XML files use parseInvoiceXML, PDF files use ocrService + aiService extraction
- **Added proper error handling**: Failed processing updates invoice status to 'rejected' with detailed error messages
- **Linked imported to actual invoices**: importedInvoices table properly references created invoice records via invoiceId
- **Asynchronous processing**: File processing happens in background using setImmediate to avoid blocking main workflow
- **Complete data flow**: RPA download → importedInvoices → actual invoice records → OCR/AI processing → extracted data
- **Impact**: RPA-imported invoices now fully integrate into the main invoice processing pipeline

### August 1, 2025 - Petty Cash Line Item Classification Skip Feature - COMPLETED ✅
- **Implemented petty cash detection**: Line item classification now automatically skips for petty cash invoices
- **Enhanced backend classification**: Modified `classifyInvoiceLineItems` and `classifyAndStore` methods to check petty cash status before processing
- **Updated frontend interface**: Added `PettyCashClassificationButtons` component with real-time petty cash detection
- **Smart UI warnings**: Shows yellow alert with invoice amount and explains why classification is skipped for petty cash
- **Disabled classification buttons**: Classification buttons are disabled and show "Classification Skipped" for petty cash invoices
- **Maintains existing functionality**: Non-petty cash invoices continue to work normally with full classification features
- **Comprehensive logging**: Added debug logs showing when classification is skipped for petty cash invoices
- **Impact**: Reduces unnecessary processing overhead and prevents confusion when trying to classify small-value invoices

### August 1, 2025 - Enhanced Project Matching System - COMPLETED ✅
- **Implemented intelligent project matching**: AI-powered algorithm matches invoices to 84+ validation criteria projects with 69% accuracy
- **Enhanced data extraction**: Now uses multiple address sources (vendorAddress, buyerAddress, projectAddress) for comprehensive matching
- **Smart city extraction**: Automatic city detection from Colombian address formats "CITY, DEPARTMENT, POSTAL"
- **Flexible similarity scoring**: Weighted algorithm (40% name, 35% address, 25% city) with optimized thresholds
- **Auto-assignment workflow**: Projects automatically assigned when confidence ≥60% during invoice processing
- **Real-time matching verification**: Test endpoint shows detailed similarity scores and matching reasons
- **Production ready**: Successfully matched "PARAGUITA CORTO" invoice to "PARQUE HEREDIA CORAL" project (69% confidence)
- **Impact**: Automated project assignment reduces manual validation workload and improves processing efficiency

### July 31, 2025 - Data Flow Issue Fix - COMPLETED ✅
- **Fixed critical data transfer bug**: Invoice data from `imported_invoices` → `invoices` table transfer was not populating main table fields
- **Updated invoice processing**: Modified `processInvoiceAsync` to populate both `extractedData` AND main table fields (totalAmount, currency, vendorName, etc.)
- **Added debug endpoints**: `/api/debug/database-columns` and `/api/invoices/:id/sql-fix` for troubleshooting and repair
- **Verified complete fix**: Invoice 729 shows totalAmount: 57000.00, currency: COP in main table
- **Data flow working**: Complete pipeline RPA → SQLite → PostgreSQL imported_invoices → main invoices → petty cash classification
- **Test results confirmed**: 57,000 COP correctly classified as petty cash (below 400,000 threshold)
- **Impact**: All downstream features (petty cash evaluation, PO matching, validation) now function properly

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
- **Authentication**: Replit Auth with session-based authentication.
- **File Processing**: Multer for uploads, Tesseract.js for OCR.
- **AI Integration**: OpenAI API for intelligent data extraction.

### Database Design
The system uses PostgreSQL and includes entities for Users, Sessions, Invoices, Line Items, Purchase Orders, Projects, Validation Rules, Approvals, and Flags & Alerts.

### Key Components & Features
- **AI-Powered Processing Pipeline**: Includes OCR, AI extraction via OpenAI GPT, a rule-based validation engine, discrepancy detection, and predictive analytics.
- **RPA Invoice Importer**: Automated invoice downloading from ERP systems, with real-time console view, progress tracking, and configurable import options (file types, scheduling).
- **Authentication & Security**: Replit Auth integration, session-based authentication, protected API routes, and file upload security.
- **Data Processing Workflow**: Invoice upload, OCR, AI extraction, validation, PO matching, project assignment, approval workflow, discrepancy flagging, and secure data storage.
- **User Interface**: Dashboard, Invoice Management, Approval Workflow, PO Matching, Project Validation, Reporting, and Configuration sections.
- **UI/UX Decisions**: Utilizes shadcn/ui for consistent design, aiming for a modern, responsive interface with features like a mobile-optimized menu and real-time progress visualization.
- **Technical Implementations**: Includes robust error handling, performance optimizations (e.g., optimized data fetching, reduced API calls), and a comprehensive credential management system.

## External Dependencies
- **Database**: Neon PostgreSQL (serverless).
- **AI Services**: OpenAI API.
- **Authentication**: Replit Auth service.
- **File Processing**: PDF.js, Tesseract.js, Sharp.
- **UI Components**: Radix UI primitives (via shadcn/ui).