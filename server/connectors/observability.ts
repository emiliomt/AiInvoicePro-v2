/**
 * Observability Utilities for ERP Connectors
 * 
 * Provides logging, monitoring, and health check utilities.
 */

import { ERPConnector, AuthContext, HealthStatus } from "./base";

export interface ConnectorLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  connector: string;
  companyId?: string;
  operation: string;
  message: string;
  metadata?: Record<string, any>;
  duration?: number;
}

class ConnectorLogger {
  private logs: ConnectorLog[] = [];
  private maxLogs = 1000; // Keep last 1000 logs
  
  log(log: Omit<ConnectorLog, "timestamp">): void {
    const fullLog: ConnectorLog = {
      ...log,
      timestamp: new Date().toISOString(),
    };
    
    this.logs.push(fullLog);
    
    // Trim logs if too many
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Also log to console
    const prefix = `[${fullLog.level.toUpperCase()}] [${fullLog.connector}]`;
    const message = `${prefix} ${fullLog.operation}: ${fullLog.message}`;
    
    switch (fullLog.level) {
      case "error":
        console.error(message, fullLog.metadata || "");
        break;
      case "warn":
        console.warn(message, fullLog.metadata || "");
        break;
      case "debug":
        console.debug(message, fullLog.metadata || "");
        break;
      default:
        console.log(message, fullLog.metadata || "");
    }
  }
  
  getRecentLogs(count = 100): ConnectorLog[] {
    return this.logs.slice(-count);
  }
  
  getLogsForConnector(connector: string, count = 100): ConnectorLog[] {
    return this.logs
      .filter(log => log.connector === connector)
      .slice(-count);
  }
  
  getLogsForCompany(companyId: string, count = 100): ConnectorLog[] {
    return this.logs
      .filter(log => log.companyId === companyId)
      .slice(-count);
  }
  
  clearLogs(): void {
    this.logs = [];
  }
}

// Singleton logger instance
export const connectorLogger = new ConnectorLogger();

/**
 * Log helper for connectors
 */
export function logConnectorOperation(
  connector: string,
  operation: string,
  message: string,
  options?: {
    level?: ConnectorLog["level"];
    companyId?: string;
    metadata?: Record<string, any>;
    duration?: number;
  }
): void {
  connectorLogger.log({
    level: options?.level || "info",
    connector,
    companyId: options?.companyId,
    operation,
    message,
    metadata: options?.metadata,
    duration: options?.duration,
  });
}

/**
 * Performance timer for connector operations
 */
export class ConnectorTimer {
  private startTime: number;
  
  constructor(
    private connector: string,
    private operation: string,
    private companyId?: string
  ) {
    this.startTime = Date.now();
    logConnectorOperation(
      connector,
      operation,
      "Operation started",
      { level: "debug", companyId }
    );
  }
  
  getDuration(): number {
    return Date.now() - this.startTime;
  }
  
  complete(message = "Operation completed", metadata?: Record<string, any>): void {
    const duration = this.getDuration();
    logConnectorOperation(
      this.connector,
      this.operation,
      `${message} (${duration}ms)`,
      { level: "info", companyId: this.companyId, metadata, duration }
    );
  }
  
  error(message: string, error?: any): void {
    const duration = this.getDuration();
    logConnectorOperation(
      this.connector,
      this.operation,
      `${message} (${duration}ms)`,
      {
        level: "error",
        companyId: this.companyId,
        metadata: { error: String(error) },
        duration
      }
    );
  }
}

/**
 * Health check aggregator
 */
export class ConnectorHealthAggregator {
  private healthChecks = new Map<string, HealthStatus>();
  
  async checkConnector(
    connector: ERPConnector,
    auth: AuthContext
  ): Promise<HealthStatus> {
    const timer = new ConnectorTimer(
      connector.name,
      "health_check",
      auth.companyId
    );
    
    try {
      const health = await connector.healthCheck(auth);
      this.healthChecks.set(`${connector.name}:${auth.companyId}`, health);
      
      timer.complete(
        `Health check: ${health.status}`,
        { status: health.status, message: health.message }
      );
      
      return health;
    } catch (error) {
      const errorHealth: HealthStatus = {
        status: "error",
        message: `Health check failed: ${error}`,
        lastChecked: new Date().toISOString(),
      };
      
      this.healthChecks.set(`${connector.name}:${auth.companyId}`, errorHealth);
      timer.error("Health check failed", error);
      
      return errorHealth;
    }
  }
  
  getHealth(connector: string, companyId: string): HealthStatus | undefined {
    return this.healthChecks.get(`${connector}:${companyId}`);
  }
  
  getAllHealth(): Map<string, HealthStatus> {
    return new Map(this.healthChecks);
  }
}

// Singleton health aggregator
export const healthAggregator = new ConnectorHealthAggregator();

/**
 * Metrics collector for connector operations
 */
export class ConnectorMetrics {
  private metrics = {
    totalInvoicesFetched: new Map<string, number>(),
    totalOperations: new Map<string, number>(),
    failedOperations: new Map<string, number>(),
    averageDuration: new Map<string, number[]>(),
  };
  
  recordInvoicesFetched(connector: string, count: number): void {
    const current = this.metrics.totalInvoicesFetched.get(connector) || 0;
    this.metrics.totalInvoicesFetched.set(connector, current + count);
  }
  
  recordOperation(
    connector: string,
    success: boolean,
    duration: number
  ): void {
    // Total operations
    const totalOps = this.metrics.totalOperations.get(connector) || 0;
    this.metrics.totalOperations.set(connector, totalOps + 1);
    
    // Failed operations
    if (!success) {
      const failedOps = this.metrics.failedOperations.get(connector) || 0;
      this.metrics.failedOperations.set(connector, failedOps + 1);
    }
    
    // Duration tracking
    const durations = this.metrics.averageDuration.get(connector) || [];
    durations.push(duration);
    
    // Keep only last 100 durations
    if (durations.length > 100) {
      durations.shift();
    }
    
    this.metrics.averageDuration.set(connector, durations);
  }
  
  getMetrics(connector: string): {
    totalInvoices: number;
    totalOperations: number;
    failedOperations: number;
    successRate: number;
    averageDuration: number;
  } {
    const durations = this.metrics.averageDuration.get(connector) || [];
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    
    const totalOps = this.metrics.totalOperations.get(connector) || 0;
    const failedOps = this.metrics.failedOperations.get(connector) || 0;
    const successRate = totalOps > 0 ? ((totalOps - failedOps) / totalOps) * 100 : 0;
    
    return {
      totalInvoices: this.metrics.totalInvoicesFetched.get(connector) || 0,
      totalOperations: totalOps,
      failedOperations: failedOps,
      successRate,
      averageDuration: avgDuration,
    };
  }
  
  getAllMetrics(): Record<string, ReturnType<typeof this.getMetrics>> {
    const allConnectors = new Set([
      ...Array.from(this.metrics.totalInvoicesFetched.keys()),
      ...Array.from(this.metrics.totalOperations.keys()),
    ]);
    
    const result: Record<string, ReturnType<typeof this.getMetrics>> = {};
    
    for (const connector of Array.from(allConnectors)) {
      result[connector] = this.getMetrics(connector);
    }
    
    return result;
  }
}

// Singleton metrics collector
export const connectorMetrics = new ConnectorMetrics();
