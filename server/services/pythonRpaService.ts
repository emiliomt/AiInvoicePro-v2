import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// TypeScript wrapper for the Python RPA service
export class PythonRPAService {
  private pythonScriptPath: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.pythonScriptPath = path.join(__dirname, 'pythonRpaService.py');
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
            resolve({ success: true, output: output.trim() });
          }
        } else {
          reject(new Error(`Python RPA process failed with code ${code}: ${errorOutput}`));
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
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Export instance
export const pythonRPAService = new PythonRPAService();