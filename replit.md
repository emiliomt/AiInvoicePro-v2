# Invoice Procurement Platform - AI-Powered Automation

## Project Overview
An advanced AI-powered invoice procurement platform that leverages intelligent automation to streamline multilingual financial document processing with enhanced security and robust data extraction capabilities.

## Recent Critical Fix: Validation Rules Implementation (Aug 6, 2025)

### Issue Resolved
- **Problem**: Validation rules were not executing during automation process due to Python simulation scripts returning mock validation results instead of using real TypeScript validation logic.
- **Root Cause**: The system was using `server/services/process_automation.py` with `simulate_workflow_step("Validation")` that returned fake success data instead of calling the real TypeScript validation services.

### Solution Implemented
1. **Implemented Real Validation Logic**: Replaced stub `validateInvoiceData()` method in `server/storage.ts` with comprehensive validation system that:
   - Retrieves active validation rules from database
   - Supports multiple rule types: `required`, `enum`, `regex`, `range`, `format`
   - Handles nested field paths (e.g., `extractedData.buyerTaxId`)
   - Provides detailed violation reporting with severity levels
   - Returns structured validation results with scores

2. **Updated Database Schema**: Added validation fields to `invoices` table:
   - `validation_status` VARCHAR(50) DEFAULT 'pending'
   - `validation_results` JSONB (stores complete validation details)
   - `validation_score` DECIMAL(3,2) (0-1 validation score)
   - `is_validated` BOOLEAN DEFAULT false
   - `validated_at` TIMESTAMP
   - `uploaded_at` TIMESTAMP DEFAULT NOW()

3. **Enhanced Invoice Processing**: Modified `server/routes.ts` to:
   - Call real validation after AI extraction
   - Store comprehensive validation results in database
   - Automatically approve/reject based on validation results
   - Log detailed validation violations and warnings

4. **Fixed Automation Flow**: Modified Python mock scripts to delegate validation to TypeScript system instead of returning fake results.

5. **Added Test Validation Rule**: Created NIT validation rule for testing:
   - Field: `extractedData.buyerTaxId`
   - Type: `enum`
   - Expected Value: `860527800`
   - Severity: `critical`

### Expected Results
- Invoice Verification dashboard now shows real validation status
- "Needs Review" counts reflect actual rule violations
- Validation rules like NIT checking execute automatically during processing
- `validationResult` and `validationErrors` fields are properly populated
- Business rules are enforced during automation workflow

## Key Technologies
- React frontend with Tanstack Query for dynamic data management
- Express.js backend with comprehensive security protocols  
- Advanced token-based file matching for PDF and XML invoices
- Real-time validation system with database-driven rules
- Multi-language invoice processing with adaptive parsing
- Playwright-based browser automation for reliable data extraction

## Architecture
- Frontend: React with TypeScript, Tailwind CSS, shadcn/ui components
- Backend: Express.js with TypeScript
- Database: PostgreSQL with Drizzle ORM
- Authentication: Replit Auth integration
- File Processing: OCR with Tesseract.js, AI extraction with OpenAI
- Validation: Rule-based validation engine with JSONB storage

## User Preferences
- Focus on business logic accuracy over UI polish
- Prioritize data integrity and validation correctness
- Use comprehensive logging for debugging validation issues
- Maintain clear error reporting for failed validations

## Development Guidelines
- All validation rules stored in database for easy management
- Validation results stored as structured JSONB for detailed analysis
- Mock data should never be used for validation - always use real rule processing
- Validation system should be extensible for new rule types
- Critical business rules (like NIT validation) should have `critical` severity