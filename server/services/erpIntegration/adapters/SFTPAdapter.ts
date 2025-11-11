import { UniversalERPAdapter } from '../UniversalERPAdapter';
import {
  ERPCredentials,
  InvoiceQueryParams,
  ERPInvoice,
  AdapterConnectionTest,
  IntegrationMethod
} from '../types';

/**
 * SFTP Adapter - Downloads invoices from SFTP server
 * Useful for ERPs that export invoices to SFTP
 */
export class SFTPAdapter extends UniversalERPAdapter {
  private sftpConfig: {
    host: string;
    port: number;
    username: string;
    password: string;
    remotePath: string;
  };
  
  constructor(adapterId: string, credentials: ERPCredentials) {
    super(adapterId, credentials);
    
    if (!credentials.host || !credentials.username || !credentials.password) {
      throw new Error('SFTP adapter requires host, username, and password');
    }
    
    this.sftpConfig = {
      host: credentials.host,
      port: credentials.port || 22,
      username: credentials.username,
      password: credentials.password,
      remotePath: credentials.ftpPath || '/invoices'
    };
  }
  
  async authenticate(): Promise<void> {
    this.log('SFTP authentication not yet implemented', 'warn');
    // Would connect to SFTP server here
  }
  
  async testConnection(): Promise<AdapterConnectionTest> {
    const startTime = Date.now();
    
    try {
      // Would test SFTP connection here
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        method: IntegrationMethod.SFTP,
        responseTime,
        features: {
          bulkDownload: true,
          realTimeSync: false,
          webhookSupport: false,
          xmlSupport: true,
          pdfSupport: true
        },
        error: 'SFTP adapter not yet implemented'
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        method: IntegrationMethod.SFTP,
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
    throw new Error('SFTP adapter not yet implemented');
  }
  
  async downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer> {
    throw new Error('SFTP adapter not yet implemented');
  }
}
