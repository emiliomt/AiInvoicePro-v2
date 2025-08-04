import { db } from "../db";
import { invoices, invoiceValidationResults, invoicePoMatches, purchaseOrders, lineItems } from "@shared/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import type { Invoice, LineItem, InsertInvoiceValidationResult } from "@shared/schema";

// Validation rule interfaces
interface ValidationRule {
  rule: string;
  required: boolean;
  validValues?: string[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  pattern?: RegExp;
  errorMessage: string;
}

interface ValidationFailure {
  rule: string;
  severity: "Critical" | "Warning" | "Info";
  message: string;
  currentValue: any;
  requiredAction: string;
}

interface ValidationResult {
  status: "Passed" | "Failed" | "Warning";
  overallScore: number; // 0-100
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
  passedRules: string[];
  timestamp: string;
}

// Colombian business validation rules
const VALIDATION_RULES: Record<string, ValidationRule> = {
  item_classification: {
    rule: "item_classification",
    required: true,
    validValues: ["Consumable Materials", "Non-Consumable Materials", "Labor", "Tools & Equipment"],
    errorMessage: "Line items must be classified into valid categories"
  },
  po_match: {
    rule: "po_match", 
    required: true,
    validValues: ["Full Match", "Partial Match"],
    errorMessage: "Invoice must match against a valid purchase order"
  },
  amount: {
    rule: "amount",
    required: true,
    minValue: 0.01,
    maxValue: 100000000.00,
    errorMessage: "Amount must be positive and within limits"
  },
  vendor: {
    rule: "vendor",
    required: true,
    minLength: 3,
    errorMessage: "Valid vendor information required"
  },
  currency: {
    rule: "currency",
    required: true,
    validValues: ["COP", "USD", "EUR"],
    errorMessage: "Currency must be valid (COP, USD, EUR)"
  },
  invoice_date: {
    rule: "invoice_date", 
    required: true,
    errorMessage: "Valid invoice date required"
  },
  invoice_number: {
    rule: "invoice_number",
    required: true,
    minLength: 1,
    errorMessage: "Invoice number is required"
  },
  tax_id: {
    rule: "tax_id",
    required: false,
    pattern: /^\d{9,11}$/, // Colombian NIT format
    errorMessage: "Tax ID must be valid Colombian NIT format (9-11 digits)"
  }
};

// Approval requirements based on amount (COP)
const APPROVAL_REQUIREMENTS = {
  1000000: ["Manager"],           // >1M COP needs manager  
  10000000: ["Manager", "Finance"], // >10M COP needs both
  50000000: ["Manager", "Finance", "Director"] // >50M COP needs all
};

export class InvoiceValidator {
  
  async validateInvoice(invoiceId: number): Promise<ValidationResult> {
    // Fetch invoice and related data
    const invoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice.length) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const invoiceData = invoice[0];
    
    // Fetch line items
    const lineItemsData = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));

    // Fetch PO matches
    const poMatches = await db
      .select()
      .from(invoicePoMatches)
      .leftJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
      .where(eq(invoicePoMatches.invoiceId, invoiceId));

    const failures: ValidationFailure[] = [];
    const warnings: ValidationFailure[] = [];
    const passedRules: string[] = [];

    // Run all validation rules
    await this.validateBasicFields(invoiceData, failures, passedRules);
    await this.validateAmount(invoiceData, failures, warnings, passedRules);
    await this.validatePOMatch(invoiceData, poMatches, failures, warnings, passedRules);
    await this.validateItemClassification(lineItemsData, failures, passedRules);
    await this.validateApprovals(invoiceData, warnings, passedRules);
    await this.validateDuplicates(invoiceData, failures, passedRules);
    await this.validateTaxId(invoiceData, failures, warnings, passedRules);

    // Calculate overall score
    const totalRules = Object.keys(VALIDATION_RULES).length + 3; // +3 for approvals, duplicates, classification
    const passedCount = passedRules.length;
    const overallScore = Math.round((passedCount / totalRules) * 100);

    // Determine status
    let status: "Passed" | "Failed" | "Warning" = "Passed";
    if (failures.length > 0) {
      status = "Failed";
    } else if (warnings.length > 0) {
      status = "Warning";
    }

    const result: ValidationResult = {
      status,
      overallScore,
      failures,
      warnings,
      passedRules,
      timestamp: new Date().toISOString()
    };

    // Store validation result in database
    await this.storeValidationResult(invoiceId, result);

    return result;
  }

  private async validateBasicFields(
    invoice: Invoice, 
    failures: ValidationFailure[], 
    passedRules: string[]
  ) {
    // Vendor validation
    if (VALIDATION_RULES.vendor.required) {
      if (!invoice.vendorName || invoice.vendorName.length < (VALIDATION_RULES.vendor.minLength || 0)) {
        failures.push({
          rule: "vendor",
          severity: "Critical",
          message: VALIDATION_RULES.vendor.errorMessage,
          currentValue: invoice.vendorName || "null",
          requiredAction: "Enter valid vendor name with at least 3 characters"
        });
      } else {
        passedRules.push("vendor");
      }
    }

    // Invoice number validation
    if (VALIDATION_RULES.invoice_number.required) {
      if (!invoice.invoiceNumber || invoice.invoiceNumber.length < 1) {
        failures.push({
          rule: "invoice_number",
          severity: "Critical", 
          message: VALIDATION_RULES.invoice_number.errorMessage,
          currentValue: invoice.invoiceNumber || "null",
          requiredAction: "Enter valid invoice number"
        });
      } else {
        passedRules.push("invoice_number");
      }
    }

    // Invoice date validation
    if (VALIDATION_RULES.invoice_date.required) {
      if (!invoice.invoiceDate) {
        failures.push({
          rule: "invoice_date",
          severity: "Critical",
          message: VALIDATION_RULES.invoice_date.errorMessage,
          currentValue: "null",
          requiredAction: "Enter valid invoice date"
        });
      } else {
        passedRules.push("invoice_date");
      }
    }

    // Currency validation
    const validCurrencies = VALIDATION_RULES.currency.validValues || [];
    if (VALIDATION_RULES.currency.required) {
      if (!invoice.currency || !validCurrencies.includes(invoice.currency)) {
        failures.push({
          rule: "currency",
          severity: "Critical",
          message: VALIDATION_RULES.currency.errorMessage,
          currentValue: invoice.currency || "null",
          requiredAction: `Set currency to one of: ${validCurrencies.join(", ")}`
        });
      } else {
        passedRules.push("currency");
      }
    }
  }

  private async validateAmount(
    invoice: Invoice,
    failures: ValidationFailure[],
    warnings: ValidationFailure[],
    passedRules: string[]
  ) {
    const amount = parseFloat(invoice.totalAmount || "0");
    const rule = VALIDATION_RULES.amount;

    if (rule.required) {
      if (!invoice.totalAmount || amount <= 0) {
        failures.push({
          rule: "amount",
          severity: "Critical",
          message: rule.errorMessage,
          currentValue: amount,
          requiredAction: "Enter valid positive amount"
        });
        return;
      }

      if (rule.minValue && amount < rule.minValue) {
        failures.push({
          rule: "amount",
          severity: "Critical", 
          message: `Amount must be at least ${rule.minValue}`,
          currentValue: amount,
          requiredAction: `Increase amount to at least ${rule.minValue}`
        });
        return;
      }

      if (rule.maxValue && amount > rule.maxValue) {
        failures.push({
          rule: "amount",
          severity: "Critical",
          message: `Amount exceeds maximum limit of ${rule.maxValue}`,
          currentValue: amount,
          requiredAction: `Reduce amount or split into multiple invoices`
        });
        return;
      }

      passedRules.push("amount");
    }
  }

  private async validatePOMatch(
    invoice: Invoice,
    poMatches: any[],
    failures: ValidationFailure[],
    warnings: ValidationFailure[],
    passedRules: string[]
  ) {
    const amount = parseFloat(invoice.totalAmount || "0");
    const currency = invoice.currency || "COP";
    
    // Convert to COP for threshold checking if needed
    let copAmount = amount;
    if (currency === "USD") {
      copAmount = amount * 4000; // Approximate USD to COP conversion
    }

    // Check if PO match is required (>5M COP threshold)
    if (copAmount > 5000000) {
      if (poMatches.length === 0) {
        const severity = copAmount > 20000000 ? "Critical" : "Warning";
        if (severity === "Critical") {
          failures.push({
            rule: "po_match",
            severity: "Critical",
            message: VALIDATION_RULES.po_match.errorMessage,
            currentValue: "No Match",
            requiredAction: "Create PO or find matching existing PO"
          });
        } else {
          warnings.push({
            rule: "po_match", 
            severity: "Warning",
            message: "High value invoice should have PO match",
            currentValue: "No Match",
            requiredAction: "Consider creating PO match for better tracking"
          });
        }
        return;
      }

      // Check PO amount matching
      for (const match of poMatches) {
        if (match.purchase_orders) {
          const poAmount = parseFloat(match.purchase_orders.amount);
          const deviation = Math.abs(amount - poAmount) / poAmount;
          
          if (deviation > 0.1) { // 10% deviation threshold
            if (deviation > 0.25) {
              failures.push({
                rule: "po_match",
                severity: "Critical",
                message: `Significant amount mismatch: Invoice ${amount} vs PO ${poAmount}`,
                currentValue: `${(deviation * 100).toFixed(1)}% deviation`,
                requiredAction: "Verify amounts or create amendment"
              });
              return;
            } else {
              warnings.push({
                rule: "po_match",
                severity: "Warning", 
                message: `Amount deviation: Invoice ${amount} vs PO ${poAmount}`,
                currentValue: `${(deviation * 100).toFixed(1)}% deviation`,
                requiredAction: "Review amount discrepancy"
              });
            }
          }
        }
      }
    }

    passedRules.push("po_match");
  }

  private async validateItemClassification(
    lineItemsData: LineItem[],
    failures: ValidationFailure[],
    passedRules: string[]
  ) {
    if (lineItemsData.length === 0) {
      failures.push({
        rule: "item_classification",
        severity: "Critical",
        message: "No line items found for classification",
        currentValue: "No items",
        requiredAction: "Add line items to invoice"
      });
      return;
    }

    // For now, assume items need to be classified
    // In a real implementation, you'd check against a classification table
    const validCategories = VALIDATION_RULES.item_classification.validValues || [];
    let hasUnclassified = false;

    // This would typically check against a line item classifications table
    // For now, we'll simulate checking if items have been classified
    const extractedData = lineItemsData[0] as any; // Assuming classification data is stored somewhere
    
    if (!extractedData.classification || extractedData.classification === "Not Classified") {
      hasUnclassified = true;
    }

    if (hasUnclassified) {
      failures.push({
        rule: "item_classification",
        severity: "Critical",
        message: VALIDATION_RULES.item_classification.errorMessage,
        currentValue: "Not Classified",
        requiredAction: "Classify all line items using AI or manual review"
      });
    } else {
      passedRules.push("item_classification");
    }
  }

  private async validateApprovals(
    invoice: Invoice,
    warnings: ValidationFailure[],
    passedRules: string[]
  ) {
    const amount = parseFloat(invoice.totalAmount || "0");
    const currency = invoice.currency || "COP";
    
    // Convert to COP for approval checking
    let copAmount = amount;
    if (currency === "USD") {
      copAmount = amount * 4000;
    }

    // Determine required approvals
    let requiredApprovals: string[] = [];
    for (const [threshold, approvers] of Object.entries(APPROVAL_REQUIREMENTS)) {
      if (copAmount > parseInt(threshold)) {
        requiredApprovals = approvers;
      }
    }

    if (requiredApprovals.length > 0) {
      warnings.push({
        rule: "approvals",
        severity: "Warning",
        message: `High value invoice requires additional approvals: ${requiredApprovals.join(", ")}`,
        currentValue: "No approvals",
        requiredAction: `Obtain approvals from: ${requiredApprovals.join(", ")}`
      });
    } else {
      passedRules.push("approvals");
    }
  }

  private async validateDuplicates(
    invoice: Invoice,
    failures: ValidationFailure[],
    passedRules: string[]
  ) {
    if (!invoice.invoiceNumber || !invoice.vendorName) {
      return; // Skip if basic data missing
    }

    const duplicates = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.invoiceNumber, invoice.invoiceNumber),
          ne(invoices.id, invoice.id),
          eq(invoices.vendorName, invoice.vendorName)
        )
      );

    if (duplicates.length > 0) {
      failures.push({
        rule: "duplicates",
        severity: "Critical",
        message: `Duplicate invoice number ${invoice.invoiceNumber} found for vendor ${invoice.vendorName}`,
        currentValue: `${duplicates.length} duplicates found`,
        requiredAction: "Verify this is not a duplicate or update invoice number"
      });
    } else {
      passedRules.push("duplicates");
    }
  }

  private async validateTaxId(
    invoice: Invoice,
    failures: ValidationFailure[],
    warnings: ValidationFailure[],
    passedRules: string[]
  ) {
    const extractedData = invoice.extractedData as any;
    const taxId = extractedData?.taxId;

    if (taxId) {
      const rule = VALIDATION_RULES.tax_id;
      if (rule.pattern && !rule.pattern.test(taxId)) {
        warnings.push({
          rule: "tax_id",
          severity: "Warning",
          message: rule.errorMessage,
          currentValue: taxId,
          requiredAction: "Verify tax ID format (should be 9-11 digits for Colombian NIT)"
        });
      } else {
        passedRules.push("tax_id");
      }
    } else {
      passedRules.push("tax_id"); // Not required, so pass if missing
    }
  }

  private async storeValidationResult(invoiceId: number, result: ValidationResult) {
    const validationData: InsertInvoiceValidationResult = {
      invoiceId,
      status: result.status.toLowerCase() as "passed" | "failed" | "warning",
      overallScore: result.overallScore.toString(),
      failures: result.failures,
      warnings: result.warnings,
      passedRules: result.passedRules,
      validatedAt: new Date(),
      autoValidated: true
    };

    await db.insert(invoiceValidationResults).values(validationData);

    // Update invoice validation status
    await db
      .update(invoices)
      .set({
        validationStatus: result.status.toLowerCase() as "passed" | "failed" | "warning",
        validationScore: result.overallScore.toString(),
        validatedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId));
  }
}

// Export validator instance
export const invoiceValidator = new InvoiceValidator();

// Export validation status styles for frontend
export const STATUS_STYLES = {
  "Passed": {
    color: "#28a745",
    icon: "✅",
    badgeClass: "badge-success"
  },
  "Failed": {
    color: "#dc3545", 
    icon: "❌",
    badgeClass: "badge-danger"
  },
  "Warning": {
    color: "#ffc107",
    icon: "⚠️",
    badgeClass: "badge-warning"
  }
};