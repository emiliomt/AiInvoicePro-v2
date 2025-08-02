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
      
      // Add timeout to Python script execution
      const result = await Promise.race([
        this.executePythonScript('process_automation.py', []),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Python script execution timeout after 20 seconds')), 20000)
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
    } catch (error) {
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