import { getDb } from "../db";
import { invoices, workflowExecutionLog } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { extractInvoiceData } from "./aiService";
import { projectMatcher } from "../projectMatcher";
import { invoicePOMatcher } from "./invoicePoMatcher";
import { storage } from "../storage";

export interface WorkflowStep {
  stepNumber: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: any;
  errorMessage?: string;
  executionTimeMs?: number;
  startedAt?: Date;
  completedAt?: Date;
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
  private db = getDb();

  /**
   * Execute a specific workflow step
   */
  async executeWorkflowStep(
    invoiceId: number, 
    stepNumber: number, 
    mode: 'manual' | 'automatic' = 'automatic'
  ): Promise<WorkflowStep> {
    const startTime = Date.now();
    
    try {
      // Log step start
      await this.logStepExecution(invoiceId, stepNumber, 'in_progress', mode);
      
      // Execute the specific step
      let result: any;
      let status: 'completed' | 'failed' | 'skipped' = 'completed';
      
      switch (stepNumber) {
        case 1:
          result = await this.executeDataExtraction(invoiceId);
          break;
        case 2:
          result = await this.executePettyCashClassification(invoiceId);
          if (result.isPettyCash) {
            status = 'skipped';
            // Skip remaining steps for petty cash
            await this.markStepsAsSkipped(invoiceId, [3, 4, 5, 6, 7]);
          }
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
      
      // Log step completion
      await this.logStepExecution(invoiceId, stepNumber, status, mode, result, executionTime);
      
      // Update invoice workflow status
      await this.updateInvoiceWorkflowStatus(invoiceId, stepNumber, status);
      
      return {
        stepNumber,
        name: this.getStepName(stepNumber),
        description: this.getStepDescription(stepNumber),
        status,
        result,
        executionTimeMs: executionTime,
        startedAt: new Date(startTime),
        completedAt: new Date()
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log step failure
      await this.logStepExecution(invoiceId, stepNumber, 'failed', mode, null, executionTime, errorMessage);
      
      // Update invoice workflow status
      await this.updateInvoiceWorkflowStatus(invoiceId, stepNumber, 'failed');
      
      throw error;
    }
  }

  /**
   * Execute the complete workflow automatically
   */
  async executeCompleteWorkflow(
    invoiceId: number, 
    config: WorkflowConfig = { mode: 'automatic', autoRetryAttempts: 3, failFast: false, loggingLevel: 'detailed' }
  ): Promise<WorkflowStatus> {
    const startTime = Date.now();
    
    try {
      // Initialize workflow
      await this.initializeWorkflow(invoiceId, config.mode);
      
      // Execute steps sequentially
      for (let step = 1; step <= 7; step++) {
        try {
          const stepResult = await this.executeWorkflowStep(invoiceId, step, config.mode);
          
          if (stepResult.status === 'failed' && config.failFast) {
            throw new Error(`Step ${step} failed: ${stepResult.errorMessage}`);
          }
          
          // If petty cash detected at step 2, workflow is complete
          if (step === 2 && stepResult.result?.isPettyCash) {
            break;
          }
          
        } catch (error) {
          // Retry logic for failed steps
          if (config.autoRetryAttempts > 0) {
            for (let attempt = 1; attempt <= config.autoRetryAttempts; attempt++) {
              try {
                await this.executeWorkflowStep(invoiceId, step, config.mode);
                break;
              } catch (retryError) {
                if (attempt === config.autoRetryAttempts) {
                  throw retryError;
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              }
            }
          } else {
            throw error;
          }
        }
      }
      
      // Mark workflow as completed
      await this.completeWorkflow(invoiceId);
      
      return await this.getWorkflowStatus(invoiceId);
      
    } catch (error) {
      // Mark workflow as failed
      await this.failWorkflow(invoiceId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get current workflow status
   */
  async getWorkflowStatus(invoiceId: number): Promise<WorkflowStatus> {
    const invoice = await this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId)
    });
    
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    
    const executionLogs = await this.db.query.workflowExecutionLog.findMany({
      where: eq(workflowExecutionLog.invoiceId, invoiceId),
      orderBy: [desc(workflowExecutionLog.stepNumber)]
    });
    
    const steps: WorkflowStep[] = [];
    for (let i = 1; i <= 7; i++) {
      const log = executionLogs.find(l => l.stepNumber === i);
      steps.push({
        stepNumber: i,
        name: this.getStepName(i),
        description: this.getStepDescription(i),
        status: log?.status || 'pending',
        result: log?.result,
        errorMessage: log?.errorMessage || undefined,
        executionTimeMs: log?.executionTimeMs || undefined,
        startedAt: log?.startedAt || undefined,
        completedAt: log?.completedAt || undefined
      });
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
    // Reset invoice workflow status
    await this.db.update(invoices)
      .set({
        currentWorkflowStep: stepNumber,
        workflowCompletedAt: null
      })
      .where(eq(invoices.id, invoiceId));
    
    // Mark subsequent steps as pending
    for (let step = stepNumber + 1; step <= 7; step++) {
      await this.logStepExecution(invoiceId, step, 'pending', 'manual');
    }
  }

  /**
   * Validate step prerequisites
   */
  async validateStepPrerequisites(invoiceId: number, stepNumber: number): Promise<boolean> {
    const invoice = await this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId)
    });
    
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    
    // Check if previous steps are completed
    for (let step = 1; step < stepNumber; step++) {
      const log = await this.db.query.workflowExecutionLog.findFirst({
        where: and(
          eq(workflowExecutionLog.invoiceId, invoiceId),
          eq(workflowExecutionLog.stepNumber, step)
        )
      });
      
      if (!log || log.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  }

  // Private helper methods
  private async logStepExecution(
    invoiceId: number,
    stepNumber: number,
    status: string,
    mode: string,
    result?: any,
    executionTimeMs?: number,
    errorMessage?: string
  ): Promise<void> {
    await this.db.insert(workflowExecutionLog).values({
      invoiceId,
      stepNumber,
      stepName: this.getStepName(stepNumber),
      executionMode: mode,
      status,
      result: result ? JSON.stringify(result) : null,
      errorMessage,
      executionTimeMs,
      startedAt: new Date(),
      completedAt: status !== 'in_progress' ? new Date() : null
    });
  }

  private async updateInvoiceWorkflowStatus(
    invoiceId: number,
    stepNumber: number,
    status: string
  ): Promise<void> {
    const updateData: any = {
      currentWorkflowStep: stepNumber
    };
    
    if (status === 'completed' && stepNumber === 7) {
      updateData.workflowCompletedAt = new Date();
    }
    
    await this.db.update(invoices)
      .set(updateData)
      .where(eq(invoices.id, invoiceId));
  }

  private async initializeWorkflow(invoiceId: number, mode: string): Promise<void> {
    await this.db.update(invoices)
      .set({
        workflowMode: mode,
        currentWorkflowStep: 1,
        workflowCompletedAt: null
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async completeWorkflow(invoiceId: number): Promise<void> {
    await this.db.update(invoices)
      .set({
        currentWorkflowStep: 7,
        workflowCompletedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async failWorkflow(invoiceId: number, errorMessage: string): Promise<void> {
    await this.db.update(invoices)
      .set({
        status: 'rejected'
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async markStepsAsSkipped(invoiceId: number, stepNumbers: number[]): Promise<void> {
    for (const step of stepNumbers) {
      await this.logStepExecution(invoiceId, step, 'skipped', 'automatic');
    }
  }

  private calculateOverallStatus(steps: WorkflowStep[]): 'pending' | 'in_progress' | 'completed' | 'failed' {
    if (steps.some(s => s.status === 'failed')) return 'failed';
    if (steps.every(s => s.status === 'completed' || s.status === 'skipped')) return 'completed';
    if (steps.some(s => s.status === 'in_progress')) return 'in_progress';
    return 'pending';
  }

  private getStepName(stepNumber: number): string {
    const stepNames = {
      1: 'Data Extraction',
      2: 'Petty Cash Classification',
      3: 'Line Item Classification',
      4: 'Project Matching',
      5: 'Validation Rules',
      6: 'PO Matching',
      7: 'Final Database Preparation'
    };
    return stepNames[stepNumber as keyof typeof stepNames] || 'Unknown Step';
  }

  private getStepDescription(stepNumber: number): string {
    const descriptions = {
      1: 'Extract data from invoice using XML parser if XML exists, otherwise use OCR extraction from PDF',
      2: 'Check if invoice is petty cash based on threshold and skip remaining steps if true',
      3: 'Perform line item classification only for non-petty cash invoices',
      4: 'Match invoices to projects based on project validation list',
      5: 'Apply validation rules to matched projects',
      6: 'Match invoices to POs based on vendor name, amount, and line items',
      7: 'Prepare final database with matched Invoice-PO and all relevant information'
    };
    return descriptions[stepNumber as keyof typeof descriptions] || 'No description available';
  }

  // Step execution methods
  private async executeDataExtraction(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'Data extraction completed' };
  }

  private async executePettyCashClassification(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { isPettyCash: false };
  }

  private async executeLineItemClassification(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'Line item classification completed' };
  }

  private async executeProjectMatching(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'Project matching completed' };
  }

  private async executeValidationRules(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'Validation rules applied' };
  }

  private async executePOMatching(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'PO matching completed' };
  }

  private async executeFinalDatabasePreparation(invoiceId: number): Promise<any> {
    // This will be implemented in the main workflow function
    // For now, return a placeholder
    return { message: 'Final database preparation completed' };
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();
