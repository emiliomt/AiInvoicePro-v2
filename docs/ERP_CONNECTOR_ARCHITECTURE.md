# ERP Connector Architecture

This document describes the new scalable connector architecture for invoice automation that supports multiple ERP systems.

## Overview

The system has been refactored from a hardcoded SINCO RPA implementation to a flexible, config-driven architecture that supports multiple ERPs through:

1. **Canonical Invoice Schema** - Standard invoice format across all ERPs
2. **ERPConnector Interface** - Generic abstraction for ERP integrations
3. **Config-Driven RPA Layer** - YAML-based browser automation flows
4. **Mapping Engine** - Converts ERP-specific data to canonical schema
5. **Connector Implementations** - Concrete ERP connectors (SINCO, SAP, etc.)

## Architecture Components

### 1. Canonical Invoice Schema

**Location**: `shared/canonicalInvoice.ts`

All ERP connectors must emit invoices in this standard format:

```typescript
type CanonicalInvoice = {
  // Core identifiers
  invoiceId: string;
  series?: string;
  number?: string;
  
  // Supplier/vendor information
  supplierName: string;
  supplierTaxId?: string;
  
  // Buyer information
  buyerName?: string;
  buyerTaxId?: string;
  
  // Dates (ISO 8601 format)
  issueDate: string;
  dueDate?: string;
  
  // Financial details
  currency: string;
  totalGross: number;
  totalNet?: number;
  vatTotal?: number;
  
  // Line items
  lineItems: CanonicalInvoiceLineItem[];
  
  // Source tracking
  sourceErp: string;          // e.g., "SINCO", "SAP"
  sourceCompanyId: string;    // Company ID in this system
  
  // Raw data preservation
  rawPayload?: any;
}
```

### 2. ERPConnector Interface

**Location**: `server/connectors/base.ts`

All ERP connectors must implement this interface:

```typescript
interface ERPConnector {
  readonly name: string;
  readonly displayName: string;
  readonly supportsIncrementalSync: boolean;
  readonly requiresRPA: boolean;
  
  authenticate(credentials: Record<string, any>): Promise<AuthContext>;
  fetchInvoices(params: FetchInvoicesParams): Promise<FetchInvoicesResult>;
  healthCheck(auth: AuthContext): Promise<HealthStatus>;
  cleanup?(): Promise<void>;
}
```

### 3. Config-Driven RPA Layer

**Location**: `server/rpa/rpaRunner.ts`

RPA flows are defined in YAML configuration files:

**Config File**: `config/erps/sinco.yaml`

```yaml
erp: "SINCO"
displayName: "SINCO ERP System"

login:
  url: "{{erpUrl}}"
  steps:
    - type: "fill"
      selector: "#txtUsuario"
      field: "username"
    - type: "click"
      selector: "#btnIngresar"

flows:
  download_invoices:
    description: "Download invoice files"
    start_url: "{{erpUrl}}"
    steps:
      - type: "click"
        selector: "#mod-FE"
      # ... more steps
```

**Benefits**:
- No hardcoded selectors in code
- Easy to update when ERP UI changes
- Supports template variables like `{{erpUrl}}`
- Self-documenting automation flows

### 4. Mapping Engine

**Location**: `server/rpa/mappingEngine.ts`

Maps ERP-specific field names to canonical schema using YAML configs:

**Mapping Config**: `config/erps/sinco_mapping.yaml`

```yaml
xml_mappings:
  invoice:
    invoiceId:
      - "/{*}Invoice/{*}ID"
      - "@UUID"
    supplierName:
      - "/{*}Emisor/@Nombre"
    totalGross:
      - "@Total"

transformations:
  currency:
    default: "COP"
    mappings:
      "PESO": "COP"
```

**Features**:
- Multiple selector fallbacks
- XPath-like XML selectors with namespace wildcards
- CSV/Excel column mappings
- Data transformations (dates, currencies, amounts)
- Field validation

### 5. Connector Registry

**Location**: `server/connectors/index.ts`

Manages available ERP connectors:

```typescript
import { connectorRegistry, getConnectorByName } from './connectors';

// Register connectors
registerAllConnectors();

// Use a connector
const connector = getConnectorByName("SINCO");
const result = await connector.fetchInvoices(params);
```

## Adding a New ERP Connector

Follow these steps to add support for a new ERP system:

### Step 1: Create RPA Configuration

Create `config/erps/{erp_name}.yaml`:

```yaml
erp: "YOUR_ERP"
displayName: "Your ERP System"
version: "1.0"

login:
  url: "{{erpUrl}}"
  steps:
    - type: "fill"
      selector: "#username"
      field: "username"
    # ... login steps

flows:
  download_invoices:
    description: "Download invoices"
    steps:
      # ... automation steps
```

### Step 2: Create Mapping Configuration

Create `config/erps/{erp_name}_mapping.yaml`:

```yaml
erp: "YOUR_ERP"

xml_mappings:
  invoice:
    invoiceId: ["/{*}InvoiceID"]
    supplierName: ["/{*}Supplier/{*}Name"]
    totalGross: ["/{*}Total"]
    # ... field mappings

transformations:
  currency:
    default: "USD"
```

### Step 3: Implement Connector Class

Create `server/connectors/{erpName}Connector.ts`:

```typescript
import { ERPConnector, AuthContext, FetchInvoicesParams } from "./base";
import { CanonicalInvoice } from "../../shared/canonicalInvoice";

export class YourErpConnector implements ERPConnector {
  readonly name = "YOUR_ERP";
  readonly displayName = "Your ERP System";
  readonly supportsIncrementalSync = true;
  readonly requiresRPA = true;
  
  async authenticate(credentials: Record<string, any>): Promise<AuthContext> {
    // Validate and prepare credentials
  }
  
  async fetchInvoices(params: FetchInvoicesParams): Promise<FetchInvoicesResult> {
    // 1. Execute RPA workflow
    // 2. Parse downloaded files
    // 3. Map to canonical invoices
    // 4. Return results
  }
  
  async healthCheck(auth: AuthContext): Promise<HealthStatus> {
    // Verify connection
  }
}
```

### Step 4: Register the Connector

Add to `server/connectors/index.ts`:

```typescript
import { YourErpConnector } from "./yourErpConnector";

export function registerAllConnectors(): void {
  // ... existing registrations
  
  const yourErpConnector = new YourErpConnector();
  connectorRegistry.register(yourErpConnector);
}
```

## SINCO Connector Implementation

The SINCO connector serves as the reference implementation:

**Location**: `server/connectors/sincoConnector.ts`

Key features:
- Implements ERPConnector interface
- Uses YAML config for RPA flows
- Delegates browser automation to existing Python service
- Parses XML files using mapping engine
- Converts to canonical invoice format

## Migration Strategy

The existing SINCO RPA code remains operational. The new architecture:

1. **Wraps** existing Python RPA service
2. **Adds** config-driven layer on top
3. **Provides** mapping to canonical schema
4. **Enables** gradual migration to pure TypeScript/Playwright if desired

## Benefits

1. **Scalability**: Easy to add new ERP systems
2. **Maintainability**: Config files separate from code
3. **Flexibility**: Support for API, RPA, CSV, or Excel imports
4. **Consistency**: All ERPs output canonical invoices
5. **Observability**: Centralized logging and health checks
6. **Documentation**: Config files are self-documenting

## Configuration Hot-Reload

Config files are loaded fresh on each run, allowing updates without deployment:

```typescript
// Configs are loaded from disk each time
const config = loadERPConfig("SINCO");
const mapping = loadMappingConfig("SINCO");
```

To update SINCO selectors:
1. Edit `config/erps/sinco.yaml`
2. No restart needed - changes apply immediately

## Health Checks

Each connector provides health check capabilities:

```typescript
const connector = getConnectorByName("SINCO");
const health = await connector.healthCheck(authContext);

if (health.status === "ok") {
  // Connection is healthy
}
```

## Future Enhancements

1. **Pure TypeScript RPA**: Migrate from Python to Playwright
2. **API-based connectors**: Support direct API integrations
3. **Incremental sync**: Track cursors for large datasets
4. **Retry policies**: Configurable retry strategies
5. **Rate limiting**: Prevent ERP overload
6. **Caching**: Cache config files with TTL

## Testing

Tests should cover:

1. **Connector interface compliance**
2. **Mapping accuracy** (XML/CSV → Canonical)
3. **Config validation**
4. **Error handling**
5. **Health checks**

Example test:

```typescript
test("SINCO connector converts XML to canonical invoice", async () => {
  const invoice = await parseXMLToCanonical(sampleXmlPath, {
    erpName: "SINCO",
    sourceCompanyId: "test-company",
  });
  
  expect(invoice.sourceErp).toBe("SINCO");
  expect(invoice.invoiceId).toBeDefined();
  expect(invoice.totalGross).toBeGreaterThan(0);
});
```

## Troubleshooting

### Config Not Found
```
Error: RPA config not found for ERP: SINCO
```
**Solution**: Ensure `config/erps/sinco.yaml` exists

### Mapping Errors
```
Error: Missing required fields: invoiceId, totalGross
```
**Solution**: Check XML structure and update mapping selectors in `sinco_mapping.yaml`

### RPA Execution Failures
**Solution**: Check Python service logs, verify selectors still match ERP UI

## Support

For questions or issues with the connector architecture:
1. Check this documentation
2. Review SINCO connector as reference implementation
3. Examine config files for examples
4. Check logs for detailed error messages
