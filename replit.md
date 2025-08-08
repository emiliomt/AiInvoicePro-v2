# Invoice Procurement Platform - AI-Powered Automation

## Overview
An advanced AI-powered invoice procurement platform that leverages intelligent automation to streamline multilingual financial document processing with enhanced security and robust data extraction capabilities. The project aims to provide accurate and efficient processing of invoices, ensuring data integrity and enabling comprehensive financial document management. This platform addresses the need for automated, reliable handling of diverse invoice formats, reducing manual effort and improving accuracy in financial operations.

## User Preferences
- Focus on business logic accuracy over UI polish
- Prioritize data integrity and validation correctness
- Use comprehensive logging for debugging validation issues
- Maintain clear error reporting for failed validations

## System Architecture
The platform is built with a React frontend, an Express.js backend, and a PostgreSQL database. UI/UX utilizes Tailwind CSS and shadcn/ui components. Core architectural decisions include robust token-based file matching for PDF and XML invoices, a real-time validation system with database-driven rules, and multi-language invoice processing with adaptive parsing. Authentication is handled via Replit Auth. AI extraction is performed using OpenAI, and OCR with Tesseract.js. The validation system is extensible, allowing new rule types and storing results as structured JSONB for detailed analysis. Critical business rules, such as NIT validation, are enforced with high severity. Duplicate invoice detection is robust, normalizing invoice numbers and vendor names, and checking against existing records to prevent re-processing. The system ensures accurate invoice counting by distinguishing between unique invoices and associated reference files. Buyer tax ID extraction is comprehensive, handling various XML formats including those embedded in CDATA sections.

## External Dependencies
- **Frontend Framework**: React
- **UI Components**: Tailwind CSS, shadcn/ui
- **Backend Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Authentication**: Replit Auth
- **OCR**: Tesseract.js
- **AI Extraction**: OpenAI
- **Browser Automation**: Playwright
- **Data Management**: Tanstack Query