import {
  ERPConnector,
  AuthContext,
  HealthStatus,
  FetchInvoicesParams,
  FetchInvoicesResult,
} from "./base";
import { CanonicalInvoice } from "../../shared/canonicalInvoice";
import { createRPAContext, getRPAConfigForPython } from "../rpa/rpaRunner";
import { parseXMLToCanonical, batchParseToCanonical } from "../rpa/mappingEngine";
import { PythonRPAService } from "../services/pythonRpaService";
import { ConnectorTimer, logConnectorOperation } from "./observability";
import fs from "fs";
import path from "path";

/**
 * SINCO ERP Connector
 * 
 * Implements the ERPConnector interface for SINCO ERP system.
 * Uses config-driven RPA and mapping layers.
 */
export class SincoConnector implements ERPConnector {
  readonly name = "SINCO";
  readonly displayName = "SINCO ERP System";
  readonly supportsIncrementalSync = true;
  readonly requiresRPA = true;
  
  private pythonRpaService: PythonRPAService;
  
  constructor() {
    this.pythonRpaService = new PythonRPAService();
    logConnectorOperation(this.name, "initialization", "SINCO connector initialized");
  }
  
  /**
   * Authenticate with SINCO ERP
   */
  async authenticate(credentials: Record<string, any>): Promise<AuthContext> {
    const timer = new ConnectorTimer(this.name, "authentication", credentials.companyId);
    
    try {
      // Validate required credentials
      if (!credentials.username || !credentials.password || !credentials.erpUrl) {
        throw new Error(
          "Missing required credentials for SINCO: username, password, erpUrl"
        );
      }
      
      if (!credentials.companyId) {
        throw new Error("Missing required field: companyId");
      }
      
      // Build auth context
      const authContext: AuthContext = {
        credentials: {
          username: credentials.username,
          password: credentials.password,
          apiKey: credentials.apiKey,
        },
        erpUrl: credentials.erpUrl,
        companyId: credentials.companyId,
        metadata: {
          headless: credentials.headless ?? false,
          zipDownloadTimeout: credentials.zipDownloadTimeout ?? 60,
          downloadPath: credentials.downloadPath ?? "uploads/pdfs",
          xmlPath: credentials.xmlPath ?? "/tmp/xml_invoices",
          fileTypes: credentials.fileTypes ?? "both",
          logId: credentials.logId,
          configId: credentials.configId,
        },
      };
      
      timer.complete("Authentication successful");
      logConnectorOperation(
        this.name,
        "authentication",
        `Authenticated for company ${authContext.companyId}`,
        { companyId: authContext.companyId }
      );
      
      return authContext;
    } catch (error) {
      timer.error("Authentication failed", error);
      throw error;
    }
  }
  
  /**
   * Fetch invoices from SINCO ERP
   */
  async fetchInvoices(params: FetchInvoicesParams): Promise<FetchInvoicesResult> {
    const timer = new ConnectorTimer(this.name, "fetch_invoices", params.auth.companyId);
    
    try {
      logConnectorOperation(
        this.name,
        "fetch_invoices",
        `Starting invoice fetch for company ${params.auth.companyId}`,
        { 
          companyId: params.auth.companyId,
          metadata: { fromDate: params.fromDate, toDate: params.toDate }
        }
      );
      
      const { auth, fromDate, toDate } = params;
      
      // Prepare RPA configuration
      const rpaParams = {
        erpUrl: auth.erpUrl || "",
        headless: auth.metadata?.headless ?? false,
        downloadPath: auth.metadata?.downloadPath ?? "uploads/pdfs",
        xmlPath: auth.metadata?.xmlPath ?? "/tmp/xml_invoices",
        zipDownloadTimeout: auth.metadata?.zipDownloadTimeout ?? 60,
        fromDate: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        toDate: toDate || new Date().toISOString().split("T")[0],
      };
      
      // Get RPA config (for documentation/debugging)
      const rpaConfig = getRPAConfigForPython("SINCO", rpaParams);
      
      console.log(`📋 Using RPA config: ${rpaConfig.displayName} v${rpaConfig.version}`);
      
      // Execute RPA workflow via Python service
      // This delegates to the existing Python RPA service with the config as guidance
      const rpaResult = await this.executePythonRPA({
        erpUrl: auth.erpUrl!,
        erpUsername: auth.credentials.username!,
        erpPassword: auth.credentials.password!,
        downloadPath: auth.metadata?.downloadPath!,
        xmlPath: auth.metadata?.xmlPath!,
        headless: auth.metadata?.headless,
        zipDownloadTimeout: auth.metadata?.zipDownloadTimeout,
        fileTypes: auth.metadata?.fileTypes,
        logId: auth.metadata?.logId,
        configId: auth.metadata?.configId,
      });
      
      if (!rpaResult.success) {
        throw new Error(`RPA execution failed: ${rpaResult.error}`);
      }
      
      // Parse downloaded files to canonical invoices
      const xmlDir = auth.metadata?.xmlPath || "/tmp/xml_invoices";
      const xmlFiles = this.getDownloadedFiles(xmlDir, "xml");
      
      console.log(`📁 Found ${xmlFiles.length} XML files to process`);
      
      const canonicalInvoices: CanonicalInvoice[] = await batchParseToCanonical(
        xmlFiles,
        {
          erpName: this.name,
          sourceCompanyId: auth.companyId,
        }
      );
      
      console.log(`✅ Converted ${canonicalInvoices.length} invoices to canonical format`);
      
      timer.complete(`Fetched ${canonicalInvoices.length} invoices`, { 
        invoiceCount: canonicalInvoices.length 
      });
      
      return {
        invoices: canonicalInvoices,
        totalCount: canonicalInvoices.length,
        hasMore: false, // SINCO downloads all matching invoices at once
      };
    } catch (error) {
      timer.error("Invoice fetch failed", error);
      throw error;
    }
  }
  
  /**
   * Perform health check on SINCO connection
   */
  async healthCheck(auth: AuthContext): Promise<HealthStatus> {
    try {
      // Basic validation
      if (!auth.erpUrl || !auth.credentials.username || !auth.credentials.password) {
        return {
          status: "error",
          message: "Missing required authentication credentials",
          lastChecked: new Date().toISOString(),
        };
      }
      
      // Check if ERP URL is accessible (simplified check)
      // In production, this would attempt to load the login page
      const urlValid = auth.erpUrl.startsWith("http");
      
      if (!urlValid) {
        return {
          status: "error",
          message: "Invalid ERP URL format",
          lastChecked: new Date().toISOString(),
        };
      }
      
      return {
        status: "ok",
        message: "Credentials configured, ready to connect",
        lastChecked: new Date().toISOString(),
        details: {
          erpUrl: auth.erpUrl,
          username: auth.credentials.username,
          companyId: auth.companyId,
        },
      };
    } catch (error) {
      return {
        status: "error",
        message: `Health check failed: ${error}`,
        lastChecked: new Date().toISOString(),
      };
    }
  }
  
  /**
   * Execute Python RPA service
   * 
   * This delegates to the existing InvoiceRPAService Python implementation.
   * The RPA config serves as documentation and can guide future refactoring.
   */
  private async executePythonRPA(config: Record<string, any>): Promise<{
    success: boolean;
    error?: string;
    data?: any;
  }> {
    const timer = new ConnectorTimer(this.name, "python_rpa_execution");
    
    try {
      logConnectorOperation(
        this.name,
        "python_rpa",
        "Executing Python RPA service",
        { level: "debug" }
      );
      
      // Execute the Python RPA with download_invoices action using the instance
      const result = await this.pythonRpaService.executeRPA({
        action: 'download_invoices',
        ...config,
      });
      
      timer.complete("Python RPA execution completed", { success: result.success });
      
      return {
        success: result.success !== false,
        error: result.error,
        data: result,
      };
    } catch (error) {
      timer.error("Python RPA execution failed", error);
      logConnectorOperation(
        this.name,
        "python_rpa",
        `Python RPA execution error: ${error}`,
        { level: "error" }
      );
      
      return {
        success: false,
        error: String(error),
      };
    }
  }
  
  /**
   * Get list of downloaded files in a directory
   */
  private getDownloadedFiles(directory: string, extension: string): string[] {
    if (!fs.existsSync(directory)) {
      console.warn(`Directory not found: ${directory}`);
      return [];
    }
    
    const files = fs.readdirSync(directory);
    return files
      .filter(file => file.toLowerCase().endsWith(`.${extension}`))
      .map(file => path.join(directory, file));
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up SINCO connector resources");
    // Cleanup would close browser sessions, temp files, etc.
  }
}
