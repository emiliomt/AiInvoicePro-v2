import { ErpConnection, RpaExtractionJob, RpaJobExecution, RpaDocumentQueue, InsertRpaJobExecution, InsertRpaDocumentQueue } from "../../shared/schema.js";
import { extractInvoiceData, extractPurchaseOrderData } from "./aiService.js";
import { ocrService } from "./ocrService.js";

export interface ERPDocument {
  id: string;
  type: 'invoice' | 'purchase_order';
  data: any;
  metadata?: {
    lastModified?: string;
    fileSize?: number;
    format?: string;
  };
}

export interface ERPExtractionResult {
  documentsFound: number;
  documentsProcessed: number;
  documentsSkipped: number;
  errorCount: number;
  extractedDocuments: ERPDocument[];
  errors: Array<{
    documentId: string;
    error: string;
    timestamp: string;
  }>;
}

export class RPAService {
  /**
   * Test ERP connection and validate credentials
   */
  async testERPConnection(connection: ErpConnection): Promise<{ success: boolean; error?: string }> {
    try {
      const config = connection.connectionConfig as any;
      
      switch (connection.erpSystemType) {
        case 'custom_api':
          return await this.testCustomAPIConnection(config);
        case 'sftp':
          return await this.testSFTPConnection(config);
        case 'database':
          return await this.testDatabaseConnection(config);
        case 'sharepoint':
          return await this.testSharePointConnection(config);
        case 'sap':
          return await this.testSAPConnection(config);
        case 'oracle':
          return await this.testOracleConnection(config);
        default:
          return { success: false, error: 'Unsupported ERP system type' };
      }
    } catch (error: any) {
      console.error('ERP connection test failed:', error);
      return { success: false, error: error.message || 'Connection test failed' };
    }
  }

  /**
   * Execute an RPA extraction job
   */
  async executeExtractionJob(
    job: RpaExtractionJob,
    connection: ErpConnection
  ): Promise<ERPExtractionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    
    console.log(`Starting RPA extraction job: ${job.jobName} (${executionId})`);
    console.log(`Connection type: ${connection.erpSystemType}`);
    console.log(`Job criteria:`, job.extractionCriteria);
    
    try {
      const config = connection.connectionConfig as any;
      const criteria = job.extractionCriteria as any;
      
      // Validate connection configuration
      if (!config) {
        throw new Error('Connection configuration is missing');
      }
      
      // Extract documents based on ERP system type
      let extractionResult: ERPExtractionResult;
      
      switch (connection.erpSystemType) {
        case 'custom_api':
          console.log('Using Custom API extraction method');
          extractionResult = await this.extractFromCustomAPI(config, criteria, job.documentType);
          break;
        case 'sftp':
          console.log('Using SFTP extraction method');
          extractionResult = await this.extractFromSFTP(config, criteria, job.documentType);
          break;
        case 'database':
          console.log('Using Database extraction method');
          extractionResult = await this.extractFromDatabase(config, criteria, job.documentType);
          break;
        case 'sharepoint':
          console.log('Using SharePoint extraction method');
          extractionResult = await this.extractFromSharePoint(config, criteria, job.documentType);
          break;
        case 'sap':
          console.log('Using SAP extraction method');
          extractionResult = await this.extractFromSAP(config, criteria, job.documentType);
          break;
        case 'oracle':
          console.log('Using Oracle extraction method');
          extractionResult = await this.extractFromOracle(config, criteria, job.documentType);
          break;
        default:
          throw new Error(`Unsupported ERP system: ${connection.erpSystemType}. Supported types: custom_api, sftp, database, sharepoint, sap, oracle`);
      }
      
      console.log(`RPA extraction completed successfully:`);
      console.log(`- Documents found: ${extractionResult.documentsFound}`);
      console.log(`- Documents processed: ${extractionResult.documentsProcessed}`);
      console.log(`- Documents skipped: ${extractionResult.documentsSkipped}`);
      console.log(`- Errors encountered: ${extractionResult.errorCount}`);
      
      if (extractionResult.errors.length > 0) {
        console.log('Extraction errors:', extractionResult.errors);
      }
      
      return extractionResult;
      
    } catch (error: any) {
      console.error(`RPA extraction job failed for ${job.jobName}:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        jobId: executionId,
        connectionType: connection.erpSystemType,
        executionTime: Date.now() - startTime.getTime()
      });
      
      // Return a structured error result instead of throwing
      return {
        documentsFound: 0,
        documentsProcessed: 0,
        documentsSkipped: 0,
        errorCount: 1,
        extractedDocuments: [],
        errors: [{
          documentId: 'job_execution',
          error: error.message || 'Unknown extraction error',
          timestamp: new Date().toISOString()
        }]
      };
    }
  }

  /**
   * Process extracted documents and convert to invoices/POs
   */
  async processExtractedDocuments(
    documents: ERPDocument[],
    jobExecutionId: number,
    userId: string
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const doc of documents) {
      try {
        if (doc.type === 'invoice') {
          await this.processInvoiceDocument(doc, jobExecutionId, userId);
        } else if (doc.type === 'purchase_order') {
          await this.processPurchaseOrderDocument(doc, jobExecutionId, userId);
        }
        processed++;
      } catch (error: any) {
        failed++;
        errors.push(`Document ${doc.id}: ${error.message}`);
        console.error(`Failed to process document ${doc.id}:`, error);
      }
    }
    
    return { processed, failed, errors };
  }

  // Private methods for different ERP systems

  private async testCustomAPIConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { endpoint, apiKey, headers = {} } = config;
      
      const response = await fetch(`${endpoint}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...headers
        }
      });
      
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async testSFTPConnection(config: any): Promise<{ success: boolean; error?: string }> {
    // For SFTP, we'd typically use a library like ssh2-sftp-client
    // This is a placeholder implementation
    try {
      const { host, port, username, password } = config;
      
      // Simulate SFTP connection test
      if (host && username && password) {
        return { success: true };
      } else {
        return { success: false, error: 'Missing SFTP credentials' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async testDatabaseConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { host, port, database, username, password, type } = config;
      
      // Simulate database connection test
      if (host && database && username && password) {
        return { success: true };
      } else {
        return { success: false, error: 'Missing database credentials' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async testSharePointConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { siteUrl, clientId, clientSecret } = config;
      
      // Simulate SharePoint connection test
      if (siteUrl && clientId && clientSecret) {
        return { success: true };
      } else {
        return { success: false, error: 'Missing SharePoint credentials' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async testSAPConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { host, systemNumber, client, username, password } = config;
      
      // Simulate SAP connection test
      if (host && systemNumber && client && username && password) {
        return { success: true };
      } else {
        return { success: false, error: 'Missing SAP credentials' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async testOracleConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { host, port, serviceName, username, password } = config;
      
      // Simulate Oracle connection test
      if (host && serviceName && username && password) {
        return { success: true };
      } else {
        return { success: false, error: 'Missing Oracle credentials' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Document extraction methods for different ERP systems

  private async extractFromCustomAPI(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    const { endpoint, apiKey, headers = {} } = config;
    const { dateFrom, dateTo, filters = {} } = criteria;
    
    try {
      const queryParams = new URLSearchParams({
        type: documentType,
        from: dateFrom,
        to: dateTo,
        ...filters
      });
      
      const response = await fetch(`${endpoint}/documents?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const documents: ERPDocument[] = data.documents?.map((doc: any) => ({
        id: doc.id,
        type: documentType as 'invoice' | 'purchase_order',
        data: doc,
        metadata: {
          lastModified: doc.lastModified,
          fileSize: doc.size,
          format: doc.format
        }
      })) || [];
      
      return {
        documentsFound: documents.length,
        documentsProcessed: documents.length,
        documentsSkipped: 0,
        errorCount: 0,
        extractedDocuments: documents,
        errors: []
      };
    } catch (error: any) {
      return {
        documentsFound: 0,
        documentsProcessed: 0,
        documentsSkipped: 0,
        errorCount: 1,
        extractedDocuments: [],
        errors: [{ documentId: 'unknown', error: error.message, timestamp: new Date().toISOString() }]
      };
    }
  }

  private async extractFromSFTP(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    // SFTP extraction implementation
    // This would use ssh2-sftp-client to connect and download files
    const documents: ERPDocument[] = [];
    
    // Placeholder implementation
    return {
      documentsFound: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      errorCount: 0,
      extractedDocuments: documents,
      errors: []
    };
  }

  private async extractFromDatabase(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    // Database extraction implementation
    const documents: ERPDocument[] = [];
    
    // Placeholder implementation
    return {
      documentsFound: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      errorCount: 0,
      extractedDocuments: documents,
      errors: []
    };
  }

  private async extractFromSharePoint(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    // SharePoint extraction implementation
    const documents: ERPDocument[] = [];
    
    // Placeholder implementation
    return {
      documentsFound: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      errorCount: 0,
      extractedDocuments: documents,
      errors: []
    };
  }

  private async extractFromSAP(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    // SAP extraction implementation
    const documents: ERPDocument[] = [];
    
    // Placeholder implementation
    return {
      documentsFound: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      errorCount: 0,
      extractedDocuments: documents,
      errors: []
    };
  }

  private async extractFromOracle(
    config: any,
    criteria: any,
    documentType: string
  ): Promise<ERPExtractionResult> {
    // Oracle extraction implementation
    const documents: ERPDocument[] = [];
    
    // Placeholder implementation
    return {
      documentsFound: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      errorCount: 0,
      extractedDocuments: documents,
      errors: []
    };
  }

  private async processInvoiceDocument(
    document: ERPDocument,
    jobExecutionId: number,
    userId: string
  ): Promise<void> {
    try {
      // Extract text content from document
      let ocrText = '';
      
      if (document.data.content) {
        // If document has text content directly
        ocrText = document.data.content;
      } else if (document.data.fileUrl) {
        // If document is a file, perform OCR
        const buffer = await this.downloadFile(document.data.fileUrl);
        ocrText = await ocrService.extractText(buffer, 'application/pdf');
      } else if (document.data.base64Content) {
        // If document is base64 encoded
        const buffer = Buffer.from(document.data.base64Content, 'base64');
        ocrText = await ocrService.extractText(buffer, document.metadata?.format || 'application/pdf');
      }
      
      // Use AI to extract structured data
      const extractedData = await extractInvoiceData(ocrText);
      
      // Create invoice record
      const invoiceData = {
        userId,
        fileName: document.data.fileName || `invoice_${document.id}`,
        fileUrl: document.data.fileUrl || null,
        status: 'extracted' as const,
        vendorName: extractedData.vendorName,
        invoiceNumber: extractedData.invoiceNumber,
        invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
        dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
        totalAmount: extractedData.totalAmount,
        taxAmount: extractedData.taxAmount,
        subtotal: extractedData.subtotal,
        currency: extractedData.currency,
        ocrText,
        extractedData,
        projectName: extractedData.projectName,
        confidenceScore: extractedData.confidenceScore,
      };
      
      // Note: In a real implementation, you'd save this to the database
      console.log('Processed invoice:', invoiceData);
      
    } catch (error: any) {
      console.error(`Failed to process invoice document ${document.id}:`, error);
      throw error;
    }
  }

  private async processPurchaseOrderDocument(
    document: ERPDocument,
    jobExecutionId: number,
    userId: string
  ): Promise<void> {
    try {
      // Extract text content from document
      let ocrText = '';
      
      if (document.data.content) {
        ocrText = document.data.content;
      } else if (document.data.fileUrl) {
        const buffer = await this.downloadFile(document.data.fileUrl);
        ocrText = await ocrService.extractText(buffer, 'application/pdf');
      } else if (document.data.base64Content) {
        const buffer = Buffer.from(document.data.base64Content, 'base64');
        ocrText = await ocrService.extractText(buffer, document.metadata?.format || 'application/pdf');
      }
      
      // Use AI to extract structured data
      const extractedData = await extractPurchaseOrderData(ocrText);
      
      // Create purchase order record
      const poData = {
        userId,
        poId: extractedData.poId || `po_${document.id}`,
        vendorName: extractedData.vendorName || '',
        issueDate: extractedData.issueDate ? new Date(extractedData.issueDate) : new Date(),
        expectedDeliveryDate: extractedData.expectedDeliveryDate ? new Date(extractedData.expectedDeliveryDate) : null,
        amount: extractedData.totalAmount || '0',
        currency: extractedData.currency,
        projectId: extractedData.projectId || '',
        buyerName: extractedData.buyerName || '',
        buyerAddress: extractedData.buyerAddress || '',
        vendorAddress: extractedData.vendorAddress || '',
        terms: extractedData.terms || '',
        items: extractedData.lineItems,
        status: 'active' as const,
        ocrText,
        extractedData,
      };
      
      // Note: In a real implementation, you'd save this to the database
      console.log('Processed purchase order:', poData);
      
    } catch (error: any) {
      console.error(`Failed to process PO document ${document.id}:`, error);
      throw error;
    }
  }

  private async downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Schedule automatic job execution based on cron-like schedule
   */
  async scheduleJob(job: RpaExtractionJob): Promise<void> {
    const scheduleConfig = job.scheduleConfig as any;
    
    if (!scheduleConfig || !scheduleConfig.enabled) {
      return;
    }
    
    // Calculate next run time based on schedule
    const nextRunTime = this.calculateNextRunTime(scheduleConfig);
    
    // Note: In a real implementation, you'd use a job scheduler like node-cron or bull queue
    console.log(`Job ${job.jobName} scheduled for next run at: ${nextRunTime}`);
  }

  private calculateNextRunTime(scheduleConfig: any): Date {
    const now = new Date();
    const { frequency, interval = 1 } = scheduleConfig;
    
    switch (frequency) {
      case 'hourly':
        return new Date(now.getTime() + interval * 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + interval);
        return nextMonth;
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
    }
  }
}

export const rpaService = new RPAService();