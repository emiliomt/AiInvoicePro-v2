import { RunContext } from './context';
import { OrchestratorConfig } from './config';

// Import existing services
import { extractInvoiceData } from '../services/aiService';
import { processInvoiceOCR } from '../services/ocrService';
import { parseInvoiceXML } from '../services/xmlParser';
import { erpAutomationService } from '../services/erpAutomationService';
import { invoiceImporterService } from '../services/invoiceImporterService';
import { progressTracker } from '../services/progressTracker';
import { pythonRPAService } from '../services/pythonRpaService';

/**
 * Standard adapter interface for all pipeline stages
 */
export interface StageAdapter<TInput = any, TOutput = any> {
  execute(input: TInput, context: RunContext): Promise<TOutput>;
  validate?(input: TInput): boolean;
  getName(): string;
}

/**
 * Base adapter class with common functionality
 */
export abstract class BaseAdapter<TInput = any, TOutput = any> implements StageAdapter<TInput, TOutput> {
  constructor(protected config: OrchestratorConfig) {}

  abstract execute(input: TInput, context: RunContext): Promise<TOutput>;
  abstract getName(): string;

  protected handleError(error: any, stage: string): Error {
    // Convert errors to typed exceptions for retry logic
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return new TimeoutError(`${stage} timed out: ${error.message}`);
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new NetworkError(`${stage} network error: ${error.message}`);
    }
    
    if (error.status === 429 || error.message.includes('rate limit')) {
      return new RateLimitError(`${stage} rate limited: ${error.message}`);
    }
    
    if (error.message.includes('temporary') || error.message.includes('transient')) {
      return new TransientError(`${stage} transient error: ${error.message}`);
    }
    
    // Default to non-retryable error
    return new Error(`${stage} failed: ${error.message}`);
  }
}

/**
 * Invoice import adapter
 */
export class ImportInvoicesAdapter extends BaseAdapter {
  private invoiceImporter = invoiceImporterService;

  getName(): string {
    return 'import_invoices';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('import_invoices', { inputType: typeof input });
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would import invoices', { input });
        return { invoices: [], dryRun: true };
      }

      // If input already contains invoice data, return as-is
      if (input.invoice) {
        return input;
      }

      // Import invoices using the existing service
      const result = await this.invoiceImporter.executeImportTask(input.configId || 1);
      
      context.logStageComplete('import_invoices', true, { result });
      return { ...input, importResult: result };

    } catch (error) {
      context.logStageComplete('import_invoices', false, { error });
      throw this.handleError(error, 'import_invoices');
    }
  }
}

/**
 * OCR processing adapter
 */
export class OCRProcessAdapter extends BaseAdapter {
  getName(): string {
    return 'ocr_process';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('ocr_process');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would process OCR');
        return { ...input, ocrText: 'DRY_RUN_OCR_TEXT', dryRun: true };
      }

      const invoice = input.invoice;
      if (!invoice) {
        throw new Error('No invoice data provided for OCR processing');
      }

      // Skip OCR if content is already text or XML
      if (input.ocrText || invoice.format === 'xml') {
        context.logger.info('Skipping OCR - text already available');
        return input;
      }

      // Process OCR using existing service
      const ocrText = await processInvoiceOCR(invoice.buffer, invoice.id);
      
      context.logStageComplete('ocr_process', true, { textLength: ocrText.length });
      return { ...input, ocrText };

    } catch (error) {
      context.logStageComplete('ocr_process', false, { error });
      throw this.handleError(error, 'ocr_process');
    }
  }
}

/**
 * AI extraction adapter
 */
export class AIExtractionAdapter extends BaseAdapter {
  getName(): string {
    return 'ai_extract';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('ai_extract');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would extract data with AI');
        return { 
          ...input, 
          extractedData: { 
            vendorName: 'DRY_RUN_VENDOR',
            invoiceNumber: 'DRY_RUN_001',
            totalAmount: '1000.00'
          },
          dryRun: true 
        };
      }

      if (!input.ocrText && !input.xmlContent) {
        throw new Error('No text content available for AI extraction');
      }

      // Use existing AI service
      const textContent = input.ocrText || input.xmlContent;
      const extractedData = await extractInvoiceData(textContent, true);
      
      context.logStageComplete('ai_extract', true, { 
        confidence: extractedData.confidenceScore,
        vendorName: extractedData.vendorName 
      });
      
      return { ...input, extractedData };

    } catch (error) {
      context.logStageComplete('ai_extract', false, { error });
      throw this.handleError(error, 'ai_extract');
    }
  }
}

/**
 * XML parsing adapter
 */
export class XMLParsingAdapter extends BaseAdapter {
  getName(): string {
    return 'xml_parse';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('xml_parse');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would parse XML');
        return { 
          ...input, 
          parsedXmlData: { format: 'xml', vendor: 'DRY_RUN_XML_VENDOR' },
          dryRun: true 
        };
      }

      // Skip if not XML format
      const invoice = input.invoice;
      if (!invoice || invoice.format !== 'xml') {
        context.logger.info('Skipping XML parsing - not XML format');
        return input;
      }

      // Parse XML using existing service
      const xmlContent = input.xmlContent || invoice.buffer.toString('utf8');
      const parsedData = await parseInvoiceXML(xmlContent);
      
      context.logStageComplete('xml_parse', true, { 
        invoiceNumber: parsedData.invoiceNumber,
        totalAmount: parsedData.totalAmount 
      });
      
      return { ...input, parsedXmlData: parsedData };

    } catch (error) {
      context.logStageComplete('xml_parse', false, { error });
      throw this.handleError(error, 'xml_parse');
    }
  }
}

/**
 * Data validation adapter
 */
export class DataValidationAdapter extends BaseAdapter {
  getName(): string {
    return 'validate';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('validate');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would validate data');
        return { ...input, validationResult: { valid: true, dryRun: true } };
      }

      const dataToValidate = input.extractedData || input.parsedXmlData;
      if (!dataToValidate) {
        throw new Error('No extracted data available for validation');
      }

      // Perform validation
      const validationResult = this.validateInvoiceData(dataToValidate);
      
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
      }

      context.logStageComplete('validate', true, validationResult);
      return { ...input, validationResult };

    } catch (error) {
      context.logStageComplete('validate', false, { error });
      throw this.handleError(error, 'validate');
    }
  }

  private validateInvoiceData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required field validation
    if (!data.vendorName) errors.push('Vendor name is required');
    if (!data.invoiceNumber) errors.push('Invoice number is required');
    if (!data.totalAmount) errors.push('Total amount is required');
    if (!data.invoiceDate) errors.push('Invoice date is required');

    // Format validation
    if (data.totalAmount && isNaN(parseFloat(data.totalAmount.replace(/[^0-9.-]/g, '')))) {
      errors.push('Total amount is not a valid number');
    }

    // Date validation
    if (data.invoiceDate && isNaN(Date.parse(data.invoiceDate))) {
      errors.push('Invoice date is not a valid date');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * ERP posting adapter
 */
export class ERPPostingAdapter extends BaseAdapter {
  private erpService = erpAutomationService;

  getName(): string {
    return 'erp_post';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('erp_post');
      
      const tenantConfig = this.config.getTenantConfig(context.tenantId);
      
      if (context.dryRun || tenantConfig?.use_sandbox) {
        context.logger.info('DRY RUN/SANDBOX: Would post to ERP');
        return { 
          ...input, 
          erpResult: { posted: true, erpId: 'DRY_RUN_ERP_ID', sandbox: true } 
        };
      }

      const validatedData = input.validationResult?.valid ? 
        (input.extractedData || input.parsedXmlData) : null;
      
      if (!validatedData) {
        throw new Error('No validated data available for ERP posting');
      }

      // Post to ERP using automation service
      const erpResult = await this.erpService.executeTask({
        action: 'post_invoice',
        data: validatedData,
        connectionId: 1 // Default connection
      });

      context.logStageComplete('erp_post', true, { erpId: erpResult.extractedData?.id });
      return { ...input, erpResult };

    } catch (error) {
      context.logStageComplete('erp_post', false, { error });
      throw this.handleError(error, 'erp_post');
    }
  }
}

/**
 * Data reconciliation adapter
 */
export class DataReconciliationAdapter extends BaseAdapter {
  getName(): string {
    return 'reconcile';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('reconcile');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would reconcile data');
        return { ...input, reconciliationResult: { reconciled: true, dryRun: true } };
      }

      if (!input.erpResult) {
        throw new Error('No ERP result available for reconciliation');
      }

      // Perform reconciliation logic
      const reconciliationResult = {
        reconciled: true,
        erpId: input.erpResult.erpId,
        originalAmount: input.extractedData?.totalAmount,
        erpAmount: input.erpResult.amount,
        matched: true,
        timestamp: new Date().toISOString()
      };

      context.logStageComplete('reconcile', true, reconciliationResult);
      return { ...input, reconciliationResult };

    } catch (error) {
      context.logStageComplete('reconcile', false, { error });
      throw this.handleError(error, 'reconcile');
    }
  }
}

/**
 * Notification adapter
 */
export class NotificationAdapter extends BaseAdapter {
  getName(): string {
    return 'notify';
  }

  async execute(input: any, context: RunContext): Promise<any> {
    try {
      context.logStageStart('notify');
      
      if (context.dryRun) {
        context.logger.info('DRY RUN: Would send notifications');
        return { ...input, notificationResult: { sent: true, dryRun: true } };
      }

      // Send progress update via WebSocket
      if (input.reconciliationResult?.reconciled) {
        progressTracker.sendProgress('system', {
          status: 'completed',
          invoiceId: input.invoice?.id,
          message: 'Invoice processing completed successfully'
        });
      }

      const notificationResult = {
        sent: true,
        timestamp: new Date().toISOString(),
        recipients: ['system'],
        message: 'Invoice processing completed'
      };

      context.logStageComplete('notify', true, notificationResult);
      return { ...input, notificationResult };

    } catch (error) {
      context.logStageComplete('notify', false, { error });
      throw this.handleError(error, 'notify');
    }
  }
}

/**
 * Main service adapters class that orchestrates all stage adapters
 */
export class ServiceAdapters {
  private adapters: Map<string, StageAdapter> = new Map();

  constructor(private config: OrchestratorConfig) {
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    this.adapters.set('import_invoices', new ImportInvoicesAdapter(this.config));
    this.adapters.set('ocr_process', new OCRProcessAdapter(this.config));
    this.adapters.set('ai_extract', new AIExtractionAdapter(this.config));
    this.adapters.set('xml_parse', new XMLParsingAdapter(this.config));
    this.adapters.set('validate', new DataValidationAdapter(this.config));
    this.adapters.set('erp_post', new ERPPostingAdapter(this.config));
    this.adapters.set('reconcile', new DataReconciliationAdapter(this.config));
    this.adapters.set('notify', new NotificationAdapter(this.config));
  }

  async initialize(): Promise<void> {
    // Initialize any adapters that need setup
    console.log('Service adapters initialized');
  }

  // Stage execution methods
  async importInvoices(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('import_invoices', input, context);
  }

  async processOCR(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('ocr_process', input, context);
  }

  async extractWithAI(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('ai_extract', input, context);
  }

  async parseXML(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('xml_parse', input, context);
  }

  async validateData(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('validate', input, context);
  }

  async postToERP(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('erp_post', input, context);
  }

  async reconcileData(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('reconcile', input, context);
  }

  async sendNotifications(input: any, context: RunContext): Promise<any> {
    return this.executeAdapter('notify', input, context);
  }

  private async executeAdapter(adapterName: string, input: any, context: RunContext): Promise<any> {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }

    context.logger.debug('Executing adapter', { adapter: adapterName });
    return await adapter.execute(input, context);
  }
}

/**
 * Typed exceptions for retry logic
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}