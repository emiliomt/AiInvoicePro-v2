export enum IntegrationMethod {
  API = 'api',
  XML_POLLING = 'xml_polling',
  EMAIL = 'email',
  SFTP = 'sftp',
  WEB_PORTAL = 'web_portal',
  RPA = 'rpa'
}

export enum ERPSystem {
  SINCO = 'sinco',
  SAP_B1 = 'sap_b1',
  SAP_HANA = 'sap_hana',
  ORACLE_EBS = 'oracle_ebs',
  MICROSOFT_DYNAMICS = 'dynamics',
  ODOO = 'odoo',
  GENERIC = 'generic'
}

export interface ERPCredentials {
  method: IntegrationMethod;
  erpSystem: ERPSystem;
  
  // API credentials
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  
  // OAuth credentials
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  
  // Basic auth
  username?: string;
  password?: string;
  
  // Email/SFTP
  host?: string;
  port?: number;
  email?: string;
  ftpPath?: string;
  
  // Additional config
  customHeaders?: Record<string, string>;
  pollInterval?: number; // minutes
  timezone?: string;
  
  // RPA-specific (legacy support)
  downloadPath?: string;
  xmlPath?: string;
  headless?: boolean;
  zipDownloadTimeout?: number;
}

export interface InvoiceQueryParams {
  dateFrom: Date;
  dateTo: Date;
  status?: 'all' | 'pending' | 'approved' | 'paid';
  documentTypes?: ('invoice' | 'credit_note' | 'debit_note')[];
  format?: 'json' | 'xml' | 'ubl';
  page?: number;
  limit?: number;
  filters?: Record<string, any>;
}

export interface ERPInvoice {
  // Universal invoice structure
  id: string;
  erpDocumentId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date;
  
  // Parties
  vendorName: string;
  vendorTaxId: string;
  customerName?: string;
  customerTaxId?: string;
  
  // Amounts
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  
  // Documents
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  xmlUrl?: string;
  xmlBuffer?: Buffer;
  
  // Metadata
  status?: string;
  projectName?: string;
  poNumber?: string;
  lineItems?: InvoiceLineItem[];
  metadata?: Record<string, any>;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  category?: string;
  unit?: string;
}

export interface AdapterConnectionTest {
  success: boolean;
  method: IntegrationMethod;
  responseTime: number;
  features: {
    bulkDownload: boolean;
    realTimeSync: boolean;
    webhookSupport: boolean;
    xmlSupport: boolean;
    pdfSupport: boolean;
  };
  error?: string;
  details?: string;
}

export interface AdapterMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  uptime: number;
  lastSync?: Date;
  invoicesProcessed: number;
  errorRate?: number;
  lastError?: string;
}

export interface AdapterCapability {
  method: IntegrationMethod;
  erpSystem: ERPSystem;
  supportedFeatures: string[];
  reliabilityScore: number; // 0-100
  averageResponseTime: number; // milliseconds
  isHealthy: boolean;
  lastHealthCheck?: Date;
}

export interface SyncResult {
  success: boolean;
  invoices: ERPInvoice[];
  totalCount?: number;
  processedCount?: number;
  errorCount?: number;
  errors?: SyncError[];
  metadata?: Record<string, any>;
}

export interface SyncError {
  invoiceId?: string;
  error: string;
  details?: string;
  timestamp: Date;
}

export interface AdapterInstance {
  id: string;
  connectionId: number;
  adapterId: string;
  method: IntegrationMethod;
  erpSystem: ERPSystem;
  config: Record<string, any>;
  isActive: boolean;
  lastSync?: Date;
  metrics: AdapterMetrics;
  capabilities: AdapterCapability;
}

export interface ProgressPayload {
  adapterId: string;
  jobId: string;
  stage: string;
  progress: number; // 0-100
  message: string;
  metrics?: {
    totalInvoices?: number;
    processedInvoices?: number;
    skippedInvoices?: number;
    failedInvoices?: number;
    currentStep?: string;
  };
  timestamp: Date;
}
