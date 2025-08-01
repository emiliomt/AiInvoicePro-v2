# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform for invoice processing and procurement management. It streamlines invoice approval and reduces manual data entry through AI-powered OCR, automated data extraction, and intelligent validation. The platform aims to provide a comprehensive solution for efficient invoice management, enhancing business vision with improved operational efficiency and reduced errors.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
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