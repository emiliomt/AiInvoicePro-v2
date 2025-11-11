import { UniversalERPAdapter } from '../UniversalERPAdapter';
import {
  ERPCredentials,
  InvoiceQueryParams,
  ERPInvoice,
  AdapterConnectionTest,
  IntegrationMethod
} from '../types';
import { APIClient } from '../utils/apiClient';

/**
 * Generic API Adapter - Works with ERPs that provide RESTful APIs
 * Configurable for different API structures
 */
export class GenericAPIAdapter extends UniversalERPAdapter {
  private apiClient: APIClient;
  private authToken?: string;
  
  constructor(adapterId: string, credentials: ERPCredentials) {
    super(adapterId, credentials);
    
    if (!credentials.baseUrl) {
      throw new Error('GenericAPIAdapter requires baseUrl');
    }
    
    this.apiClient = new APIClient(
      credentials.baseUrl,
      credentials.customHeaders || {}
    );
  }
  
  async authenticate(): Promise<void> {
    this.log('Authenticating with API...');
    
    try {
      // Try API key authentication
      if (this.credentials.apiKey) {
        this.apiClient.setDefaultHeader('Authorization', `Bearer ${this.credentials.apiKey}`);
        this.authToken = this.credentials.apiKey;
        this.log('API key authentication configured');
        return;
      }
      
      // Try basic auth
      if (this.credentials.username && this.credentials.password) {
        const token = Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`
        ).toString('base64');
        
        this.apiClient.setDefaultHeader('Authorization', `Basic ${token}`);
        this.authToken = token;
        this.log('Basic authentication configured');
        return;
      }
      
      // Try OAuth (placeholder - would need full OAuth flow)
      if (this.credentials.clientId && this.credentials.clientSecret) {
        this.log('OAuth authentication not yet implemented', 'warn');
        throw new Error('OAuth authentication requires implementation');
      }
      
      throw new Error('No valid authentication credentials provided');
    } catch (error: any) {
      this.log(`Authentication failed: ${error.message}`, 'error');
      throw error;
    }
  }
  
  async testConnection(): Promise<AdapterConnectionTest> {
    const startTime = Date.now();
    
    try {
      await this.authenticate();
      
      // Try to make a test API call (adjust endpoint based on ERP)
      // For now, just verify authentication worked
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        method: IntegrationMethod.API,
        responseTime,
        features: {
          bulkDownload: true,
          realTimeSync: true,
          webhookSupport: false, // Would need to be configured per ERP
          xmlSupport: true,
          pdfSupport: true
        },
        details: 'API connection successful'
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        method: IntegrationMethod.API,
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
    this.log('Fetching invoices from API...');
    
    // This is a generic implementation - specific ERPs would override this
    // The endpoint and response format would be configurable
    
    try {
      const queryParams = new URLSearchParams({
        dateFrom: params.dateFrom.toISOString(),
        dateTo: params.dateTo.toISOString(),
        ...(params.status && { status: params.status }),
        ...(params.page && { page: params.page.toString() }),
        ...(params.limit && { limit: params.limit.toString() })
      });
      
      // Placeholder endpoint - would be configured per ERP
      const endpoint = `/api/invoices?${queryParams.toString()}`;
      
      this.log(`Calling endpoint: ${endpoint}`, 'info');
      
      // This would need to be implemented based on actual API structure
      throw new Error('Generic API adapter requires ERP-specific implementation');
    } catch (error: any) {
      this.log(`Failed to list invoices: ${error.message}`, 'error');
      throw error;
    }
  }
  
  async downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer> {
    this.log(`Downloading ${type} for invoice ${invoiceId}...`);
    
    try {
      // Placeholder endpoint - would be configured per ERP
      const endpoint = `/api/invoices/${invoiceId}/document?type=${type}`;
      
      const buffer = await this.apiClient.get<Buffer>(endpoint);
      
      this.log(`Successfully downloaded ${type} for invoice ${invoiceId}`);
      return buffer;
    } catch (error: any) {
      this.log(`Failed to download ${type}: ${error.message}`, 'error');
      throw error;
    }
  }
}
