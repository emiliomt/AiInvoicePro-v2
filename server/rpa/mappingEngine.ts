import fs from "fs";
import path from "path";
import yaml from "yaml";
import { DOMParser } from "@xmldom/xmldom";
import { CanonicalInvoice, CanonicalInvoiceLineItem } from "../../shared/canonicalInvoice";

/**
 * Mapping Engine
 * 
 * Converts ERP-specific data (XML, CSV, Excel) to canonical invoice schema
 * using YAML mapping configurations.
 */

export interface MappingConfig {
  erp: string;
  version: string;
  xml_mappings?: {
    invoice: Record<string, string[]>;
  };
  csv_mappings?: {
    invoice: Record<string, string>;
  };
  filename_patterns?: {
    pattern: string;
    groups: Record<string, number>;
  };
  transformations?: {
    dates?: {
      input_format: string;
      output_format: string;
    };
    currency?: {
      default: string;
      mappings: Record<string, string>;
    };
    amounts?: {
      decimal_separator: string;
      thousand_separator: string;
      precision: number;
    };
  };
  validation?: {
    required_fields?: string[];
    field_constraints?: Record<string, any>;
  };
}

/**
 * Load mapping configuration for an ERP
 */
export function loadMappingConfig(erpName: string): MappingConfig {
  const configPath = path.join(
    process.cwd(),
    "config",
    "erps",
    `${erpName.toLowerCase()}_mapping.yaml`
  );
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Mapping config not found for ERP: ${erpName} at ${configPath}`);
  }
  
  const fileContent = fs.readFileSync(configPath, "utf-8");
  const config = yaml.parse(fileContent) as MappingConfig;
  
  console.log(`✅ Loaded mapping config for ${erpName}`);
  return config;
}

/**
 * Extract value from XML using XPath-like selectors
 */
function extractFromXML(xmlDoc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    try {
      // Handle attribute selectors (e.g., "@UUID")
      if (selector.startsWith("@")) {
        const attrName = selector.substring(1);
        const root = xmlDoc.documentElement;
        const attrValue = root.getAttribute(attrName);
        if (attrValue) return attrValue;
        continue;
      }
      
      // Simple XPath-like selector handling with wildcards
      const parts = selector.split("/").filter(p => p);
      let currentNode: Element | null = xmlDoc.documentElement;
      
      for (const part of parts) {
        if (!currentNode) break;
        
        if (part === "{*}") {
          // Wildcard namespace - take first element child
          const children: Element[] = Array.from(currentNode.children) as Element[];
          currentNode = children[0] as Element || null;
        } else if (part.startsWith("{*}")) {
          // Wildcard namespace with specific local name
          const localName = part.substring(3);
          const children: Element[] = Array.from(currentNode.children) as Element[];
          currentNode = children.find(
            (child: Element) => child.localName === localName || child.tagName.includes(`:${localName}`)
          ) as Element || null;
        } else if (part.startsWith("@")) {
          // Attribute
          if (currentNode) {
            const attrName = part.substring(1);
            const value = currentNode.getAttribute(attrName);
            if (value) return value;
          }
          break;
        } else {
          // Regular element name
          const children: Element[] = Array.from(currentNode.children) as Element[];
          currentNode = children.find(
            (child: Element) => child.localName === part || child.tagName === part
          ) as Element || null;
        }
      }
      
      if (currentNode) {
        const value = currentNode.textContent?.trim();
        if (value) return value;
      }
    } catch (error) {
      // Try next selector
      continue;
    }
  }
  
  return undefined;
}

/**
 * Parse XML file and map to canonical invoice
 */
export async function parseXMLToCanonical(
  xmlFilePath: string,
  options: {
    erpName: string;
    sourceCompanyId: string;
    additionalMetadata?: Record<string, any>;
  }
): Promise<CanonicalInvoice> {
  const config = loadMappingConfig(options.erpName);
  
  // Read and parse XML
  const xmlContent = fs.readFileSync(xmlFilePath, "utf-8");
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  
  if (!config.xml_mappings?.invoice) {
    throw new Error(`No XML mappings defined for ${options.erpName}`);
  }
  
  const mappings = config.xml_mappings.invoice;
  
  // Extract invoice data using mappings
  const invoiceData: Partial<CanonicalInvoice> = {
    sourceErp: options.erpName.toUpperCase(),
    sourceCompanyId: options.sourceCompanyId,
    rawPayload: { xmlContent: xmlContent.substring(0, 1000) + "..." }, // Truncated for storage
    processingStatus: "downloaded",
    originalFileName: path.basename(xmlFilePath),
    fileType: "xml",
    filePaths: {
      xml: xmlFilePath
    },
    isDataSource: true,
  };
  
  // Map fields
  for (const [canonicalField, selectors] of Object.entries(mappings)) {
    const value = extractFromXML(xmlDoc, selectors);
    
    if (value) {
      // Type conversions
      if (canonicalField.includes("total") || canonicalField.includes("Total") ||
          canonicalField === "totalGross" || canonicalField === "totalNet" ||
          canonicalField === "vatTotal" || canonicalField === "subtotal") {
        (invoiceData as any)[canonicalField] = parseFloat(value.replace(/,/g, ""));
      } else {
        (invoiceData as any)[canonicalField] = value;
      }
    }
  }
  
  // Apply transformations
  if (config.transformations) {
    // Currency transformation
    if (config.transformations.currency && invoiceData.currency) {
      const currencyMappings = config.transformations.currency.mappings;
      invoiceData.currency = currencyMappings[invoiceData.currency] || 
                             invoiceData.currency ||
                             config.transformations.currency.default;
    }
  }
  
  // Set defaults
  if (!invoiceData.currency) {
    invoiceData.currency = config.transformations?.currency?.default || "COP";
  }
  
  if (!invoiceData.lineItems) {
    invoiceData.lineItems = [];
  }
  
  // Extract line items if available (simplified - would need more complex logic)
  const lineItemsNode = xmlDoc.getElementsByTagName("LineItem")[0] ||
                        xmlDoc.getElementsByTagName("Concepto")[0];
  
  if (lineItemsNode) {
    // Basic line item extraction
    const description = lineItemsNode.getAttribute("Descripcion") ||
                       lineItemsNode.textContent?.trim() ||
                       "";
    
    if (description) {
      invoiceData.lineItems.push({
        description,
        quantity: 1,
        lineTotal: invoiceData.totalGross,
      });
    }
  }
  
  // Validate required fields
  if (config.validation?.required_fields) {
    const missing = config.validation.required_fields.filter(
      field => !(invoiceData as any)[field]
    );
    
    if (missing.length > 0) {
      throw new Error(
        `Missing required fields in ${path.basename(xmlFilePath)}: ${missing.join(", ")}`
      );
    }
  }
  
  // Additional metadata from options
  if (options.additionalMetadata) {
    invoiceData.rawPayload = {
      ...invoiceData.rawPayload,
      ...options.additionalMetadata
    };
  }
  
  return invoiceData as CanonicalInvoice;
}

/**
 * Parse CSV/Excel row and map to canonical invoice
 */
export async function parseCSVRowToCanonical(
  row: Record<string, any>,
  options: {
    erpName: string;
    sourceCompanyId: string;
  }
): Promise<CanonicalInvoice> {
  const config = loadMappingConfig(options.erpName);
  
  if (!config.csv_mappings?.invoice) {
    throw new Error(`No CSV mappings defined for ${options.erpName}`);
  }
  
  const mappings = config.csv_mappings.invoice;
  
  // Build canonical invoice from row
  const invoiceData: Partial<CanonicalInvoice> = {
    sourceErp: options.erpName.toUpperCase(),
    sourceCompanyId: options.sourceCompanyId,
    rawPayload: row,
    processingStatus: "downloaded",
    lineItems: [],
  };
  
  // Map fields
  for (const [canonicalField, csvColumn] of Object.entries(mappings)) {
    const value = row[csvColumn];
    
    if (value !== undefined && value !== null && value !== "") {
      // Type conversions
      if (canonicalField.includes("total") || canonicalField.includes("Total") ||
          canonicalField === "totalGross" || canonicalField === "totalNet") {
        (invoiceData as any)[canonicalField] = parseFloat(String(value).replace(/,/g, ""));
      } else {
        (invoiceData as any)[canonicalField] = String(value);
      }
    }
  }
  
  // Set defaults
  if (!invoiceData.currency) {
    invoiceData.currency = config.transformations?.currency?.default || "COP";
  }
  
  return invoiceData as CanonicalInvoice;
}

/**
 * Extract invoice metadata from filename using pattern matching
 */
export function extractFromFilename(
  filename: string,
  erpName: string
): Partial<CanonicalInvoice> {
  const config = loadMappingConfig(erpName);
  
  if (!config.filename_patterns) {
    return {};
  }
  
  const pattern = new RegExp(config.filename_patterns.pattern);
  const match = filename.match(pattern);
  
  if (!match) {
    return {};
  }
  
  const data: Partial<CanonicalInvoice> = {};
  
  for (const [field, groupIndex] of Object.entries(config.filename_patterns.groups)) {
    const value = match[groupIndex];
    if (value) {
      (data as any)[field] = value;
    }
  }
  
  return data;
}

/**
 * Batch parse multiple files to canonical invoices
 */
export async function batchParseToCanonical(
  filePaths: string[],
  options: {
    erpName: string;
    sourceCompanyId: string;
  }
): Promise<CanonicalInvoice[]> {
  const results: CanonicalInvoice[] = [];
  
  for (const filePath of filePaths) {
    try {
      const invoice = await parseXMLToCanonical(filePath, options);
      results.push(invoice);
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error);
      // Continue with other files
    }
  }
  
  return results;
}
