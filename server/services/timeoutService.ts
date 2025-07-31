
interface TimeoutOptions {
  timeoutMs?: number;
  operation: string;
  cleanup?: () => void;
}

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class DatabaseTimeoutService {
  private static readonly DEFAULT_TIMEOUT = 8000; // 8 seconds
  private static readonly LONG_OPERATION_TIMEOUT = 15000; // 15 seconds for complex operations
  private static activeOperations = new Map<string, NodeJS.Timeout>();
  
  static async withTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions
  ): Promise<T> {
    const { timeoutMs = this.DEFAULT_TIMEOUT, operation, cleanup } = options;
    const operationId = `${operation}_${Date.now()}_${Math.random()}`;
    
    console.log(`🔄 Starting database operation: ${operation} (timeout: ${timeoutMs}ms)`);
    const startTime = Date.now();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        console.error(`⏰ Database operation timed out: ${operation} after ${timeoutMs}ms`);
        
        // Perform cleanup if provided
        if (cleanup) {
          try {
            cleanup();
          } catch (cleanupError) {
            console.error(`❌ Cleanup failed for ${operation}:`, cleanupError);
          }
        }
        
        // Remove from active operations
        this.activeOperations.delete(operationId);
        
        reject(new TimeoutError(operation, timeoutMs));
      }, timeoutMs);
      
      this.activeOperations.set(operationId, timeoutId);
    });
    
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      
      // Clear timeout on success
      const timeoutId = this.activeOperations.get(operationId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeOperations.delete(operationId);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ Database operation completed: ${operation} in ${duration}ms`);
      
      // Log slow operations for monitoring
      if (duration > 3000) {
        console.warn(`🐌 Slow database operation detected: ${operation} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      // Clear timeout on error
      const timeoutId = this.activeOperations.get(operationId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeOperations.delete(operationId);
      }
      
      const duration = Date.now() - startTime;
      console.error(`❌ Database operation failed: ${operation} after ${duration}ms`, error);
      
      throw error;
    }
  }
  
  static async withLongTimeout<T>(
    promise: Promise<T>,
    operation: string,
    cleanup?: () => void
  ): Promise<T> {
    return this.withTimeout(promise, {
      timeoutMs: this.LONG_OPERATION_TIMEOUT,
      operation,
      cleanup
    });
  }
  
  static getActiveOperations(): string[] {
    return Array.from(this.activeOperations.keys());
  }
  
  static cancelAllOperations(): void {
    console.log(`🧹 Cancelling ${this.activeOperations.size} active database operations`);
    
    for (const [operationId, timeoutId] of this.activeOperations) {
      clearTimeout(timeoutId);
      console.log(`❌ Cancelled operation: ${operationId}`);
    }
    
    this.activeOperations.clear();
  }
  
  static getOperationStats(): { active: number; types: string[] } {
    const operations = Array.from(this.activeOperations.keys());
    return {
      active: operations.length,
      types: operations.map(op => op.split('_')[0])
    };
  }
}

// Utility functions for common timeout patterns
export const timeoutWrapper = {
  getUserSettings: <T>(promise: Promise<T>) => 
    DatabaseTimeoutService.withTimeout(promise, {
      timeoutMs: 5000,
      operation: 'getUserSettings'
    }),
    
  updateUserSettings: <T>(promise: Promise<T>) => 
    DatabaseTimeoutService.withTimeout(promise, {
      timeoutMs: 8000,
      operation: 'updateUserSettings'
    }),
    
  getInvoices: <T>(promise: Promise<T>) => 
    DatabaseTimeoutService.withTimeout(promise, {
      timeoutMs: 10000,
      operation: 'getInvoices'
    }),
    
  complexQuery: <T>(promise: Promise<T>, operation: string) => 
    DatabaseTimeoutService.withLongTimeout(promise, operation),
    
  quickOperation: <T>(promise: Promise<T>, operation: string) => 
    DatabaseTimeoutService.withTimeout(promise, {
      timeoutMs: 3000,
      operation
    })
};
