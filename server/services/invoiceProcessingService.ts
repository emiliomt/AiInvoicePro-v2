import { eq, and } from 'drizzle-orm';
import { getStorage, getDb } from '../storage.js';
import { importedInvoices, invoices, invoiceImporterLogs, lineItems, lineItemClassifications, pettyCashLog, invoiceProjectMatches, type Invoice } from '../../shared/schema.js';
import * as aiService from './aiService.js';
import { storage } from '../storage.js';
import { parseInvoiceXML } from './xmlParser.js';
import * as fs from 'fs';
import * as path from 'path';
import { ClassificationService } from './classificationService.js';
import { ProgressTracker } from './progressTracker';
import { settings } from '../../shared/schema';

export class InvoiceProcessingService {
  /**
   * Process all downloaded imported invoices that haven't been processed yet
   */
  async processDownloadedInvoices(): Promise<{ processed: number; failed: number; errors: string[] }> {
    console.log('🔄 Starting processing of downloaded imported invoices...');

    // Find all downloaded but unprocessed imported invoices
    const db = await getDb();
    const downloadedInvoices = await db
      .select()
      .from(importedInvoices)
      .where(eq(importedInvoices.processingStatus, 'downloaded'));

    console.log(`📋 Found ${downloadedInvoices.length} downloaded invoices to process`);

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const importedInvoice of downloadedInvoices) {
      try {
        console.log(`🔄 Processing: ${importedInvoice.originalFileName}`);

        // Check if this invoice has a corresponding XML file with data
        const hasMatchedXml = importedInvoice.metadata && 
                              typeof importedInvoice.metadata === 'object' && 
                              'matched_xml' in importedInvoice.metadata;

        let extractedData: any = null;
        let ocrText = '';

        if (hasMatchedXml) {
          // Look for the corresponding XML file
          const xmlFileName = (importedInvoice.metadata as any).matched_xml;
          const xmlFilePath = importedInvoice.filePath?.replace('/pdfs/', '/xmls/').replace('.pdf', '.xml');

          if (xmlFilePath && fs.existsSync(xmlFilePath)) {
            console.log(`📄 Processing XML file: ${xmlFileName}`);

            try {
              const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
              extractedData = parseInvoiceXML(xmlContent, true);
              ocrText = xmlContent;
              console.log(`✅ XML data extracted for ${importedInvoice.originalFileName}`);
            } catch (xmlError) {
              console.error(`❌ Failed to parse XML for ${importedInvoice.originalFileName}:`, xmlError);
              // Fall back to PDF processing if XML fails
            }
          }
        }

        // If no XML data or XML processing failed, try to process the PDF
        if (!extractedData && importedInvoice.filePath && fs.existsSync(importedInvoice.filePath)) {
          console.log(`📄 Processing PDF file: ${importedInvoice.originalFileName}`);

          try {
            // For now, we'll extract basic info from filename and metadata
            const metadata = importedInvoice.metadata as any;
            const fileName = importedInvoice.originalFileName || '';

            // Extract basic information from filename pattern (e.g., FE114740_830000818_Crowe_CO_SAS.pdf)
            const fileNameParts = fileName.replace('.pdf', '').split('_');
            const invoiceNumber = fileNameParts[0] || null;
            const taxId = fileNameParts[1] || null;
            const vendorName = fileNameParts.slice(2).join(' ').replace(/&/g, '&') || metadata?.valor || null;

            extractedData = {
              vendorName,
              invoiceNumber,
              invoiceDate: null,
              dueDate: null,
              totalAmount: null,
              taxAmount: null,
              subtotal: null,
              currency: 'COP',
              taxId,
              companyName: vendorName,
              concept: 'Imported via RPA',
              projectName: null,
              vendorAddress: null,
              buyerTaxId: null,
              buyerAddress: null,
              descriptionSummary: `Invoice ${invoiceNumber} from ${vendorName}`,
              projectAddress: null,
              projectCity: null,
              notes: `Imported from ERP system via RPA on ${new Date().toISOString()}`,
              lineItems: [],
              confidenceScore: '0.75' // Lower confidence for filename-based extraction
            };

            ocrText = `Imported invoice: ${fileName}`;
            console.log(`✅ Basic data extracted from filename for ${importedInvoice.originalFileName}`);
          } catch (pdfError) {
            console.error(`❌ Failed to process PDF for ${importedInvoice.originalFileName}:`, pdfError);
            throw pdfError;
          }
        }

        if (!extractedData) {
          throw new Error('No data could be extracted from either XML or PDF');
        }

        // Create invoice record
        const invoiceData = {
          userId: 'rpa-system',
          companyId: 860527800, // Use main company ID for company-wide access
          fileName: importedInvoice.originalFileName || `imported_${importedInvoice.id}`,
          fileUrl: importedInvoice.filePath,
          status: 'extracted' as const,
          vendorName: extractedData.vendorName,
          invoiceNumber: extractedData.invoiceNumber,
          invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
          dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
          totalAmount: extractedData.totalAmount ? extractedData.totalAmount.toString() : null,
          taxAmount: extractedData.taxAmount ? extractedData.taxAmount.toString() : null,
          subtotal: extractedData.subtotal ? extractedData.subtotal.toString() : null,
          currency: extractedData.currency || 'COP',
          ocrText,
          extractedData,
          projectName: extractedData.projectName,
          confidenceScore: extractedData.confidenceScore || '0.75',
        };

        // Insert invoice record
        const [newInvoice] = await db.insert(invoices).values(invoiceData).returning();

        // If we have line items from XML extraction, insert them and classify
        if (extractedData.lineItems && extractedData.lineItems.length > 0) {
          for (const item of extractedData.lineItems) {
            // Insert line item
            const [lineItem] = await db.insert(lineItems).values({
              invoiceId: newInvoice.id,
              description: item.description,
              quantity: item.quantity || '1',
              unitPrice: item.unitPrice || '0.00',
              totalPrice: item.totalPrice || '0.00',
            }).returning();

            // Classify the line item after insertion
            await ClassificationService.classifyAndStore(lineItem.id, 'rpa-system');
          }

          console.log(`✅ Inserted and classified ${extractedData.lineItems.length} line items for invoice ${newInvoice.id}`);
        }

        // Update imported invoice status and link to created invoice
        await db
          .update(importedInvoices)
          .set({
            processingStatus: 'completed',
            linkedInvoiceId: newInvoice.id,
            processedAt: new Date(),
          })
          .where(eq(importedInvoices.id, importedInvoice.id));

        console.log(`✅ Successfully processed ${importedInvoice.originalFileName} -> Invoice ID: ${newInvoice.id}`);
        processed++;

      } catch (error: any) {
        console.error(`❌ Failed to process ${importedInvoice.originalFileName}:`, error);

        // Update status to failed
        await db
          .update(importedInvoices)
          .set({
            processingStatus: 'failed',
            processedAt: new Date(),
          })
          .where(eq(importedInvoice.id, importedInvoice.id));

        errors.push(`${importedInvoice.originalFileName}: ${error.message}`);
        failed++;
      }
    }

    console.log(`🎉 Processing complete: ${processed} processed, ${failed} failed`);
    return { processed, failed, errors };
  }

  /**
   * Get company ID from the importer log
   */
  private async getCompanyIdFromLog(logId: number): Promise<number | null> {
    // The invoice_importer_configs table doesn't have a direct company_id
    // For RPA imports, we'll use a default company
    console.log(`Getting company ID for log ${logId} - using default RPA company (ID: 2)`);
    return 2; // Use the RPA Import Company we created
  }

  /**
   * Process a specific batch of imported invoices by log ID
   */
  async processInvoicesByLogId(logId: number): Promise<{ processed: number; failed: number; errors: string[] }> {
    console.log(`🔄 Processing imported invoices for log ID: ${logId}`);

    const db = await getDb();
    const downloadedInvoices = await db
      .select()
      .from(importedInvoices)
      .where(and(
        eq(importedInvoices.logId, logId),
        eq(importedInvoices.processingStatus, 'downloaded')
      ));

    console.log(`📋 Found ${downloadedInvoices.length} invoices to process for log ${logId}`);

    if (downloadedInvoices.length === 0) {
      return { processed: 0, failed: 0, errors: [] };
    }

    // Process the filtered invoices
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const importedInvoice of downloadedInvoices) {
      try {
        console.log(`🔄 Processing: ${importedInvoice.originalFileName}`);

        // Check if this invoice has a corresponding XML file with data
        const hasMatchedXml = importedInvoice.metadata && 
                              typeof importedInvoice.metadata === 'object' && 
                              'matched_xml' in importedInvoice.metadata;

        let extractedData: any = null;
        let ocrText = '';

        if (hasMatchedXml) {
          // Look for the corresponding XML file
          const xmlFileName = (importedInvoice.metadata as any).matched_xml;
          const xmlFilePath = importedInvoice.filePath?.replace('/pdfs/', '/xmls/').replace('.pdf', '.xml');

          if (xmlFilePath && fs.existsSync(xmlFilePath)) {
            console.log(`📄 Processing XML file: ${xmlFileName}`);

            try {
              const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
              extractedData = parseInvoiceXML(xmlContent, true);
              ocrText = xmlContent;
              console.log(`✅ XML data extracted for ${importedInvoice.originalFileName}`);
            } catch (xmlError) {
              console.error(`❌ Failed to parse XML for ${importedInvoice.originalFileName}:`, xmlError);
              // Fall back to PDF processing if XML fails
            }
          }
        }

        // If no XML data or XML processing failed, try to process basic info from filename
        if (!extractedData) {
          console.log(`📄 Processing basic info for: ${importedInvoice.originalFileName}`);

          const metadata = importedInvoice.metadata as any;
          const fileName = importedInvoice.originalFileName || '';

          // Extract basic information from filename pattern
          const fileNameParts = fileName.replace('.pdf', '').split('_');
          const invoiceNumber = fileNameParts[0] || null;
          const taxId = fileNameParts[1] || null;
          const vendorName = fileNameParts.slice(2).join(' ').replace(/&/g, '&') || metadata?.valor || null;

          extractedData = {
            vendorName,
            invoiceNumber,
            invoiceDate: null,
            dueDate: null,
            totalAmount: null,
            taxAmount: null,
            subtotal: null,
            currency: 'COP',
            taxId,
            companyName: vendorName,
            concept: 'Imported via RPA',
            projectName: null,
            vendorAddress: null,
            buyerTaxId: null,
            buyerAddress: null,
            descriptionSummary: `Invoice ${invoiceNumber} from ${vendorName}`,
            projectAddress: null,
            projectCity: null,
            notes: `Imported from ERP system via RPA on ${new Date().toISOString()}`,
            lineItems: [],
            confidenceScore: '0.75'
          };

          ocrText = `Imported invoice: ${fileName}`;
          console.log(`✅ Basic data extracted from filename for ${importedInvoice.originalFileName}`);
        }

        // Create invoice record
        const invoiceData = {
          userId: 'rpa-system',
          companyId: 860527800, // Use main company ID for company-wide access
          fileName: importedInvoice.originalFileName || `imported_${importedInvoice.id}`,
          fileUrl: importedInvoice.filePath,
          status: 'extracted' as const,
          vendorName: extractedData.vendorName,
          invoiceNumber: extractedData.invoiceNumber,
          invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
          dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
          totalAmount: extractedData.totalAmount ? extractedData.totalAmount.toString() : null,
          taxAmount: extractedData.taxAmount ? extractedData.taxAmount.toString() : null,
          subtotal: extractedData.subtotal ? extractedData.subtotal.toString() : null,
          currency: extractedData.currency || 'COP',
          ocrText,
          extractedData,
          projectName: extractedData.projectName,
          confidenceScore: extractedData.confidenceScore || '0.75',
        };

        // Insert invoice record
        const [newInvoice] = await db.insert(invoices).values(invoiceData).returning();

        // If we have line items from XML extraction, insert them and classify
        if (extractedData.lineItems && extractedData.lineItems.length > 0) {
          for (const item of extractedData.lineItems) {
            // Insert line item
            const [lineItem] = await db.insert(lineItems).values({
              invoiceId: newInvoice.id,
              description: item.description,
              quantity: item.quantity || '1',
              unitPrice: item.unitPrice || '0.00',
              totalPrice: item.totalPrice || '0.00',
            }).returning();

            // Classify the line item after insertion
            await ClassificationService.classifyAndStore(lineItem.id, 'rpa-system');
          }

          console.log(`✅ Inserted and classified ${extractedData.lineItems.length} line items for invoice ${newInvoice.id}`);
        }

        // Update imported invoice status and link to created invoice
        await db
          .update(importedInvoices)
          .set({
            processingStatus: 'completed',
            linkedInvoiceId: newInvoice.id,
            processedAt: new Date(),
          })
          .where(eq(importedInvoices.id, importedInvoice.id));

        console.log(`✅ Successfully processed ${importedInvoice.originalFileName} -> Invoice ID: ${newInvoice.id}`);
        processed++;

      } catch (error: any) {
        console.error(`❌ Failed to process ${importedInvoice.originalFileName}:`, error);

        // Update status to failed
        await db
          .update(importedInvoices)
          .set({
            processingStatus: 'failed',
            processedAt: new Date(),
          })
          .where(eq(importedInvoice.id, importedInvoice.id));

        errors.push(`${importedInvoice.originalFileName}: ${error.message}`);
        failed++;
      }
    }

    console.log(`🎉 Processing complete for log ${logId}: ${processed} processed, ${failed} failed`);
    return { processed, failed, errors };
  }

  /**
   * Process a batch of invoices automatically
   */
  async processMultipleInvoicesAutomatically(
    invoiceIds: number[],
    userId: string,
    source: string = 'manual',
    skipValidation: boolean = false
  ): Promise<{
    totalInvoices: number;
    processedInvoices: number;
    failedInvoices: number;
    errors: string[];
  }> {
    console.log(`🔄 Processing ${invoiceIds.length} invoices automatically...`);
    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Start a new progress tracking session
    const sessionId = ProgressTracker.startSession(userId, 'Invoice Processing', invoiceIds.length);
    ProgressTracker.updateStep(sessionId, 1, 'active', 'Extracting Invoice Data');

    for (const invoiceId of invoiceIds) {
      try {
        // Process each invoice
        const result = await this.processInvoiceAutomatically(invoiceId, userId, source, skipValidation);
        if (result) {
          processedCount++;
          // Update progress metrics
          ProgressTracker.updateMetrics(sessionId, {
            processedInvoices: processedCount,
            currentInvoice: invoiceId,
            totalItems: 0, // Placeholder, will be updated in the next step if applicable
            processedItems: 0
          });
          // Move to the next step if this was the first invoice processed
          if (processedCount === 1) {
            ProgressTracker.updateStep(sessionId, 2, 'active', 'Classifying Line Items');
          }
        } else {
          failedCount++;
          errors.push(`Failed to process invoice ID ${invoiceId} automatically`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing invoice ID ${invoiceId} automatically:`, error);
        failedCount++;
        errors.push(`Invoice ID ${invoiceId}: ${error.message}`);
        ProgressTracker.failSession(sessionId, error.message);
      }
    }

    // Complete the session if no errors occurred during the loop
    if (failedCount === 0) {
      ProgressTracker.completeSession(sessionId);
    } else {
      ProgressTracker.failSession(sessionId, `${failedCount} invoices failed to process.`);
    }

    console.log(`🎉 Finished automatic processing: ${processedCount} processed, ${failedCount} failed.`);
    return {
      totalInvoices: invoiceIds.length,
      processedInvoices: processedCount,
      failedInvoices: failedCount,
      errors,
    };
  }

  /**
   * Process a single invoice automatically
   */
  async processInvoiceAutomatically(
    invoiceId: number,
    userId: string,
    source: string = 'manual',
    skipValidation: boolean = false
  ): Promise<boolean> {
    console.log(`🚀 Processing invoice ID ${invoiceId} automatically.`);

    // Step 1: Fetch invoice data
    let invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      console.error(`❌ Invoice ${invoiceId} not found.`);
      return false;
    }

    const sessionId = ProgressTracker.getSessionIdByInvoice(invoiceId); // Assume this function exists
    if (!sessionId) {
      console.error(`❌ No session found for invoice ${invoiceId}`);
      return false;
    }

    // Ensure initial status is set to 'processing'
    if (invoice.status === 'pending' || invoice.status === 'extracted') {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'Invoice processing started...');
    }

    // Step 2: Extract data if not already done
    if (!invoice.extractedData) {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'AI extraction in progress...');

      try {
        // Extract data using AI service
        const extractedData = await aiService.extractInvoiceData(invoice.ocrText || '', true);

        // Update invoice with extracted data
        await storage.updateInvoice(invoiceId, {
          extractedData: extractedData,
          status: 'extracted'
        });

        console.log(`✅ AI extraction completed for invoice ${invoiceId}`);
      } catch (extractionError: any) {
        console.error(`❌ AI extraction failed for invoice ${invoiceId}:`, extractionError);
        await this.updateInvoiceStatus(invoiceId, 'rejected', `AI extraction failed: ${extractionError.message}`);
        ProgressTracker.failStep(sessionId, 1, `AI extraction failed: ${extractionError.message}`);
        return false;
      }

      // Refresh invoice data after extraction
      invoice = await storage.getInvoice(invoiceId);
      if (!invoice) throw new Error('Invoice not found after extraction');
    }

    // Step 2.5: Execute validation rules if not skipped
    if (!skipValidation && invoice.extractedData) {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'Executing validation rules...');

      try {
        console.log(`🔍 Running validation rules for invoice ${invoiceId}`);
        const validationResult = await storage.validateInvoiceData(invoice.extractedData);

        // Update invoice with validation results
        await storage.updateInvoice(invoiceId, {
          validationResults: validationResult,
          status: validationResult.isValid ? 'extracted' : 'rejected'
        });

        if (!validationResult.isValid) {
          console.log(`❌ Validation failed for invoice ${invoiceId}:`, validationResult.violations);
          await this.updateInvoiceStatus(invoiceId, 'rejected', 
            `Validation failed: ${validationResult.violations?.map((v: any) => v.message).join(', ') || 'Unknown validation errors'}`);
          ProgressTracker.failStep(sessionId, 1, `Validation failed: ${validationResult.violations?.map((v: any) => v.message).join(', ') || 'Unknown validation errors'}`);
          // Continue processing even if validation fails for now
        } else {
          console.log(`✅ Validation passed for invoice ${invoiceId}`);
          ProgressTracker.updateStep(sessionId, 1, 'completed'); // Mark extraction step as completed
        }

        // Refresh invoice data after validation
        invoice = await storage.getInvoice(invoiceId);
      } catch (validationError: any) {
        console.error(`❌ Validation execution failed for invoice ${invoiceId}:`, validationError);
        await this.updateInvoiceStatus(invoiceId, 'processing', `Validation failed, continuing: ${validationError.message}`);
        ProgressTracker.failStep(sessionId, 1, `Validation execution failed: ${validationError.message}`);
        // Continue processing even if validation fails
      }
    }

    // Step 3: Create and classify line items
    if (invoice && invoice.extractedData && invoice.status !== 'rejected') {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'Processing line items...');

      try {
        const db = await getDb();
        const extractedData = invoice.extractedData as any;

        // Check if any line items already exist for this invoice
        const existingLineItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));

        let lineItemsToProcess: any[] = [];
        let totalLineItems = 0;
        let totalProcessed = 0;

        if (existingLineItems.length === 0) {
          // Create line items from extracted data if available
          if (extractedData.lineItems && extractedData.lineItems.length > 0) {
            console.log(`📝 Creating ${extractedData.lineItems.length} line items from extracted data for invoice ${invoiceId}`);
            totalLineItems = extractedData.lineItems.length;

            for (const [index, item] of extractedData.lineItems.entries()) {
              const [lineItem] = await db.insert(lineItems).values({
                invoiceId: invoiceId,
                description: item.description || item.item || 'Unknown item',
                quantity: item.quantity || '1',
                unitPrice: item.unitPrice || item.price || '0.00',
                totalPrice: item.totalPrice || item.total || '0.00',
                unit: item.unit || null,
                rawText: item.rawText || item.description,
                lineNumber: index + 1,
              }).returning();

              lineItemsToProcess.push(lineItem);
              totalProcessed++; // Increment processed items count
            }
          } else {
            // Create a default line item from invoice summary if no detailed line items
            console.log(`📝 Creating default line item for invoice ${invoiceId} - no detailed line items found`);
            totalLineItems = 1;

            const description = extractedData.descriptionSummary || 
                              extractedData.concept || 
                              `Service from ${invoice.vendorName || 'Unknown Vendor'}`;

            const [lineItem] = await db.insert(lineItems).values({
              invoiceId: invoiceId,
              description: description,
              quantity: '1',
              unitPrice: invoice.totalAmount || '0.00',
              totalPrice: invoice.totalAmount || '0.00',
              unit: 'service',
              rawText: description,
              lineNumber: 1,
            }).returning();

            lineItemsToProcess.push(lineItem);
            totalProcessed++; // Increment processed items count
          }
        } else {
          console.log(`📋 Found ${existingLineItems.length} existing line items for invoice ${invoiceId}`);
          lineItemsToProcess = existingLineItems;
          totalLineItems = existingLineItems.length;
          totalProcessed = existingLineItems.length; // Assume all existing are processed for now
        }

        // Now classify all line items
        let classifiedItemsCount = 0;
        for (const lineItem of lineItemsToProcess) {
          try {
            // Check if already classified
            const existingClassification = await db.select()
              .from(lineItemClassifications)
              .where(eq(lineItemClassifications.lineItemId, lineItem.id))
              .limit(1);

            if (existingClassification.length === 0) {
              console.log(`🔍 Classifying line item ${lineItem.id}: "${lineItem.description}"`);
              await ClassificationService.classifyAndStore(lineItem.id, userId);
              classifiedItemsCount++;
            } else {
              console.log(`✅ Line item ${lineItem.id} already classified as: ${existingClassification[0].category}`);
              classifiedItemsCount++;
            }
          } catch (itemError: any) {
            console.error(`❌ Failed to classify line item ${lineItem.id}:`, itemError);
          }
        }

        console.log(`✅ Line item processing completed for invoice ${invoiceId}: ${lineItemsToProcess.length} items processed, ${classifiedItemsCount} classified`);

        // Update progress metrics with line item details
        ProgressTracker.updateMetrics(sessionId, {
          totalItems: totalLineItems,
          processedItems: totalProcessed, // This might need refinement if partial processing occurs
        });

        // Move to next step if extraction and classification are done
        ProgressTracker.updateStep(sessionId, 2, 'completed');
        ProgressTracker.updateStep(sessionId, 3, 'active', 'Performing Petty Cash Analysis');

      } catch (classificationError: any) {
        console.error(`❌ Line item processing failed for invoice ${invoiceId}:`, classificationError);
        await this.updateInvoiceStatus(invoiceId, 'processing', `Line item processing failed, continuing: ${classificationError.message}`);
        ProgressTracker.failStep(sessionId, 2, `Line item processing failed: ${classificationError.message}`);
        // Don't return false here, continue with processing
      }
    } else if (invoice && invoice.status === 'rejected') {
      console.log(`ℹ️ Skipping line item processing for invoice ${invoiceId} due to previous failure.`);
      return false;
    }

    // Step 4: Automatic Petty Cash Detection
    await this.updateInvoiceStatus(invoiceId, 'processing', 'Checking petty cash status...');
    try {
      if (invoice) {
        await this.performPettyCashAnalysis(invoiceId, invoice);
        console.log(`✅ Petty cash analysis completed for invoice ${invoiceId}`);
        ProgressTracker.updateStep(sessionId, 3, 'completed');
        ProgressTracker.updateStep(sessionId, 4, 'active', 'Matching with Projects');
      }
    } catch (pettyCashError: any) {
      console.error(`❌ Petty cash analysis failed for invoice ${invoiceId}:`, pettyCashError);
      ProgressTracker.failStep(sessionId, 3, `Petty cash analysis failed: ${pettyCashError.message}`);
      // Continue processing even if petty cash analysis fails
    }

    // Step 5: Automatic Project Assignment
    await this.updateInvoiceStatus(invoiceId, 'processing', 'Matching with projects...');
    try {
      if (invoice) {
        await this.performAutomaticProjectMatching(invoiceId, invoice, userId);
        console.log(`✅ Project matching completed for invoice ${invoiceId}`);
        ProgressTracker.updateStep(sessionId, 4, 'completed');
        ProgressTracker.updateStep(sessionId, 5, 'active', 'Finalizing Invoice');
      }
    } catch (projectError: any) {
      console.error(`❌ Project matching failed for invoice ${invoiceId}:`, projectError);
      ProgressTracker.failStep(sessionId, 4, `Project matching failed: ${projectError.message}`);
      // Continue processing even if project matching fails
    }

    // Step 6: Finalize invoice status
    // Set to approved if everything went well
    await this.updateInvoiceStatus(invoiceId, 'approved', 'Invoice processing completed successfully');
    ProgressTracker.updateStep(sessionId, 5, 'completed');

    console.log(`✅ Successfully processed invoice ID ${invoiceId}`);
    return true;
  }

  /**
   * Perform automatic petty cash analysis
   */
  private async performPettyCashAnalysis(invoiceId: number, invoice: Invoice): Promise<void> {
    const extractedData = invoice.extractedData as any;
    const totalAmount = extractedData?.totalAmount || invoice.totalAmount;

    if (totalAmount) {
      // Convert to number if it's a string
      const amount = typeof totalAmount === 'string' ? parseFloat(totalAmount) : totalAmount;

      // Get configurable petty cash threshold from settings
      let pettyCashThreshold = 400000; // Default to 400,000 COP
      try {
        const db = await getDb();
        const thresholdSetting = await db
          .select()
          .from(settings)
          .where(eq(settings.key, 'petty_cash_threshold'))
          .limit(1);
        
        if (thresholdSetting.length > 0) {
          pettyCashThreshold = parseFloat(thresholdSetting[0].value) || 400000;
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch petty cash threshold, using default: ${pettyCashThreshold}`);
      }

      const isPettyCash = amount <= pettyCashThreshold;

      if (isPettyCash) {
        console.log(`📋 Invoice ${invoiceId} flagged as petty cash (Amount: ${invoice.currency || 'COP'} ${amount}, Threshold: ${pettyCashThreshold})`);

        // Create petty cash log entry
        const db = await getDb();
        await db.insert(pettyCashLog).values({
          invoiceId: invoiceId,
          isPettyCash: true,
          classificationMethod: 'rule-based',
          confidenceScore: '1.00', // High confidence for rule-based classification
          status: 'pending_approval'
        });

        console.log(`✅ Petty cash log created for invoice ${invoiceId}`);
      } else {
        console.log(`📋 Invoice ${invoiceId} not petty cash (Amount: ${invoice.currency || 'COP'} ${amount}, Threshold: ${pettyCashThreshold})`);
      }
    } else {
      console.log(`⚠️ No total amount found for invoice ${invoiceId}, skipping petty cash analysis`);
    }
  }

  /**
   * Perform automatic project matching
   */
  private async performAutomaticProjectMatching(invoiceId: number, invoice: Invoice, userId: string): Promise<void> {
    try {
      // Get all active projects for the user's company
      const projects = await storage.getProjects();

      if (!projects || projects.length === 0) {
        console.log(`ℹ️ No projects found for automatic matching for invoice ${invoiceId}`);
        return;
      }

      // Use project matcher service
      const projectMatcher = new (await import('../projectMatcher')).ProjectMatcherService();
      const matches = await projectMatcher.matchInvoiceWithProjects(invoice, projects);

      if (matches && matches.length > 0) {
        const bestMatch = matches[0];

        // Auto-assign if confidence is high enough (>= 70%)
        if (bestMatch.matchScore >= 70) {
          console.log(`🎯 Auto-assigning project to invoice ${invoiceId}: ${bestMatch.project?.projectId} (Score: ${bestMatch.matchScore}%)`);

          // Create project match record
          const db = await getDb();
          await db.insert(invoiceProjectMatches).values({
            invoiceId: invoiceId,
            projectId: bestMatch.project?.projectId || 'unknown',
            matchScore: bestMatch.matchScore.toString(),
            matchDetails: JSON.stringify(bestMatch.matchDetails),
            isAutoMatched: true,
            matchedBy: userId || 'system'
          });

          // Update invoice with project assignment
          await storage.updateInvoice(invoiceId, {
            projectName: bestMatch.project?.name || bestMatch.project?.projectId || 'Unknown Project'
          });

          console.log(`✅ Project auto-assigned to invoice ${invoiceId}`);
        } else {
          console.log(`📋 Project match found for invoice ${invoiceId} but confidence too low for auto-assignment (Score: ${bestMatch.matchScore}%)`);

          // Create project match record for manual review
          const db = await getDb();
          await db.insert(invoiceProjectMatches).values({
            invoiceId: invoiceId,
            projectId: bestMatch.project?.projectId || 'unknown',
            matchScore: bestMatch.matchScore.toString(),
            matchDetails: JSON.stringify(bestMatch.matchDetails),
            isAutoMatched: false,
            matchedBy: userId || 'system'
          });
        }
      } else {
        console.log(`📋 No project matches found for invoice ${invoiceId}`);
      }
    } catch (error: any) {
      console.error(`❌ Project matching error for invoice ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Update invoice status and add a log entry
   */
  private async updateInvoiceStatus(invoiceId: number, status: 'pending' | 'processing' | 'extracted' | 'approved' | 'rejected' | 'paid' | 'matched', message: string): Promise<void> {
    console.log(`Updating invoice ${invoiceId} status to: ${status} - ${message}`);
    await storage.updateInvoice(invoiceId, { status });
    const db = await getDb();
    await db.insert(invoiceImporterLogs).values({
      configId: 1, // Default config ID for RPA system
      status: 'running',
      message,
      userId: 'rpa-system',
      timestamp: new Date(),
    });
  }
}

export const invoiceProcessingService = new InvoiceProcessingService();