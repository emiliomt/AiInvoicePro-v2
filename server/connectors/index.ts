/**
 * ERP Connector Registry
 * 
 * This file registers all available ERP connectors.
 * Add new connectors here to make them available to the system.
 */

import { connectorRegistry } from "./base";
import { SincoConnector } from "./sincoConnector";

// Register all connectors
export function registerAllConnectors(): void {
  console.log("📦 Registering ERP connectors...");
  
  // Register SINCO connector
  const sincoConnector = new SincoConnector();
  connectorRegistry.register(sincoConnector);
  
  // Add more connectors here as they are implemented:
  // const sapConnector = new SapConnector();
  // connectorRegistry.register(sapConnector);
  
  // const oracleConnector = new OracleConnector();
  // connectorRegistry.register(oracleConnector);
  
  console.log(`✅ Registered ${connectorRegistry.list().length} connectors`);
}

// Export the registry and helper function
export { connectorRegistry, getConnectorByName } from "./base";

// Export connector types
export type { ERPConnector, AuthContext, HealthStatus, FetchInvoicesParams, FetchInvoicesResult } from "./base";
