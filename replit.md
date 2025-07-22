# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview

InvoicePro is a comprehensive invoice processing and procurement management platform that leverages AI-powered OCR, automated data extraction, and intelligent validation workflows. The system is built as a full-stack web application with React frontend and Express.js backend, designed to streamline invoice approval processes and reduce manual data entry errors.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth with session-based authentication
- **File Processing**: Multer for uploads, Tesseract.js for OCR
- **AI Integration**: OpenAI API for intelligent data extraction

### Database Design
The system uses PostgreSQL with the following key entities:
- **Users**: Authentication and profile management (required for Replit Auth)
- **Sessions**: Session storage (required for Replit Auth)
- **Invoices**: Core invoice data with extracted information
- **Line Items**: Individual invoice line items
- **Purchase Orders**: PO management and matching
- **Projects**: Project validation and assignment
- **Validation Rules**: Configurable business rules
- **Approvals**: Workflow and approval tracking
- **Flags & Alerts**: Discrepancy detection and predictive analytics

## Key Components

### AI-Powered Processing Pipeline
1. **OCR Service**: Tesseract.js processes PDF/image invoices
2. **AI Extraction**: OpenAI GPT extracts structured data from OCR text
3. **Validation Engine**: Rule-based validation with configurable business rules
4. **Discrepancy Detection**: Automated flagging of potential issues
5. **Predictive Analytics**: ML-based issue prediction and alerts

### Authentication & Security
- Replit Auth integration with OpenID Connect
- Session-based authentication with PostgreSQL session store
- Protected API routes with middleware validation
- File upload security with type and size restrictions

### Data Processing Workflow
1. Invoice upload (PDF/JPG/PNG)
2. OCR text extraction
3. AI-powered data extraction
4. Validation rule application
5. PO matching and project assignment
6. Approval workflow routing
7. Discrepancy flagging and resolution

### User Interface Components
- **Dashboard**: Real-time stats and processing overview
- **Invoice Management**: Upload, preview, and data extraction
- **Approval Workflow**: Multi-stage approval process
- **PO Matching**: Automated and manual purchase order matching
- **Project Validation**: Project assignment and validation
- **Reporting**: Analytics and trend analysis
- **Configuration**: Validation rules and system settings

## Data Flow

1. **Invoice Upload**: Files processed through secure upload endpoint
2. **OCR Processing**: Background processing with status updates
3. **AI Extraction**: Structured data extraction with confidence scoring
4. **Validation**: Rule-based validation with flag generation
5. **Matching**: Automatic PO matching and project assignment
6. **Approval**: Workflow routing based on business rules
7. **Storage**: Processed data stored with audit trail

## External Dependencies

### Core Dependencies
- **Database**: Neon PostgreSQL (serverless)
- **AI Services**: OpenAI API for data extraction
- **Authentication**: Replit Auth service
- **File Processing**: PDF.js, Tesseract.js, Sharp for image processing
- **UI Components**: Radix UI primitives via shadcn/ui

### Development Tools
- **TypeScript**: Type safety across the stack
- **Drizzle Kit**: Database migrations and schema management
- **ESBuild**: Production bundling for server code
- **Vite**: Frontend development and bundling

## Deployment Strategy

### Environment Configuration
- **Development**: `npm run dev` - Concurrent frontend/backend development
- **Production**: `npm run build && npm run start` - Optimized build deployment
- **Database**: Drizzle push for schema updates

### Replit Deployment
- **Platform**: Replit autoscale deployment
- **Modules**: Node.js 20, Web, PostgreSQL 16
- **Build Process**: Vite build + ESBuild server bundling
- **Port Configuration**: Internal 5000, External 80

### Key Configuration Files
- **drizzle.config.ts**: Database configuration and migrations
- **vite.config.ts**: Frontend build configuration with path aliases
- **tsconfig.json**: TypeScript configuration for monorepo structure
- **.replit**: Replit-specific deployment configuration

## Changelog
- June 13, 2025. Initial setup
- June 23, 2025. Added verified invoices system: automatic validation processing moves approved invoices to verified status when they pass validation criteria, displayed in Unresolved Invoice-PO Matches section
- June 26, 2025. Added modular ERP automation platform: AI-powered RPA system with natural language task input, ChatGPT script generation, Playwright browser automation, secure credential management, and real-time task monitoring
- June 27, 2025. Implemented real-time progress tracking system: WebSocket-based live updates during ERP automation tasks, step-by-step progress display with screenshots, enhanced user feedback with comprehensive progress monitoring UI component
- January 02, 2025. Enhanced invoice-PO matching status tracking: Added comprehensive timestamp tracking for match events including matchedAt, approvedAt, rejectedAt timestamps, status change tracking with user attribution, real-time activity feed showing recent match events, detailed status timeline in PO matching interface displaying when matches occur and their approval/rejection history
- January 02, 2025. Optimized RPA system performance: Reduced timeout bottlenecks by 60%, implemented smart selector fallbacks with priority queues, added browser performance optimizations including resource blocking and smaller viewport rendering, reduced step execution times from 5-minute to 2-minute maximums, optimized wait times and eliminated excessive delays that caused system hanging
- January 02, 2025. Enhanced multi-tenant database sharing: Completed implementation of company-based data sharing where users within the same organization can access shared invoices, purchase orders, and project data, added comprehensive database filtering by companyId across all major entities, updated API routes to support company-based data isolation, fixed database schema inconsistencies and added missing timestamp tracking fields for invoice-PO matching system
- January 02, 2025. Added automation workflow saving and scheduling: Implemented saved workflows feature allowing users to save automation tasks for future reuse, created scheduled tasks system with cron-based execution, added node-cron scheduler service for automated task execution, enhanced ERP automation interface with "Save Task" button, built comprehensive API routes for workflow and task management with multi-tenant support
- January 02, 2025. Created ERP Invoice Importer module: Built comprehensive RPA-based invoice importing system with configurable file types (XML/PDF/Both), multiple scheduling options (once/daily/weekly/hourly/multiple daily), real-time progress tracking with step-by-step execution monitoring, multi-tenant import configurations, complete database schema for import logs and metadata, and integrated into ERP Automation navigation menu
- January 07, 2025. Enhanced Invoice Importer with real-time progress visualization: Created comprehensive progress tracker component with live step-by-step updates, execution metrics display (processed/successful/failed invoices), screenshot gallery, detailed error reporting, progress bar visualization, real-time polling system, and enhanced logging with structured step tracking for better user feedback during import processes
- January 13, 2025. Added iPhone-optimized mobile menu: Implemented responsive mobile navigation with hamburger menu, slide-out sheet interface, organized sections for all app features, enhanced touch targets (44px minimum), iOS-specific optimizations including webkit zoom prevention, smooth scrolling, and tap highlighting improvements, WebSocket connection status indicator, and mobile-first design patterns
- January 15, 2025. Enhanced XML invoice processing: Improved AI extraction for XML invoices with specialized XML parsing prompts, better field mapping for electronic invoice formats, increased XML content truncation limit to 8000 characters, and added XML detection logic to differentiate between OCR and XML processing for better extraction accuracy
- January 16, 2025. Fixed XML subtotal extraction issue: Enhanced XML parser with comprehensive fallback patterns for subtotal extraction, added alternative patterns for TaxExclusiveAmount/LineExtensionAmount/TaxableAmount, improved calculation logic for missing subtotal values, fixed TypeScript compilation errors with ES2018 features, and added extensive debugging for XML parsing to resolve "N/A" subtotal values
- January 16, 2025. Fixed application startup error: Resolved "Cannot access 'processInvoiceWrapper' before initialization" error in invoice upload processing by removing wrapper function scope issue in setImmediate callback, ensuring proper function accessibility and preventing server crashes during invoice processing initialization
- January 16, 2025. Enhanced application stability: Fixed recurring crash issues by completing incomplete project validation endpoint, removing orphaned code fragments causing syntax errors, and implementing timeout protection for database operations in user settings routes to prevent hanging operations that could cause memory exhaustion
- January 17, 2025. Added invoice upload functionality: Implemented upload button in Invoices page header with support for PDF, XML, JPG, JPEG, and PNG files, multiple file uploads, real-time upload status, and automatic page refresh after successful upload
- January 17, 2025. Fixed application crash: Resolved syntax errors in server/routes.ts caused by incomplete code blocks and duplicate closing braces, ensuring proper invoice upload handler completion and preventing server startup failures
- January 17, 2025. Fixed LearningTracker crash: Added error handling around LearningTracker.recordFeedback method call to prevent application crashes during feedback submission, ensuring stable operation when Colombian invoice processing encounters learning system issues
- January 22, 2025. Fixed Invoice Importer execution and storage issues: Resolved missing storage interface methods causing "function not defined" errors, fixed user access control preventing configuration execution, added proper cascade deletion for foreign key constraints, completed database schema with headless column for Chrome browser control, and enabled both headless and visible browser modes for Python RPA automation
- January 22, 2025. Fixed application crash in TopIssuesWidget: Added null/undefined checks in getTrendIcon and getTrendColor functions to prevent "Cannot read properties of undefined (reading 'startsWith')" error when trend data is missing

## User Preferences

Preferred communication style: Simple, everyday language.