import { db } from "../db";
import { predictiveAlerts, invoices } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Invoice, LineItem, InsertPredictiveAlert } from "@shared/schema";

export interface PredictiveIssue {
  prediction: string;
  confidence: number;
  alertType: string;
  details?: any;
}

export async function predictInvoiceIssues(
  invoice: Invoice,
  lineItems: LineItem[]
): Promise<PredictiveIssue[]> {
  const predictions: PredictiveIssue[] = [];

  // Mock predictions for now - will be replaced with ML model
  const invoiceAmount = parseFloat(invoice.totalAmount || "0");
  
  // Duplicate vendor prediction
  if (invoice.vendorName) {
    const vendorHistory = await db
      .select()
      .from(invoices)
      .where(eq(invoices.vendorName, invoice.vendorName))
      .limit(10);
    
    if (vendorHistory.length > 5) {
      predictions.push({
        prediction: "Possible duplicate vendor invoice",
        confidence: 0.87,
        alertType: "duplicate_risk",
        details: {
          vendorName: invoice.vendorName,
          historicalCount: vendorHistory.length
        }
      });
    }
  }

  // High amount prediction
  if (invoiceAmount > 15000) {
    predictions.push({
      prediction: "High-value invoice requires additional approval",
      confidence: 0.95,
      alertType: "approval_required",
      details: {
        amount: invoiceAmount,
        threshold: 15000
      }
    });
  }

  // Invoice date anomaly
  if (invoice.invoiceDate) {
    const invoiceDate = new Date(invoice.invoiceDate);
    const currentDate = new Date();
    const daysDiff = Math.abs((currentDate.getTime() - invoiceDate.getTime()) / (1000 * 3600 * 24));
    
    if (daysDiff > 90) {
      predictions.push({
        prediction: "Invoice date is unusually old",
        confidence: 0.73,
        alertType: "date_anomaly",
        details: {
          invoiceDate: invoice.invoiceDate,
          daysDifference: daysDiff
        }
      });
    }
  }

  // Line item quantity anomaly
  const unusualQuantities = lineItems.filter(item => {
    const qty = parseFloat(item.quantity || "0");
    return qty > 1000 || qty === 0;
  });

  if (unusualQuantities.length > 0) {
    predictions.push({
      prediction: "Unusual quantities detected in line items",
      confidence: 0.64,
      alertType: "quantity_anomaly",
      details: {
        unusualItems: unusualQuantities.length,
        items: unusualQuantities.map(item => ({
          description: item.description,
          quantity: item.quantity
        }))
      }
    });
  }

  // Vendor name pattern matching
  if (invoice.vendorName && /\d{3,}/.test(invoice.vendorName)) {
    predictions.push({
      prediction: "Vendor name contains unusual number pattern",
      confidence: 0.42,
      alertType: "vendor_anomaly",
      details: {
        vendorName: invoice.vendorName,
        pattern: "contains_numbers"
      }
    });
  }

  return predictions;
}

export async function storePredictiveAlerts(
  invoiceId: number,
  predictions: PredictiveIssue[]
): Promise<void> {
  if (predictions.length === 0) return;

  const alerts: InsertPredictiveAlert[] = predictions.map(pred => ({
    invoiceId,
    prediction: pred.prediction,
    confidence: pred.confidence.toString(),
    alertType: pred.alertType,
    details: pred.details
  }));

  await db.insert(predictiveAlerts).values(alerts);
}

export async function getPredictiveAlerts(invoiceId: number) {
  return await db
    .select()
    .from(predictiveAlerts)
    .where(eq(predictiveAlerts.invoiceId, invoiceId));
}

export async function getTopIssuesThisMonth() {
  // Mock data for top issues - will be replaced with actual analytics
  return [
    {
      issueType: "Amount Mismatch",
      count: 23,
      severity: "high",
      trend: "+15%"
    },
    {
      issueType: "Missing PO Match",
      count: 18,
      severity: "medium", 
      trend: "-8%"
    },
    {
      issueType: "Duplicate Invoice",
      count: 12,
      severity: "high",
      trend: "+5%"
    },
    {
      issueType: "Tax ID Mismatch",
      count: 9,
      severity: "medium",
      trend: "-12%"
    },
    {
      issueType: "Date Anomaly",
      count: 7,
      severity: "low",
      trend: "0%"
    }
  ];
}