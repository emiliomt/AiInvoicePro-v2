
import { storage } from '../storage';

export class PostImportPdfLinker {
  /**
   * Links PDFs to invoices after RPA import based on token matching
   */
  async linkPdfsAfterImport(logId: number): Promise<{
    linkedCount: number;
    unlinkedPdfs: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    let linkedCount = 0;
    const unlinkedPdfs: string[] = [];

    try {
      console.log(`🔗 Starting post-import PDF linking for log ${logId}`);

      // Get all imported files for this log
      const importedFiles = await storage.getImportedInvoicesByLog(logId);
      
      const xmlFiles = importedFiles.filter(f => f.fileType === 'xml');
      const pdfFiles = importedFiles.filter(f => f.fileType === 'pdf' && !f.linkedInvoiceId);

      console.log(`📁 Found ${xmlFiles.length} XML files and ${pdfFiles.length} unlinked PDF files`);

      // For each unlinked PDF, try to find matching invoice
      for (const pdfFile of pdfFiles) {
        try {
          const pdfToken = this.extractInvoiceToken(pdfFile.originalFileName || '');
          
          if (!pdfToken) {
            console.log(`⚠️ Could not extract token from PDF: ${pdfFile.originalFileName}`);
            unlinkedPdfs.push(pdfFile.originalFileName || 'unknown');
            continue;
          }

          // Find matching invoice by token
          const matchingInvoice = await this.findInvoiceByToken(pdfToken, logId);
          
          if (matchingInvoice) {
            // Link PDF to invoice
            await storage.updateImportedInvoice(pdfFile.id, {
              linkedInvoiceId: matchingInvoice.id,
              processingStatus: 'completed'
            });

            // Update the main invoice record with PDF reference
            await storage.updateInvoice(matchingInvoice.id, {
              extractedData: {
                ...matchingInvoice.extractedData,
                linkedPdfFile: pdfFile.originalFileName,
                linkedPdfPath: pdfFile.filePath
              }
            });

            console.log(`✅ Linked PDF ${pdfFile.originalFileName} to invoice ${matchingInvoice.id}`);
            linkedCount++;
          } else {
            console.log(`❌ No matching invoice found for PDF token: ${pdfToken}`);
            unlinkedPdfs.push(pdfFile.originalFileName || 'unknown');
          }
        } catch (error: any) {
          const errorMsg = `Failed to link PDF ${pdfFile.originalFileName}: ${error.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      console.log(`🔗 Post-import linking completed: ${linkedCount} linked, ${unlinkedPdfs.length} unlinked`);

      return {
        linkedCount,
        unlinkedPdfs,
        errors
      };

    } catch (error: any) {
      console.error('Post-import PDF linking failed:', error);
      errors.push(`General linking error: ${error.message}`);
      
      return {
        linkedCount,
        unlinkedPdfs,
        errors
      };
    }
  }

  /**
   * Extract invoice token from filename for matching
   */
  private extractInvoiceToken(filename: string): string | null {
    // Remove file extension
    const baseName = filename.replace(/\.(xml|pdf)$/i, '');
    
    // Try different token extraction patterns
    const patterns = [
      // Pattern 1: INVOICE_NUMBER_TAX_ID (e.g., "ROS16733_901328897")
      /^([A-Z0-9]+_[0-9]{9,12})/,
      // Pattern 2: Just the invoice number part
      /^([A-Z0-9]+\d+)/,
      // Pattern 3: Invoice number with tax ID separated by underscore
      /^([^_]+_[0-9]{9,12})/
    ];

    for (const pattern of patterns) {
      const match = baseName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Find invoice by token in various ways
   */
  private async findInvoiceByToken(token: string, logId: number): Promise<any> {
    try {
      // Get all invoices created from this import log
      const importedFiles = await storage.getImportedInvoicesByLog(logId);
      const xmlFiles = importedFiles.filter(f => f.fileType === 'xml' && f.invoiceId);

      // Check each XML file's associated invoice
      for (const xmlFile of xmlFiles) {
        if (!xmlFile.invoiceId) continue;

        const invoice = await storage.getInvoice(xmlFile.invoiceId);
        if (!invoice) continue;

        // Check if tokens match
        const xmlToken = this.extractInvoiceToken(xmlFile.originalFileName || '');
        if (xmlToken === token) {
          return invoice;
        }

        // Also check extracted data for document number match
        const extractedData = invoice.extractedData as any;
        if (extractedData?.documentNumber && token.includes(extractedData.documentNumber)) {
          return invoice;
        }

        if (extractedData?.invoiceNumber && token.includes(extractedData.invoiceNumber)) {
          return invoice;
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding invoice by token:', error);
      return null;
    }
  }

  /**
   * Check current linking status for a log
   */
  async checkLinkingStatus(logId: number): Promise<{
    totalPdfs: number;
    linkedPdfs: number;
    unlinkedPdfs: number;
    details: Array<{
      filename: string;
      linked: boolean;
      linkedToInvoice?: number;
    }>;
  }> {
    const importedFiles = await storage.getImportedInvoicesByLog(logId);
    const pdfFiles = importedFiles.filter(f => f.fileType === 'pdf');

    const details = pdfFiles.map(pdf => ({
      filename: pdf.originalFileName || 'unknown',
      linked: !!pdf.linkedInvoiceId,
      linkedToInvoice: pdf.linkedInvoiceId || undefined
    }));

    const linkedPdfs = details.filter(d => d.linked).length;

    return {
      totalPdfs: pdfFiles.length,
      linkedPdfs,
      unlinkedPdfs: pdfFiles.length - linkedPdfs,
      details
    };
  }
}

export const postImportPdfLinker = new PostImportPdfLinker();
