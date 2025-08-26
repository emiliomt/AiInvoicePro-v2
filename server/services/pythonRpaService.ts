import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import * as storage from './storage'; // Assuming storage module exists for config
import { pythonInvoiceImporter } from './pythonInvoiceImporter'; // Assuming this module exists

// TypeScript wrapper for the Python RPA service
export class PythonRPAService {
  private pythonScriptPath: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Correctly resolve the path to the Python script
    this.pythonScriptPath = path.join(__dirname, '..', 'rpa', 'pythonRpaService.py'); // Adjusted path assuming pythonRpaService.py is in an 'rpa' directory
  }

  // Check if Python environment is set up and dependencies are installed
  private async checkPythonEnvironment(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const checkProcess = spawn('python3', ['-c', 'import sys; import requests; import pandas; print("Python environment OK")']);
      let errorOutput = '';

      checkProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      checkProcess.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          console.error('Python environment check failed:', errorOutput);
          resolve(false);
        }
      });
    });
  }

  // Execute Python RPA automation
  async executeRPA(config: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [this.pythonScriptPath, JSON.stringify(config)]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (error) {
            // If parsing fails, assume raw output is the result
            resolve({ success: true, output: output.trim() });
          }
        } else {
          // Provide more context in rejection
          reject(new Error(`Python RPA process failed with code ${code}. Stderr: ${errorOutput}. Stdout: ${output}`));
        }
      });
    });
  }

  // Process XML invoices using Python automation
  async processXMLInvoices(config: any): Promise<any> {
    try {
      const result = await this.executeRPA({
        action: 'process_xml_invoices',
        ...config
      });
      return result;
    } catch (error) {
      console.error('Error processing XML invoices:', error);
      throw error;
    }
  }

  // Download invoices using Python automation
  async downloadInvoices(config: any): Promise<any> {
    try {
      const result = await this.executeRPA({
        action: 'download_invoices',
        ...config
      });
      return result;
    } catch (error) {
      console.error('Error downloading invoices:', error);
      throw error;
    }
  }

  // Get automation status
  async getStatus(): Promise<any> {
    try {
      const result = await this.executeRPA({
        action: 'get_status'
      });
      return result;
    } catch (error) {
      console.error('Error getting RPA status:', error);
      // Provide a more informative fallback status
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error occurred while fetching RPA status' };
    }
  }
}

// Export instance
export const pythonRPAService = new PythonRPAService();