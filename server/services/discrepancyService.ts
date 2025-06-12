import { db } from "../db";
import { invoices, invoiceFlags, purchaseOrders, invoicePoMatches, validationRules } from "@shared/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import type { Invoice, LineItem, InsertInvoiceFlag } from "@shared/schema";

export interface DiscrepancyCheckResult {
  hasDiscrepancies: boolean;
  flags: InsertInvoiceFlag[];
}

export async function checkInvoiceDiscrepancies(
  invoice: Invoice,
  lineItems: LineItem[]
): Promise<DiscrepancyCheckResult> {
  const flags: InsertInvoiceFlag[] = [];

  // 1. Check for duplicate invoice numbers
  if (invoice.invoiceNumber) {
    const duplicates = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.invoiceNumber, invoice.invoiceNumber),
          ne(invoices.id, invoice.id),
          eq(invoices.vendorName, invoice.vendorName || "")
        )
      );

    if (duplicates.length > 0) {
      flags.push({
        invoiceId: invoice.id,
        flagType: "duplicate_invoice",
        severity: "high",
        message: `Duplicate invoice number ${invoice.invoiceNumber} found for vendor ${invoice.vendorName}`,
        details: {
          duplicateInvoiceIds: duplicates.map(d => d.id),
          duplicateCount: duplicates.length
        }
      });
    }
  }

  // 2. Check for amount mismatch with PO (if matched)
  const poMatches = await db
    .select()
    .from(invoicePoMatches)
    .leftJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
    .where(eq(invoicePoMatches.invoiceId, invoice.id));

  for (const match of poMatches) {
    if (match.purchase_orders && invoice.totalAmount) {
      const invoiceAmount = parseFloat(invoice.totalAmount);
      const poAmount = parseFloat(match.purchase_orders.amount);
      const deviation = Math.abs(invoiceAmount - poAmount) / poAmount;

      if (deviation > 0.1) { // 10% deviation threshold
        const severity = deviation > 0.25 ? "critical" : deviation > 0.15 ? "high" : "medium";
        flags.push({
          invoiceId: invoice.id,
          flagType: "amount_mismatch",
          severity: severity as "low" | "medium" | "high" | "critical",
          message: `Amount mismatch: Invoice ${invoiceAmount} vs PO ${poAmount} (${(deviation * 100).toFixed(1)}% deviation)`,
          details: {
            invoiceAmount,
            poAmount,
            deviation: deviation * 100,
            poId: match.purchase_orders.poId
          }
        });
      }
    }
  }

  // 3. Check for missing PO match (for invoices above threshold)
  const invoiceAmount = parseFloat(invoice.totalAmount || "0");
  if (invoiceAmount > 5000 && poMatches.length === 0) { // Threshold for requiring PO match
    flags.push({
      invoiceId: invoice.id,
      flagType: "missing_po_match",
      severity: invoiceAmount > 20000 ? "high" : "medium",
      message: `No purchase order match found for high-value invoice (${invoice.totalAmount})`,
      details: {
        invoiceAmount,
        threshold: 5000
      }
    });
  }

  // 4. Check for tax ID mismatch (if validation rule exists)
  const taxIdRules = await db
    .select()
    .from(validationRules)
    .where(eq(validationRules.fieldName, "taxId"));

  if (taxIdRules.length > 0 && invoice.vendorName) {
    // Check if vendor has consistent tax ID across invoices
    const vendorInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.vendorName, invoice.vendorName),
          ne(invoices.id, invoice.id)
        )
      )
      .orderBy(desc(invoices.createdAt))
      .limit(5);

    // Extract tax IDs from previous invoices (assuming it's stored in extractedData)
    const currentTaxId = (invoice.extractedData as any)?.taxId;
    if (currentTaxId) {
      const inconsistentTaxIds = vendorInvoices.filter(inv => {
        const prevTaxId = (inv.extractedData as any)?.taxId;
        return prevTaxId && prevTaxId !== currentTaxId;
      });

      if (inconsistentTaxIds.length > 0) {
        flags.push({
          invoiceId: invoice.id,
          flagType: "tax_id_mismatch",
          severity: "medium",
          message: `Tax ID inconsistency detected for vendor ${invoice.vendorName}`,
          details: {
            currentTaxId,
            previousTaxIds: inconsistentTaxIds.map(inv => (inv.extractedData as any)?.taxId),
            vendorName: invoice.vendorName
          }
        });
      }
    }
  }

  return {
    hasDiscrepancies: flags.length > 0,
    flags
  };
}

export async function storeInvoiceFlags(flags: InsertInvoiceFlag[]): Promise<void> {
  if (flags.length === 0) return;

  await db.insert(invoiceFlags).values(flags);
}

export async function getInvoiceFlags(invoiceId: number) {
  return await db
    .select()
    .from(invoiceFlags)
    .where(eq(invoiceFlags.invoiceId, invoiceId))
    .orderBy(desc(invoiceFlags.createdAt));
}

export async function resolveFlag(flagId: number, resolvedBy: string): Promise<void> {
  await db
    .update(invoiceFlags)
    .set({
      isResolved: true,
      resolvedBy,
      resolvedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(invoiceFlags.id, flagId));
}

export async function getAllUnresolvedFlags() {
  return await db
    .select()
    .from(invoiceFlags)
    .leftJoin(invoices, eq(invoiceFlags.invoiceId, invoices.id))
    .where(eq(invoiceFlags.isResolved, false))
    .orderBy(desc(invoiceFlags.createdAt));
}