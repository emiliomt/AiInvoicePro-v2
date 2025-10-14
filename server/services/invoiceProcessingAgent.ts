/**
 * Autonomous Invoice Processing Agent
 * 
 * Implements the comprehensive workflow specification for end-to-end
 * invoice processing from upload to classification with monitoring,
 * error handling, and real-time progress updates.
 */

import { WebSocket } from 'ws';
import { getDb } from '../storage';
import { lineItems, lineItemClassifications, invoices } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ProgressTracker } from './progressTracker';

// Import services
import { ClassificationService } from './classificationService';
import { ocrService } from './ocrService';
import { aiService } from './aiService';
import { validationService } from './validationService';
import { storage } from '../storage';

export interface AgentConfig {
  classification_method: 'ai' | 'keyword' | 'hybrid';
  use_websocket_progress: boolean;
  enable_duplicate_detection: boolean;
  auto_approve_threshold: number;
  timeout_seconds: number;
  max_retries: number;
  backoff_strategy: 'exponential' | 'linear';
  retry_on: string[];
}

export interface WorkflowContext {
  user_id: string;
  company_id?: string;
  timezone: string;
  language: string;
  session_id?: string;
}

export interface WorkflowStep {
  id: number;
  action: string;
  endpoint?: string;
  service?: string;
  method?: string;
  depends_on?: number[];
  input: Record<string, any>;
  output?: string;
  websocket_events?: string[];
  optional?: boolean;
  timeout_ms?: number;
}

export interface WorkflowResult {
  success: boolean;
  step_results: Map<number, any>;
  final_status: 'pending' | 'extracted' | 'classified' | 'validated' | 'approved' | 'failed';
  processing_time_ms: number;
  error?: string;
  metrics: {
    processing_time: number;
    classification_confidence?: number;
    validation_score?: number;
    match_accuracy?: number;
  };
}

export class InvoiceProcessingAgent {
  private config: AgentConfig;
  private context: WorkflowContext;
  private progressTracker?: string;

  constructor(config: Partial<AgentConfig> = {}, context: WorkflowContext) {
    this.config = {
      classification_method: 'ai',
      use_websocket_progress: true,
      enable_duplicate_detection: true,
      auto_approve_threshold: 0.95,
      timeout_seconds: 300,
      max_retries: 3,
      backoff_strategy: 'exponential',
      retry_on: ['network_error', 'timeout', 'service_unavailable'],
      ...config
    };
    this.context = context;
  }

  /**
   * Main workflow execution method
   */
  async executeWorkflow(
    invoiceFile: Buffer,
    fileName: string,
    additionalContext?: Record<string, any>
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const sessionId = this.context.session_id || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize progress tracking
    if (this.config.use_websocket_progress) {
      this.progressTracker = ProgressTracker.createSession(
        sessionId,
        this.context.user_id,
        1,
        `Invoice Processing Agent - ${fileName}`
      ).sessionId;
    }

    const stepResults = new Map<number, any>();
    const workflowSteps = this.getWorkflowSteps(invoiceFile, fileName, additionalContext);

    try {
      // Execute workflow steps in dependency order
      await this.executeSteps(workflowSteps, stepResults, sessionId);

      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        step_results: stepResults,
        final_status: 'classified',
        processing_time_ms: processingTime,
        metrics: {
          processing_time: processingTime,
          classification_confidence: this.calculateAverageConfidence(stepResults),
          validation_score: stepResults.get(4)?.validation_score || 0,
          match_accuracy: stepResults.get(7)?.match_accuracy || 0
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Workflow execution failed:', error);

      if (this.progressTracker) {
        ProgressTracker.errorSession(this.progressTracker, error instanceof Error ? error.message : 'Unknown error');
      }

      return {
        success: false,
        step_results: stepResults,
        final_status: 'failed',
        processing_time_ms: processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: {
          processing_time: processingTime
        }
      };
    }
  }

  /**
   * Define the workflow steps based on the specification
   */
  private getWorkflowSteps(
    invoiceFile: Buffer,
    fileName: string,
    additionalContext?: Record<string, any>
  ): WorkflowStep[] {
    return [
      {
        id: 1,
        action: 'upload_invoice',
        endpoint: '/api/invoices/upload',
        method: 'POST',
        input: {
          file: invoiceFile,
          userId: this.context.user_id,
          source: 'agent',
          fileName: fileName,
          ...additionalContext
        },
        output: 'invoice_id',
        timeout_ms: 30000
      },
      {
        id: 2,
        action: 'extract_ocr_text',
        service: 'ocrService.processInvoiceOCR',
        depends_on: [1],
        input: {
          fileBuffer: invoiceFile,
          invoiceId: '{{invoice_id}}'
        },
        output: 'ocr_text',
        timeout_ms: 180000
      },
      {
        id: 3,
        action: 'extract_invoice_data',
        service: 'aiService.extractInvoiceData',
        depends_on: [2],
        input: {
          ocrText: '{{ocr_text}}',
          fileName: fileName
        },
        output: 'extracted_data',
        timeout_ms: 180000
      },
      {
        id: 4,
        action: 'validate_invoice',
        service: 'validationService.validateInvoice',
        depends_on: [3],
        input: {
          invoiceId: '{{invoice_id}}',
          extractedData: '{{extracted_data}}'
        },
        output: 'validation_results',
        timeout_ms: 90000
      },
      {
        id: 5,
        action: 'create_line_items',
        service: 'storage.createLineItems',
        depends_on: [3],
        input: {
          invoiceId: '{{invoice_id}}',
          lineItems: '{{extracted_data.lineItems}}'
        },
        output: 'line_item_ids',
        timeout_ms: 30000
      },
      {
        id: 6,
        action: 'classify_line_items',
        service: 'ClassificationService.classifyInvoiceLineItems',
        depends_on: [5],
        input: {
          invoiceId: '{{invoice_id}}',
          userId: this.context.user_id
        },
        output: 'classifications',
        websocket_events: [
          'classification:progress',
          'classification:item_classified',
          'classification:complete'
        ],
        timeout_ms: 300000
      },
      {
        id: 7,
        action: 'match_purchase_order',
        service: 'invoicePoMatcher.matchInvoiceToPurchaseOrder',
        depends_on: [4],
        input: {
          invoiceId: '{{invoice_id}}'
        },
        output: 'po_matches',
        optional: true,
        timeout_ms: 60000
      },
      {
        id: 8,
        action: 'assign_project',
        service: 'projectMatcher.matchInvoiceToProject',
        depends_on: [4],
        input: {
          invoiceId: '{{invoice_id}}'
        },
        output: 'project_matches',
        optional: true,
        timeout_ms: 60000
      },
      {
        id: 9,
        action: 'update_invoice_status',
        service: 'storage.updateInvoice',
        depends_on: [6],
        input: {
          invoiceId: '{{invoice_id}}',
          status: 'extracted',
          processingStatus: 'classified'
        },
        output: 'updated_invoice',
        timeout_ms: 10000
      }
    ];
  }

  /**
   * Execute workflow steps in dependency order with retry logic
   */
  private async executeSteps(
    steps: WorkflowStep[],
    stepResults: Map<number, any>,
    sessionId: string
  ): Promise<void> {
    const completedSteps = new Set<number>();
    const stepMap = new Map(steps.map(step => [step.id, step]));

    // Initialize progress tracking
    if (this.progressTracker) {
      ProgressTracker.updateStep(this.progressTracker, 0, 'active', 'Initializing Invoice Processing Agent');
    }

    while (completedSteps.size < steps.length) {
      let progressMade = false;

      for (const step of steps) {
        // Skip if already completed
        if (completedSteps.has(step.id)) {
          continue;
        }

        // Check if all dependencies are met
        const dependenciesMet = !step.depends_on || 
          step.depends_on.every(depId => completedSteps.has(depId));

        if (dependenciesMet) {
          try {
            console.log(`🔄 Executing step ${step.id}: ${step.action}`);
            
            // Update progress
            if (this.progressTracker) {
              ProgressTracker.updateStep(this.progressTracker, this.getStepIndex(step.id), 'active', step.action);
            }

            const result = await this.executeStep(step, stepResults);
            stepResults.set(step.id, result);
            completedSteps.add(step.id);
            progressMade = true;

            console.log(`✅ Step ${step.id} completed successfully`);

            // Update progress
            if (this.progressTracker) {
              ProgressTracker.updateStep(this.progressTracker, this.getStepIndex(step.id), 'completed');
              ProgressTracker.updateProgress(this.progressTracker, completedSteps.size, steps.length, `Completed ${step.action}`);
            }

          } catch (error) {
            console.error(`❌ Step ${step.id} failed:`, error);
            
            if (step.optional) {
              console.log(`⚠️ Optional step ${step.id} failed, continuing workflow`);
              stepResults.set(step.id, { error: error instanceof Error ? error.message : 'Unknown error', skipped: true });
              completedSteps.add(step.id);
              progressMade = true;
            } else {
              throw error;
            }
          }
        }
      }

      if (!progressMade) {
        throw new Error('Workflow deadlock: no steps can be executed');
      }
    }

    // Complete the workflow
    if (this.progressTracker) {
      ProgressTracker.updateStep(this.progressTracker, steps.length - 1, 'completed');
      ProgressTracker.completeSession(this.progressTracker, {
        totalSteps: steps.length,
        completedSteps: completedSteps.size,
        finalStatus: 'classified'
      });
    }
  }

  /**
   * Execute a single workflow step with retry logic
   */
  private async executeStep(step: WorkflowStep, stepResults: Map<number, any>): Promise<any> {
    const resolvedInput = this.resolveStepInput(step.input, stepResults);
    
    for (let attempt = 1; attempt <= this.config.max_retries; attempt++) {
      try {
        return await this.executeStepAction(step, resolvedInput);
      } catch (error) {
        const isRetryable = this.isRetryableError(error);
        
        if (attempt === this.config.max_retries || !isRetryable) {
          throw error;
        }

        const delay = this.calculateBackoffDelay(attempt);
        console.log(`⏳ Retrying step ${step.id} in ${delay}ms (attempt ${attempt + 1}/${this.config.max_retries})`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Execute the actual step action based on service or endpoint
   */
  private async executeStepAction(step: WorkflowStep, resolvedInput: Record<string, any>): Promise<any> {
    if (step.service) {
      return await this.executeServiceAction(step.service, resolvedInput);
    } else if (step.endpoint) {
      return await this.executeEndpointAction(step.endpoint, step.method || 'POST', resolvedInput);
    } else {
      throw new Error(`Step ${step.id} has neither service nor endpoint defined`);
    }
  }

  /**
   * Execute service-based actions
   */
  private async executeServiceAction(servicePath: string, input: Record<string, any>): Promise<any> {
    const [module, method] = servicePath.split('.');

    switch (module) {
      case 'ocrService':
        if (method === 'processInvoiceOCR') {
          return await ocrService.processInvoiceOCR(input.fileBuffer, input.invoiceId);
        }
        break;

      case 'aiService':
        if (method === 'extractInvoiceData') {
          return await aiService.extractInvoiceData(input.ocrText);
        }
        break;

      case 'ClassificationService':
        if (method === 'classifyInvoiceLineItems') {
          return await ClassificationService.classifyInvoiceLineItems(input.invoiceId, input.userId);
        }
        break;

      case 'storage':
        if (method === 'createLineItems') {
          return await this.createLineItems(input.invoiceId, input.lineItems);
        } else if (method === 'updateInvoice') {
          return await storage.updateInvoice(input.invoiceId, {
            status: input.status,
            processingStatus: input.processingStatus
          });
        }
        break;

      default:
        throw new Error(`Unknown service module: ${module}`);
    }

    throw new Error(`Unknown service method: ${servicePath}`);
  }

  /**
   * Execute endpoint-based actions (HTTP calls)
   */
  private async executeEndpointAction(endpoint: string, method: string, input: Record<string, any>): Promise<any> {
    // This would make HTTP calls to the specified endpoint
    // For now, we'll simulate the upload action
    if (endpoint === '/api/invoices/upload' && method === 'POST') {
      return await this.simulateInvoiceUpload(input);
    }

    throw new Error(`Endpoint action not implemented: ${method} ${endpoint}`);
  }

  /**
   * Simulate invoice upload (in real implementation, this would call the actual endpoint)
   */
  private async simulateInvoiceUpload(input: Record<string, any>): Promise<any> {
    // Create invoice record in database
    const invoice = await storage.createInvoice({
      userId: input.userId,
      fileName: input.fileName,
      status: 'pending',
      fileUrl: `uploads/${input.fileName}`,
      source: input.source || 'agent',
      totalAmount: null, // Will be extracted later
      vendorName: null   // Will be extracted later
    });

    return { invoice_id: invoice.id };
  }

  /**
   * Create line items from extracted data
   */
  private async createLineItems(invoiceId: number, lineItemsData: any[]): Promise<any> {
    const db = getDb();
    const createdItems = [];

    for (let i = 0; i < lineItemsData.length; i++) {
      const item = lineItemsData[i];
      const [newLineItem] = await db.insert(lineItems).values({
        invoiceId: invoiceId,
        description: item.description || 'Unknown item',
        quantity: item.quantity?.toString() || '1',
        unitPrice: item.unitPrice?.toString() || '0.00',
        totalPrice: item.totalPrice?.toString() || '0.00',
        unit: item.unit || null,
        rawText: item.rawText || item.description,
        lineNumber: i + 1,
      }).returning();

      createdItems.push(newLineItem);
    }

    return { line_item_ids: createdItems.map(item => item.id) };
  }

  /**
   * Resolve step input by replacing placeholders with actual values
   */
  private resolveStepInput(input: Record<string, any>, stepResults: Map<number, any>): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const placeholder = value.slice(2, -2);
        const [stepId, field] = placeholder.split('.');
        
        if (stepResults.has(parseInt(stepId))) {
          const stepResult = stepResults.get(parseInt(stepId));
          resolved[key] = field ? stepResult[field] : stepResult;
        } else {
          throw new Error(`Cannot resolve placeholder ${value}: step ${stepId} not completed`);
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Check if error is retryable based on configuration
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    return this.config.retry_on.some(retryableError => 
      errorMessage.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Calculate backoff delay based on strategy
   */
  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second

    switch (this.config.backoff_strategy) {
      case 'exponential':
        return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
      case 'linear':
        return baseDelay * attempt;
      default:
        return baseDelay;
    }
  }

  /**
   * Calculate average classification confidence
   */
  private calculateAverageConfidence(stepResults: Map<number, any>): number {
    const classificationResult = stepResults.get(6);
    if (!classificationResult) return 0;

    // This would need to be implemented based on actual classification results
    return 0.85; // Placeholder
  }

  /**
   * Get step index for progress tracking
   */
  private getStepIndex(stepId: number): number {
    // Map step IDs to progress tracker indices
    const stepIndexMap: Record<number, number> = {
      1: 1, // upload_invoice
      2: 2, // extract_ocr_text
      3: 3, // extract_invoice_data
      4: 4, // validate_invoice
      5: 5, // create_line_items
      6: 6, // classify_line_items
      7: 7, // match_purchase_order
      8: 8, // assign_project
      9: 9  // update_invoice_status
    };

    return stepIndexMap[stepId] || 0;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create an invoice processing agent
 */
export function createInvoiceProcessingAgent(
  config: Partial<AgentConfig> = {},
  context: WorkflowContext
): InvoiceProcessingAgent {
  return new InvoiceProcessingAgent(config, context);
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  classification_method: 'ai',
  use_websocket_progress: true,
  enable_duplicate_detection: true,
  auto_approve_threshold: 0.95,
  timeout_seconds: 300,
  max_retries: 3,
  backoff_strategy: 'exponential',
  retry_on: ['network_error', 'timeout', 'service_unavailable']
};
