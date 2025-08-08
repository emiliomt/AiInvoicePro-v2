# Invoice Procurement Platform - AI-Powered Automation

## Overview
This project is an advanced AI-powered invoice procurement platform designed to streamline multilingual financial document processing. It focuses on intelligent automation, enhanced security, and robust data extraction capabilities, aiming to deliver a comprehensive solution for efficient invoice management. The platform's core purpose is to automate and secure the handling of diverse financial documents, improving efficiency and data accuracy for businesses.

## User Preferences
- Focus on business logic accuracy over UI polish
- Prioritize data integrity and validation correctness
- Use comprehensive logging for debugging validation issues
- Maintain clear error reporting for failed validations

## System Architecture
The platform is built with a microservices-oriented approach, emphasizing modularity and scalability.

**Technical Implementations & Feature Specifications:**
- **Invoice Processing:** Leverages AI for multi-language invoice processing and adaptive parsing. OCR (Tesseract.js) and AI extraction (OpenAI) are used for data extraction.
- **Data Extraction:** Robust logic for extracting critical fields like buyer tax ID from various XML formats, including those embedded in CDATA sections.
- **Duplicate Prevention:** A robust duplicate invoice detection system is implemented, normalizing invoice numbers, vendor names, and optionally validating total amounts. This system performs checks *before* file download to optimize resource usage.
- **Validation System:** A real-time, rule-based validation engine retrieves active rules from a database. It supports various rule types (`required`, `enum`, `regex`, `range`, `format`), handles nested field paths, provides detailed violation reporting with severity levels, and returns structured validation results with scores. Validation results are stored in JSONB format in the database.
- **RPA Automation:** The Robotic Process Automation (RPA) system ensures session isolation for accurate file counting by clearing download directories at the start of each run and tracking only files downloaded during the current session.
- **Security:** Comprehensive security protocols are integrated at the backend.
- **File Matching:** Advanced token-based file matching for PDF and XML invoices.

**System Design Choices:**
- **Frontend:** React with TypeScript, utilizing Tailwind CSS and shadcn/ui components for a modern and efficient user interface.
- **Backend:** Express.js with TypeScript for a robust and scalable server-side.
- **Database:** PostgreSQL with Drizzle ORM for data storage and management. Invoice data includes fields for validation status, results, score, and timestamps.
- **Authentication:** Integrated with Replit Auth for secure user authentication.
- **UI/UX Decisions:** While the focus is on business logic, the choice of React, Tailwind CSS, and shadcn/ui suggests a modern, component-based design approach with an emphasis on functional and clean aesthetics. The Invoice Verification dashboard is a key UI component for displaying real-time validation status.

## External Dependencies
- **Replit Auth:** For user authentication.
- **PostgreSQL:** Primary database for data storage.
- **Tesseract.js:** For Optical Character Recognition (OCR).
- **OpenAI:** For AI-powered data extraction.
- **Express.js:** Backend framework.
- **React:** Frontend library.
- **Playwright:** For browser automation.