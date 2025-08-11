import { eq, and } from 'drizzle-orm';
import { getStorage, getDb } from '../storage.js';
import { importedInvoices, invoices, invoiceImporterLogs, lineItems } from '../../shared/schema.js';
import * as aiService from './aiService.js';
import { storage } from '../storage.js';
import { parseInvoiceXML } from './xmlParser.js';
import * as fs from 'fs';
import * as path from 'path';
import { ClassificationService } from './classificationService.js';

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
          companyId: 2, // Always use RPA Import Company (ID: 2) for RPA imports
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
          .where(eq(importedInvoices.id, importedInvoice.id));

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
          companyId: 2, // Always use RPA Import Company (ID: 2) for RPA imports
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
          .where(eq(importedInvoices.id, importedInvoice.id));

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

    for (const invoiceId of invoiceIds) {
      try {
        // Process each invoice
        const result = await this.processInvoiceAutomatically(invoiceId, userId, source, skipValidation);
        if (result) {
          processedCount++;
        } else {
          failedCount++;
          errors.push(`Failed to process invoice ID ${invoiceId} automatically`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing invoice ID ${invoiceId} automatically:`, error);
        failedCount++;
        errors.push(`Invoice ID ${invoiceId}: ${error.message}`);
      }
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
          validationResult: validationResult,
          validationErrors: validationResult.violations || [],
          status: validationResult.isValid ? 'extracted' : 'rejected'
        });

        if (!validationResult.isValid) {
          console.log(`❌ Validation failed for invoice ${invoiceId}:`, validationResult.violations);
          await this.updateInvoiceStatus(invoiceId, 'rejected', 
            `Validation failed: ${validationResult.violations?.map((v: any) => v.message).join(', ') || 'Unknown validation errors'}`);
          // Continue processing even if validation fails for now
        } else {
          console.log(`✅ Validation passed for invoice ${invoiceId}`);
        }

        // Refresh invoice data after validation
        invoice = await storage.getInvoice(invoiceId);
      } catch (validationError: any) {
        console.error(`❌ Validation execution failed for invoice ${invoiceId}:`, validationError);
        await this.updateInvoiceStatus(invoiceId, 'processing', `Validation failed, continuing: ${validationError.message}`);
        // Continue processing even if validation fails
      }
    }

    // Step 3: Classify line items if not already done and validation passed or was skipped
    // If validation failed, we should still attempt to classify line items to identify issues
    if (invoice && invoice.extractedData && invoice.status !== 'rejected') {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'Classifying line items...');

      try {
        if ((invoice.extractedData as any).lineItems && (invoice.extractedData as any).lineItems.length > 0) {
          for (const item of (invoice.extractedData as any).lineItems) {
            // Insert line item if it doesn't exist
            const existingLineItem = await db.query.lineItems.findFirst({
              where: (lt, { eq }) => eq(lt.invoiceId, invoiceId)
            });

            if (!existingLineItem) {
              const [lineItem] = await db.insert(lineItems).values({
                invoiceId: invoiceId,
                description: item.description,
                quantity: item.quantity || '1',
                unitPrice: item.unitPrice || '0.00',
                totalPrice: item.totalPrice || '0.00',
              }).returning();

              // Classify the line item after insertion
              await ClassificationService.classifyAndStore(lineItem.id, userId);
            }
          }
          console.log(`✅ Line items classified for invoice ${invoiceId}`);
        } else {
          console.log(`ℹ️ No line items found for invoice ${invoiceId} to classify.`);
        }
      } catch (classificationError: any) {
        console.error(`❌ Line item classification failed for invoice ${invoiceId}:`, classificationError);
        await this.updateInvoiceStatus(invoiceId, 'rejected', `Line item classification failed: ${classificationError.message}`);
        return false;
      }
    } else if (invoice && invoice.status === 'rejected') {
      console.log(`ℹ️ Skipping line item classification for invoice ${invoiceId} due to previous failure.`);
      return false;
    }

    // Step 4: Check for petty cash auto-approval
    if (invoice && invoice.extractedData) {
      await this.updateInvoiceStatus(invoiceId, 'processing', 'Checking petty cash criteria...');

      try {
        // Get petty cash threshold
        const thresholdSetting = await storage.getSetting('petty_cash_threshold');
        const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 1000;
        
        const amount = parseFloat(invoice.totalAmount || "0");
        const isPettyCash = amount <= threshold && amount > 0;

        if (isPettyCash) {
          console.log(`💰 Invoice ${invoiceId} qualifies for petty cash (${amount} <= ${threshold})`);
          
          // Create or update petty cash log
          const existingLog = await storage.getPettyCashLogByInvoiceId(invoiceId);
          
          if (existingLog) {
            await storage.updatePettyCashLog(existingLog.id, {
              isPettyCash: true,
              classificationMethod: 'automatic',
              confidenceScore: 1.0,
              status: 'approved',
              costCenter: 'Petty Cash',
              approvedBy: userId,
              approvedAt: new Date(),
              approvalNotes: 'Auto-approved during processing - meets petty cash criteria',
              updatedAt: new Date()
            });
          } else {
            await storage.createPettyCashLog({
              invoiceId,
              isPettyCash: true,
              classificationMethod: 'automatic',
              confidenceScore: 1.0,
              status: 'approved',
              costCenter: 'Petty Cash',
              approvedBy: userId,
              approvedAt: new Date(),
              approvalNotes: 'Auto-approved during processing - meets petty cash criteria'
            });
          }
          
          console.log(`✅ Auto-approved petty cash for invoice ${invoiceId}`);
        }
      } catch (pettyCashError: any) {
        console.error(`❌ Petty cash processing failed for invoice ${invoiceId}:`, pettyCashError);
        // Continue with normal processing even if petty cash fails
      }
    }

    // Step 5: Finalize invoice status
    // Set to approved if everything went well
    await this.updateInvoiceStatus(invoiceId, 'approved', 'Invoice processing completed');

    console.log(`✅ Successfully processed invoice ID ${invoiceId}`);
    return true;
  }

  /**
   * Update invoice status and add a log entry
   */
  private async updateInvoiceStatus(invoiceId: number, status: 'pending' | 'processing' | 'extracted' | 'approved' | 'rejected' | 'paid' | 'matched', message: string): Promise<void> {
    console.log(`Updating invoice ${invoiceId} status to: ${status} - ${message}`);
    await storage.updateInvoice(invoiceId, { status });
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