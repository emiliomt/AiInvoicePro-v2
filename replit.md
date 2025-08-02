# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform designed to streamline invoice processing and procurement management. It automates data extraction, validation, and workflow, reducing manual errors and enhancing efficiency. The platform aims to be a comprehensive solution for managing invoices from upload to approval, incorporating advanced AI and RPA capabilities for a seamless user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Design Principles
The system is built as a full-stack web application with a React frontend and Node.js/Express.js backend, prioritizing scalability, maintainability, and a responsive user experience. Key architectural decisions include:
- **Modular Design**: Separation of concerns between frontend and backend, with clear API contracts.
- **Data Integrity**: Robust database design with PostgreSQL and Drizzle ORM ensures data consistency.
- **AI-Driven Automation**: Integration of AI for OCR and data extraction, and RPA for automated invoice import.
- **Configurable Workflows**: Rule-based validation and approval processes to adapt to various business needs.
- **Real-time Feedback**: WebSocket integration for live progress tracking and immediate user feedback.

### Frontend
- **Technology Stack**: React 18 with TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Wouter, React Hook Form with Zod.
- **UI/UX**: Focus on intuitive design with a clean aesthetic. Components are built using shadcn/ui for consistency and accessibility. Dashboard provides real-time statistics, while dedicated modules manage invoices, approvals, PO matching, and configurations.
- **Mobile Responsiveness**: Optimized for mobile devices, including iPhone-specific enhancements for navigation and touch interactions.

### Backend
- **Technology Stack**: Node.js with Express.js, TypeScript, PostgreSQL with Drizzle ORM.
- **Core Services**:
    - **AI-Powered Processing Pipeline**: Orchestrates OCR (Tesseract.js), AI data extraction (OpenAI GPT), rule-based validation, discrepancy detection, and predictive analytics.
    - **RPA Invoice Importer**: Python-based service for automated invoice downloading from ERP systems, featuring real-time console views, progress tracking, and configurable import settings.
- **Authentication & Security**: Replit Auth integration, session-based authentication, and robust middleware for API route protection and file upload security.
- **Data Flow**: Secure invoice upload, background OCR processing, AI extraction, validation, PO matching, approval routing, and auditable storage.

### Database Design
- **PostgreSQL**: Primary data store with entities for Users, Sessions, Invoices, Line Items, Purchase Orders, Projects, Validation Rules, Approvals, Flags & Alerts.
- **Schema Management**: Drizzle ORM for type-safe database interactions and schema migrations.
- **Multi-tenancy**: Comprehensive company-based data sharing and isolation across all major entities.

## External Dependencies
- **Database**: Neon PostgreSQL (serverless)
- **AI Services**: OpenAI API (for intelligent data extraction)
- **Authentication**: Replit Auth service (OpenID Connect)
- **File Processing**: Tesseract.js (OCR), PDF.js (PDF rendering), Sharp (image processing)
- **UI Components**: Radix UI primitives via shadcn/ui
- **Development Tools**: TypeScript, Drizzle Kit, ESBuild, Vite