/**
 * Python RPA Invoice Importer Service
 * Node.js wrapper for Python-based invoice importing automation
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../storage';
import { progressTracker } from './progressTracker.js';
import type { InvoiceImporterConfig } from '../../shared/schema';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ImportProgress {
  configId: number;
  logId: number;
  totalInvoices: number;
  processedInvoices: number;
  successfulImports: number;
  failedImports: number;
  currentStep: string;
  progress: number;
  isComplete: boolean;
  error?: string;
  logs?: string;
}

interface PythonRPAResult {
  success: boolean;
  error?: string;
  stats: {
    total_invoices: number;
    processed_invoices: number;
    successful_imports: number;
    failed_imports: number;
    current_step: string;
    progress: number;
  };
}

class PythonInvoiceImporter {
  private activeImports = new Map<number, ImportProgress>();

  /**
   * Execute Python RPA import task
   */
  async executeImportTask(configId: number): Promise<void> {
    console.log(`Starting Python RPA import task for config ${configId}`);

    try {
      // Get configuration
      const config = await storage.getInvoiceImporterConfig(configId);
      if (!config) {
        throw new Error(`Configuration ${configId} not found`);
      }

      // Create execution log
      const log = await storage.createInvoiceImporterLog({
        configId,
        status: 'running',
        startedAt: new Date(),
        totalInvoices: 0,
        processedInvoices: 0,
        successfulImports: 0,
        failedImports: 0,
      });

      // Initialize progress tracking
      const progress: ImportProgress = {
        configId,
        logId: log.id,
        totalInvoices: 0,
        processedInvoices: 0,
        successfulImports: 0,
        failedImports: 0,
        currentStep: 'Initializing Python RPA service',
        progress: 0,
        isComplete: false,
      };

      this.activeImports.set(configId, progress);

      // Start progress tracking via WebSocket
      progressTracker.sendProgress(config.userId, {
        taskId: log.id,
        step: 1,
        totalSteps: 100,
        status: 'processing',
        message: `Starting import: ${config.taskName}`,
        timestamp: new Date(),
        data: { configId, logId: log.id }
      });

      // Prepare Python RPA configuration
      const pythonConfig = {
        erpUrl: config.erpUrl,
        erpUsername: config.erpUsername,
        erpPassword: config.erpPassword,
        downloadPath: config.downloadPath || '/tmp/invoice_downloads',
        xmlPath: config.xmlPath || '/tmp/xml_invoices',
        headless: config.headless !== undefined ? config.headless : true, // Default to true for Replit
      };

      // Validate required fields
      if (!pythonConfig.erpUrl || !pythonConfig.erpUsername || !pythonConfig.erpPassword) {
        throw new Error('Missing required Python RPA configuration: ERP URL, username, or password');
      }

      console.log('Python RPA config prepared:', {
        erpUrl: pythonConfig.erpUrl,
        erpUsername: pythonConfig.erpUsername,
        downloadPath: pythonConfig.downloadPath,
        xmlPath: pythonConfig.xmlPath,
      });

      // Execute Python RPA process
      const result = await this.executePythonRPA(pythonConfig, progress);

      // Update final status and save imported invoices to main database
      if (result.success) {
        await storage.updateInvoiceImporterLog(log.id, {
          status: 'completed',
          completedAt: new Date(),
          totalInvoices: result.stats.total_invoices,
          processedInvoices: result.stats.processed_invoices,
          successfulImports: result.stats.successful_imports,
          failedImports: result.stats.failed_imports,
          executionTime: Date.now() - log.startedAt!.getTime(),
        });

        // Save imported invoices from Python RPA to main database
        try {
          await this.saveImportedInvoicesToDatabase(log.id, pythonConfig);
          console.log(`Imported invoices saved to main database for log ${log.id}`);
        } catch (dbError) {
          console.error(`Failed to save imported invoices to database:`, dbError);
        }

        progress.isComplete = true;
        progress.progress = 100;
        progress.currentStep = 'Import completed successfully';

        // Complete progress tracking
        progressTracker.sendTaskComplete(config.userId, log.id, true, 
          'Import completed successfully', {
            totalInvoices: progress.totalInvoices,
            successfulImports: progress.successfulImports,
            failedImports: progress.failedImports
          });

        console.log(`Python RPA import task ${configId} completed successfully`);
      } else {
        await storage.updateInvoiceImporterLog(log.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: result.error || 'Unknown error occurred',
          totalInvoices: result.stats.total_invoices,
          processedInvoices: result.stats.processed_invoices,
          successfulImports: result.stats.successful_imports,
          failedImports: result.stats.failed_imports,
          executionTime: Date.now() - log.startedAt!.getTime(),
        });

        progress.isComplete = true;
        progress.error = result.error;
        progress.currentStep = 'Import failed';

        // Complete progress tracking with error
        progressTracker.sendTaskComplete(config.userId, log.id, false, 
          result.error || 'Import failed', {
            totalInvoices: progress.totalInvoices,
            successfulImports: progress.successfulImports,
            failedImports: progress.failedImports,
            error: result.error
          });

        console.error(`Python RPA import task ${configId} failed:`, result.error);
      }

    } catch (error) {
      console.error(`Python RPA import task ${configId} error:`, error);

      // Update progress with error
      const progress = this.activeImports.get(configId);
      if (progress) {
        progress.isComplete = true;
        progress.error = error instanceof Error ? error.message : 'Unknown error';
        progress.currentStep = 'Import failed';

        // Complete progress tracking with error
        const config = await storage.getInvoiceImporterConfig(progress.configId);
        if (config) {
          progressTracker.sendTaskComplete(config.userId, progress.logId, false, 
            progress.error, {
              configId: progress.configId,
              error: progress.error
            });
        }

        // Update log with error
        try {
          await storage.updateInvoiceImporterLog(progress.logId, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: progress.error,
          });
        } catch (logError) {
          console.error('Failed to update log with error:', logError);
        }
      }
    } finally {
      // Clean up progress tracking after delay
      setTimeout(() => {
        this.activeImports.delete(configId);
      }, 30000); // Keep progress for 30 seconds after completion
    }
  }

  /**
   * Save imported invoices from Python RPA SQLite databases to main PostgreSQL database
   */
  private async saveImportedInvoicesToDatabase(logId: number, pythonConfig: any): Promise<void> {
    const fs = await import('fs/promises');
    const sqlite3 = await import('sqlite3');

    try {
      // Connect to Python RPA SQLite databases (matching Python service paths)
      const downloadDbPath = '/tmp/invoice_downloads/invoices.db';
      const xmlDbPath = '/tmp/xml_invoices/invoices_xml.db';

      // Process downloaded files (PDFs/ZIPs)
      if (await this.fileExists(downloadDbPath)) {
        await this.processDownloadedFiles(logId);
      }

      // Process XML files
      if (await this.fileExists(xmlDbPath)) {
        await this.processXmlFiles(logId);
      }

    } catch (error) {
      console.error('Error saving imported invoices to database:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filepath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Process downloaded files from SQLite and save to PostgreSQL
   */
  private async processDownloadedFiles(logId: number): Promise<void> {
    const fs = await import('fs');
    const sqlite3 = await import('sqlite3');
    const dbPath = '/tmp/invoice_downloads/invoices.db';

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err: any) => {
        if (err) {
          console.error('Failed to connect to SQLite database:', err);
          reject(err);
          return;
        }

        db.all('SELECT * FROM downloaded_invoices', async (err: any, rows: any[]) => {
          if (err) {
            console.error('Failed to execute query:', err);
            reject(err);
            db.close();
            return;
          }

          try {
            await this.storeImportedInvoicesFast(logId, {
              configId: 0,
              logId: 0,
              totalInvoices: 0,
              processedInvoices: 0,
              successfulImports: 0,
              failedImports: 0,
              currentStep: '',
              progress: 0,
              isComplete: false,
            });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            db.close();
          }
        });
      });
    });
  }

  /**
   * Process XML files from SQLite and save to PostgreSQL
   */
  private async processXmlFiles(logId: number): Promise<void> {
    const fs = await import('fs');
    const sqlite3 = await import('sqlite3');
    const dbPath = '/tmp/xml_invoices/invoices_xml.db';

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err: any) => {
        if (err) {
          console.error('Failed to connect to SQLite database:', err);
          reject(err);
          return;
        }

        db.all('SELECT * FROM downloaded_invoices', async (err: any, rows: any[]) => {
          if (err) {
            console.error('Failed to execute query:', err);
            reject(err);
            db.close();
            return;
          }

          try {
            await this.storeImportedInvoicesFast(logId, {
              configId: 0,
              logId: 0,
              totalInvoices: 0,
              processedInvoices: 0,
              successfulImports: 0,
              failedImports: 0,
              currentStep: '',
              progress: 0,
              isComplete: false,
            });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            db.close();
          }
        });
      });
    });
  }

  /**
   * Execute Python RPA script
   */
  private async executePythonRPA(config: any, progress: ImportProgress): Promise<PythonRPAResult> {
    return new Promise((resolve, reject) => {
      const pythonScriptPath = path.join(__dirname, 'pythonRpaService.py');
      const configJson = JSON.stringify(config);

      console.log('Executing Python RPA script:', pythonScriptPath);
      console.log('Python config:', configJson);

      // Spawn Python process
      const pythonProcess = spawn('python3', [pythonScriptPath, configJson], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      let result: PythonRPAResult | null = null;

      // Handle stdout (normal output)
      pythonProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('Python RPA:', output.trim());

        // Update progress with live logs
        if (progress) {
          // Process each line individually for real-time streaming
          const lines = output.split('\n').filter(line => line.trim());

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Extract progress percentage and stats from PROGRESS tags (higher priority)
            const statsUpdate = this.extractStatsFromOutput(trimmedLine);
            if (statsUpdate) {
              progress.totalInvoices = statsUpdate.total_invoices || progress.totalInvoices;
              progress.processedInvoices = statsUpdate.processed_invoices || progress.processedInvoices;
              progress.successfulImports = statsUpdate.successful_imports || progress.successfulImports;
              progress.failedImports = statsUpdate.failed_imports || progress.failedImports;
              progress.progress = statsUpdate.progress || progress.progress;
              
              // Update current step from PROGRESS data if available
              if ((statsUpdate as any).current_step) {
                progress.currentStep = (statsUpdate as any).current_step;
              }
            } else {
              // Fallback: Update current step from log content if no PROGRESS tag
              if (trimmedLine.includes('INFO:')) {
                const stepMatch = trimmedLine.match(/INFO:\s*(.+)/);
                if (stepMatch) {
                  progress.currentStep = stepMatch[1];
                }
              }
            }

            // Send real-time log line via WebSocket immediately
            this.sendRealTimeLogLine(progress, trimmedLine);
          }

          // Append to accumulated logs for database storage
          if (!progress.logs) progress.logs = '';
          progress.logs += '\n' + output.trim();

          // Update progress in memory for real-time display
          this.activeImports.set(progress.configId, progress);

          // Update database periodically with accumulated logs
          if (output.includes('INFO:') && Math.random() < 0.2) { // 20% chance to update DB
            storage.updateInvoiceImporterLog(progress.logId, {
              logs: progress.logs,
              currentStep: progress.currentStep,
              processedInvoices: progress.processedInvoices,
              totalInvoices: progress.totalInvoices,
              successfulImports: progress.successfulImports,
              failedImports: progress.failedImports,
            }).catch(console.error);
          }
        }

        // Store logs for database
        if (output.includes('RESULT:')) {
          try {
            const resultLine = output.split('RESULT:')[1];
            if (resultLine) {
              result = JSON.parse(resultLine.trim());
            }
          } catch (parseError) {
            console.error('Failed to parse Python result:', parseError);
          }
        }
      });

      // Handle stderr (errors)
      pythonProcess.stderr.on('data', (data) => {
        const error = data.toString();
        stderr += error;
        console.error('Python RPA stderr:', error);

        // Check for specific error types
        if (error.includes('selenium')) {
          progress.currentStep = 'Error: Selenium not installed - run: pip3 install selenium';
        } else if (error.includes('chrome') || error.includes('chromium')) {
          progress.currentStep = 'Error: Chrome/Chromium not found - install browser';
        } else if (error.includes('Permission denied')) {
          progress.currentStep = 'Error: Permission denied - check file permissions';
        } else if (error.includes('Connection refused')) {
          progress.currentStep = 'Error: Cannot connect to ERP system';
        } else {
          progress.currentStep = `Error: ${error.substring(0, 100)}...`;
        }

        progress.error = error;
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
        console.log(`Python RPA process exited with code ${code}`);

        if (code === 0 && result) {
          // Update progress with final stats
          progress.totalInvoices = result.stats.total_invoices;
          progress.processedInvoices = result.stats.processed_invoices;
          progress.successfulImports = result.stats.successful_imports;
          progress.failedImports = result.stats.failed_imports;

          resolve(result);
        } else {
          const error = stderr || 'Python process failed with no output';
          resolve({
            success: false,
            error,
            stats: {
              total_invoices: 0,
              processed_invoices: 0,
              successful_imports: 0,
              failed_imports: 0,
              current_step: 'Failed',
              progress: 0,
            },
          });
        }
      });

      // Handle process error
      pythonProcess.on('error', (error) => {
        console.error('Python RPA process error:', error);
        resolve({
          success: false,
          error: `Process error: ${error.message}`,
          stats: {
            total_invoices: 0,
            processed_invoices: 0,
            successful_imports: 0,
            failed_imports: 0,
            current_step: 'Failed',
            progress: 0,
          },
        });
      });

      // Set timeout for long-running processes
      setTimeout(() => {
        if (!pythonProcess.killed) {
          pythonProcess.kill('SIGTERM');
          resolve({
            success: false,
            error: 'Process timeout after 30 minutes',
            stats: {
              total_invoices: 0,
              processed_invoices: 0,
              successful_imports: 0,
              failed_imports: 0,
              current_step: 'Timeout',
              progress: 0,
            },
          });
        }
      }, 30 * 60 * 1000); // 30 minutes timeout
    });
  }

  /**
   * Get progress for a specific configuration
   */
  getProgress(configId: number): ImportProgress | undefined {
    return this.activeImports.get(configId);
  }

  /**
   * Send real-time individual log line via WebSocket
   */
  private sendRealTimeLogLine(progress: ImportProgress, logLine: string): void {
    try {
      storage.getInvoiceImporterConfig(progress.configId).then(config => {
        if (config) {
          console.log(`Attempting to send progress to user: ${config.userId}`);
          // Send individual log line for real-time streaming
          progressTracker.sendProgress(config.userId, {
            taskId: progress.logId,
            step: progress.progress,
            totalSteps: 100,
            status: 'processing',
            message: progress.currentStep,
            timestamp: new Date(),
            data: {
              configId: progress.configId,
              logId: progress.logId,
              currentStep: progress.currentStep,
              progress: progress.progress,
              totalInvoices: progress.totalInvoices,
              processedInvoices: progress.processedInvoices,
              successfulImports: progress.successfulImports,
              failedImports: progress.failedImports,
              isComplete: progress.isComplete,
              logs: progress.logs, // Send accumulated logs for full history
              currentLogLine: logLine // Send current line for immediate display
            }
          });
        }
      }).catch(error => {
        console.error('Failed to get config for real-time log update:', error);
      });
    } catch (error) {
      console.error('Failed to send real-time log update:', error);
    }
  }

  /**
   * Extract stats from Python output (parsing STATS:{...} and PROGRESS:{...} tags)
   */
  private extractStatsFromOutput(output: string): Partial<{
    total_invoices: number;
    processed_invoices: number;
    successful_imports: number;
    failed_imports: number;
    progress: number;
    current_step: string;
  }> | null {
    try {
      // Look for STATS: or PROGRESS: tags in output
      if (output.includes('STATS:')) {
        const statsLine = output.split('STATS:')[1]?.split('\n')[0];
        if (statsLine) {
          return JSON.parse(statsLine.trim());
        }
      }

      if (output.includes('PROGRESS:')) {
        const progressLine = output.split('PROGRESS:')[1]?.split('\n')[0];
        if (progressLine) {
          const progressData = JSON.parse(progressLine.trim());
          return {
            progress: progressData.progress || 0,
            processed_invoices: progressData.processed_invoices || 0,
            total_invoices: progressData.total_invoices || 0,
            successful_imports: progressData.successful_imports || 0,
            failed_imports: progressData.failed_imports || 0,
            current_step: progressData.current_step || null
          };
        }
      }

      // Look for step indicators in output
      const stepMatch = output.match(/Processing\s+(\d+)\s*\/\s*(\d+)/i);
      if (stepMatch) {
        const processed = parseInt(stepMatch[1]);
        const total = parseInt(stepMatch[2]);
        return {
          processed_invoices: processed,
          total_invoices: total,
          progress: total > 0 ? Math.round((processed / total) * 100) : 0
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract current step from Python log output
   */
  private extractCurrentStep(output: string): string | null {
    // Extract meaningful steps from Python logs
    if (output.includes('Setting up Chrome WebDriver')) return 'Setting up browser';
    if (output.includes('Navigating to ERP URL')) return 'Connecting to ERP system';
    if (output.includes('Entering username')) return 'Logging into ERP';
    if (output.includes('Login successful')) return 'Login completed';
    if (output.includes('Navigating to invoice section')) return 'Accessing invoices section';
    if (output.includes('Found') && output.includes('rows')) return 'Loading invoice list';
    if (output.includes('Processing:')) return 'Processing invoices';
    if (output.includes('Downloaded:')) return 'Downloading invoice files';
    if (output.includes('Successfully processed invoice')) return 'Processing invoice data';
    if (output.includes('Moving to next page')) return 'Loading next page';
    if (output.includes('Extracting XML files')) return 'Extracting XML files';
    if (output.includes('Importing XML to database')) return 'Importing to database';
    if (output.includes('Import process completed')) return 'Import completed';

    return null;
  }

  /**
   * Get all active imports
   */
  getActiveImports(): ImportProgress[] {
    return Array.from(this.activeImports.values());
  }

  /**
   * Cancel a running import
   */
  async cancelImport(configId: number): Promise<boolean> {
    const progress = this.activeImports.get(configId);
    if (!progress) {
      return false;
    }

    // Mark as cancelled
    progress.isComplete = true;
    progress.error = 'Import cancelled by user';
    progress.currentStep = 'Cancelled';

    // Update log
    try {
      await storage.updateInvoiceImporterLog(progress.logId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Import cancelled by user',
      });
    } catch (error) {
      console.error('Failed to update log for cancelled import:', error);
    }

    // Remove from active imports
    this.activeImports.delete(configId);
    return true;
  }

  /**
   * Simulate delay
   */
  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store imported invoices and run full processing pipeline (OCR + AI extraction)
   */
  private async storeImportedInvoicesFast(logId: number, progress: ImportProgress): Promise<void> {
    // Convert imported invoices to regular invoice records with full processing
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    if (importedInvoices.length === 0) {
      return;
    }

    // Get the user ID from the log
    const log = await storage.getInvoiceImporterLog(logId);
    if (!log) return;

    const config = await storage.getInvoiceImporterConfig(log.configId);
    if (!config) return;

    console.log(`Starting full processing pipeline for ${importedInvoices.length} RPA-imported invoices`);

    const batchSize = 3; // Smaller batches for full processing
    for (let i = 0; i < importedInvoices.length; i += batchSize) {
      const batch = importedInvoices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (importedInvoice) => {
        try {
          // Create main invoice record from imported invoice
          const mainInvoice = await storage.createInvoice({
            userId: config.userId,
            fileName: importedInvoice.originalFileName,
            status: "processing", // Keep as processing until OCR/AI completes
            fileUrl: importedInvoice.filePath,
            metadata: {
              ...importedInvoice.metadata,
              importSource: 'python_rpa',
              importLogId: logId,
              erpDocumentId: importedInvoice.erpDocumentId,
              downloadedAt: importedInvoice.downloadedAt
            }
          });

          console.log(`Created main invoice ${mainInvoice.id} for RPA import: ${importedInvoice.originalFileName}`);

          // Start async processing using the same pipeline as manual uploads
          setImmediate(async () => {
            await this.processRpaInvoiceWithFullPipeline(mainInvoice, importedInvoice);
          });

          // Mark imported invoice as processed immediately (main invoice created)
          await storage.updateImportedInvoice(importedInvoice.id, {
            processedAt: new Date(),
            metadata: {
              ...importedInvoice.metadata,
              mainInvoiceId: mainInvoice.id,
              processedToMainSystem: true
            }
          });

        } catch (error) {
          console.error(`Failed to create main invoice for ${importedInvoice.originalFileName}:`, error);
        }
      }));

      // Delay between batches to prevent overwhelming the system
      await this.simulateDelay(500);
    }
  }

  /**
   * Process RPA invoice through the same pipeline as manual uploads
   */
  private async processRpaInvoiceWithFullPipeline(invoice: any, importedInvoice: any): Promise<void> {
    try {
      const fs = await import('fs');

      // Check if file exists
      if (!fs.existsSync(importedInvoice.filePath)) {
        throw new Error(`Invoice file not found: ${importedInvoice.filePath}`);
      }

      // Read file buffer
      const fileBuffer = fs.readFileSync(importedInvoice.filePath);
      console.log(`Starting OCR processing for RPA invoice ${invoice.id} (${invoice.fileName})`);

      // Run OCR processing (same as manual import)
      const { processInvoiceOCR } = await import('./ocrService');
      const ocrPromise = processInvoiceOCR(fileBuffer, invoice.id);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR processing timeout')), 60000)
      );

      const ocrText = await Promise.race([ocrPromise, timeoutPromise]) as string;
      console.log(`OCR completed for RPA invoice ${invoice.id}, text length: ${ocrText.length}`);

      if (!ocrText || ocrText.trim().length < 10) {
        throw new Error("OCR did not extract sufficient text from the document");
      }

      // Run AI extraction (same as manual import)
      console.log(`Starting AI extraction for RPA invoice ${invoice.id}`);
      const { extractInvoiceData } = await import('./aiService');

      const aiPromise = extractInvoiceData(ocrText);
      const aiTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI extraction timeout')), 30000)
      );

      const extractedData = await Promise.race([aiPromise, aiTimeoutPromise]) as any;
      console.log(`AI extraction completed for RPA invoice ${invoice.id}:`, {
        vendor: extractedData.vendorName,
        amount: extractedData.totalAmount,
        invoiceNumber: extractedData.invoiceNumber
      });

      // Validate and clean extracted data (same as manual import)
      const cleanedData = {
        vendorName: extractedData.vendorName || null,
        invoiceNumber: extractedData.invoiceNumber || null,
        invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
        dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
        totalAmount: extractedData.totalAmount || null,
        taxAmount: extractedData.taxAmount || null,
        currency: extractedData.currency || 'USD',
      };

      // Update invoice with extracted data (same as manual import)
      await storage.updateInvoice(invoice.id, {
        status: "extracted", // Now properly extracted with data
        ocrText,
        extractedData,
        ...cleanedData
      });

      console.log(`RPA invoice ${invoice.id} processing completed successfully - now matches manual import format`);

    } catch (error) {
      console.error(`Error processing RPA invoice ${invoice.id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update invoice with error status (same as manual import)
      await storage.updateInvoice(invoice.id, {
        status: "rejected",
        extractedData: { 
          error: errorMessage,
          errorType: "RpaProcessingError",
          timestamp: new Date().toISOString(),
          step: "rpa_processing"
        },
      });
    }
  }

  /**
   * Parse and update progress based on log line from Python script
   *
   * @param {ImportProgress} progress - The progress object to update
   * @param {string} line - The log line from the Python script
   * @param {InvoiceImporterConfig} config - The invoice importer config
   * @returns {void}
   */
  private parseAndUpdateProgress(progress: ImportProgress, line: string, config: InvoiceImporterConfig): void {
    // Look for progress indicators in the output
    if (line.includes('INFO:')) {
      const stepMatch = line.match(/INFO:\s*(.+)/);
      if (stepMatch) {
        progress.currentStep = stepMatch[1];
      }
    }

    // Extract progress percentage and stats from output
    const statsUpdate = this.extractStatsFromOutput(line);
    if (statsUpdate) {
      progress.totalInvoices = statsUpdate.total_invoices || progress.totalInvoices;
      progress.processedInvoices = statsUpdate.processed_invoices || progress.processedInvoices;
      progress.successfulImports = statsUpdate.successful_imports || progress.successfulImports;
      progress.failedImports = statsUpdate.failed_imports || progress.failedImports;
      progress.progress = statsUpdate.progress || progress.progress;

      // Send real-time progress update via WebSocket
      progressTracker.sendProgress(config.userId, {
        taskId: progress.logId,
        step: progress.progress,
        totalSteps: 100,
        status: 'processing',
        message: progress.currentStep,
        timestamp: new Date(),
        data: {
          configId: progress.configId,
          logId: progress.logId,
          currentStep: progress.currentStep,
          progress: progress.progress,
          totalInvoices: progress.totalInvoices,
          processedInvoices: progress.processedInvoices,
          successfulImports: progress.successfulImports,
          failedImports: progress.failedImports,
          isComplete: progress.isComplete,
          logs: progress.logs // Send accumulated logs for full history
        }
      });
    }
  }
}

// Export singleton instance
export const pythonInvoiceImporter = new PythonInvoiceImporter();