import pino from 'pino';

export interface RunContextOptions {
  runId: string;
  tenantId: string;
  logger: pino.Logger;
  dryRun: boolean;
  maxWorkers: number;
  environment?: string;
  idempotencyKeys?: Map<string, string>;
  startTime?: Date;
}

export class RunContext {
  public readonly runId: string;
  public readonly tenantId: string;
  public readonly logger: pino.Logger;
  public readonly dryRun: boolean;
  public readonly maxWorkers: number;
  public readonly environment: string;
  public readonly idempotencyKeys: Map<string, string>;
  public readonly startTime: Date;

  // Runtime metrics
  private metrics: Map<string, any> = new Map();
  private counters: Map<string, number> = new Map();
  private timers: Map<string, number> = new Map();

  constructor(options: RunContextOptions) {
    this.runId = options.runId;
    this.tenantId = options.tenantId;
    this.logger = options.logger;
    this.dryRun = options.dryRun;
    this.maxWorkers = options.maxWorkers;
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.idempotencyKeys = options.idempotencyKeys || new Map();
    this.startTime = options.startTime || new Date();
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1): void {
    const currentValue = this.counters.get(name) || 0;
    this.counters.set(name, currentValue + value);
    
    this.logger.debug('Counter incremented', { 
      metric: name, 
      value, 
      total: currentValue + value 
    });
  }

  /**
   * Record a timer metric (duration in milliseconds)
   */
  recordTimer(name: string, durationMs: number): void {
    this.timers.set(name, durationMs);
    
    this.logger.debug('Timer recorded', { 
      metric: name, 
      durationMs 
    });
  }

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordTimer(name, duration);
      return duration;
    };
  }

  /**
   * Set a custom metric value
   */
  setMetric(name: string, value: any): void {
    this.metrics.set(name, value);
    
    this.logger.debug('Metric set', { 
      metric: name, 
      value 
    });
  }

  /**
   * Get a custom metric value
   */
  getMetric(name: string): any {
    return this.metrics.get(name);
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get timer value
   */
  getTimer(name: string): number {
    return this.timers.get(name) || 0;
  }

  /**
   * Get all metrics as a summary object
   */
  getMetricsSummary(): {
    counters: Record<string, number>;
    timers: Record<string, number>;
    metrics: Record<string, any>;
    runInfo: {
      runId: string;
      tenantId: string;
      dryRun: boolean;
      maxWorkers: number;
      environment: string;
      startTime: string;
      runDuration: number;
    };
  } {
    const now = new Date();
    const runDuration = now.getTime() - this.startTime.getTime();

    return {
      counters: Object.fromEntries(this.counters),
      timers: Object.fromEntries(this.timers),
      metrics: Object.fromEntries(this.metrics),
      runInfo: {
        runId: this.runId,
        tenantId: this.tenantId,
        dryRun: this.dryRun,
        maxWorkers: this.maxWorkers,
        environment: this.environment,
        startTime: this.startTime.toISOString(),
        runDuration
      }
    };
  }

  /**
   * Create a child context for a specific task or stage
   */
  createChild(suffix: string, additionalData?: Record<string, any>): RunContext {
    const childLogger = this.logger.child({ 
      childContext: suffix,
      ...additionalData 
    });

    return new RunContext({
      runId: `${this.runId}-${suffix}`,
      tenantId: this.tenantId,
      logger: childLogger,
      dryRun: this.dryRun,
      maxWorkers: this.maxWorkers,
      environment: this.environment,
      idempotencyKeys: new Map(this.idempotencyKeys),
      startTime: this.startTime
    });
  }

  /**
   * Generate an idempotency key for a specific operation
   */
  generateIdempotencyKey(operation: string, ...identifiers: string[]): string {
    const key = `${this.tenantId}:${operation}:${identifiers.join(':')}`;
    this.idempotencyKeys.set(operation, key);
    return key;
  }

  /**
   * Get an existing idempotency key
   */
  getIdempotencyKey(operation: string): string | undefined {
    return this.idempotencyKeys.get(operation);
  }

  /**
   * Log progress update
   */
  logProgress(stage: string, current: number, total: number, message?: string): void {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    this.logger.info('Progress update', {
      stage,
      current,
      total,
      percentage,
      message
    });
  }

  /**
   * Log stage start
   */
  logStageStart(stage: string, metadata?: Record<string, any>): void {
    this.setMetric(`stage_${stage}_start_time`, Date.now());
    
    this.logger.info('Stage started', {
      stage,
      ...metadata
    });
  }

  /**
   * Log stage completion
   */
  logStageComplete(stage: string, success: boolean, metadata?: Record<string, any>): void {
    const startTime = this.getMetric(`stage_${stage}_start_time`);
    const duration = startTime ? Date.now() - startTime : 0;
    
    this.recordTimer(`stage_${stage}_duration`, duration);
    this.incrementCounter(success ? `stage_${stage}_success` : `stage_${stage}_failure`);
    
    this.logger.info('Stage completed', {
      stage,
      success,
      durationMs: duration,
      ...metadata
    });
  }

  /**
   * Check if running in production environment
   */
  isProduction(): boolean {
    return this.environment === 'production';
  }

  /**
   * Check if running in development environment
   */
  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Check if running in test environment
   */
  isTest(): boolean {
    return this.environment === 'test';
  }
}