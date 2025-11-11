import { CanonicalInvoice } from "../../shared/canonicalInvoice";

/**
 * Authentication context for ERP connectors
 */
export interface AuthContext {
  credentials: {
    username?: string;
    password?: string;
    apiKey?: string;
    token?: string;
    [key: string]: any;
  };
  erpUrl?: string;
  companyId: string;
  metadata?: Record<string, any>;
}

/**
 * Health check status
 */
export interface HealthStatus {
  status: "ok" | "error" | "warning";
  message?: string;
  lastChecked: string; // ISO timestamp
  details?: Record<string, any>;
}

/**
 * Fetch parameters for invoice sync
 */
export interface FetchInvoicesParams {
  auth: AuthContext;
  fromDate?: string; // ISO date
  toDate?: string; // ISO date
  lastCursor?: string; // For pagination
  limit?: number;
  filters?: Record<string, any>;
}

/**
 * Fetch result
 */
export interface FetchInvoicesResult {
  invoices: CanonicalInvoice[];
  nextCursor?: string; // For pagination
  totalCount?: number;
  hasMore?: boolean;
}

/**
 * Base interface that all ERP connectors must implement
 */
export interface ERPConnector {
  /**
   * Unique name identifier for this connector
   */
  readonly name: string;
  
  /**
   * Human-readable display name
   */
  readonly displayName: string;
  
  /**
   * Whether this connector supports incremental synchronization
   */
  readonly supportsIncrementalSync: boolean;
  
  /**
   * Whether this connector requires RPA (browser automation)
   */
  readonly requiresRPA: boolean;
  
  /**
   * Authenticate and prepare connection context
   * @param credentials - Authentication credentials
   * @returns AuthContext for subsequent operations
   */
  authenticate(credentials: Record<string, any>): Promise<AuthContext>;
  
  /**
   * Fetch invoices from the ERP system
   * @param params - Fetch parameters including auth, date range, pagination
   * @returns Canonical invoices and pagination info
   */
  fetchInvoices(params: FetchInvoicesParams): Promise<FetchInvoicesResult>;
  
  /**
   * Perform health check on the connection
   * @param auth - Authentication context
   * @returns Health status
   */
  healthCheck(auth: AuthContext): Promise<HealthStatus>;
  
  /**
   * Cleanup resources (close browser, connections, etc.)
   */
  cleanup?(): Promise<void>;
}

/**
 * Connector registry for managing available ERP connectors
 */
class ConnectorRegistry {
  private connectors: Map<string, ERPConnector> = new Map();
  
  /**
   * Register a connector
   */
  register(connector: ERPConnector): void {
    if (this.connectors.has(connector.name)) {
      console.warn(`Connector ${connector.name} is already registered. Overwriting.`);
    }
    this.connectors.set(connector.name, connector);
    console.log(`✅ Registered ERP connector: ${connector.displayName} (${connector.name})`);
  }
  
  /**
   * Get a connector by name
   */
  get(name: string): ERPConnector | undefined {
    return this.connectors.get(name);
  }
  
  /**
   * Get all registered connectors
   */
  getAll(): ERPConnector[] {
    return Array.from(this.connectors.values());
  }
  
  /**
   * Check if a connector is registered
   */
  has(name: string): boolean {
    return this.connectors.has(name);
  }
  
  /**
   * List all connector names
   */
  list(): string[] {
    return Array.from(this.connectors.keys());
  }
}

// Singleton registry instance
export const connectorRegistry = new ConnectorRegistry();

/**
 * Helper to get connector by name with error handling
 */
export function getConnectorByName(name: string): ERPConnector {
  const connector = connectorRegistry.get(name);
  if (!connector) {
    const available = connectorRegistry.list().join(", ");
    throw new Error(
      `Connector "${name}" not found. Available connectors: ${available || "none"}`
    );
  }
  return connector;
}

// Re-export for convenience
export { connectorRegistry as registry };
