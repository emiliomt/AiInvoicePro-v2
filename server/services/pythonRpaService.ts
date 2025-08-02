static async processInvoicesAutomatically(): Promise<any> {
    try {
      logger.info('🔄 Calling Python RPA service for automatic processing...');

      // Check if Python is available
      try {
        const pythonCheck = await this.executePythonCommand('python3 --version');
        logger.info('Python version check:', pythonCheck);
      } catch (pythonError) {
        logger.error('Python not available:', pythonError);
        throw new Error('Python environment not available for RPA processing');
      }

      const result = await this.executePythonScript('process_automation.py', []);

      logger.info('✅ Python RPA processing completed');
      logger.info('RPA result:', result);

      // Ensure we return a structured response
      return {
        success: true,
        processedInvoices: result?.processedInvoices || 0,
        message: 'Automatic processing completed',
        details: result
      };
    } catch (error) {
      logger.error('❌ Python RPA processing failed:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // Return a structured error instead of throwing
      return {
        success: false,
        error: true,
        message: error.message || 'Python RPA processing failed',
        processedInvoices: 0
      };
    }
  }