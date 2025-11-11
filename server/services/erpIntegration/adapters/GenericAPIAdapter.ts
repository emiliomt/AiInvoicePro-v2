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
 * Supports multiple authentication methods: API Key, OAuth2, Basic Auth
 * Configurable for different API structures through credentials
 */
export class GenericAPIAdapter extends UniversalERPAdapter {
  private apiClient: APIClient;
  private authToken?: string;
  private tokenExpiry?: Date;
  
  constructor(adapterId: string, credentials: ERPCredentials) {
    super(adapterId, credentials);
    
    if (!credentials.baseUrl) {
      throw new Error('GenericAPIAdapter requires baseUrl in credentials');
    }
    
    this.apiClient = new APIClient(
      credentials.baseUrl,
      credentials.customHeaders || {}
    );
  }
  
  async authenticate(): Promise<void> {
    if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      this.log('Using cached authentication token');
      return;
    }
    
    const { apiKey, username, password, clientId, clientSecret, baseUrl } = this.credentials;
    
    if (!baseUrl) {
      throw new Error('Base URL is required for API adapter');
    }
    
    try {
      if (apiKey) {
        this.log('Authenticating with API key...');
        this.authToken = apiKey;
        this.tokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        this.apiClient.setDefaultHeader('Authorization', `Bearer ${apiKey}`);
        this.log('API key authentication successful');
        return;
      }
      
      if (clientId && clientSecret) {
        this.log('Authenticating with OAuth2 client credentials...');
        const response = await fetch(`${baseUrl}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
          })
        });
        
        if (!response.ok) {
          throw new Error(`OAuth authentication failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        this.authToken = data.access_token;
        this.tokenExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000);
        this.apiClient.setDefaultHeader('Authorization', `Bearer ${this.authToken}`);
        this.log('OAuth2 authentication successful');
        return;
      }
      
      if (username && password) {
        this.log('Authenticating with username/password...');
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
          throw new Error(`Login failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        this.authToken = data.token || data.access_token;
        this.tokenExpiry = new Date(Date.now() + ((data.expires_in || 3600) * 1000));
        this.apiClient.setDefaultHeader('Authorization', `Bearer ${this.authToken}`);
        this.log('Username/password authentication successful');
        return;
      }
      
      throw new Error('No valid authentication method provided (apiKey, OAuth, or username/password required)');
    } catch (error: any) {
      this.log(`Authentication failed: ${error.message}`, 'error');
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
  
  async testConnection(): Promise<AdapterConnectionTest> {
    const startTime = Date.now();
    
    try {
      await this.authenticate();
      
      const testParams: InvoiceQueryParams = {
        dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        dateTo: new Date(),
        limit: 1
      };
      
      try {
        await this.listInvoices(testParams);
      } catch (error) {
        this.log('Invoice list test failed, but authentication succeeded', 'warn');
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        method: IntegrationMethod.API,
        responseTime,
        features: {
          bulkDownload: true,
          realTimeSync: true,
          webhookSupport: false,
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
    await this.authenticate();
    
    const { baseUrl } = this.credentials;
    const queryParams = new URLSearchParams({
      date_from: params.dateFrom.toISOString().split('T')[0],
      date_to: params.dateTo.toISOString().split('T')[0],
      page: (params.page || 1).toString(),
      limit: (params.limit || 100).toString()
    });
    
    if (params.status) {
      queryParams.append('status', params.status);
    }
    
    if (params.filters?.invoiceIds && Array.isArray(params.filters.invoiceIds)) {
      params.filters.invoiceIds.forEach((id: string) => {
        queryParams.append('invoice_id', id);
      });
    }
    
    this.log(`Fetching invoices from ${baseUrl}/api/invoices`);
    
    const response = await fetch(`${baseUrl}/api/invoices?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        ...this.credentials.customHeaders
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch invoices: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    const invoices = data.invoices || data.data || data;
    this.log(`Fetched ${invoices.length} invoices from API`);
    
    return this.transformInvoices(invoices);
  }
  
  async downloadDocument(invoiceId: string, type: 'pdf' | 'xml'): Promise<Buffer> {
    await this.authenticate();
    
    const { baseUrl } = this.credentials;
    this.log(`Downloading ${type.toUpperCase()} for invoice ${invoiceId}...`);
    
    const response = await fetch(`${baseUrl}/api/invoices/${invoiceId}/download/${type}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        ...this.credentials.customHeaders
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download ${type}: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    this.log(`Successfully downloaded ${type.toUpperCase()} (${buffer.length} bytes)`);
    return buffer;
  }
  
  private transformInvoices(apiInvoices: any[]): ERPInvoice[] {
    return apiInvoices.map(inv => ({
      id: String(inv.id || inv.invoice_id),
      erpDocumentId: String(inv.document_id || inv.id),
      invoiceNumber: inv.invoice_number || inv.number || inv.id,
      issueDate: new Date(inv.issue_date || inv.date || inv.created_at),
      dueDate: inv.due_date ? new Date(inv.due_date) : undefined,
      vendorName: inv.vendor_name || inv.supplier_name || inv.vendor || 'Unknown Vendor',
      vendorTaxId: inv.vendor_tax_id || inv.supplier_nit || inv.vendor_id || '',
      customerName: inv.customer_name || inv.client_name,
      customerTaxId: inv.customer_tax_id || inv.client_nit,
      subtotal: parseFloat(inv.subtotal || inv.amount_before_tax || inv.net_amount || 0),
      taxAmount: parseFloat(inv.tax_amount || inv.vat || inv.tax || 0),
      total: parseFloat(inv.total || inv.total_amount || inv.gross_amount || 0),
      currency: inv.currency || 'COP',
      status: inv.status,
      projectName: inv.project_name || inv.project,
      poNumber: inv.po_number || inv.purchase_order,
      pdfUrl: inv.pdf_url,
      xmlUrl: inv.xml_url,
      metadata: inv
    }));
  }
}
