import { getDb } from "../storage";
import { sql, eq, and, desc } from "drizzle-orm";
import { invoices, workflowExecutionLog } from "@shared/schema";
import { extractInvoiceData } from "./aiService";
import { projectMatcher } from "../projectMatcher";
import { invoicePOMatcher } from "./invoicePoMatcher";
import { lineItemClassificationService } from "./lineItemClassificationService";
import { storage } from "../storage";

export interface WorkflowStep {
  stepNumber: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs?: number;
}

export interface WorkflowStatus {
  invoiceId: number;
  currentStep: number;
  mode: 'manual' | 'automatic';
  steps: WorkflowStep[];
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: Date;
  lastUpdatedAt: Date;
}

export interface WorkflowConfig {
  mode: 'automatic' | 'manual';
  autoRetryAttempts: number;
  failFast: boolean;
  loggingLevel: 'basic' | 'detailed';
}

export class WorkflowOrchestrator {
  private config: WorkflowConfig;

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = {
      mode: 'automatic',
      autoRetryAttempts: 3,
      failFast: false,
      loggingLevel: 'detailed',
      ...config
    };
  }

  /**
   * Execute a specific workflow step
   */
  async executeWorkflowStep(
    invoiceId: number, 
    stepNumber: number, 
    mode: 'manual' | 'automatic' = 'automatic'
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Log step execution start
      await this.logStepExecution(invoiceId, stepNumber, 'in_progress', mode);
      
      let result: any;
      
      switch (stepNumber) {
        case 1:
          result = await this.executeDataExtraction(invoiceId);
          break;
        case 2:
          result = await this.executePettyCashClassification(invoiceId);
          break;
        case 3:
          result = await this.executeLineItemClassification(invoiceId);
          break;
        case 4:
          result = await this.executeProjectMatching(invoiceId);
          break;
        case 5:
          result = await this.executeValidationRules(invoiceId);
          break;
        case 6:
          result = await this.executePOMatching(invoiceId);
          break;
        case 7:
          result = await this.executeFinalDatabasePreparation(invoiceId);
          break;
        default:
          throw new Error(`Invalid step number: ${stepNumber}`);
      }

      const executionTime = Date.now() - startTime;
      
      // Log successful step completion
      await this.logStepExecution(
        invoiceId, 
        stepNumber, 
        'completed', 
        mode, 
        result, 
        undefined, 
        executionTime
      );

      // Update invoice workflow step
      await this.updateInvoiceWorkflowStep(invoiceId, stepNumber + 1);

      return { success: true, result };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log step failure
      await this.logStepExecution(
        invoiceId, 
        stepNumber, 
        'failed', 
        mode, 
        undefined, 
        errorMessage, 
        executionTime
      );

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute complete workflow automatically
   */
  async executeCompleteWorkflow(
    invoiceId: number, 
    config: Partial<WorkflowConfig> = {}
  ): Promise<{ success: boolean; results: any[]; errors: string[] }> {
    const workflowConfig = { ...this.config, ...config };
    const results: any[] = [];
    const errors: string[] = [];

    // Update invoice to show workflow in progress
    await this.updateInvoiceWorkflowStep(invoiceId, 1);

    for (let step = 1; step <= 7; step++) {
      try {
        const stepResult = await this.executeWorkflowStep(invoiceId, step, 'automatic');
        
        if (stepResult.success) {
          results.push({ step, result: stepResult.result });
          
          // Check if we should skip remaining steps (e.g., petty cash)
          if (step === 2 && stepResult.result?.isPettyCash) {
            console.log(`Invoice ${invoiceId} is petty cash, skipping remaining steps`);
            break;
          }
        } else {
          errors.push(`Step ${step}: ${stepResult.error}`);
          if (workflowConfig.failFast) {
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Step ${step}: ${errorMessage}`);
        
        if (workflowConfig.failFast) {
          break;
        }
      }
    }

    const success = errors.length === 0;
    
    if (success) {
      await this.updateInvoiceWorkflowStep(invoiceId, 8); // Mark as completed
    }

    return { success, results, errors };
  }

  /**
   * Get current workflow status
   */
  async getWorkflowStatus(invoiceId: number): Promise<WorkflowStatus> {
    const db = await getDb();
    
    // Get invoice workflow info
    const [invoice] = await db.select({
      currentWorkflowStep: invoices.currentWorkflowStep,
      workflowMode: invoices.workflowMode,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt
    }).from(invoices).where(eq(invoices.id, invoiceId));

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // Get step execution logs
    const stepLogs = await db.select().from(workflowExecutionLog)
      .where(eq(workflowExecutionLog.invoiceId, invoiceId))
      .orderBy(workflowExecutionLog.stepNumber);

    const steps: WorkflowStep[] = [];
    for (let i = 1; i <= 7; i++) {
      const stepLog = stepLogs.find(log => log.stepNumber === i);
      
      if (stepLog) {
        steps.push({
          stepNumber: i,
          name: this.getStepName(i),
          description: this.getStepDescription(i),
          status: stepLog.status as any,
          result: stepLog.result,
          error: stepLog.errorMessage || undefined,
          startedAt: stepLog.startedAt,
          completedAt: stepLog.completedAt,
          executionTimeMs: stepLog.executionTimeMs || undefined
        });
      } else {
        steps.push({
          stepNumber: i,
          name: this.getStepName(i),
          description: this.getStepDescription(i),
          status: 'pending'
        });
      }
    }

    const overallStatus = this.calculateOverallStatus(steps);

    return {
      invoiceId,
      currentStep: invoice.currentWorkflowStep || 1,
      mode: (invoice.workflowMode as 'manual' | 'automatic') || 'automatic',
      steps,
      overallStatus,
      startedAt: invoice.createdAt || new Date(),
      lastUpdatedAt: invoice.updatedAt || new Date()
    };
  }

  /**
   * Reset workflow to specific step
   */
  async resetWorkflowToStep(invoiceId: number, stepNumber: number): Promise<void> {
    const db = await getDb();
    
    // Update invoice workflow step
    await db.update(invoices)
      .set({ currentWorkflowStep: stepNumber })
      .where(eq(invoices.id, invoiceId));

    // Mark subsequent steps as pending
    await db.update(workflowExecutionLog)
      .set({ status: 'pending' })
      .where(and(
        eq(workflowExecutionLog.invoiceId, invoiceId),
        sql`${workflowExecutionLog.stepNumber} > ${stepNumber}`
      ));
  }

  /**
   * Validate step prerequisites
   */
  async validateStepPrerequisites(invoiceId: number, stepNumber: number): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Check if previous steps are completed
    for (let i = 1; i < stepNumber; i++) {
      const stepStatus = await this.getStepStatus(invoiceId, i);
      if (stepStatus !== 'completed') {
        issues.push(`Step ${i} (${this.getStepName(i)}) must be completed before step ${stepNumber}`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  // Private helper methods

  private async logStepExecution(
    invoiceId: number,
    stepNumber: number,
    status: string,
    mode: string,
    result?: any,
    errorMessage?: string,
    executionTimeMs?: number
  ): Promise<void> {
    const db = await getDb();
    
    const logData: any = {
      invoiceId,
      stepName: this.getStepName(stepNumber),
      stepNumber,
      executionMode: mode,
      status,
      startedAt: new Date()
    };

    if (result) logData.result = result;
    if (errorMessage) logData.errorMessage = errorMessage;
    if (executionTimeMs) logData.executionTimeMs = executionTimeMs;

    if (status === 'completed' || status === 'failed') {
      logData.completedAt = new Date();
    }

    await db.insert(workflowExecutionLog).values(logData);
  }

  private async updateInvoiceWorkflowStep(invoiceId: number, stepNumber: number): Promise<void> {
    const db = await getDb();
    
    await db.update(invoices)
      .set({ 
        currentWorkflowStep: stepNumber,
        updatedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async getStepStatus(invoiceId: number, stepNumber: number): Promise<string> {
    const db = await getDb();
    
    const [log] = await db.select({ status: workflowExecutionLog.status })
      .from(workflowExecutionLog)
      .where(and(
        eq(workflowExecutionLog.invoiceId, invoiceId),
        eq(workflowExecutionLog.stepNumber, stepNumber)
      ))
      .orderBy(desc(workflowExecutionLog.startedAt))
      .limit(1);

    return log?.status || 'pending';
  }

  private calculateOverallStatus(steps: WorkflowStep[]): 'pending' | 'in_progress' | 'completed' | 'failed' {
    if (steps.every(step => step.status === 'pending')) return 'pending';
    if (steps.some(step => step.status === 'failed')) return 'failed';
    if (steps.every(step => step.status === 'completed' || step.status === 'skipped')) return 'completed';
    return 'in_progress';
  }

  private getStepName(stepNumber: number): string {
    const stepNames = [
      'Data Extraction',
      'Petty Cash Classification',
      'Line Item Classification',
      'Project Matching',
      'Validation Rules',
      'PO Matching',
      'Final Database Preparation'
    ];
    return stepNames[stepNumber - 1] || 'Unknown Step';
  }

  private getStepDescription(stepNumber: number): string {
    const descriptions = [
      'Extract data from invoice using XML parser or OCR',
      'Check if invoice is petty cash based on threshold',
      'Perform line item classification for non-petty cash invoices',
      'Match invoices to projects based on validation list',
      'Apply validation rules to matched projects',
      'Match invoices to POs based on vendor, amount, and line items',
      'Prepare final database with all workflow results'
    ];
    return descriptions[stepNumber - 1] || 'No description available';
  }

  // Step execution methods

  private async executeDataExtraction(invoiceId: number): Promise<any> {
    // This step is typically done during initial invoice upload
    // Return existing extracted data
    const db = await getDb();
    const [invoice] = await db.select({
      extractedData: invoices.extractedData,
      ocrText: invoices.ocrText
    }).from(invoices).where(eq(invoices.id, invoiceId));

    return {
      hasData: !!invoice.extractedData,
      hasOcrText: !!invoice.ocrText,
      extractedData: invoice.extractedData
    };
  }

  private async executePettyCashClassification(invoiceId: number): Promise<any> {
    const db = await getDb();
    const [invoice] = await db.select({
      totalAmount: invoices.totalAmount,
      vendorName: invoices.vendorName
    }).from(invoices).where(eq(invoices.id, invoiceId));

    // Simple petty cash classification based on amount threshold
    const amount = parseFloat(invoice.totalAmount?.toString() || '0');
    const isPettyCash = amount <= 100; // Configurable threshold

    if (isPettyCash) {
      // Create petty cash log entry
      await storage.createPettyCashLog({
        invoiceId,
        amount,
        vendorName: invoice.vendorName || 'Unknown',
        status: 'pending_approval',
        createdAt: new Date()
      });
    }

    return { isPettyCash, amount, threshold: 100 };
  }

  private async executeLineItemClassification(invoiceId: number): Promise<any> {
    // Use existing line item classification service
    const result = await lineItemClassificationService.classifyInvoiceLineItems(invoiceId);
    return result;
  }

  private async executeProjectMatching(invoiceId: number): Promise<any> {
    const db = await getDb();
    const [invoice] = await db.select({
      vendorName: invoices.vendorName,
      totalAmount: invoices.totalAmount
    }).from(invoices).where(eq(invoices.id, invoiceId));

    // Use existing project matcher
    const projectMatch = await projectMatcher.findBestProjectMatch(invoice);
    return { projectMatch };
  }

  private async executeValidationRules(invoiceId: number): Promise<any> {
    // Use existing validation logic
    const db = await getDb();
    const [invoice] = await db.select({
      totalAmount: invoices.totalAmount,
      taxAmount: invoices.taxAmount,
      vendorName: invoices.vendorName
    }).from(invoices).where(eq(invoices.id, invoiceId));

    // Basic validation rules
    const validations = [];
    
    if (invoice.totalAmount && invoice.totalAmount > 0) {
      validations.push({ rule: 'amount_positive', status: 'passed' });
    } else {
      validations.push({ rule: 'amount_positive', status: 'failed' });
    }

    if (invoice.vendorName && invoice.vendorName.trim().length > 0) {
      validations.push({ rule: 'vendor_name_present', status: 'passed' });
    } else {
      validations.push({ rule: 'vendor_name_present', status: 'failed' });
    }

    return { validations, passed: validations.every(v => v.status === 'passed') };
  }

  private async executePOMatching(invoiceId: number): Promise<any> {
    const db = await getDb();
    const [invoice] = await db.select({
      vendorName: invoices.vendorName,
      totalAmount: invoices.totalAmount
    }).from(invoices).where(eq(invoices.id, invoiceId));

    // Use existing PO matcher
    const poMatches = await invoicePOMatcher.findMatches(invoice);
    return { poMatches };
  }

  private async executeFinalDatabasePreparation(invoiceId: number): Promise<any> {
    // Mark workflow as completed
    const db = await getDb();
    await db.update(invoices)
      .set({ 
        workflowCompletedAt: new Date(),
        status: 'matched'
      })
      .where(eq(invoices.id, invoiceId));

    return { 
      workflowCompleted: true,
      completedAt: new Date(),
      finalStatus: 'matched'
    };
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();
