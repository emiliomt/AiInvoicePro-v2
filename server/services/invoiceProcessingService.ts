import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { importedInvoices, invoices, invoiceImporterLogs } from '../../shared/schema.js';
import { extractInvoiceData } from './aiService.js';
import { parseInvoiceXML } from './xmlParser.js';
import * as fs from 'fs';
import * as path from 'path';

export class InvoiceProcessingService {
  /**
   * Process all downloaded imported invoices that haven't been processed yet
   */
  async processDownloadedInvoices(): Promise<{ processed: number; failed: number; errors: string[] }> {
    console.log('🔄 Starting processing of downloaded imported invoices...');
    
    // Find all downloaded but unprocessed imported invoices
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
    try {
      // The invoice_importer_configs table doesn't have a direct company_id
      // For RPA imports, we'll use a default company
      console.log(`Getting company ID for log ${logId} - using default RPA company (ID: 2)`);
      return 2; // Use the RPA Import Company we created
    } catch (error) {
      console.error('Failed to get company ID from log:', error);
      return 2; // Default fallback
    }
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

    // Temporarily update our search to process this specific batch
    const originalSelect = db.select;
    
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
}

export const invoiceProcessingService = new InvoiceProcessingService();