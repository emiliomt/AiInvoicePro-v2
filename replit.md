# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform for invoice processing and procurement management. It streamlines invoice approval and reduces manual data entry using AI-powered OCR, automated data extraction, and intelligent validation workflows. The system aims to provide a comprehensive solution for efficient invoice management, enhancing business operations and reducing errors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
InvoicePro is built as a full-stack web application.

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (session-based)
- **File Processing**: Multer for uploads, Tesseract.js for OCR
- **AI Integration**: OpenAI API for intelligent data extraction

### Database Design
The system utilizes PostgreSQL for data storage, including entities for Users, Sessions, Invoices, Line Items, Purchase Orders, Projects, Validation Rules, Approvals, and Flags & Alerts.

### Key Components & Features
- **AI-Powered Processing Pipeline**: Includes OCR, AI extraction (OpenAI GPT), rule-based validation, discrepancy detection, and predictive analytics.
- **RPA Invoice Importer**: Python-based service for automated invoice downloading from ERP systems, featuring real-time console view, progress tracking, and configuration management.
- **Authentication & Security**: Replit Auth integration, session-based authentication, protected API routes, and file upload security.
- **Data Processing Workflow**: Covers invoice upload, OCR, AI extraction, validation, PO matching, project assignment, approval routing, discrepancy flagging, and data storage.
- **User Interface Components**: Dashboard, Invoice Management, Approval Workflow, PO Matching, Project Validation, Reporting, and Configuration sections.

## External Dependencies

### Core Dependencies
- **Database**: Neon PostgreSQL
- **AI Services**: OpenAI API
- **Authentication**: Replit Auth
- **File Processing**: PDF.js, Tesseract.js, Sharp
- **UI Components**: Radix UI primitives via shadcn/ui

### Development Tools
- **TypeScript**: For type safety.
- **Drizzle Kit**: For database migrations.
- **ESBuild**: For server code bundling.
- **Vite**: For frontend development and bundling.