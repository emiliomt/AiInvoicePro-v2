#!/usr/bin/env node

import { Command } from 'commander';
import { StateMachine, PipelineState } from './stateMachine';
import { ServiceAdapters } from './adapters';
import { OrchestratorConfig } from './config';
import { RunContext } from './context';
import { IdempotencyStore } from './idempotencyStore';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import pino from 'pino';

export interface InvoiceRecord {
  id: string;
  filePath?: string;
  buffer?: Buffer;
  tenantId: string;
  fingerprint: string;
  metadata?: Record<string, any>;
}

export interface PipelineResult {
  runId: string;
  startedAt: string;
  endedAt: string;
  summary: {
    totalInvoices: number;
    byStage: Record<string, { ok: number; failed: number }>;
  };
  failures: Array<{
    invoiceId: string;
    stage: string;
    error: string;
    attempts: number;
  }>;
  artifacts: {
    auditLog: string;
    metrics: string;
  };
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private stateMachine: StateMachine;
  private adapters: ServiceAdapters;
  private idempotencyStore: IdempotencyStore;
  private logger: pino.Logger;

  constructor(configPath?: string) {
    this.config = new OrchestratorConfig(configPath);
    this.stateMachine = new StateMachine(this.config);
    this.adapters = new ServiceAdapters(this.config);
    this.idempotencyStore = new IdempotencyStore();
    
    this.logger = pino({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true }
      } : undefined
    });
  }

  async initialize(): Promise<void> {
    await this.idempotencyStore.initialize();
    await this.adapters.initialize();
    
    // Ensure audit and metrics directories exist
    await fs.mkdir('.orchestrator/audit', { recursive: true });
    await fs.mkdir('.orchestrator/metrics', { recursive: true });
  }

  /**
   * Run the full invoice processing pipeline
   */
  async runFullPipeline(
    invoices: InvoiceRecord[],
    options: {
      fromStage?: PipelineState;
      toStage?: PipelineState;
      dryRun?: boolean;
      resume?: boolean;
      maxWorkers?: number;
      tenantId?: string;
    } = {}
  ): Promise<PipelineResult> {
    const runId = uuidv4();
    const startedAt = new Date().toISOString();
    
    const context = new RunContext({
      runId,
      tenantId: options.tenantId || 'default',
      logger: this.logger.child({ runId }),
      dryRun: options.dryRun || false,
      maxWorkers: options.maxWorkers || this.config.concurrency.defaultMaxWorkers
    });

    context.logger.info('Starting full pipeline', {
      invoiceCount: invoices.length,
      options,
      runId
    });

    // Initialize pipeline result tracking
    const result: PipelineResult = {
      runId,
      startedAt,
      endedAt: '',
      summary: {
        totalInvoices: invoices.length,
        byStage: {}
      },
      failures: [],
      artifacts: {
        auditLog: `.orchestrator/audit/${runId}.jsonl`,
        metrics: `.orchestrator/metrics/${runId}.json`
      }
    };

    try {
      // Initialize stage counters
      const stages = this.config.stages;
      for (const stage of stages) {
        result.summary.byStage[stage] = { ok: 0, failed: 0 };
      }

      // Process invoices with controlled concurrency
      const semaphore = new Semaphore(context.maxWorkers);
      const promises = invoices.map(invoice => 
        semaphore.acquire().then(async (release) => {
          try {
            await this.processInvoice(invoice, context, result, options);
          } finally {
            release();
          }
        })
      );

      await Promise.all(promises);

      result.endedAt = new Date().toISOString();
      
      // Write audit log and metrics
      await this.writeAuditLog(context, result);
      await this.writeMetrics(context, result);

      context.logger.info('Pipeline completed', {
        summary: result.summary,
        failureCount: result.failures.length,
        duration: Date.now() - new Date(startedAt).getTime()
      });

      return result;

    } catch (error) {
      result.endedAt = new Date().toISOString();
      context.logger.error('Pipeline failed', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Process a single invoice through the pipeline
   */
  private async processInvoice(
    invoice: InvoiceRecord,
    context: RunContext,
    result: PipelineResult,
    options: {
      fromStage?: PipelineState;
      toStage?: PipelineState;
      resume?: boolean;
    }
  ): Promise<void> {
    const invoiceLogger = context.logger.child({ invoiceId: invoice.id });
    let currentStage = options.fromStage || PipelineState.IMPORTED;
    const endStage = options.toStage || PipelineState.DONE;

    invoiceLogger.info('Processing invoice', { 
      from: currentStage, 
      to: endStage,
      fingerprint: invoice.fingerprint 
    });

    let stageData: any = { invoice };

    try {
      while (currentStage !== endStage) {
        // Check if stage already completed (for resume functionality)
        if (options.resume) {
          const isCompleted = await this.idempotencyStore.isStageCompleted(
            invoice.fingerprint, 
            currentStage, 
            context.tenantId
          );
          
          if (isCompleted) {
            invoiceLogger.debug('Stage already completed, skipping', { stage: currentStage });
            currentStage = this.stateMachine.getNextState(currentStage);
            continue;
          }
        }

        // Check if stage is enabled
        if (!this.config.isStageEnabled(currentStage)) {
          invoiceLogger.debug('Stage disabled, skipping', { stage: currentStage });
          currentStage = this.stateMachine.getNextState(currentStage);
          continue;
        }

        const stageStartTime = Date.now();
        
        try {
          invoiceLogger.info('Executing stage', { stage: currentStage });

          // Execute stage with retries
          stageData = await this.executeStageWithRetries(
            currentStage,
            stageData,
            context,
            invoiceLogger
          );

          // Mark stage as completed
          if (!context.dryRun) {
            await this.idempotencyStore.markStageCompleted(
              invoice.fingerprint,
              currentStage,
              context.tenantId,
              stageData
            );
          }

          // Update success counter
          result.summary.byStage[currentStage].ok++;
          
          const duration = Date.now() - stageStartTime;
          invoiceLogger.info('Stage completed', { 
            stage: currentStage, 
            durationMs: duration 
          });

          // Move to next stage
          currentStage = this.stateMachine.getNextState(currentStage);

        } catch (error) {
          const duration = Date.now() - stageStartTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          invoiceLogger.error('Stage failed', {
            stage: currentStage,
            error: errorMessage,
            durationMs: duration
          });

          // Update failure counter and log failure
          result.summary.byStage[currentStage].failed++;
          result.failures.push({
            invoiceId: invoice.id,
            stage: currentStage,
            error: errorMessage,
            attempts: this.config.retries.maxAttempts
          });

          // Stop processing this invoice
          break;
        }
      }

    } catch (error) {
      invoiceLogger.error('Invoice processing failed', { 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  /**
   * Execute a pipeline stage with retry logic
   */
  private async executeStageWithRetries(
    stage: PipelineState,
    stageData: any,
    context: RunContext,
    logger: pino.Logger
  ): Promise<any> {
    const retryConfig = this.config.retries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        // Apply jitter and exponential backoff for retries
        if (attempt > 1) {
          const delay = this.calculateBackoffDelay(attempt, retryConfig);
          logger.debug('Retrying after delay', { attempt, delayMs: delay, stage });
          await this.sleep(delay);
        }

        // Execute the stage
        const timeout = this.config.getStageTimeout(stage);
        const stagePromise = this.executeStage(stage, stageData, context);
        
        const result = await Promise.race([
          stagePromise,
          this.createTimeoutPromise(timeout, `Stage ${stage} timed out after ${timeout}ms`)
        ]);

        logger.debug('Stage attempt succeeded', { stage, attempt });
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('Stage attempt failed', {
          stage,
          attempt,
          error: lastError.message,
          willRetry: attempt < retryConfig.maxAttempts
        });

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          logger.error('Non-retryable error encountered', { stage, error: lastError.message });
          throw lastError;
        }
      }
    }

    logger.error('All stage attempts exhausted', { stage, attempts: retryConfig.maxAttempts });
    throw lastError || new Error(`Stage ${stage} failed after ${retryConfig.maxAttempts} attempts`);
  }

  /**
   * Execute a specific pipeline stage
   */
  private async executeStage(stage: PipelineState, stageData: any, context: RunContext): Promise<any> {
    switch (stage) {
      case PipelineState.IMPORTED:
        return await this.adapters.importInvoices(stageData, context);
      
      case PipelineState.OCR_PROCESSED:
        return await this.adapters.processOCR(stageData, context);
      
      case PipelineState.AI_EXTRACTED:
        return await this.adapters.extractWithAI(stageData, context);
      
      case PipelineState.XML_PARSED:
        return await this.adapters.parseXML(stageData, context);
      
      case PipelineState.VALIDATED:
        return await this.adapters.validateData(stageData, context);
      
      case PipelineState.ERP_POSTED:
        return await this.adapters.postToERP(stageData, context);
      
      case PipelineState.RECONCILED:
        return await this.adapters.reconcileData(stageData, context);
      
      case PipelineState.NOTIFIED:
        return await this.adapters.sendNotifications(stageData, context);
      
      default:
        throw new Error(`Unknown pipeline stage: ${stage}`);
    }
  }

  /**
   * Utility methods
   */
  private calculateBackoffDelay(attempt: number, config: typeof this.config.retries): number {
    const exponentialDelay = config.initialDelaySeconds * Math.pow(2, attempt - 1) * 1000;
    const cappedDelay = Math.min(exponentialDelay, config.maxDelaySeconds * 1000);
    
    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    return Math.max(1000, cappedDelay + jitter);
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = ['NetworkError', 'RateLimitError', 'TransientError', 'TimeoutError'];
    return retryableErrors.some(type => error.message.includes(type) || error.name === type);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createTimeoutPromise(timeout: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  private async writeAuditLog(context: RunContext, result: PipelineResult): Promise<void> {
    const auditData = {
      runId: context.runId,
      timestamp: new Date().toISOString(),
      result
    };
    
    await fs.writeFile(
      result.artifacts.auditLog,
      JSON.stringify(auditData) + '\n',
      { flag: 'a' }
    );
  }

  private async writeMetrics(context: RunContext, result: PipelineResult): Promise<void> {
    await fs.writeFile(
      result.artifacts.metrics,
      JSON.stringify(result, null, 2)
    );
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(() => this.release());
      } else {
        this.waiting.push(() => {
          this.permits--;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const program = new Command();
  
  program
    .name('orchestrator')
    .description('Invoice Processing Pipeline Orchestrator')
    .version('1.0.0');

  program
    .command('run')
    .description('Run the full invoice processing pipeline')
    .option('--from-stage <stage>', 'Start from specific stage')
    .option('--to-stage <stage>', 'End at specific stage')
    .option('--dry-run', 'Perform dry run without making changes')
    .option('--resume', 'Resume from last checkpoint')
    .option('--max-workers <number>', 'Maximum concurrent workers', '4')
    .option('--config <path>', 'Configuration file path')
    .option('--tenant <id>', 'Tenant ID', 'default')
    .option('--limit <number>', 'Limit number of invoices to process')
    .action(async (options) => {
      const orchestrator = new Orchestrator(options.config);
      await orchestrator.initialize();
      
      // TODO: Load invoices from storage or file system
      const invoices: InvoiceRecord[] = []; // Placeholder
      
      const result = await orchestrator.runFullPipeline(invoices, {
        fromStage: options.fromStage as PipelineState,
        toStage: options.toStage as PipelineState,
        dryRun: options.dryRun,
        resume: options.resume,
        maxWorkers: parseInt(options.maxWorkers),
        tenantId: options.tenant
      });
      
      console.log(JSON.stringify(result, null, 2));
    });

  program
    .command('status')
    .description('Show previous runs and checkpoints')
    .action(async () => {
      // TODO: Implement status command
      console.log('Status command not yet implemented');
    });

  program
    .command('metrics')
    .description('Print metrics counters and timers')
    .action(async () => {
      // TODO: Implement metrics command
      console.log('Metrics command not yet implemented');
    });

  program
    .command('doctor')
    .description('Check environment, dependencies, and configuration')
    .action(async () => {
      // TODO: Implement doctor command
      console.log('Doctor command not yet implemented');
    });

  await program.parseAsync();
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default Orchestrator;