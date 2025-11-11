import { z } from "zod";

/**
 * Canonical Invoice Schema
 * 
 * This is the standard invoice format that all ERP connectors must emit.
 * It provides a unified interface for invoice data across different ERPs.
 */

export const canonicalInvoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  lineTotal: z.number().optional(),
  vatRate: z.number().optional(),
  unit: z.string().optional(),
  lineNumber: z.number().optional(),
  rawText: z.string().optional(),
});

export const canonicalInvoiceSchema = z.object({
  // Core identifiers
  invoiceId: z.string(), // Unique ID within the ERP system
  series: z.string().optional(), // Invoice series (e.g., "FE", "NC")
  number: z.string().optional(), // Invoice number
  
  // Supplier/vendor information
  supplierName: z.string(),
  supplierTaxId: z.string().optional(),
  supplierAddress: z.string().optional(),
  
  // Buyer information
  buyerName: z.string().optional(),
  buyerTaxId: z.string().optional(),
  buyerAddress: z.string().optional(),
  
  // Dates
  issueDate: z.string(), // ISO 8601 date string
  dueDate: z.string().optional(), // ISO 8601 date string
  downloadedAt: z.string().optional(), // When fetched from ERP
  
  // Financial details
  currency: z.string().default("COP"),
  totalGross: z.number(), // Total amount including tax
  totalNet: z.number().optional(), // Total amount excluding tax
  vatTotal: z.number().optional(), // Total VAT/tax amount
  subtotal: z.number().optional(), // Subtotal before tax
  
  // Line items
  lineItems: z.array(canonicalInvoiceLineItemSchema).default([]),
  
  // Document references
  rawDocumentUrls: z.array(z.string()).optional(), // URLs to XML/PDF files
  filePaths: z.object({
    xml: z.string().optional(),
    pdf: z.string().optional(),
  }).optional(),
  
  // Source tracking
  sourceErp: z.string(), // e.g., "SINCO", "SAP", "Oracle"
  sourceCompanyId: z.string(), // Company/tenant ID in this system
  
  // Raw data preservation
  rawPayload: z.any().optional(), // Original ERP response/data
  
  // Processing metadata
  processingStatus: z.enum([
    "downloaded",
    "ready_for_upload_pipeline",
    "processing",
    "completed",
    "failed"
  ]).default("downloaded"),
  
  // File metadata
  fileType: z.enum(["xml", "pdf", "both"]).optional(),
  fileSize: z.number().optional(),
  originalFileName: z.string().optional(),
  baseFileName: z.string().optional(),
  
  // Matching/linking
  isDataSource: z.boolean().default(false), // True if this is the primary data source
  matchedFileId: z.number().optional(), // Links XML to PDF
});

export type CanonicalInvoice = z.infer<typeof canonicalInvoiceSchema>;
export type CanonicalInvoiceLineItem = z.infer<typeof canonicalInvoiceLineItemSchema>;

/**
 * Helper to convert canonical invoice to the existing DB schema
 */
export function canonicalToDbInvoice(canonical: CanonicalInvoice): {
  originalFileName: string | undefined;
  fileType: string | undefined;
  fileSize: number | undefined;
  filePath: string | undefined;
  erpDocumentId: string;
  downloadedAt: Date | undefined;
  metadata: Record<string, any>;
  processingStatus: string;
  baseFileName: string | undefined;
  isDataSource: boolean;
} {
  return {
    originalFileName: canonical.originalFileName,
    fileType: canonical.fileType,
    fileSize: canonical.fileSize,
    filePath: canonical.filePaths?.xml || canonical.filePaths?.pdf,
    erpDocumentId: canonical.invoiceId,
    downloadedAt: canonical.downloadedAt ? new Date(canonical.downloadedAt) : undefined,
    metadata: {
      invoiceNumber: canonical.number,
      series: canonical.series,
      emisor: canonical.supplierName,
      emisorTaxId: canonical.supplierTaxId,
      receptor: canonical.buyerName,
      receptorTaxId: canonical.buyerTaxId,
      fechaEmision: canonical.issueDate,
      fechaVencimiento: canonical.dueDate,
      totalAmount: canonical.totalGross,
      valorTotal: canonical.totalGross,
      totalNet: canonical.totalNet,
      vatTotal: canonical.vatTotal,
      subtotal: canonical.subtotal,
      currency: canonical.currency,
      sourceErp: canonical.sourceErp,
      lineItems: canonical.lineItems,
      rawPayload: canonical.rawPayload,
    },
    processingStatus: canonical.processingStatus,
    baseFileName: canonical.baseFileName,
    isDataSource: canonical.isDataSource,
  };
}
