# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform for invoice processing and procurement management. It streamlines invoice approval and reduces manual data entry through AI-powered OCR, automated data extraction, and intelligent validation. The platform aims to provide a comprehensive solution for efficient invoice management, enhancing business vision with improved operational efficiency and reduced errors.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
### July 31, 2025 - Critical Invoice Data Storage Fix
- **Fixed urgent bug**: Invoice data was being stored in `extractedData` JSON field but not in main table columns
- **Updated invoice processing**: Modified `processInvoiceAsync` to populate both `extractedData` AND main table fields (totalAmount, currency, vendorName, etc.)
- **Added repair endpoints**: Created force repair functionality for existing invoices with missing main field data
- **Resolved storage errors**: Fixed LSP diagnostics in storage.ts including duplicate functions and column reference issues
- **Verified fix**: Invoice 729 now correctly shows totalAmount: 57000.00, currency: COP
- **Impact**: Petty cash classification and all features depending on main table fields now work correctly

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