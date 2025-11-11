import fs from "fs";
import path from "path";
import yaml from "yaml";

/**
 * Generic RPA Runner
 * 
 * Executes browser automation flows based on YAML configuration files.
 * This allows config-driven RPA without hardcoding selectors and navigation logic.
 */

export interface RPAConfig {
  erp: string;
  displayName: string;
  version: string;
  login: {
    url: string;
    steps: RPAStep[];
  };
  flows: Record<string, RPAFlow>;
  browser: BrowserConfig;
  error_handling: ErrorHandlingConfig;
  file_processing: FileProcessingConfig;
}

export interface RPAStep {
  type: string;
  selector?: string;
  xpath?: boolean;
  field?: string;
  value?: string;
  description?: string;
  wait_after?: number;
  timeout?: number;
  condition?: string;
  continue_on_error?: boolean;
  handler?: string;
  params?: Record<string, any>;
}

export interface RPAFlow {
  description: string;
  start_url: string;
  steps: RPAStep[];
}

export interface BrowserConfig {
  headless: boolean | string;
  download_path: string;
  timeout: number;
  window_size: { width: number; height: number };
  user_agent: string;
}

export interface ErrorHandlingConfig {
  max_retries: number;
  retry_delay: number;
  screenshot_on_error: boolean;
  capture_console_logs: boolean;
}

export interface FileProcessingConfig {
  supported_formats: string[];
  extract_from_zip: boolean;
  zip_timeout: number | string;
  temp_extract_dir: string;
}

export interface RPAContext {
  config: RPAConfig;
  params: Record<string, any>;
  auth?: {
    username: string;
    password: string;
  };
  customHandlers?: Record<string, (context: any, step: RPAStep) => Promise<any>>;
}

/**
 * Load ERP configuration from YAML file
 */
export function loadERPConfig(erpName: string): RPAConfig {
  const configPath = path.join(process.cwd(), "config", "erps", `${erpName.toLowerCase()}.yaml`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`RPA config not found for ERP: ${erpName} at ${configPath}`);
  }
  
  const fileContent = fs.readFileSync(configPath, "utf-8");
  const config = yaml.parse(fileContent) as RPAConfig;
  
  console.log(`✅ Loaded RPA config for ${config.displayName || erpName}`);
  return config;
}

/**
 * Replace template variables in config
 */
export function resolveConfigTemplates(config: RPAConfig, params: Record<string, any>): RPAConfig {
  const configStr = JSON.stringify(config);
  let resolved = configStr;
  
  // Replace all {{variable}} placeholders
  for (const [key, value] of Object.entries(params)) {
    const pattern = new RegExp(`{{${key}}}`, "g");
    resolved = resolved.replace(pattern, String(value));
  }
  
  return JSON.parse(resolved) as RPAConfig;
}

/**
 * Validate RPA config structure
 */
export function validateRPAConfig(config: RPAConfig): void {
  if (!config.erp) {
    throw new Error("RPA config missing 'erp' field");
  }
  if (!config.login || !config.login.url || !config.login.steps) {
    throw new Error("RPA config missing 'login' configuration");
  }
  if (!config.flows || Object.keys(config.flows).length === 0) {
    throw new Error("RPA config missing 'flows' configuration");
  }
}

/**
 * Execute a login flow
 * 
 * This is a stub that would be implemented with actual Selenium/Playwright logic.
 * For now, it returns the config to be used by the Python RPA service.
 */
export async function executeLogin(
  context: RPAContext
): Promise<{ success: boolean; message?: string }> {
  console.log(`🔐 Executing login flow for ${context.config.erp}...`);
  
  // Validate auth credentials
  if (!context.auth?.username || !context.auth?.password) {
    throw new Error("Missing authentication credentials (username/password)");
  }
  
  // In a real implementation, this would:
  // 1. Launch browser
  // 2. Navigate to login URL
  // 3. Execute each login step
  // 4. Verify successful login
  
  // For now, we return the configuration to be used by the Python service
  return {
    success: true,
    message: "Login configuration prepared"
  };
}

/**
 * Execute a specific flow
 * 
 * This is a stub that would orchestrate the Python RPA service.
 */
export async function executeFlow(
  context: RPAContext,
  flowName: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const flow = context.config.flows[flowName];
  
  if (!flow) {
    throw new Error(`Flow "${flowName}" not found in ${context.config.erp} configuration`);
  }
  
  console.log(`▶️  Executing flow: ${flowName} - ${flow.description}`);
  
  // In a real implementation, this would:
  // 1. Execute each step in the flow
  // 2. Handle custom processing steps
  // 3. Return downloaded files or extracted data
  
  return {
    success: true,
    data: {
      flow: flowName,
      description: flow.description,
      steps: flow.steps.length
    }
  };
}

/**
 * Get RPA configuration for Python service
 * 
 * This prepares the config in a format the Python RPA service can use.
 */
export function getRPAConfigForPython(
  erpName: string,
  params: Record<string, any>
): RPAConfig {
  const config = loadERPConfig(erpName);
  validateRPAConfig(config);
  return resolveConfigTemplates(config, params);
}

/**
 * Helper to create RPA context
 */
export function createRPAContext(
  erpName: string,
  params: Record<string, any>,
  auth?: { username: string; password: string },
  customHandlers?: Record<string, (context: any, step: RPAStep) => Promise<any>>
): RPAContext {
  const config = getRPAConfigForPython(erpName, params);
  
  return {
    config,
    params,
    auth,
    customHandlers
  };
}
