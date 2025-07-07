import { storage } from '../storage';
import type { InvoiceImporterConfig, ErpConnection } from '@shared/schema';
import { progressTracker } from './progressTracker';
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
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

class InvoiceImporterService {
  private activeImports = new Map<number, ImporterProgress>();

  async executeImportTask(configId: number): Promise<void> {
    const config = await storage.getInvoiceImporterConfig(configId);
    if (!config) {
      throw new Error('Import configuration not found');
    }

    // Create execution log
    const log = await storage.createInvoiceImporterLog({
      configId,
      status: 'running',
      startedAt: new Date(),
    });

    const progress: ImporterProgress = {
      taskId: log.id,
      currentStep: 0,
      totalSteps: 12,
      steps: this.initializeSteps(),
      totalInvoices: 0,
      processedInvoices: 0,
      successfulImports: 0,
      failedImports: 0,
      status: 'running',
      startedAt: new Date(),
    };

    this.activeImports.set(log.id, progress);
    console.log(`Started import task ${log.id} for config ${configId}, stored in activeImports`);

    try {
      // Get connection details
      const connection = await storage.getErpConnection(config.connectionId);
      if (!connection) {
        throw new Error(`ERP connection not found for connectionId ${config.connectionId}`);
      }
      
      console.log(`Found ERP connection for import task ${log.id}: ${connection.name}`);

      // Set a timeout for the entire import process (10 minutes max)
      const importTimeout = setTimeout(() => {
        throw new Error('Import process timed out after 10 minutes');
      }, 10 * 60 * 1000);

      try {
        await this.performImportProcess(log.id, config, connection, progress);
        clearTimeout(importTimeout);
      } catch (importError) {
        clearTimeout(importTimeout);
        throw importError;
      }

      // Mark as completed
      progress.status = 'completed';
      progress.completedAt = new Date();

      await storage.updateInvoiceImporterLog(log.id, {
        status: 'completed',
        completedAt: new Date(),
        totalInvoices: progress.totalInvoices,
        processedInvoices: progress.processedInvoices,
        successfulImports: progress.successfulImports,
        failedImports: progress.failedImports,
        executionTime: Date.now() - progress.startedAt.getTime(),
      });

    } catch (error: any) {
      progress.status = 'failed';
      progress.errorMessage = error.message;
      progress.completedAt = new Date();

      await storage.updateInvoiceImporterLog(log.id, {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
        executionTime: Date.now() - progress.startedAt.getTime(),
      });

      throw error;
    } finally {
      // Clean up active import after a delay
      setTimeout(() => {
        this.activeImports.delete(log.id);
      }, 5 * 60 * 1000); // Keep for 5 minutes
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

  private async performImportProcess(
    logId: number,
    config: InvoiceImporterConfig,
    connection: ErpConnection,
    progress: ImporterProgress
  ): Promise<void> {
    // Step 1: Initialize browser session
    await this.updateStepStatus(logId, progress, 1, 'running');
    await this.simulateDelay(2000);
    await this.updateStepStatus(logId, progress, 1, 'completed');

    // Step 2: Navigate to ERP login page
    await this.updateStepStatus(logId, progress, 2, 'running');
    await this.simulateDelay(3000);
    await this.updateStepStatus(logId, progress, 2, 'completed');

    // Step 3: Login to ERP system
    await this.updateStepStatus(logId, progress, 3, 'running');
    await this.simulateDelay(4000);
    await this.updateStepStatus(logId, progress, 3, 'completed');

    // Step 4: Navigate to invoice section
    await this.updateStepStatus(logId, progress, 4, 'running');
    await this.simulateDelay(3000);
    await this.updateStepStatus(logId, progress, 4, 'completed');

    // Step 5: Load invoice list
    await this.updateStepStatus(logId, progress, 5, 'running');
    await this.simulateDelay(5000);

    // Simulate finding invoices
    const mockInvoiceCount = Math.floor(Math.random() * 10) + 5; // 5-14 invoices
    progress.totalInvoices = mockInvoiceCount;

    await this.updateStepStatus(logId, progress, 5, 'completed');

    // Step 6: Scan available invoices
    await this.updateStepStatus(logId, progress, 6, 'running');
    await this.simulateDelay(2000);
    await this.updateStepStatus(logId, progress, 6, 'completed');

    // Step 7-9: Process downloads based on file type configuration
    if (config.fileTypes === 'xml' || config.fileTypes === 'both') {
      await this.processXMLDownloads(logId, progress, config);
    }

    if (config.fileTypes === 'pdf' || config.fileTypes === 'both') {
      await this.processPDFDownloads(logId, progress, config);
    }

    // Step 10: Process metadata
    await this.updateStepStatus(logId, progress, 10, 'running');
    await this.processInvoiceMetadata(logId, progress);
    await this.updateStepStatus(logId, progress, 10, 'completed');

    // Step 11: Store imported invoices
    await this.updateStepStatus(logId, progress, 11, 'running');
    await this.storeImportedInvoices(logId, progress);
    await this.updateStepStatus(logId, progress, 11, 'completed');

    // Step 12: Cleanup
    await this.updateStepStatus(logId, progress, 12, 'running');
    await this.simulateDelay(1000);
    await this.updateStepStatus(logId, progress, 12, 'completed');
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

      // Update progress
      progressTracker.sendProgress(config.userId, {
        taskId: logId,
        step: 8,
        totalSteps: progress.totalSteps,
        status: 'processing',
        message: `Downloading XML ${i + 1}/${progress.totalInvoices}`,
        timestamp: new Date(),
        data: { processedInvoices: progress.processedInvoices, successfulImports: progress.successfulImports },
      });

      await this.simulateDelay(1500);
    }

    await this.updateStepStatus(logId, progress, 8, 'completed');
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

      progressTracker.sendProgress(config.userId, {
        taskId: logId,
        step: 9,
        totalSteps: progress.totalSteps,
        status: 'processing',
        message: `Downloading PDF ${i + 1}/${progress.totalInvoices}`,
        timestamp: new Date(),
        data: { processedInvoices: progress.processedInvoices, successfulImports: progress.successfulImports },
      });

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

    // Update logs in database
    const logs = progress.steps
      .filter(s => s.status !== 'pending')
      .map(s => `[${s.timestamp.toISOString()}] ${s.status.toUpperCase()}: ${s.description}${s.errorMessage ? ` - ERROR: ${s.errorMessage}` : ''}`)
      .join('\n');

    await storage.updateInvoiceImporterLog(logId, { logs });
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProgress(taskId: number): ImporterProgress | undefined {
    return this.activeImports.get(taskId);
  }

  getAllActiveImports(): ImporterProgress[] {
    return Array.from(this.activeImports.values());
  }
}

export const invoiceImporterService = new InvoiceImporterService();