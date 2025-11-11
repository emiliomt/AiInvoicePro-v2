import {
  ERPCredentials,
  InvoiceQueryParams,
  ERPInvoice,
  AdapterConnectionTest,
  AdapterMetrics,
  IntegrationMethod,
  SyncResult,
  SyncError
} from './types';

export abstract class UniversalERPAdapter {
  protected credentials: ERPCredentials;
  protected metrics: AdapterMetrics;
  protected adapterId: string;
  
  constructor(adapterId: string, credentials: ERPCredentials) {
    this.adapterId = adapterId;
    this.credentials = credentials;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      uptime: 100,
      invoicesProcessed: 0,
      errorRate: 0
    };
  }
  
  // Core methods - MUST be implemented by all adapters
  abstract authenticate(): Promise<void>;
  abstract testConnection(): Promise<AdapterConnectionTest>;
  abstract listInvoices(params: InvoiceQueryParams): Promise<ERPInvoice[]>;
  abstract downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer>;
  
  // Optional methods - Can be overridden
  async getInvoice(invoiceId: string): Promise<ERPInvoice> {
    const invoices = await this.listInvoices({
      dateFrom: new Date(0),
      dateTo: new Date(),
      filters: { id: invoiceId }
    });
    
    if (invoices.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    
    return invoices[0];
  }
  
  async syncInvoices(params: InvoiceQueryParams): Promise<SyncResult> {
    try {
      this.metrics.totalRequests++;
      const startTime = Date.now();
      
      // Authenticate before syncing
      await this.authenticate();
      
      // Fetch invoices
      const invoices = await this.listInvoices(params);
      
      // Download documents for each invoice
      const errors: SyncError[] = [];
      let processedCount = 0;
      
      for (const invoice of invoices) {
        try {
          // Download PDF if not already present
          if (!invoice.pdfBuffer && !invoice.pdfUrl) {
            try {
              invoice.pdfBuffer = await this.downloadDocument(invoice.id, 'pdf');
            } catch (pdfError: any) {
              console.log(`PDF not available for invoice ${invoice.id}: ${pdfError.message}`);
            }
          }
          
          // Download XML if not already present
          if (!invoice.xmlBuffer && !invoice.xmlUrl) {
            try {
              invoice.xmlBuffer = await this.downloadDocument(invoice.id, 'xml');
            } catch (xmlError: any) {
              console.log(`XML not available for invoice ${invoice.id}: ${xmlError.message}`);
            }
          }
          
          processedCount++;
        } catch (downloadError: any) {
          errors.push({
            invoiceId: invoice.id,
            error: `Failed to download documents: ${downloadError.message}`,
            timestamp: new Date()
          });
          console.error(`Failed to download documents for ${invoice.id}:`, downloadError);
        }
      }
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, true, invoices.length);
      
      return {
        success: true,
        invoices,
        totalCount: invoices.length,
        processedCount,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error: any) {
      this.metrics.failedRequests++;
      this.metrics.lastError = error.message;
      
      return {
        success: false,
        invoices: [],
        totalCount: 0,
        processedCount: 0,
        errorCount: 1,
        errors: [{
          error: error.message,
          details: error.stack,
          timestamp: new Date()
        }]
      };
    }
  }
  
  getMetrics(): AdapterMetrics {
    return { ...this.metrics };
  }
  
  getAdapterId(): string {
    return this.adapterId;
  }
  
  getIntegrationMethod(): IntegrationMethod {
    return this.credentials.method;
  }
  
  getERPSystem(): string {
    return this.credentials.erpSystem;
  }
  
  protected updateMetrics(responseTime: number, success: boolean, invoiceCount: number = 0) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
      this.metrics.invoicesProcessed += invoiceCount;
    } else {
      this.metrics.failedRequests++;
    }
    
    // Update average response time (running average)
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
    
    // Update uptime percentage
    this.metrics.uptime = (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
    
    // Update error rate
    this.metrics.errorRate = (this.metrics.failedRequests / this.metrics.totalRequests) * 100;
    
    // Update last sync timestamp
    this.metrics.lastSync = new Date();
  }
  
  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.adapterId}][${level.toUpperCase()}]`;
    console.log(`${timestamp} ${prefix} ${message}`);
  }
}
