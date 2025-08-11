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
- **Bulk Classification:** Comprehensive system for processing multiple invoices simultaneously with AI-powered line item classification, real-time progress tracking, and detailed analytics.

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

## Current Issue: PDF Data Loss Prevention Fixed (Aug 8, 2025)

### Critical Issue Identified & Fixed ✅ RESOLVED
After RPA runs, previously linked PDF files were being deleted, causing complete data loss when skipped invoices lose their PDF references.

### Root Cause Analysis
1. **Critical Bug**: `clear_download_directories()` function was clearing ALL PDF files at start of each RPA run
2. **Data Loss Impact**: Previously processed and linked PDFs were being deleted, breaking database references
3. **User Impact**: Skipped invoices lost their PDF links permanently after subsequent RPA runs

### Solution Implemented ✅
1. **Smart PDF Preservation**: Modified `clear_download_directories()` to check database before deleting PDFs
2. **Database Link Verification**: PDFs referenced by existing invoices are now preserved during cleanup
3. **Selective Cleanup**: Only orphaned PDFs (not linked to any invoice) are removed
4. **Safety Logic**: If database check fails, PDFs are preserved (fail-safe approach)

### Latest Achievement: Invoice Processing Data Storage System (Aug 11, 2025)

### Complete Invoice Processing Data Storage System Implemented ✅ COMPLETED
Fixed the critical data storage issue where processed results (petty cash classifications, project matches, validation status) were showing in the UI but not being properly stored in the database tables.

### Technical Implementation ✅
1. **Database Schema Updates**: Enhanced PostgreSQL schema with missing fields:
   - Added `is_petty_cash`, `classification_method`, `confidence_score` to `petty_cash_log` table
   - Added `processing_status` field to `invoices` table for tracking processing pipeline stages
   - Updated database columns successfully with SQL ALTER TABLE commands

2. **API Endpoints for Data Storage**: Created comprehensive endpoints for storing all processing results:
   - `POST /api/petty-cash/classify` - Stores petty cash classification results with confidence scores
   - `POST /api/project-matching` - Stores project match results when "Project Match: CONSTRUCCIONES OBYCON" is determined
   - `POST /api/invoices/process` - Comprehensive endpoint that processes and stores all results (petty cash, project matching, validation status)
   - Enhanced existing validation endpoints to update `processing_status` field

3. **PostgresStorage Implementation**: Fixed missing database operations:
   - Implemented proper `createPettyCashLog()`, `updatePettyCashLog()`, `getPettyCashLogs()` methods
   - Added database operations using Drizzle ORM for consistent data handling
   - Integrated error handling and transaction management

4. **Processing Status Tracking**: Implemented comprehensive processing pipeline tracking:
   - `pending` -> `extracted` -> `classified` -> `matched` -> `validated` -> `processed`
   - Each processing step updates the invoice status in the database
   - Real-time status updates for monitoring processing progress

### Data Integrity Verification ✅
Successfully tested database operations:
- Petty cash classification data properly stored with invoice_id=1005, is_petty_cash=true, confidence_score=0.92
- Processing status correctly updated from 'pending' to 'classified'
- Database schema supports all required fields for complete processing result storage

### Previous Achievement: Bulk Invoice Classification System (Aug 11, 2025)

### Comprehensive Bulk Classification System Implemented ✅ COMPLETED
Created a complete bulk invoice line item classification system that replaces single-item processing with efficient batch operations.

### Technical Implementation
1. **Backend Services**: Built comprehensive `BulkClassificationService` with:
   - Batch processing capabilities for multiple invoices simultaneously
   - AI integration using existing `ClassificationService` infrastructure
   - Real-time progress tracking with session isolation
   - Smart invoice filtering by project, date range, and status
   - Automatic line item extraction from OCR data when unavailable
   - Database optimization with batch operations and transaction management

2. **API Endpoints**: Added complete REST API for bulk operations:
   - `/api/invoices/ready-for-classification` - Get invoices ready for processing
   - `/api/classify-bulk-invoices` - Start bulk classification process  
   - `/api/classify-bulk-invoices/progress/:sessionId` - Real-time progress tracking
   - `/api/classification-results` - Paginated results with filters
   - `/api/classification-summary` - Analytics and statistics
   - `/api/classification/categories` - Available classification categories

3. **Frontend Interface**: Professional React interface with:
   - Multi-tab design (Classify, Results, Analytics)
   - Advanced filtering by project ID and date ranges
   - Real-time progress monitoring with detailed statistics
   - Invoice selection with batch operations
   - Comprehensive results view with pagination
   - Category breakdown and confidence analytics
   - Integration with existing design system and navigation

4. **Database Extensions**: Extended schema with bulk processing support:
   - Enhanced classification tracking and progress management
   - Session-based processing for concurrent user support
   - Optimized queries for large-scale invoice processing

### Business Impact
- **Efficiency**: Process hundreds of invoices simultaneously vs. single-item approach
- **Scalability**: Handle enterprise-level invoice volumes with concurrent processing
- **Analytics**: Comprehensive reporting on classification performance and accuracy
- **User Experience**: Intuitive interface with real-time feedback and progress tracking
- **Integration**: Seamless integration with existing AI classification infrastructure

## Previous Task: Global Progress Tracking Implementation (Aug 8, 2025)

### Enhancement Implemented ✅ COMPLETED  
Implementing global progress tracking across all invoice pages instead of per-page progress for smoother user experience.

### Technical Implementation
1. **Global Progress Structure**: Added `global_progress` tracking with estimated totals and global index counter
2. **Invoice Estimation Logic**: Implemented `estimate_total_invoices()` method that:
   - Analyzes first page invoice count
   - Attempts to detect pagination info from UI elements  
   - Creates conservative estimates when pagination info unavailable
3. **Dynamic Refinement**: Added `refine_total_estimate()` to improve accuracy using actual page samples
4. **Global Index Tracking**: Updated main processing loop to increment `global_index` for every invoice (skip, success, failure)
5. **Progress Calculation**: Modified `_output_download_progress()` to use global ratio mapping to 30-90% range

### Previous Issues Successfully Resolved
1. **PDF Data Loss Prevention Fixed**: Modified `clear_download_directories()` to preserve linked PDFs
2. **PDF Directory Structure Fixed**: Corrected nested path construction (`uploads/pdfs/pdfs/` → `uploads/pdfs/`)
3. **Session Isolation Working**: RPA correctly reports session-specific file counts  
4. **Download System Enhanced**: Comprehensive Chrome configuration and error handling
5. **Database Linking Operational**: PDFs properly linked to invoices with correct metadata