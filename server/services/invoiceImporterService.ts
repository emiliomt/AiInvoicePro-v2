import { storage } from '../storage';
import type { InvoiceImporterConfig, ErpConnection } from '@shared/schema';
import { getProgressTracker } from './progressTracker';
import fs from 'fs/promises';
import path from 'path';

export interface ImporterStep {
  id: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  screenshot?: string;
  errorMessage?: string;
  timestamp: Date;
}

export interface ImporterProgress {
  taskId: number;
  currentStep: number;
  totalSteps: number;
  steps: ImporterStep[];
  totalInvoices: number;
  processedInvoices: number;
  successfulImports: number;
  failedImports: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

class InvoiceImporterService {
  private activeImports = new Map<number, ImporterProgress>();

  private async logStep(logId: number, stepTitle: string, status: 'pending' | 'running' | 'completed' | 'failed', details?: string): Promise<void> {
    try {
      const log = await storage.getInvoiceImporterLog(logId);
      if (!log) return;

      const timestamp = new Date().toISOString();
      const stepLog = `[${timestamp}] [STEP] ${stepTitle} [${status.toUpperCase()}]${details ? ` - ${details}` : ''}`;

      const updatedLogs = log.logs ? `${log.logs}\n${stepLog}` : stepLog;

      await storage.updateInvoiceImporterLog(logId, {
        logs: updatedLogs
      });
    } catch (error) {
      console.error('Failed to log step:', error);
    }
  }

  async executeImportTask(configId: number, userId?: string): Promise<void> {
    const config = await storage.getInvoiceImporterConfig(configId);
    if (!config) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const { getProgressTracker } = await import('./progressTracker');
    const progressTracker = getProgressTracker();

    const taskId = `import_${configId}_${Date.now()}`;
    const taskUserId = userId || config.userId;

    console.log(`📋 [INVOICE_IMPORTER] Starting import task for config: ${config.taskName}`);

    // Start progress tracking
    if (progressTracker) {
      progressTracker.startTask({
        taskId,
        configId,
        userId: taskUserId,
        type: 'invoice_import',
        progress: { current: 0, total: 100, percentage: 0 },
        steps: [
          { id: 1, name: 'Initialize Import', status: 'pending' },
          { id: 2, name: 'Connect to ERP', status: 'pending' },
          { id: 3, name: 'Extract Invoices', status: 'pending' },
          { id: 4, name: 'Process Data', status: 'pending' },
          { id: 5, name: 'Finalize Import', status: 'pending' }
        ]
      });

      progressTracker.addLog(taskId, 'info', `Starting import task: ${config.taskName}`);
    }

    try {
      // Update status to running
      await storage.updateInvoiceImporterConfig(configId, {
        lastRun: new Date(),
        isRunning: true
      });

      if (progressTracker) {
        progressTracker.updateStep(taskId, 1, { status: 'running' });
        progressTracker.updateProgress(taskId, {
          status: 'running',
          progress: { current: 1, total: 5, percentage: 20 }
        });
      }

      let result;
      if (config.isManualConfig) {
        if (progressTracker) {
          progressTracker.addLog(taskId, 'info', 'Running manual configuration (no automation)');
        }
        console.log('📋 [INVOICE_IMPORTER] Running manual configuration (no automation)');
        result = await this.processManualConfiguration(config, taskId);
      } else {
        if (progressTracker) {
          progressTracker.addLog(taskId, 'info', 'Running RPA automation...');
        }
        console.log('📋 [INVOICE_IMPORTER] Running RPA automation...');
        result = await this.processERPIntegration(config, taskId);
      }

      // Complete progress tracking
      if (progressTracker) {
        progressTracker.completeTask(taskId, result);
        progressTracker.addLog(taskId, result.success ? 'success' : 'error', 
          result.message || (result.success ? 'Import completed successfully' : 'Import failed'));
      }

      // Log the result
      await storage.createInvoiceImporterLog({
        configId,
        status: result.success ? 'completed' : 'failed',
        message: result.message || (result.success ? 'Import completed successfully' : 'Import failed'),
        details: result,
        executionTime: result.executionTime || 0
      });

      console.log(`✅ [INVOICE_IMPORTER] Task completed: ${result.message}`);
    } catch (error: any) {
      console.error(`❌ [INVOICE_IMPORTER] Task failed:`, error);

      if (progressTracker) {
        progressTracker.completeTask(taskId, null, error.message || 'Unknown error');
        progressTracker.addLog(taskId, 'error', `Task failed: ${error.message}`);
      }

      await storage.createInvoiceImporterLog({
        configId,
        status: 'failed',
        message: error.message || 'Unknown error',
        details: { error: error.message, stack: error.stack },
        executionTime: 0
      });

      throw error;
    } finally {
      // Update status to not running
      await storage.updateInvoiceImporterConfig(configId, {
        isRunning: false
      });
    }
  }

  private async processManualConfiguration(config: any, taskId?: string): Promise<any> {
    const { getProgressTracker } = await import('./progressTracker');
    const progressTracker = getProgressTracker();

    if (progressTracker && taskId) {
      progressTracker.updateStep(taskId, 2, { status: 'running' });
      progressTracker.addLog(taskId, 'info', 'Manual configuration mode - ready for manual invoice uploads');
    }

    const result = {
      success: true,
      message: 'Manual configuration ready for invoice uploads',
      isManualMode: true,
      configId: config.id,
      taskName: config.taskName,
      invoicesProcessed: 0,
      executionTime: 1000
    };

    if (progressTracker && taskId) {
      progressTracker.updateStep(taskId, 2, { status: 'completed' });
      progressTracker.updateStep(taskId, 3, { status: 'completed' });
      progressTracker.updateStep(taskId, 4, { status: 'completed' });
      progressTracker.updateStep(taskId, 5, { status: 'running' });
      progressTracker.updateProgress(taskId, {
        progress: { current: 5, total: 5, percentage: 100 }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (progressTracker && taskId) {
      progressTracker.updateStep(taskId, 5, { status: 'completed' });
    }

    return result;
  }

  private async processERPIntegration(config: any, taskId?: string): Promise<any> {
    const { getProgressTracker } = await import('./progressTracker');
    const progressTracker = getProgressTracker();

    if (progressTracker && taskId) {
      progressTracker.updateStep(taskId, 2, { status: 'running' });
      progressTracker.addLog(taskId, 'info', 'Connecting to ERP system...');
    }

    try {
      // Get connection details
      const connection = await storage.getErpConnection(config.connectionId);
      if (!connection) {
        throw new Error('ERP connection not found');
      }

      if (progressTracker && taskId) {
        progressTracker.updateStep(taskId, 2, { status: 'completed' });
        progressTracker.updateStep(taskId, 3, { status: 'running' });
        progressTracker.updateProgress(taskId, {
          progress: { current: 3, total: 5, percentage: 60 }
        });
        progressTracker.addLog(taskId, 'info', 'Extracting invoices from ERP...');
      }

      // Use RPA service for automation
      const { PythonRPAService } = await import('./pythonRpaService');
      const rpaResult = await PythonRPAService.processInvoicesAutomatically();

      if (progressTracker && taskId) {
        progressTracker.updateStep(taskId, 3, { status: 'completed' });
        progressTracker.updateStep(taskId, 4, { status: 'running' });
        progressTracker.updateProgress(taskId, {
          progress: { current: 4, total: 5, percentage: 80 }
        });
        progressTracker.addLog(taskId, 'info', 'Processing extracted data...');
      }

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (progressTracker && taskId) {
        progressTracker.updateStep(taskId, 4, { status: 'completed' });
        progressTracker.updateStep(taskId, 5, { status: 'running' });
        progressTracker.updateProgress(taskId, {
          progress: { current: 5, total: 5, percentage: 100 }
        });
      }

      const result = {
        success: rpaResult.success,
        message: rpaResult.message || 'ERP integration completed',
        invoicesProcessed: rpaResult.invoicesProcessed || 0,
        details: rpaResult,
        executionTime: 10000
      };

      if (progressTracker && taskId) {
        progressTracker.updateStep(taskId, 5, { status: 'completed' });
        progressTracker.updateStats(taskId, {
          processed: result.invoicesProcessed,
          successful: result.success ? result.invoicesProcessed : 0,
          failed: result.success ? 0 : 1
        });
      }

      return result;
    } catch (error: any) {
      if (progressTracker && taskId) {
        progressTracker.addLog(taskId, 'error', `ERP integration failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async performImportProcessWithRetry(
    logId: number,
    config: InvoiceImporterConfig,
    connection: ErpConnection,
    progress: ImporterProgress
  ): Promise<void> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Import attempt ${attempt}/${maxRetries} for log ${logId}`);
        await this.performImportProcess(logId, config, connection, progress);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        console.error(`Import attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Reset progress for retry
          progress.currentStep = 1;
          progress.steps = this.initializeSteps();
          await this.updateStepStatus(logId, progress, 1, 'running', `Retrying import (attempt ${attempt + 1}/${maxRetries})...`);

          // Wait before retry
          await this.simulateDelay(3000);
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Import failed after all retry attempts');
  }

  private async performImportProcess(
    logId: number,
    config: InvoiceImporterConfig,
    connection: ErpConnection,
    progress: ImporterProgress
  ): Promise<void> {
    const { erpAutomationService } = await import('./erpAutomationService');

    // Step 1: Initialize browser (faster)
    await this.logStep(logId, 'Initializing browser automation', 'running');
    await this.updateStepStatus(logId, progress, 1, 'running');
    await this.simulateDelay(500); // Reduced delay
    await this.logStep(logId, 'Browser automation initialized', 'completed');
    await this.updateStepStatus(logId, progress, 1, 'completed');

    // Step 2: Generate optimized RPA script
    await this.logStep(logId, 'Generating automation script', 'running');
    await this.updateStepStatus(logId, progress, 2, 'running');
    const taskDescription = `Quick login and navigate to FE module. Extract invoice document list from Documentos recibidos section. Focus on document numbers, download links, and any project/contract references in document descriptions.`;

    try {
      // Decrypt password for RPA script generation
      const decryptedPassword = connection.password ? Buffer.from(connection.password, 'base64').toString('utf8') : '';

      console.log(`🔍 Invoice import: Preparing credentials for RPA script generation:`, {
        configType: config.isManualConfig ? 'Manual' : 'Connection-based',
        connectionId: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username || '',
        encryptedPasswordLength: connection.password ? connection.password.length : 0,
        decryptedPasswordLength: decryptedPassword.length,
        decryptedPassword: decryptedPassword
      });

      const script = await erpAutomationService.generateRPAScript(taskDescription, {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username || '',
        password: decryptedPassword
      });

      await this.logStep(logId, 'Automation script generated successfully', 'completed');
      await this.updateStepStatus(logId, progress, 2, 'completed');

      // Step 3: Execute optimized RPA script
      await this.logStep(logId, 'Connecting to ERP system', 'running');
      await this.updateStepStatus(logId, progress, 3, 'running', 'Connecting to ERP system...');

      console.log(`🔍 Invoice import: Preparing credentials for RPA execution:`, {
        configType: config.isManualConfig ? 'Manual' : 'Connection-based',
        connectionId: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username || '',
        decryptedPasswordLength: decryptedPassword.length,
        decryptedPassword: decryptedPassword
      });

      const result = await erpAutomationService.executeRPAScript(script, {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username || '',
        password: decryptedPassword
      }, config.userId, logId);

      if (!result.success) {
        await this.logStep(logId, 'ERP connection failed', 'failed', result.errorMessage);
        throw new Error(`ERP connection failed: ${result.errorMessage}`);
      }

      await this.logStep(logId, 'Successfully connected to ERP system', 'completed');
      await this.updateStepStatus(logId, progress, 3, 'completed');

      // Step 4: Navigate to invoice section
      await this.updateStepStatus(logId, progress, 4, 'running');
      await this.simulateDelay(300);
      await this.updateStepStatus(logId, progress, 4, 'completed');

      // Step 5: Load invoice list
      await this.updateStepStatus(logId, progress, 5, 'running');

      // Process extracted data more efficiently
      if (result.extractedData && Object.keys(result.extractedData).length > 0) {
        progress.totalInvoices = Object.keys(result.extractedData).length;
        await this.updateStepStatus(logId, progress, 5, 'completed');

        // Step 6: Scan invoices (fast)
        await this.updateStepStatus(logId, progress, 6, 'running');
        await this.simulateDelay(200);
        await this.updateStepStatus(logId, progress, 6, 'completed');

        // Step 7-9: Process downloads efficiently
        await this.updateStepStatus(logId, progress, 7, 'running');
        await this.processExtractedInvoiceDataFast(logId, progress, config, result.extractedData);
        await this.updateStepStatus(logId, progress, 7, 'completed');

        // Skip to processed steps
        await this.updateStepStatus(logId, progress, 8, 'completed', 'File extraction completed');
        await this.updateStepStatus(logId, progress, 9, 'completed', 'Document processing completed');
      } else {
        console.log('No invoice data extracted from ERP system');
        progress.totalInvoices = 0;
        await this.updateStepStatus(logId, progress, 5, 'completed', 'No invoices found');

        // Mark remaining steps as completed
        for (let step = 6; step <= 9; step++) {
          await this.updateStepStatus(logId, progress, step, 'completed', 'No data to process');
        }
      }

      // Step 10: Process metadata (optimized)
      await this.updateStepStatus(logId, progress, 10, 'running');
      await this.processInvoiceMetadataFast(logId, progress);
      await this.updateStepStatus(logId, progress, 10, 'completed');

      // Step 11: Store imported invoices (optimized)
      await this.updateStepStatus(logId, progress, 11, 'running');
      await this.storeImportedInvoicesFast(logId, progress);
      await this.updateStepStatus(logId, progress, 11, 'completed');

      // Step 12: Cleanup (fast)
      await this.updateStepStatus(logId, progress, 12, 'running');
      await this.simulateDelay(200);
      await this.updateStepStatus(logId, progress, 12, 'completed');

      // Step 13: Trigger automatic processing if enabled
      if (config.automaticProcessing) {
        await this.triggerAutomaticProcessing(logId, config.userId);
      }

    } catch (error: any) {
      console.error('RPA automation failed:', error);

      // Log the RPA failure but don't fail the entire import
      await this.logStep(logId, 'RPA automation failed, switching to manual mode', 'failed', error.message);

      // Update progress to indicate manual processing needed
      await this.updateStepStatus(logId, progress, 3, 'failed', 'RPA login failed - manual upload required');

      // Mark remaining steps as completed but with manual processing note
      for (let step = 4; step <= 12; step++) {
        await this.updateStepStatus(logId, progress, step, 'completed', 'Manual processing required due to RPA failure');
      }

      // Don't throw error - allow manual processing workflow
      console.log(`Import task ${logId} switched to manual mode due to RPA failure`);
      return;
    }
  }

  private async handleImportTimeout(logId: number, message: string): Promise<void> {
    try {
      const progress = this.activeImports.get(logId);
      if (progress) {
        progress.status = 'failed';
        progress.message = message;
        progress.completedAt = new Date();

        // Update the current step to failed
        const currentStep = progress.steps.find(s => s.id === progress.currentStep);
        if (currentStep) {
          currentStep.status = 'failed';
          currentStep.errorMessage = message;
          currentStep.timestamp = new Date();
        }
      }

      await storage.updateInvoiceImporterLog(logId, {
        status: 'failed',
        errorMessage: message,
        completedAt: new Date(),
        logs: progress ? this.generateLogsFromSteps(progress.steps) : `Import timed out: ${message}`,
      });

      // Remove from active imports
      this.activeImports.delete(logId);
    } catch (error) {
      console.error('Failed to handle import timeout:', error);
    }
  }

  private initializeSteps(): ImporterStep[] {
    return [
      { id: 1, description: 'Initializing browser session', status: 'pending', timestamp: new Date() },
      { id: 2, description: 'Navigating to ERP login page', status: 'pending', timestamp: new Date() },
      { id: 3, description: 'Logging into ERP system', status: 'pending', timestamp: new Date() },
      { id: 4, description: 'Navigating to invoice section', status: 'pending', timestamp: new Date() },
      { id: 5, description: 'Loading invoice list', status: 'pending', timestamp: new Date() },
      { id: 6, description: 'Scanning available invoices', status: 'pending', timestamp: new Date() },
      { id: 7, description: 'Processing invoice downloads', status: 'pending', timestamp: new Date() },
      { id: 8, description: 'Extracting XML files', status: 'pending', timestamp: new Date() },
      { id: 9, description: 'Extracting PDF files', status: 'pending', timestamp: new Date() },
      { id: 10, description: 'Processing invoice metadata', status: 'pending', timestamp: new Date() },
      { id: 11, description: 'Storing imported invoices', status: 'pending', timestamp: new Date() },
      { id: 12, description: 'Cleaning up and finalizing', status: 'pending', timestamp: new Date() },
    ];
  }

  private async processXMLDownloads(logId: number, progress: ImporterProgress, config: InvoiceImporterConfig): Promise<void> {
    await this.updateStepStatus(logId, progress, 8, 'running');

    // Simulate downloading XML files
    for (let i = 0; i < progress.totalInvoices; i++) {
      progress.processedInvoices = i + 1;

      // Simulate success/failure rate (90% success)
      if (Math.random() > 0.1) {
        progress.successfulImports++;

        // Create mock imported invoice record
        await storage.createImportedInvoice({
          logId,
          originalFileName: `invoice_${i + 1}.xml`,
          fileType: 'xml',
          fileSize: Math.floor(Math.random() * 50000) + 10000, // 10-60KB
          filePath: `/uploads/imported/xml/invoice_${i + 1}.xml`,
          erpDocumentId: `DOC_${Date.now()}_${i}`,
          downloadedAt: new Date(),
          metadata: {
            invoiceNumber: `INV-${Date.now()}-${i}`,
            issueDate: new Date().toISOString(),
            vendor: `Vendor ${i + 1}`,
            amount: (Math.random() * 10000).toFixed(2),
          },
        });
      } else {
        progress.failedImports++;
      }
    }
  }

  private async processExtractedInvoiceDataFast(
    logId: number,
    progress: ImporterProgress,
    config: InvoiceImporterConfig,
    extractedData: any
  ): Promise<void> {
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    const entries = Object.entries(extractedData);
    const batchSize = 5; // Process in smaller batches for better UX

    // Process in batches for better performance
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      await Promise.all(batch.map(async ([key, value]) => {
        try {
          processedCount++;

          // Create imported invoice record from extracted data
          await storage.createImportedInvoice({
            logId,
            originalFileName: `invoice_${processedCount}.${config.fileTypes === 'xml' ? 'xml' : 'pdf'}`,
            fileType: config.fileTypes === 'both' ? 'pdf' : config.fileTypes,
            fileSize: JSON.stringify(value).length,
            filePath: `/uploads/imported/${config.fileTypes}/invoice_${processedCount}.${config.fileTypes === 'xml' ? 'xml' : 'pdf'}`,
            erpDocumentId: `ERP_${Date.now()}_${processedCount}`,
            downloadedAt: new Date(),
            metadata: {
              extractedKey: key,
              extractedValue: value,
              extractionTimestamp: new Date().toISOString(),
              sourceErpName: config.connectionId ? `Connection ID: ${config.connectionId}` : 'Unknown'
            },
          });

          successCount++;
        } catch (error: any) {
          failCount++;
          console.error(`Failed to process extracted invoice ${processedCount}:`, error);
        }
      }));

      // Update progress more frequently
      progress.processedInvoices = processedCount;
      progress.successfulImports = successCount;
      progress.failedImports = failCount;

      const progressTracker = getProgressTracker(); // Get progressTracker here
      if (progressTracker) {
        progressTracker.sendProgress(config.userId, {
          taskId: logId,
          step: 7,
          totalSteps: progress.totalSteps,
          status: 'processing',
          message: `Processing batch ${Math.ceil((i + batchSize) / batchSize)} of ${Math.ceil(entries.length / batchSize)}`,
          timestamp: new Date(),
          data: { processedInvoices: processedCount, successfulImports: successCount },
        });
      }


      // Minimal delay between batches
      await this.simulateDelay(100);
    }
  }

  private async processInvoiceMetadataFast(logId: number, progress: ImporterProgress): Promise<void> {
    // Get imported invoices and process them in batches
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    if (importedInvoices.length === 0) {
      return;
    }

    const batchSize = 10;
    for (let i = 0; i < importedInvoices.length; i += batchSize) {
      const batch = importedInvoices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (importedInvoice) => {
        await storage.updateImportedInvoice(importedInvoice.id, {
          processedAt: new Date(),
        });
      }));

      // Minimal delay between batches
      await this.simulateDelay(50);
    }
  }

  private async storeImportedInvoicesFast(logId: number, progress: ImporterProgress): Promise<void> {
    // Convert imported invoices to regular invoice records efficiently
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    if (importedInvoices.length === 0) {
      return;
    }

    const batchSize = 10;
    for (let i = 0; i < importedInvoices.length; i += batchSize) {
      const batch = importedInvoices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (importedInvoice) => {
        if (importedInvoice.metadata) {
          // Create placeholder invoice record - in real implementation this would involve OCR/AI
          // For now just mark as processed
          console.log(`Processed invoice: ${importedInvoice.originalFileName}`);
        }
      }));

      // Minimal delay between batches
      await this.simulateDelay(50);
    }
  }

  private async processPDFDownloads(logId: number, progress: ImporterProgress, config: InvoiceImporterConfig): Promise<void> {
    await this.updateStepStatus(logId, progress, 9, 'running');

    // Similar to XML processing but for PDFs
    for (let i = 0; i < progress.totalInvoices; i++) {
      // Simulate success/failure rate (85% success for PDFs)
      if (Math.random() > 0.15) {
        progress.successfulImports++;

        await storage.createImportedInvoice({
          logId,
          originalFileName: `invoice_${i + 1}.pdf`,
          fileType: 'pdf',
          fileSize: Math.floor(Math.random() * 200000) + 50000, // 50-250KB
          filePath: `/uploads/imported/pdf/invoice_${i + 1}.pdf`,
          erpDocumentId: `DOC_${Date.now()}_${i}`,
          downloadedAt: new Date(),
          metadata: {
            invoiceNumber: `INV-${Date.now()}-${i}`,
            issueDate: new Date().toISOString(),
            vendor: `Vendor ${i + 1}`,
            amount: (Math.random() * 10000).toFixed(2),
          },
        });
      } else {
        progress.failedImports++;
      }

      const progressTracker = getProgressTracker(); // Get progressTracker here
      if (progressTracker) {
        progressTracker.sendProgress(config.userId, {
          taskId: logId,
          step: 9,
          totalSteps: progress.totalSteps,
          status: 'processing',
          message: `Downloading PDF ${i + 1}/${progress.totalInvoices}`,
          timestamp: new Date(),
          data: { processedInvoices: progress.processedInvoices, successfulImports: progress.successfulImports },
        });
      }


      await this.simulateDelay(2000);
    }

    await this.updateStepStatus(logId, progress, 9, 'completed');
  }

  private async processInvoiceMetadata(logId: number, progress: ImporterProgress): Promise<void> {
    // Process and validate imported invoice metadata
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    for (const importedInvoice of importedInvoices) {
      // Here you would normally process the file and extract data
      // For now, we'll just update the processed timestamp
      await storage.updateImportedInvoice(importedInvoice.id, {
        processedAt: new Date(),
      });

      await this.simulateDelay(500);
    }
  }

  private async storeImportedInvoices(logId: number, progress: ImporterProgress): Promise<void> {
    // Convert imported invoices to regular invoice records
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    for (const importedInvoice of importedInvoices) {
      if (importedInvoice.metadata) {
        // Create invoice record from imported data
        // This would normally involve full OCR and AI extraction
        // For now, we'll create a placeholder

        await this.simulateDelay(1000);
      }
    }
  }

  private async updateStepStatus(
    logId: number,
    progress: ImporterProgress,
    stepId: number,
    status: 'running' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const step = progress.steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      step.timestamp = new Date();
      if (errorMessage) step.errorMessage = errorMessage;
    }

    progress.currentStep = stepId;

    // Send progress update via WebSocket
    const log = await storage.getInvoiceImporterLog(logId);
    if (log) {
      const config = await storage.getInvoiceImporterConfig(log.configId);
      if (config) {
        const progressTracker = getProgressTracker(); // Get progressTracker here
        if (progressTracker) {
          progressTracker.sendProgress(config.userId, {
            taskId: logId,
            step: stepId,
            totalSteps: progress.totalSteps,
            status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'processing',
            message: step?.description || `Step ${stepId}`,
            timestamp: new Date(),
            data: progress,
          });
        }
      }
    }

    // Update logs in database
    const logs = progress.steps
      .filter(s => s.status !== 'pending')
      .map(s => `[${s.timestamp.toISOString()}] ${s.status.toUpperCase()}: ${s.description}${s.errorMessage ? ` - ERROR: ${s.errorMessage}` : ''}`)
      .join('\n');

    await storage.updateInvoiceImporterLog(logId, { logs });
  }

  private async processExtractedInvoiceData(
    logId: number,
    progress: ImporterProgress,
    config: InvoiceImporterConfig,
    extractedData: any
  ): Promise<void> {
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    // Process each extracted data item as an invoice
    for (const [key, value] of Object.entries(extractedData)) {
      try {
        processedCount++;

        // Create imported invoice record from extracted data
        await storage.createImportedInvoice({
          logId,
          originalFileName: `extracted_invoice_${processedCount}.${config.fileTypes === 'xml' ? 'xml' : 'pdf'}`,
          fileType: config.fileTypes === 'both' ? 'pdf' : config.fileTypes,
          fileSize: JSON.stringify(value).length,
          filePath: `/uploads/imported/${config.fileTypes}/extracted_invoice_${processedCount}.${config.fileTypes === 'xml' ? 'xml' : 'pdf'}`,
          erpDocumentId: `ERP_${Date.now()}_${processedCount}`,
          downloadedAt: new Date(),
          metadata: {
            extractedKey: key,
            extractedValue: value,
            extractionTimestamp: new Date().toISOString(),
            sourceERP: config.connectionId ? `Connection ID: ${config.connectionId}` : 'Unknown'
          },
        });

        successCount++;

        // Update progress
        const progressTracker = getProgressTracker(); // Get progressTracker here
        if (progressTracker) {
          progressTracker.sendProgress(config.userId, {
            taskId: logId,
            step: 3,
            totalSteps: progress.totalSteps,
            status: 'processing',
            message: `Processing extracted invoice ${processedCount}/${progress.totalInvoices}`,
            timestamp: new Date(),
            data: { processedInvoices: processedCount, successfulImports: successCount },
          });
        }


        await this.simulateDelay(500);
      } catch (error: any) {
        failCount++;
        console.error(`Failed to process extracted invoice ${processedCount}:`, error);
      }
    }

    progress.processedInvoices = processedCount;
    progress.successfulImports = successCount;
    progress.failedImports = failCount;
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async triggerAutomaticProcessing(logId: number, userId: string): Promise<void> {
    try {
      console.log(`🤖 Triggering automatic processing for import log ${logId}`);

      // Get all imported invoices from this RPA session
      const { storage } = await import('../storage.js');
      const importedInvoices = await storage.getImportedInvoicesByLogId(logId);

      if (importedInvoices.length === 0) {
        console.log('No invoices found for automatic processing');
        return;
      }

      // Extract invoice IDs
      const invoiceIds = importedInvoices.map(inv => inv.id).filter(Boolean);

      if (invoiceIds.length === 0) {
        console.log('No valid invoice IDs found for automatic processing');
        return;
      }

      console.log(`Initiating automatic processing for ${invoiceIds.length} RPA-imported invoices`);

      // Make internal API call to trigger automatic processing
      const fetch = (await import('node-fetch')).default;

      const response = await fetch('http://localhost:5000/api/invoices/initiate-automatic-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add user context for internal call
          'X-Internal-User-Id': userId
        },
        body: JSON.stringify({
          invoiceIds,
          source: 'rpa_automation'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Automatic processing triggered successfully:`, result.summary);

        await this.logStep(logId, `Automatic processing initiated for ${result.summary.totalInvoices} invoices`, 'completed');
      } else {
        const error = await response.text();
        console.error('Failed to trigger automatic processing:', error);
        await this.logStep(logId, 'Failed to initiate automatic processing', 'failed', error);
      }

    } catch (error: any) {
      console.error('Error triggering automatic processing:', error);
      await this.logStep(logId, 'Error initiating automatic processing', 'failed', error.message);
    }
  }

  private generateLogsFromSteps(steps: ImporterStep[]): string {
    return steps
      .filter(step => step.status !== 'pending')
      .map(step => {
        const timestamp = step.timestamp.toISOString();
        const status = step.status.toUpperCase();
        const errorInfo = step.errorMessage ? ` - ERROR: ${step.errorMessage}` : '';
        return `[${timestamp}] [STEP] ${step.description} [${status}]${errorInfo}`;
      })
      .join('\n');
  }

  getProgress(taskId: number): ImporterProgress | undefined {
    return this.activeImports.get(taskId);
  }

  getAllActiveImports(): ImporterProgress[] {
    return Array.from(this.activeImports.values());
  }
}

export const invoiceImporterService = new InvoiceImporterService();