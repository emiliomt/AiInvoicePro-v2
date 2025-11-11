import { UniversalERPAdapter } from '../UniversalERPAdapter';
import {
  ERPCredentials,
  InvoiceQueryParams,
  ERPInvoice,
  AdapterConnectionTest,
  IntegrationMethod
} from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * XML Polling Adapter - Monitors a directory for XML invoice files
 * Useful for ERPs that export invoices to a shared folder
 */
export class XMLPollingAdapter extends UniversalERPAdapter {
  private pollingPath: string;
  private pollInterval: number;
  
  constructor(adapterId: string, credentials: ERPCredentials) {
    super(adapterId, credentials);
    
    this.pollingPath = credentials.xmlPath || credentials.downloadPath || '/tmp/erp_exports';
    this.pollInterval = credentials.pollInterval || 15; // minutes
  }
  
  async authenticate(): Promise<void> {
    // For file-based polling, authentication means verifying path access
    try {
      await fs.access(this.pollingPath);
      this.log(`XML polling path accessible: ${this.pollingPath}`);
    } catch (error: any) {
      throw new Error(`Cannot access XML polling path ${this.pollingPath}: ${error.message}`);
    }
  }
  
  async testConnection(): Promise<AdapterConnectionTest> {
    const startTime = Date.now();
    
    try {
      await this.authenticate();
      
      // Check if path exists and is readable
      const stats = await fs.stat(this.pollingPath);
      
      if (!stats.isDirectory()) {
        throw new Error('Polling path is not a directory');
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        method: IntegrationMethod.XML_POLLING,
        responseTime,
        features: {
          bulkDownload: true,
          realTimeSync: false, // Polling-based, not real-time
          webhookSupport: false,
          xmlSupport: true,
          pdfSupport: false // XML only, PDFs would need separate adapter
        },
        details: `Polling directory: ${this.pollingPath}, Interval: ${this.pollInterval}min`
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        method: IntegrationMethod.XML_POLLING,
        responseTime,
        features: {
          bulkDownload: false,
          realTimeSync: false,
          webhookSupport: false,
          xmlSupport: false,
          pdfSupport: false
        },
        error: error.message
      };
    }
  }
  
  async listInvoices(params: InvoiceQueryParams): Promise<ERPInvoice[]> {
    this.log('Scanning directory for XML invoices...');
    
    try {
      const files = await fs.readdir(this.pollingPath);
      const xmlFiles = files.filter(f => f.endsWith('.xml'));
      
      this.log(`Found ${xmlFiles.length} XML files`);
      
      const invoices: ERPInvoice[] = [];
      
      for (const file of xmlFiles) {
        try {
          const filePath = path.join(this.pollingPath, file);
          const stats = await fs.stat(filePath);
          
          // Filter by date range
          if (stats.mtime < params.dateFrom || stats.mtime > params.dateTo) {
            continue;
          }
          
          // Read and parse XML
          const xmlContent = await fs.readFile(filePath, 'utf-8');
          const xmlBuffer = Buffer.from(xmlContent, 'utf-8');
          
          // Parse XML to extract invoice data
          // This would use the existing XML parser service
          const invoice = await this.parseXMLToInvoice(file, xmlBuffer);
          
          if (invoice) {
            invoices.push(invoice);
          }
        } catch (error: any) {
          this.log(`Failed to process ${file}: ${error.message}`, 'warn');
        }
      }
      
      this.log(`Processed ${invoices.length} invoices from XML files`);
      return invoices;
    } catch (error: any) {
      this.log(`Failed to list invoices: ${error.message}`, 'error');
      throw error;
    }
  }
  
  async downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer> {
    if (type === 'pdf') {
      throw new Error('XML Polling Adapter does not support PDF downloads');
    }
    
    const filePath = path.join(this.pollingPath, `${invoiceId}.xml`);
    
    try {
      const content = await fs.readFile(filePath);
      return content;
    } catch (error: any) {
      throw new Error(`Failed to read XML file ${invoiceId}: ${error.message}`);
    }
  }
  
  private async parseXMLToInvoice(filename: string, xmlBuffer: Buffer): Promise<ERPInvoice | null> {
    // This would integrate with the existing XML parser service
    // For now, return a placeholder
    
    return {
      id: filename.replace('.xml', ''),
      erpDocumentId: filename,
      invoiceNumber: filename.replace('.xml', ''),
      issueDate: new Date(),
      vendorName: 'Unknown',
      vendorTaxId: 'Unknown',
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      currency: 'COP',
      xmlBuffer
    };
  }
}
