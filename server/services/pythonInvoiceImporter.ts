/**
 * Python RPA Invoice Importer Service
 * Node.js wrapper for Python-based invoice importing automation
 */

import { spawn } from 'child_process';
import path from 'path';
import { storage } from '../storage';
import type { InvoiceImporterConfig } from '../../shared/schema';

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

      // Update final status
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

      // Handle stdout (logs and result)
      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Check for result output
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('RESULT:')) {
            try {
              const resultJson = line.substring(7).trim();
              result = JSON.parse(resultJson);
            } catch (e) {
              console.error('Failed to parse Python result:', e);
            }
          } else if (line.includes('Progress:')) {
            // Parse progress updates
            const progressMatch = line.match(/Progress: (\d+)% - (.+)/);
            if (progressMatch) {
              progress.progress = parseInt(progressMatch[1]);
              progress.currentStep = progressMatch[2];
              console.log(`Progress update: ${progress.progress}% - ${progress.currentStep}`);
            }
          } else if (line.trim()) {
            console.log('Python RPA:', line.trim());
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
  getProgress(configId: number): ImportProgress | null {
    return this.activeImports.get(configId) || null;
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
}

// Export singleton instance
export const pythonInvoiceImporter = new PythonInvoiceImporter();