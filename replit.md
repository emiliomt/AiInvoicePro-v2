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

## User Preferences

Preferred communication style: Simple, everyday language.