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
      let outputBuffer = '';
      let errorBuffer = '';
      let result: any = null;

      console.log('🔍 [PYTHON_RPA] Process execution details:', {
        command: 'python3',
        script: scriptPath,
        cwd: process.cwd(),
        env: {
          PYTHONPATH: process.cwd(),
          PYTHONUNBUFFERED: '1',
          PATH: process.env.PATH
        }
      });

      const pythonProcess = spawn('python3', [scriptPath, ...args], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONPATH: process.cwd(),
          PYTHONUNBUFFERED: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Add immediate process monitoring
      pythonProcess.on('spawn', () => {
        console.log('🐍 [PYTHON_RPA] Python process spawned successfully');
      });

      pythonProcess.on('error', (error) => {
        console.error('🐍 [PYTHON_RPA] Process spawn error:', error);
        reject(new Error(`Python process failed to start: ${error.message}`));
      });

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`🐍 [PYTHON_RPA] Raw stdout: ${JSON.stringify(output)}`);
        console.log(`🐍 [PYTHON_RPA] Formatted output: ${output}`);

        outputBuffer += output;

        // Parse progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          console.log(`🔍 [PYTHON_RPA] Processing line: ${trimmedLine}`);

          if (trimmedLine.startsWith('PROGRESS_UPDATE:')) {
            try {
              const progressData = JSON.parse(trimmedLine.substring(16));
              console.log('📊 [PYTHON_RPA] Progress update:', progressData);
              // Handle progress update
            } catch (error) {
              console.error('❌ [PYTHON_RPA] Failed to parse progress update:', error, 'Line:', trimmedLine);
            }
          } else if (trimmedLine.startsWith('LOG_UPDATE:')) {
            try {
              const logData = JSON.parse(trimmedLine.substring(11));
              console.log('📝 [PYTHON_RPA] Log update:', logData);
              // Handle log update
            } catch (error) {
              console.error('❌ [PYTHON_RPA] Failed to parse log update:', error, 'Line:', trimmedLine);
            }
          } else if (trimmedLine.startsWith('WORKFLOW_RESULT:')) {
            try {
              const resultData = JSON.parse(trimmedLine.substring(16));
              console.log('✅ [PYTHON_RPA] Workflow result:', resultData);
              result = resultData;
            } catch (error) {
              console.error('❌ [PYTHON_RPA] Failed to parse workflow result:', error, 'Line:', trimmedLine);
            }
          } else if (trimmedLine.startsWith('🚀') || trimmedLine.startsWith('📍') || trimmedLine.startsWith('📥') || trimmedLine.startsWith('❌')) {
            console.log(`📋 [PYTHON_RPA] Script log: ${trimmedLine}`);
          }
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`🐍 [PYTHON_RPA] Stderr: ${error}`);
        console.error(`🐍 [PYTHON_RPA] Raw stderr: ${JSON.stringify(error)}`);
        errorBuffer += error;

        // Check for common Python errors
        if (error.includes('ModuleNotFoundError')) {
          console.error('❌ [PYTHON_RPA] Missing Python module - check dependencies');
        } else if (error.includes('Permission denied')) {
          console.error('❌ [PYTHON_RPA] Permission error - check file permissions');
        } else if (error.includes('SyntaxError')) {
          console.error('❌ [PYTHON_RPA] Python syntax error - check script syntax');
        }
      });

      pythonProcess.on('close', (code, signal) => {
        console.log(`🐍 [PYTHON_RPA] Process exited with code: ${code}, signal: ${signal}`);
        console.log(`🐍 [PYTHON_RPA] Output buffer length: ${outputBuffer.length}`);
        console.log(`🐍 [PYTHON_RPA] Error buffer length: ${errorBuffer.length}`);

        if (outputBuffer) {
          console.log(`🐍 [PYTHON_RPA] Full output: ${outputBuffer}`);
        }
        if (errorBuffer) {
          console.log(`🐍 [PYTHON_RPA] Full error: ${errorBuffer}`);
        }

        if (code === 0) {
          const finalResult = result || {
            success: true,
            message: 'Python RPA processing completed (no structured result)',
            data: { output: outputBuffer },
            processing_complete: true
          };

          resolve({
            success: true,
            message: finalResult.message || 'Python RPA processing completed successfully',
            data: finalResult,
            output: outputBuffer
          });
        } else {
          const errorMsg = errorBuffer || `Process exited with code ${code}`;
          console.error(`❌ [PYTHON_RPA] Process failed: ${errorMsg}`);
          reject(new Error(`Python process failed with code ${code}. Error: ${errorMsg}`));
        }
      });

      // Set timeout with better logging
      const timeoutId = setTimeout(() => {
        if (!pythonProcess.killed) {
          console.log('⏰ [PYTHON_RPA] Process timeout after 2 minutes, killing...');
          console.log(`⏰ [PYTHON_RPA] Output so far: ${outputBuffer}`);
          console.log(`⏰ [PYTHON_RPA] Error so far: ${errorBuffer}`);
          pythonProcess.kill('SIGTERM');

          setTimeout(() => {
            if (!pythonProcess.killed) {
              console.log('⏰ [PYTHON_RPA] Force killing process...');
              pythonProcess.kill('SIGKILL');
            }
          }, 5000);

          reject(new Error('Python process timeout after 2 minutes'));
        }
      }, 120000); // 2 minute timeout

      // Clear timeout if process completes
      pythonProcess.on('close', () => {
        clearTimeout(timeoutId);
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