# Invoice Procurement Platform - AI-Powered Automation

## Overview
This project is an advanced AI-powered invoice procurement platform designed to streamline multilingual financial document processing. Its core purpose is to automate and secure the handling of diverse financial documents, improving efficiency and data accuracy for businesses through intelligent automation, enhanced security, and robust data extraction capabilities.

## User Preferences
- Focus on business logic accuracy over UI polish
- Prioritize data integrity and validation correctness
- Use comprehensive logging for debugging validation issues
- Maintain clear error reporting for failed validations

## System Architecture
The platform is built with a microservices-oriented approach, emphasizing modularity and scalability.

**Technical Implementations & Feature Specifications:**
- **Invoice Processing:** Leverages AI for multi-language invoice processing and adaptive parsing, utilizing OCR (Tesseract.js) and AI extraction (OpenAI).
- **Data Extraction:** Robust logic for extracting critical fields, including from complex XML formats.
- **Duplicate Prevention:** Implemented a robust duplicate invoice detection system that normalizes invoice numbers and vendor names, performing checks before file download.
- **Validation System:** A real-time, rule-based validation engine supports various rule types (`required`, `enum`, `regex`, `range`, `format`), handles nested field paths, provides detailed violation reporting, and returns structured validation results stored in JSONB format.
- **RPA Automation:** Ensures session isolation for accurate file counting by clearing download directories at the start of each run and tracking only current session downloads. Includes smart PDF preservation to prevent data loss.
- **Security:** Comprehensive security protocols are integrated at the backend.
- **File Matching:** Advanced token-based file matching for PDF and XML invoices.
- **Bulk Classification:** Processes multiple invoices simultaneously with AI-powered line item classification, real-time progress tracking, and detailed analytics.
- **Global Progress Tracking:** Implements global progress tracking across all invoice pages for a smoother user experience, including estimated totals and dynamic refinement.
- **Invoice Rejection Debugging:** Comprehensive tools for analyzing and debugging invoice rejections, including API endpoints for detailed analysis and a dedicated UI.
- **Line Item Classification Integration:** Automatic processing workflow includes comprehensive line item classification at Step 3, creating line items from extracted data and automatically classifying them using AI-powered categorization with proper error handling and database storage.

**System Design Choices:**
- **Frontend:** React with TypeScript, utilizing Tailwind CSS and shadcn/ui components for a modern and efficient user interface.
- **Backend:** Express.js with TypeScript for a robust and scalable server-side.
- **Database:** PostgreSQL with Drizzle ORM for data storage and management, including fields for validation status, results, score, and timestamps.
- **Authentication:** Integrated with Replit Auth for secure user authentication.
- **UI/UX Decisions:** Focuses on a modern, component-based design with an emphasis on functional and clean aesthetics, exemplified by the Invoice Verification dashboard.

## External Dependencies
- **Replit Auth:** For user authentication.
- **PostgreSQL:** Primary database for data storage.
- **Tesseract.js:** For Optical Character Recognition (OCR).
- **OpenAI:** For AI-powered data extraction.
- **Express.js:** Backend framework.
- **React:** Frontend library.
- **Playwright:** For browser automation.