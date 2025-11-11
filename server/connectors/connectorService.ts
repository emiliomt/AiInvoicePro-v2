/**
 * Connector Service
 * 
 * High-level service that orchestrates ERP connectors for invoice importing.
 * Provides integration between the new connector architecture and existing API routes.
 */

import { getConnectorByName, registerAllConnectors } from "./index";
import { ERPConnector, FetchInvoicesParams } from "./base";
import { CanonicalInvoice, canonicalToDbInvoice } from "../../shared/canonicalInvoice";
import { ConnectorTimer, logConnectorOperation, connectorMetrics } from "./observability";
import { db } from "../db";
import { importedInvoices } from "../../shared/schema";

// Register all connectors on service initialization
registerAllConnectors();

export interface ImportInvoicesOptions {
  erpName: string;
  erpUrl: string;
  username: string;
  password: string;
  companyId: string;
  fromDate?: string;
  toDate?: string;
  logId?: number;
  configId?: number;
  headless?: boolean;
  zipDownloadTimeout?: number;
  downloadPath?: string;
  xmlPath?: string;
  fileTypes?: string;
}

export interface ImportInvoicesResult {
  success: boolean;
  totalInvoices: number;
  successfulImports: number;
  failedImports: number;
  skippedInvoices: number;
  invoices: CanonicalInvoice[];
  error?: string;
}

/**
 * Import invoices using the appropriate ERP connector
 */
export async function importInvoicesViaConnector(
  options: ImportInvoicesOptions
): Promise<ImportInvoicesResult> {
  const timer = new ConnectorTimer(options.erpName, "import_invoices", options.companyId);
  
  logConnectorOperation(
    options.erpName,
    "import_start",
    `Starting import for company ${options.companyId}`,
    { companyId: options.companyId, level: "info" }
  );
  
  try {
    // Get the appropriate connector
    const connector = getConnectorByName(options.erpName);
    
    logConnectorOperation(
      options.erpName,
      "connector_resolved",
      `Using connector: ${connector.displayName}`,
      { level: "debug" }
    );
    
    // Authenticate
    const authContext = await connector.authenticate({
      username: options.username,
      password: options.password,
      erpUrl: options.erpUrl,
      companyId: options.companyId,
      headless: options.headless,
      zipDownloadTimeout: options.zipDownloadTimeout,
      downloadPath: options.downloadPath,
      xmlPath: options.xmlPath,
      fileTypes: options.fileTypes,
      logId: options.logId,
      configId: options.configId,
    });
    
    // Fetch invoices
    const fetchParams: FetchInvoicesParams = {
      auth: authContext,
      fromDate: options.fromDate,
      toDate: options.toDate,
    };
    
    const result = await connector.fetchInvoices(fetchParams);
    
    console.log(`📥 Fetched ${result.invoices.length} invoices from ${options.erpName}`);
    
    // Store invoices in database
    const stored = await storeCanonicalInvoices(
      result.invoices,
      options.logId || 0
    );
    
    // Cleanup connector resources
    if (connector.cleanup) {
      await connector.cleanup();
    }
    
    // Record metrics
    connectorMetrics.recordInvoicesFetched(options.erpName, result.invoices.length);
    connectorMetrics.recordOperation(options.erpName, true, timer.getDuration());
    
    timer.complete(`Import completed: ${stored.successful} successful, ${stored.failed} failed`);
    
    logConnectorOperation(
      options.erpName,
      "import_complete",
      `Import completed successfully: ${stored.successful}/${result.invoices.length} stored`,
      { 
        companyId: options.companyId,
        metadata: {
          totalInvoices: result.invoices.length,
          successful: stored.successful,
          failed: stored.failed
        }
      }
    );
    
    return {
      success: true,
      totalInvoices: result.invoices.length,
      successfulImports: stored.successful,
      failedImports: stored.failed,
      skippedInvoices: 0,
      invoices: result.invoices,
    };
  } catch (error) {
    timer.error("Import failed", error);
    
    connectorMetrics.recordOperation(options.erpName, false, timer.getDuration());
    
    logConnectorOperation(
      options.erpName,
      "import_failed",
      `Import failed: ${error}`,
      { level: "error", companyId: options.companyId }
    );
    
    return {
      success: false,
      totalInvoices: 0,
      successfulImports: 0,
      failedImports: 0,
      skippedInvoices: 0,
      invoices: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Store canonical invoices in the database
 */
async function storeCanonicalInvoices(
  invoices: CanonicalInvoice[],
  logId: number
): Promise<{ successful: number; failed: number }> {
  let successful = 0;
  let failed = 0;
  
  for (const canonicalInvoice of invoices) {
    try {
      const dbInvoice = canonicalToDbInvoice(canonicalInvoice);
      
      await db.insert(importedInvoices).values({
        logId: logId,
        originalFileName: dbInvoice.originalFileName,
        fileType: dbInvoice.fileType,
        fileSize: dbInvoice.fileSize,
        filePath: dbInvoice.filePath,
        erpDocumentId: dbInvoice.erpDocumentId,
        downloadedAt: dbInvoice.downloadedAt,
        metadata: dbInvoice.metadata,
        processingStatus: dbInvoice.processingStatus as any,
        baseFileName: dbInvoice.baseFileName,
        isDataSource: dbInvoice.isDataSource,
      });
      
      successful++;
    } catch (error) {
      console.error(`Failed to store invoice ${canonicalInvoice.invoiceId}:`, error);
      failed++;
    }
  }
  
  console.log(`💾 Stored ${successful} invoices, ${failed} failed`);
  
  return { successful, failed };
}

/**
 * Get available ERP connectors
 */
export function getAvailableConnectors(): Array<{
  name: string;
  displayName: string;
  supportsIncrementalSync: boolean;
  requiresRPA: boolean;
}> {
  const { connectorRegistry } = require("./index");
  const connectors = connectorRegistry.getAll();
  
  return connectors.map((connector: ERPConnector) => ({
    name: connector.name,
    displayName: connector.displayName,
    supportsIncrementalSync: connector.supportsIncrementalSync,
    requiresRPA: connector.requiresRPA,
  }));
}

/**
 * Perform health check for a specific ERP connector
 */
export async function checkConnectorHealth(
  erpName: string,
  credentials: Record<string, any>
): Promise<{
  status: "ok" | "error" | "warning";
  message?: string;
  details?: Record<string, any>;
}> {
  try {
    const connector = getConnectorByName(erpName);
    const authContext = await connector.authenticate(credentials);
    const health = await connector.healthCheck(authContext);
    
    return {
      status: health.status,
      message: health.message,
      details: health.details,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
