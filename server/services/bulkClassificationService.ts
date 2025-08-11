import { getDb } from "../storage";
import { invoiceProjectMatches, invoices, lineItems, lineItemClassifications, pettyCashLog } from "@shared/schema";
import { eq, and, gte, lte, isNull, inArray, sql } from "drizzle-orm";
import { ClassificationService } from "./classificationService";
import type { BulkClassifyInvoicesRequest, BulkClassificationResult } from "@shared/schema";

interface ProcessingProgress {
  totalInvoices: number;
  processedInvoices: number;
  currentInvoice?: {
    id: number;
    vendorName: string;
    progress: number;
  };
  status: 'initializing' | 'processing' | 'completed' | 'failed';
  startTime: Date;
  estimatedCompletion?: Date;
}

export class BulkClassificationService {
  private static progressMap = new Map<string, ProcessingProgress>();

  /**
   * Get invoices ready for classification from invoiceProjectMatches table
   * Filters out petty cash invoices and already classified invoices
   */
  static async getInvoicesReadyForClassification(filters?: BulkClassifyInvoicesRequest['filters']) {
    const db = getDb();
    let query = db
      .select({
        invoiceId: invoiceProjectMatches.invoiceId,
        projectId: invoiceProjectMatches.projectId,
        matchScore: invoiceProjectMatches.matchScore,
        invoice: {
          id: invoices.id,
          vendorName: invoices.vendorName,
          invoiceNumber: invoices.invoiceNumber,
          invoiceDate: invoices.invoiceDate,
          totalAmount: invoices.totalAmount,
          fileName: invoices.fileName,
          extractedData: invoices.extractedData,
          ocrText: invoices.ocrText,
        }
      })
      .from(invoiceProjectMatches)
      .innerJoin(invoices, eq(invoiceProjectMatches.invoiceId, invoices.id))
      .leftJoin(pettyCashLog, eq(invoices.id, pettyCashLog.invoiceId))
      .where(
        and(
          eq(invoiceProjectMatches.isActive, true),
          isNull(pettyCashLog.invoiceId), // Exclude petty cash invoices
          eq(invoices.status, 'extracted') // Only process extracted invoices
        )
      );

    // Apply filters
    if (filters?.projectId) {
      query = query.where(and(
        eq(invoiceProjectMatches.isActive, true),
        isNull(pettyCashLog.invoiceId),
        eq(invoices.status, 'extracted'),
        eq(invoiceProjectMatches.projectId, filters.projectId)
      ));
    }

    if (filters?.dateFrom) {
      query = query.where(and(
        eq(invoiceProjectMatches.isActive, true),
        isNull(pettyCashLog.invoiceId),
        eq(invoices.status, 'extracted'),
        gte(invoices.invoiceDate, new Date(filters.dateFrom))
      ));
    }

    if (filters?.dateTo) {
      query = query.where(and(
        eq(invoiceProjectMatches.isActive, true),
        isNull(pettyCashLog.invoiceId),
        eq(invoices.status, 'extracted'),
        lte(invoices.invoiceDate, new Date(filters.dateTo))
      ));
    }

    if (filters?.invoiceIds && filters.invoiceIds.length > 0) {
      query = query.where(and(
        eq(invoiceProjectMatches.isActive, true),
        isNull(pettyCashLog.invoiceId),
        eq(invoices.status, 'extracted'),
        inArray(invoices.id, filters.invoiceIds)
      ));
    }

    const results = await query;
    
    return results.map((result: any) => ({
      invoiceId: result.invoiceId,
      projectId: result.projectId,
      matchScore: result.matchScore,
      vendorName: result.invoice.vendorName,
      invoiceNumber: result.invoice.invoiceNumber,
      invoiceDate: result.invoice.invoiceDate,
      totalAmount: result.invoice.totalAmount,
      fileName: result.invoice.fileName,
      extractedData: result.invoice.extractedData,
      ocrText: result.invoice.ocrText,
    }));
  }

  /**
   * Get line items for specific invoices
   */
  static async getLineItemsForInvoices(invoiceIds: number[]) {
    const db = getDb();
    const results = await db
      .select()
      .from(lineItems)
      .where(inArray(lineItems.invoiceId, invoiceIds));

    return results;
  }

  /**
   * Check if line items already have classifications
   */
  static async getExistingClassifications(lineItemIds: number[]) {
    const db = getDb();
    const results = await db
      .select()
      .from(lineItemClassifications)
      .where(inArray(lineItemClassifications.lineItemId, lineItemIds));

    return results;
  }

  /**
   * Extract line items from invoice data
   */
  static extractLineItemsFromInvoice(invoice: any): Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
    unit?: string;
    rawText?: string;
  }> {
    const lineItemsData = [];

    // Try to get line items from extractedData first
    if (invoice.extractedData?.lineItems && Array.isArray(invoice.extractedData.lineItems)) {
      for (const item of invoice.extractedData.lineItems) {
        if (item.description && item.description.trim()) {
          lineItemsData.push({
            description: item.description,
            quantity: item.quantity ? parseFloat(item.quantity) : undefined,
            unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
            totalPrice: item.totalPrice ? parseFloat(item.totalPrice) : undefined,
            unit: item.unit || undefined,
            rawText: item.rawText || item.description,
          });
        }
      }
    }

    // If no line items in extractedData, try to parse from OCR text
    if (lineItemsData.length === 0 && invoice.ocrText) {
      const lines = invoice.ocrText.split('\n').filter(line => line.trim());
      
      // Simple heuristic to find line items (look for lines with numbers and descriptions)
      for (const line: string of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 5 && /\d/.test(trimmed)) { // Has numbers and reasonable length
          // Skip obvious header/footer lines
          const lowerLine = trimmed.toLowerCase();
          if (!lowerLine.includes('total') && 
              !lowerLine.includes('subtotal') && 
              !lowerLine.includes('tax') && 
              !lowerLine.includes('invoice') &&
              !lowerLine.includes('date') &&
              !lowerLine.includes('vendor')) {
            
            // Try to extract quantity, unit price from the line
            const numberMatches = trimmed.match(/\d+(?:\.\d+)?/g);
            const quantity = numberMatches && numberMatches.length > 0 ? parseFloat(numberMatches[0]) : undefined;
            const unitPrice = numberMatches && numberMatches.length > 1 ? parseFloat(numberMatches[1]) : undefined;
            const totalPrice = numberMatches && numberMatches.length > 2 ? parseFloat(numberMatches[2]) : undefined;

            lineItemsData.push({
              description: trimmed,
              quantity,
              unitPrice,
              totalPrice,
              rawText: trimmed,
            });
          }
        }
      }
    }

    return lineItemsData.slice(0, 50); // Limit to 50 line items per invoice
  }

  /**
   * Process bulk classification with progress tracking
   */
  static async processBulkClassification(
    request: BulkClassifyInvoicesRequest, 
    userId: string,
    sessionId: string = 'default'
  ): Promise<BulkClassificationResult> {
    
    // Initialize progress tracking
    const progress: ProcessingProgress = {
      totalInvoices: 0,
      processedInvoices: 0,
      status: 'initializing',
      startTime: new Date(),
    };
    this.progressMap.set(sessionId, progress);

    try {
      // Get invoices ready for classification
      const readyInvoices = await this.getInvoicesReadyForClassification(request.filters);
      progress.totalInvoices = readyInvoices.length;
      progress.status = 'processing';
      this.progressMap.set(sessionId, progress);

      if (readyInvoices.length === 0) {
        progress.status = 'completed';
        this.progressMap.set(sessionId, progress);
        
        return {
          success: true,
          processed: 0,
          successful: 0,
          failed: 0,
          results: [],
          summary: {
            totalInvoices: 0,
            totalLineItems: 0,
            totalClassifications: 0,
            categoryBreakdown: {},
            averageConfidence: 0,
          }
        };
      }

      const results = [];
      const categoryBreakdown: Record<string, number> = {};
      let totalLineItems = 0;
      let totalClassifications = 0;
      let totalConfidence = 0;
      let successfulClassifications = 0;
      let failedInvoices = 0;

      // Process each invoice
      for (const invoice of readyInvoices) {
        progress.currentInvoice = {
          id: invoice.invoiceId,
          vendorName: invoice.vendorName || 'Unknown Vendor',
          progress: (progress.processedInvoices / progress.totalInvoices) * 100
        };
        this.progressMap.set(sessionId, progress);

        try {
          // Get existing line items for this invoice
          let existingLineItems = await this.getLineItemsForInvoices([invoice.invoiceId]);
          
          // If no line items exist, create them from extracted/OCR data
          if (existingLineItems.length === 0) {
            const extractedLineItems = this.extractLineItemsFromInvoice(invoice);
            
            // Create line items in database
            if (extractedLineItems.length > 0) {
              const db = getDb();
              const newLineItems = await db.insert(lineItems).values(
                extractedLineItems.map((item: any, index: number) => ({
                  invoiceId: invoice.invoiceId,
                  description: item.description,
                  quantity: item.quantity ? item.quantity.toString() : null,
                  unitPrice: item.unitPrice ? item.unitPrice.toString() : null,
                  totalPrice: item.totalPrice ? item.totalPrice.toString() : null,
                  unit: item.unit,
                  rawText: item.rawText,
                  lineNumber: index + 1,
                }))
              ).returning();
              
              existingLineItems = newLineItems;
            }
          }

          totalLineItems += existingLineItems.length;

          // Check for existing classifications
          const existingClassifications = await this.getExistingClassifications(
            existingLineItems.map(item => item.id)
          );

          const existingClassificationMap = new Map(
            existingClassifications.map((c: any) => [c.lineItemId, c])
          );

          let invoiceClassifications = 0;

          // Classify each line item
          for (const lineItem of existingLineItems) {
            // Skip if already classified and not forcing reclassification
            if (existingClassificationMap.has(lineItem.id) && !request.forceReclassify) {
              invoiceClassifications++;
              const existingClassification = existingClassificationMap.get(lineItem.id)!;
              
              // Count in summary
              categoryBreakdown[existingClassification.category] = 
                (categoryBreakdown[existingClassification.category] || 0) + 1;
              
              if (existingClassification.confidence) {
                totalConfidence += parseFloat(existingClassification.confidence);
                successfulClassifications++;
              }
              continue;
            }

            try {
              // Classify the line item using the existing classification service
              const classificationResult = await ClassificationService.classifyLineItemWithAI({
                id: lineItem.id,
                invoiceId: lineItem.invoiceId,
                description: lineItem.description,
                quantity: lineItem.quantity ? parseFloat(lineItem.quantity) : undefined,
                unitPrice: lineItem.unitPrice ? parseFloat(lineItem.unitPrice) : undefined,
                totalPrice: lineItem.totalPrice ? parseFloat(lineItem.totalPrice) : undefined,
                unit: lineItem.unit,
                rawText: lineItem.rawText,
                lineNumber: lineItem.lineNumber,
                createdAt: lineItem.createdAt,
              }, userId);

              // Store the classification
              const classificationData = {
                lineItemId: lineItem.id,
                category: classificationResult.category as any,
                confidence: classificationResult.confidence.toString(),
                method: 'ai' as any,
                reasoning: 'AI-powered bulk classification',
                matchedKeywords: classificationResult.matchedKeyword ? [classificationResult.matchedKeyword] : null,
                originalText: lineItem.description,
                classifiedBy: userId,
              };

              // Delete existing classification if reclassifying
              if (existingClassificationMap.has(lineItem.id)) {
                const db = getDb();
                await db.delete(lineItemClassifications)
                  .where(eq(lineItemClassifications.lineItemId, lineItem.id));
              }

              // Insert new classification
              const db = getDb();
              await db.insert(lineItemClassifications).values(classificationData);

              invoiceClassifications++;
              totalClassifications++;
              
              // Update category breakdown
              categoryBreakdown[classificationResult.category] = 
                (categoryBreakdown[classificationResult.category] || 0) + 1;
              
              totalConfidence += classificationResult.confidence;
              successfulClassifications++;

            } catch (classificationError) {
              console.error(`Failed to classify line item ${lineItem.id}:`, classificationError);
            }
          }

          results.push({
            invoiceId: invoice.invoiceId,
            vendorName: invoice.vendorName || 'Unknown Vendor',
            projectId: invoice.projectId,
            lineItemsCount: existingLineItems.length,
            classificationsCount: invoiceClassifications,
            status: 'success' as const,
          });

        } catch (invoiceError) {
          console.error(`Failed to process invoice ${invoice.invoiceId}:`, invoiceError);
          failedInvoices++;
          
          results.push({
            invoiceId: invoice.invoiceId,
            vendorName: invoice.vendorName || 'Unknown Vendor',
            projectId: invoice.projectId,
            lineItemsCount: 0,
            classificationsCount: 0,
            status: 'failed' as const,
            error: invoiceError instanceof Error ? invoiceError.message : 'Unknown error',
          });
        }

        progress.processedInvoices++;
        this.progressMap.set(sessionId, progress);
      }

      progress.status = 'completed';
      this.progressMap.set(sessionId, progress);

      return {
        success: true,
        processed: readyInvoices.length,
        successful: readyInvoices.length - failedInvoices,
        failed: failedInvoices,
        results,
        summary: {
          totalInvoices: readyInvoices.length,
          totalLineItems,
          totalClassifications,
          categoryBreakdown,
          averageConfidence: successfulClassifications > 0 ? totalConfidence / successfulClassifications : 0,
        }
      };

    } catch (error) {
      console.error('Bulk classification failed:', error);
      progress.status = 'failed';
      this.progressMap.set(sessionId, progress);
      
      throw error;
    }
  }

  /**
   * Get processing progress for a session
   */
  static getProgress(sessionId: string = 'default'): ProcessingProgress | null {
    return this.progressMap.get(sessionId) || null;
  }

  /**
   * Get classification results with pagination
   */
  static async getClassificationResults(
    filters?: BulkClassifyInvoicesRequest['filters'],
    page: number = 1,
    limit: number = 50
  ) {
    const db = getDb();
    const offset = (page - 1) * limit;

    let query = db
      .select({
        classification: lineItemClassifications,
        lineItem: lineItems,
        invoice: {
          id: invoices.id,
          vendorName: invoices.vendorName,
          invoiceNumber: invoices.invoiceNumber,
          invoiceDate: invoices.invoiceDate,
        },
        projectMatch: {
          projectId: invoiceProjectMatches.projectId,
        }
      })
      .from(lineItemClassifications)
      .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .innerJoin(invoices, eq(lineItems.invoiceId, invoices.id))
      .leftJoin(invoiceProjectMatches, and(
        eq(invoiceProjectMatches.invoiceId, invoices.id),
        eq(invoiceProjectMatches.isActive, true)
      ))
      .limit(limit)
      .offset(offset)
      .orderBy(lineItemClassifications.classifiedAt);

    const results = await query;

    // Get total count for pagination
    const totalCount = await db
      .select({ count: lineItemClassifications.id })
      .from(lineItemClassifications)
      .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .innerJoin(invoices, eq(lineItems.invoiceId, invoices.id));

    return {
      results: results.map(r => ({
        id: r.classification.id,
        invoiceId: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        vendorName: r.invoice.vendorName,
        projectId: r.projectMatch?.projectId,
        lineItemDescription: r.lineItem.description,
        category: r.classification.category,
        subcategory: r.classification.subcategory,
        confidence: r.classification.confidence,
        method: r.classification.method,
        reasoning: r.classification.reasoning,
        matchedKeywords: r.classification.matchedKeywords,
        classifiedAt: r.classification.classifiedAt,
        isUserVerified: r.classification.isUserVerified,
      })),
      pagination: {
        page,
        limit,
        total: totalCount.length,
        pages: Math.ceil(totalCount.length / limit),
      }
    };
  }

  /**
   * Get summary statistics for classified line items
   */
  static async getClassificationSummary() {
    const db = getDb();
    const categoryStats = await db
      .select({
        category: lineItemClassifications.category,
        count: lineItemClassifications.id,
      })
      .from(lineItemClassifications);

    const categoryBreakdown: Record<string, number> = {};
    let totalClassifications = 0;
    let totalConfidence = 0;

    for (const stat of categoryStats) {
      categoryBreakdown[stat.category] = (categoryBreakdown[stat.category] || 0) + 1;
      totalClassifications++;
    }

    // Get confidence statistics
    const confidenceStats = await db
      .select({
        confidence: lineItemClassifications.confidence,
      })
      .from(lineItemClassifications)
      .where(isNull(lineItemClassifications.confidence));

    for (const stat of confidenceStats) {
      if (stat.confidence) {
        totalConfidence += parseFloat(stat.confidence);
      }
    }

    return {
      totalClassifications,
      categoryBreakdown,
      averageConfidence: totalClassifications > 0 ? totalConfidence / totalClassifications : 0,
    };
  }
}