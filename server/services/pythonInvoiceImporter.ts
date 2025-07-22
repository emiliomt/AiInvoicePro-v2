/**
 * Python RPA Invoice Importer Service
 * Node.js wrapper for Python-based invoice importing automation
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../storage';
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

      // Handle stdout (Python script output)
      pythonProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('Python RPA:', output.trim());

        // Update progress with live logs
        if (progress) {
          progress.currentStep = this.extractCurrentStep(output) || progress.currentStep;

          // Append new logs to existing logs
          if (!progress.logs) progress.logs = '';
          progress.logs += '\nPython RPA: ' + output.trim();

          // Update progress in memory for real-time display
          this.activeImports.set(progress.configId, progress);

          // Update database periodically with logs
          if (output.includes('INFO:') && Math.random() < 0.3) { // 30% chance to update DB
            storage.updateInvoiceImporterLog(progress.logId, {
              logs: progress.logs,
              currentStep: progress.currentStep,
              processedInvoices: progress.processedInvoices,
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
   * Store imported invoices and trigger AI processing
   */
  private async storeImportedInvoicesFast(logId: number, progress: ImportProgress): Promise<void> {
    // Convert imported invoices to regular invoice records efficiently
    const importedInvoices = await storage.getImportedInvoicesByLog(logId);

    if (importedInvoices.length === 0) {
      return;
    }

    // Get the user ID from the log
    const log = await storage.getInvoiceImporterLog(logId);
    if (!log) return;

    const config = await storage.getInvoiceImporterConfig(log.configId);
    if (!config) return;

    const batchSize = 5;
    for (let i = 0; i < importedInvoices.length; i += batchSize) {
      const batch = importedInvoices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (importedInvoice) => {
        try {
          // Create main invoice record from imported invoice
          const mainInvoice = await storage.createInvoice({
            userId: config.userId,
            fileName: importedInvoice.originalFileName,
            status: "processing",
            fileUrl: importedInvoice.filePath,
            uploadedAt: importedInvoice.downloadedAt,
            metadata: {
              ...importedInvoice.metadata,
              importSource: 'python_rpa',
              importLogId: logId,
              erpDocumentId: importedInvoice.erpDocumentId
            }
          });

          // Trigger AI processing for the main invoice (if file exists)
          const fs = require('fs');
          if (fs.existsSync(importedInvoice.filePath)) {
            // Import the processing function
            const { processInvoiceAsync } = await import('../routes');

            // Read file and process
            const fileBuffer = fs.readFileSync(importedInvoice.filePath);

            // Start AI processing in background
            setImmediate(async () => {
              try {
                await processInvoiceAsync(mainInvoice, fileBuffer);
                console.log(`AI processing completed for imported invoice: ${importedInvoice.originalFileName}`);
              } catch (error) {
                console.error(`AI processing failed for imported invoice ${importedInvoice.originalFileName}:`, error);
                await storage.updateInvoice(mainInvoice.id, { 
                  status: "failed",
                  errorMessage: error instanceof Error ? error.message : 'AI processing failed'
                });
              }
            });
          }

          // Mark imported invoice as processed
          await storage.updateImportedInvoice(importedInvoice.id, {
            processedAt: new Date(),
            metadata: {
              ...importedInvoice.metadata,
              mainInvoiceId: mainInvoice.id,
              processedToMainSystem: true
            }
          });

          console.log(`Converted imported invoice to main system: ${importedInvoice.originalFileName} -> Invoice ID ${mainInvoice.id}`);
        } catch (error) {
          console.error(`Failed to process imported invoice ${importedInvoice.originalFileName}:`, error);
        }
      }));

      // Minimal delay between batches
      await this.simulateDelay(100);
    }
  }
}

// Export singleton instance
export const pythonInvoiceImporter = new PythonInvoiceImporter();