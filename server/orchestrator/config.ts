import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { PipelineState } from './stateMachine';

export interface RetryConfig {
  strategy: 'exponential_backoff_jitter';
  maxAttempts: number;
  initialDelaySeconds: number;
  maxDelaySeconds: number;
  retryOn: string[];
}

export interface ConcurrencyConfig {
  documentLevel: string;
  defaultMaxWorkers: number;
  erpSerializationPerTenant: boolean;
}

export interface TimeoutConfig {
  import_invoices: number;
  ocr_process: number;
  ai_extract: number;
  xml_parse: number;
  validate: number;
  erp_post: number;
  reconcile: number;
  notify: number;
}

export interface CircuitBreakerConfig {
  window: number;
  errorThreshold: number;
  cooldownSeconds: number;
}

export interface TenantConfig {
  tenant_id: string;
  erp_system: string;
  use_sandbox: boolean;
  rpa_profile: string;
}

export interface FeatureFlags {
  enable_import: boolean;
  enable_ocr: boolean;
  enable_ai_extract: boolean;
  enable_xml_parse: boolean;
  enable_validate: boolean;
  enable_erp_post: boolean;
  enable_reconcile: boolean;
  enable_notify: boolean;
}

export interface OrchestratorConfiguration {
  stages: string[];
  concurrency: ConcurrencyConfig;
  retries: RetryConfig;
  timeouts: TimeoutConfig;
  idempotency: string;
  circuitBreaker: CircuitBreakerConfig;
  featureFlags: FeatureFlags;
  tenants: TenantConfig[];
}

export class OrchestratorConfig {
  public readonly stages: string[];
  public readonly concurrency: ConcurrencyConfig;
  public readonly retries: RetryConfig;
  public readonly timeouts: TimeoutConfig;
  public readonly idempotency: string;
  public readonly circuitBreaker: CircuitBreakerConfig;
  public readonly featureFlags: FeatureFlags;
  public readonly tenants: { [key: string]: TenantConfig };

  constructor(configPath?: string) {
    // Default configuration
    const defaultConfig: OrchestratorConfiguration = {
      stages: [
        'import_invoices',
        'ocr_process',
        'ai_extract',
        'xml_parse',
        'validate',
        'erp_post',
        'reconcile',
        'notify'
      ],
      concurrency: {
        documentLevel: 'Process invoices in parallel up to a configurable max workers; serialize ERP posting per tenant to avoid state conflicts.',
        defaultMaxWorkers: 4,
        erpSerializationPerTenant: true
      },
      retries: {
        strategy: 'exponential_backoff_jitter',
        maxAttempts: 5,
        initialDelaySeconds: 2,
        maxDelaySeconds: 60,
        retryOn: ['NetworkError', 'RateLimitError', 'TransientError']
      },
      timeouts: {
        import_invoices: 120000, // 2 minutes
        ocr_process: 180000,     // 3 minutes
        ai_extract: 180000,      // 3 minutes
        xml_parse: 120000,       // 2 minutes
        validate: 90000,         // 1.5 minutes
        erp_post: 180000,        // 3 minutes
        reconcile: 120000,       // 2 minutes
        notify: 60000            // 1 minute
      },
      idempotency: 'Use invoice fingerprint (e.g., hash of file + tenantId) and stage name as keys; skip completed stages when resume flag is set.',
      circuitBreaker: {
        window: 20,
        errorThreshold: 0.5,
        cooldownSeconds: 120
      },
      featureFlags: {
        enable_import: true,
        enable_ocr: true,
        enable_ai_extract: true,
        enable_xml_parse: true,
        enable_validate: true,
        enable_erp_post: true,
        enable_reconcile: true,
        enable_notify: true
      },
      tenants: [
        {
          tenant_id: 'default',
          erp_system: 'SINCO',
          use_sandbox: true,
          rpa_profile: 'headless'
        }
      ]
    };

    // Load configuration from file if provided
    let config = defaultConfig;
    if (configPath) {
      config = this.loadConfigFromFile(configPath, defaultConfig);
    } else {
      // Try to load from default locations
      const defaultPaths = ['config.yaml', 'config/orchestrator.yaml', '.orchestrator/config.yaml'];
      for (const defaultPath of defaultPaths) {
        if (fs.existsSync(defaultPath)) {
          config = this.loadConfigFromFile(defaultPath, defaultConfig);
          break;
        }
      }
    }

    // Override with environment variables
    config = this.applyEnvironmentOverrides(config);

    // Assign configuration
    this.stages = config.stages;
    this.concurrency = config.concurrency;
    this.retries = config.retries;
    this.timeouts = config.timeouts;
    this.idempotency = config.idempotency;
    this.circuitBreaker = config.circuitBreaker;
    this.featureFlags = config.featureFlags;
    
    // Convert tenant array to map for easier lookup
    this.tenants = {};
    config.tenants.forEach(tenant => {
      this.tenants[tenant.tenant_id] = tenant;
    });

    this.validate();
  }

  private loadConfigFromFile(configPath: string, defaultConfig: OrchestratorConfiguration): OrchestratorConfiguration {
    try {
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      const fileContent = fs.readFileSync(configPath, 'utf8');
      let fileConfig: Partial<OrchestratorConfiguration>;

      if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        fileConfig = yaml.parse(fileContent);
      } else if (configPath.endsWith('.json')) {
        fileConfig = JSON.parse(fileContent);
      } else {
        throw new Error(`Unsupported configuration file format: ${configPath}`);
      }

      // Deep merge with default configuration
      return this.deepMerge(defaultConfig, fileConfig);

    } catch (error) {
      console.error(`Error loading configuration from ${configPath}:`, error);
      console.log('Using default configuration');
      return defaultConfig;
    }
  }

  private applyEnvironmentOverrides(config: OrchestratorConfiguration): OrchestratorConfiguration {
    // Override timeouts from environment
    if (process.env.ORCHESTRATOR_TIMEOUT_IMPORT) {
      config.timeouts.import_invoices = parseInt(process.env.ORCHESTRATOR_TIMEOUT_IMPORT) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_OCR) {
      config.timeouts.ocr_process = parseInt(process.env.ORCHESTRATOR_TIMEOUT_OCR) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_AI) {
      config.timeouts.ai_extract = parseInt(process.env.ORCHESTRATOR_TIMEOUT_AI) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_XML) {
      config.timeouts.xml_parse = parseInt(process.env.ORCHESTRATOR_TIMEOUT_XML) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_VALIDATE) {
      config.timeouts.validate = parseInt(process.env.ORCHESTRATOR_TIMEOUT_VALIDATE) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_ERP) {
      config.timeouts.erp_post = parseInt(process.env.ORCHESTRATOR_TIMEOUT_ERP) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_RECONCILE) {
      config.timeouts.reconcile = parseInt(process.env.ORCHESTRATOR_TIMEOUT_RECONCILE) * 1000;
    }
    if (process.env.ORCHESTRATOR_TIMEOUT_NOTIFY) {
      config.timeouts.notify = parseInt(process.env.ORCHESTRATOR_TIMEOUT_NOTIFY) * 1000;
    }

    // Override retry configuration
    if (process.env.ORCHESTRATOR_MAX_RETRIES) {
      config.retries.maxAttempts = parseInt(process.env.ORCHESTRATOR_MAX_RETRIES);
    }
    if (process.env.ORCHESTRATOR_RETRY_INITIAL_DELAY) {
      config.retries.initialDelaySeconds = parseInt(process.env.ORCHESTRATOR_RETRY_INITIAL_DELAY);
    }
    if (process.env.ORCHESTRATOR_RETRY_MAX_DELAY) {
      config.retries.maxDelaySeconds = parseInt(process.env.ORCHESTRATOR_RETRY_MAX_DELAY);
    }

    // Override concurrency
    if (process.env.ORCHESTRATOR_MAX_WORKERS) {
      config.concurrency.defaultMaxWorkers = parseInt(process.env.ORCHESTRATOR_MAX_WORKERS);
    }

    // Override feature flags
    if (process.env.ORCHESTRATOR_DISABLE_STAGES) {
      const disabledStages = process.env.ORCHESTRATOR_DISABLE_STAGES.split(',');
      disabledStages.forEach(stage => {
        const flagKey = `enable_${stage.trim()}` as keyof FeatureFlags;
        if (config.featureFlags[flagKey] !== undefined) {
          config.featureFlags[flagKey] = false;
        }
      });
    }

    return config;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private validate(): void {
    // Validate timeouts are positive numbers
    Object.entries(this.timeouts).forEach(([stage, timeout]) => {
      if (typeof timeout !== 'number' || timeout <= 0) {
        throw new Error(`Invalid timeout for stage ${stage}: ${timeout}`);
      }
    });

    // Validate retry configuration
    if (this.retries.maxAttempts <= 0) {
      throw new Error(`Invalid max retry attempts: ${this.retries.maxAttempts}`);
    }

    if (this.retries.initialDelaySeconds <= 0) {
      throw new Error(`Invalid initial retry delay: ${this.retries.initialDelaySeconds}`);
    }

    // Validate concurrency
    if (this.concurrency.defaultMaxWorkers <= 0) {
      throw new Error(`Invalid max workers: ${this.concurrency.defaultMaxWorkers}`);
    }

    // Validate circuit breaker
    if (this.circuitBreaker.errorThreshold < 0 || this.circuitBreaker.errorThreshold > 1) {
      throw new Error(`Invalid circuit breaker error threshold: ${this.circuitBreaker.errorThreshold}`);
    }

    // Validate at least one tenant exists
    if (Object.keys(this.tenants).length === 0) {
      throw new Error('At least one tenant configuration is required');
    }
  }

  /**
   * Get timeout for a specific stage
   */
  getStageTimeout(stage: PipelineState): number {
    return this.timeouts[stage as keyof TimeoutConfig] || 120000; // Default 2 minutes
  }

  /**
   * Check if a stage is enabled
   */
  isStageEnabled(stage: PipelineState): boolean {
    const flagKey = `enable_${stage}` as keyof FeatureFlags;
    return this.featureFlags[flagKey] ?? true;
  }

  /**
   * Get tenant configuration
   */
  getTenantConfig(tenantId: string): TenantConfig | undefined {
    return this.tenants[tenantId];
  }

  /**
   * Check if running in sandbox mode for tenant
   */
  isSandboxMode(tenantId: string): boolean {
    const tenant = this.getTenantConfig(tenantId);
    return tenant?.use_sandbox ?? true;
  }

  /**
   * Get ERP system for tenant
   */
  getErpSystem(tenantId: string): string {
    const tenant = this.getTenantConfig(tenantId);
    return tenant?.erp_system ?? 'SINCO';
  }

  /**
   * Get RPA profile for tenant
   */
  getRpaProfile(tenantId: string): string {
    const tenant = this.getTenantConfig(tenantId);
    return tenant?.rpa_profile ?? 'headless';
  }
}