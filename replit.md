# InvoicePro - AI-Powered Invoice Procurement Platform

## Overview
InvoicePro is an AI-powered platform designed to streamline invoice processing and procurement management. It automates data extraction, validation, and approval workflows, aiming to reduce manual errors and enhance efficiency. The system includes AI-powered OCR, intelligent validation, discrepancy detection, and predictive analytics. It also features an RPA service for automated invoice downloading and real-time progress tracking. InvoicePro aims to revolutionize invoice management by providing a comprehensive, full-stack web application solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
InvoicePro is a full-stack web application. The frontend is built with React 18, TypeScript, Tailwind CSS (with shadcn/ui), TanStack Query, Wouter, React Hook Form, and Vite. The backend uses Node.js with Express.js, TypeScript, and Drizzle ORM for PostgreSQL. Authentication is handled via Replit Auth. Core functionalities include an AI-powered processing pipeline for OCR and data extraction (leveraging OpenAI GPT), a rule-based validation engine, and discrepancy detection. An RPA service (Python-based) is integrated for automated invoice downloading and includes real-time console views. The database schema supports core entities like Invoices, Line Items, Purchase Orders, Projects, Validation Rules, Approvals, and Flags & Alerts. The UI components include a dashboard, invoice management, approval workflows, PO matching, project validation, reporting, and configuration settings. The system ensures secure file processing, AI-powered extraction, validation, matching, and approval routing.

## External Dependencies
*   **Database**: Neon PostgreSQL (serverless)
*   **AI Services**: OpenAI API (for data extraction)
*   **Authentication**: Replit Auth
*   **File Processing**: Tesseract.js, Sharp (for image processing), PDF.js
*   **UI Components**: Radix UI primitives (via shadcn/ui)