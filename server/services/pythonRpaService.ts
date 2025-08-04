import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonRPAService {
  
  /**
   * Execute Python command
   */
  private static async executePythonCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { 
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname)
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute Python script with arguments
   */
  private static async executePythonScript(scriptName: string, args: string[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, scriptName);
      const process = spawn('python3', [scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            // Try to parse JSON output
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (parseError) {
            // If not JSON, return the raw output
            resolve({ 
              success: true, 
              output: stdout.trim(),
              processedInvoices: 0
            });
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Process invoices automatically using Python RPA
   */
  static async processInvoicesAutomatically(): Promise<any> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 [PYTHON_RPA] Starting Python RPA service for automatic processing...');

      // Check if Python is available
      try {
        const pythonCheck = await this.executePythonCommand('python3 --version');
        console.log('✅ [PYTHON_RPA] Python version check:', pythonCheck);
      } catch (pythonError) {
        console.error('❌ [PYTHON_RPA] Python not available:', pythonError);
        throw new Error('Python environment not available for RPA processing');
      }

      console.log('🚀 [PYTHON_RPA] Executing process_automation.py...');
      
      // Increase timeout to 4 minutes (240 seconds) to match the API timeout better
      const result = await Promise.race([
        this.executePythonScript('process_automation.py', []),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Python script execution timeout after 240 seconds')), 240000)
        )
      ]);

      const processingTime = Date.now() - startTime;
      console.log(`✅ [PYTHON_RPA] Python RPA processing completed in ${processingTime}ms`);
      console.log('✅ [PYTHON_RPA] RPA result:', JSON.stringify(result, null, 2));

      // Ensure we return a structured response
      return {
        success: true,
        processedInvoices: result?.processedInvoices || 0,
        message: 'Automatic processing completed',
        processingTimeMs: processingTime,
        details: result
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ [PYTHON_RPA] Python RPA processing failed after ${processingTime}ms:`, error);
      console.error('❌ [PYTHON_RPA] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // Return a structured error instead of throwing
      return {
        success: false,
        error: true,
        message: error.message || 'Python RPA processing failed',
        processedInvoices: 0,
        processingTimeMs: processingTime
      };
    }
  }

  /**
   * Test RPA connectivity and Python environment
   */
  static async testRPAEnvironment(): Promise<any> {
    try {
      console.log('🧪 [PYTHON_RPA] Testing RPA environment...');
      
      // Test Python availability
      const pythonVersion = await this.executePythonCommand('python3 --version');
      console.log('✅ [PYTHON_RPA] Python version:', pythonVersion);

      // Test process_automation.py existence
      const scriptPath = path.join(__dirname, 'process_automation.py');
      const fs = await import('fs');
      const scriptExists = fs.existsSync(scriptPath);
      
      return {
        success: true,
        pythonAvailable: true,
        pythonVersion: pythonVersion,
        scriptExists: scriptExists,
        scriptPath: scriptPath,
        environment: 'ready'
      };
    } catch (error: any) {
      console.error('❌ [PYTHON_RPA] Environment test failed:', error);
      return {
        success: false,
        pythonAvailable: false,
        error: error.message,
        environment: 'not_ready'
      };
    }
  }
}

// Export singleton instance
export const pythonRPAService = new PythonRPAService();