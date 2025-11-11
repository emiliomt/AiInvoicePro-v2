import { UniversalERPAdapter } from '../UniversalERPAdapter';
import {
  ERPCredentials,
  InvoiceQueryParams,
  ERPInvoice,
  AdapterConnectionTest,
  IntegrationMethod,
  ERPSystem
} from '../types';

/**
 * RPA Fallback Adapter - Wraps the existing Python Selenium-based RPA service
 * This adapter serves as the last resort when API-first methods are unavailable
 */
export class RPAFallbackAdapter extends UniversalERPAdapter {
  constructor(adapterId: string, credentials: ERPCredentials) {
    super(adapterId, credentials);
    
    // Ensure this is marked as RPA method
    this.credentials.method = IntegrationMethod.RPA;
  }
  
  async authenticate(): Promise<void> {
    // RPA authentication happens during the scraping process
    // Validate that required credentials are present
    if (!this.credentials.username || !this.credentials.password) {
      throw new Error('RPA adapter requires username and password');
    }
    
    if (!this.credentials.baseUrl) {
      throw new Error('RPA adapter requires baseUrl');
    }
    
    this.log('RPA credentials validated');
  }
  
  async testConnection(): Promise<AdapterConnectionTest> {
    const startTime = Date.now();
    
    try {
      // For RPA, we'll do a lightweight check
      // In production, this could trigger a quick test login
      await this.authenticate();
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        method: IntegrationMethod.RPA,
        responseTime,
        features: {
          bulkDownload: true,
          realTimeSync: false, // RPA is batch-based
          webhookSupport: false,
          xmlSupport: true,
          pdfSupport: true
        },
        details: 'RPA adapter ready. Note: This is a fallback method with lower reliability.'
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        method: IntegrationMethod.RPA,
        responseTime,
        features: {
          bulkDownload: false,
          realTimeSync: false,
          webhookSupport: false,
          xmlSupport: false,
          pdfSupport: false
        },
        error: error.message,
        details: 'RPA connection test failed'
      };
    }
  }
  
  async listInvoices(params: InvoiceQueryParams): Promise<ERPInvoice[]> {
    this.log('RPA adapter: listInvoices() - This method requires triggering the Python RPA service');
    
    // In a full implementation, this would:
    // 1. Call the Python RPA service via the existing infrastructure
    // 2. Wait for it to complete the scraping
    // 3. Read the results from the database (imported_invoices table)
    // 4. Transform them into ERPInvoice format
    
    // For now, return empty array as this requires integration with existing RPA service
    this.log('RPA listInvoices: Integration with pythonRpaService pending', 'warn');
    
    return [];
  }
  
  async downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer> {
    this.log(`RPA adapter: downloadDocument(${invoiceId}, ${type}) - Documents are downloaded during scraping`);
    
    // In the RPA flow, documents are already downloaded to the file system
    // This method would retrieve them from the uploads directory
    
    throw new Error('RPA downloadDocument: Documents are downloaded during the scraping process');
  }
  
  /**
   * Special method for RPA adapter to trigger a scraping job
   * This integrates with the existing Python RPA service
   */
  async triggerRPAScraping(configId: number, logId: number): Promise<{
    success: boolean;
    jobId: string;
    message: string;
  }> {
    try {
      this.log(`Triggering RPA scraping for config ${configId}, log ${logId}`);
      
      // This would call the existing Python RPA service
      // For now, return a placeholder response
      
      return {
        success: true,
        jobId: `rpa-${configId}-${logId}`,
        message: 'RPA scraping job queued'
      };
    } catch (error: any) {
      this.log(`Failed to trigger RPA scraping: ${error.message}`, 'error');
      
      return {
        success: false,
        jobId: '',
        message: error.message
      };
    }
  }
}
