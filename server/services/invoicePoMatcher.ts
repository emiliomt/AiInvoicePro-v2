
import OpenAI from "openai";
import { Invoice, PurchaseOrder, InsertInvoicePoMatch } from "../../shared/schema.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface POMatchResult {
  purchaseOrder: PurchaseOrder;
  matchScore: number;
  matchDetails: {
    vendorSimilarity: number;
    amountSimilarity: number;
    projectSimilarity: number;
    itemSimilarity: number;
    overallConfidence: number;
    matchedFields: string[];
    reasons: string[];
  };
}

export class InvoicePOMatcherService {
  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 100;
    
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    
    if (maxLength === 0) return 100;
    
    return Math.round(((maxLength - distance) / maxLength) * 100);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Use AI to enhance matching logic with semantic understanding
   */
  private async enhanceMatchingWithAI(
    invoice: Invoice,
    purchaseOrder: PurchaseOrder,
    basicMatch: POMatchResult
  ): Promise<POMatchResult> {
    try {
      const prompt = `
        Analyze the similarity between this invoice and purchase order for better matching:

        Invoice Data:
        - Vendor: ${invoice.vendorName || 'N/A'}
        - Amount: ${invoice.totalAmount || 'N/A'} ${invoice.currency || 'USD'}
        - Invoice Number: ${invoice.invoiceNumber || 'N/A'}
        - Date: ${invoice.invoiceDate || 'N/A'}
        - Project: ${invoice.projectName || (invoice.extractedData as any)?.projectName || 'N/A'}
        - Extracted Items: ${JSON.stringify((invoice.extractedData as any)?.lineItems || [])}

        Purchase Order Data:
        - Vendor: ${purchaseOrder.vendorName}
        - Amount: ${purchaseOrder.amount} ${purchaseOrder.currency}
        - PO ID: ${purchaseOrder.poId}
        - Issue Date: ${purchaseOrder.issueDate}
        - Project ID: ${purchaseOrder.projectId || 'N/A'}
        - Items: ${JSON.stringify(purchaseOrder.items)}

        Current Basic Match Score: ${basicMatch.matchScore}%

        Please analyze and provide:
        1. Enhanced match confidence (0-100)
        2. Specific reasons for the match or mismatch
        3. Consider vendor name variations, amount tolerances, and item similarities
        4. Account for partial matches and business logic

        Respond with JSON in this format:
        {
          "enhancedScore": number,
          "confidence": number,
          "reasons": ["reason1", "reason2"],
          "semanticMatches": ["field1", "field2"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at matching invoices with purchase orders. Analyze semantic similarity and provide accurate matching scores."
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      // Combine AI results with basic matching
      const enhancedMatchDetails = {
        ...basicMatch.matchDetails,
        overallConfidence: Math.max(basicMatch.matchScore, aiResult.enhancedScore || basicMatch.matchScore),
        reasons: [...basicMatch.matchDetails.reasons, ...(aiResult.reasons || [])],
        matchedFields: [...basicMatch.matchDetails.matchedFields, ...(aiResult.semanticMatches || [])]
      };

      return {
        ...basicMatch,
        matchScore: Math.max(basicMatch.matchScore, aiResult.enhancedScore || basicMatch.matchScore),
        matchDetails: enhancedMatchDetails
      };

    } catch (error) {
      console.error("AI matching enhancement failed:", error);
      return basicMatch;
    }
  }

  /**
   * Match invoice with purchase orders using both fuzzy logic and AI
   */
  async matchInvoiceWithPurchaseOrders(
    invoice: Invoice,
    purchaseOrders: PurchaseOrder[]
  ): Promise<POMatchResult[]> {
    const matches: POMatchResult[] = [];

    for (const po of purchaseOrders) {
      // Basic fuzzy matching
      const basicMatch = await this.performBasicMatching(invoice, po);
      
      // Enhance with AI if basic score is promising (>30%)
      let finalMatch = basicMatch;
      if (basicMatch.matchScore > 30) {
        finalMatch = await this.enhanceMatchingWithAI(invoice, po, basicMatch);
      }

      if (finalMatch.matchScore > 0) {
        matches.push(finalMatch);
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  private async performBasicMatching(
    invoice: Invoice,
    purchaseOrder: PurchaseOrder
  ): Promise<POMatchResult> {
    const matchDetails = {
      vendorSimilarity: 0,
      amountSimilarity: 0,
      projectSimilarity: 0,
      itemSimilarity: 0,
      overallConfidence: 0,
      matchedFields: [] as string[],
      reasons: [] as string[]
    };

    // Vendor matching (40% weight)
    if (invoice.vendorName && purchaseOrder.vendorName) {
      matchDetails.vendorSimilarity = this.calculateStringSimilarity(invoice.vendorName, purchaseOrder.vendorName);
      if (matchDetails.vendorSimilarity > 80) {
        matchDetails.matchedFields.push('vendor');
        matchDetails.reasons.push(`Vendor similarity: ${matchDetails.vendorSimilarity}%`);
      }
    }

    // Amount matching (30% weight)
    if (invoice.totalAmount && purchaseOrder.amount) {
      const invoiceAmount = parseFloat(invoice.totalAmount.toString());
      const poAmount = parseFloat(purchaseOrder.amount.toString());
      const amountDifference = Math.abs(invoiceAmount - poAmount) / poAmount;
      matchDetails.amountSimilarity = Math.max(0, Math.round((1 - amountDifference) * 100));
      
      if (amountDifference < 0.1) { // Within 10%
        matchDetails.matchedFields.push('amount');
        matchDetails.reasons.push(`Amount match: ${matchDetails.amountSimilarity}%`);
      }
    }

    // Project matching (20% weight)
    const invoiceProject = invoice.projectName || (invoice.extractedData as any)?.projectName;
    if (invoiceProject && purchaseOrder.projectId) {
      matchDetails.projectSimilarity = this.calculateStringSimilarity(invoiceProject, purchaseOrder.projectId);
      if (matchDetails.projectSimilarity > 70) {
        matchDetails.matchedFields.push('project');
        matchDetails.reasons.push(`Project similarity: ${matchDetails.projectSimilarity}%`);
      }
    }

    // Item matching (10% weight)
    const invoiceItems = (invoice.extractedData as any)?.lineItems || [];
    const poItems = purchaseOrder.items as any[] || [];
    if (invoiceItems.length > 0 && poItems.length > 0) {
      let totalItemSimilarity = 0;
      let matchedItems = 0;

      for (const invoiceItem of invoiceItems) {
        for (const poItem of poItems) {
          const similarity = this.calculateStringSimilarity(
            invoiceItem.description || '',
            poItem.description || ''
          );
          if (similarity > 60) {
            totalItemSimilarity += similarity;
            matchedItems++;
            break;
          }
        }
      }

      if (matchedItems > 0) {
        matchDetails.itemSimilarity = Math.round(totalItemSimilarity / matchedItems);
        if (matchDetails.itemSimilarity > 60) {
          matchDetails.matchedFields.push('items');
          matchDetails.reasons.push(`Item similarity: ${matchDetails.itemSimilarity}%`);
        }
      }
    }

    // Calculate overall match score with weighted importance
    const weights = {
      vendor: 0.4,     // 40% weight
      amount: 0.3,     // 30% weight
      project: 0.2,    // 20% weight
      items: 0.1       // 10% weight
    };

    let weightedScore = 0;
    let totalWeight = 0;

    if (matchDetails.vendorSimilarity > 0) {
      weightedScore += matchDetails.vendorSimilarity * weights.vendor;
      totalWeight += weights.vendor;
    }
    if (matchDetails.amountSimilarity > 0) {
      weightedScore += matchDetails.amountSimilarity * weights.amount;
      totalWeight += weights.amount;
    }
    if (matchDetails.projectSimilarity > 0) {
      weightedScore += matchDetails.projectSimilarity * weights.project;
      totalWeight += weights.project;
    }
    if (matchDetails.itemSimilarity > 0) {
      weightedScore += matchDetails.itemSimilarity * weights.items;
      totalWeight += weights.items;
    }

    const matchScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    matchDetails.overallConfidence = matchScore;

    return {
      purchaseOrder,
      matchScore,
      matchDetails
    };
  }

  /**
   * Create invoice-PO match record
   */
  async createInvoicePOMatch(
    invoiceId: number,
    poMatch: POMatchResult,
    status: 'auto' | 'manual' | 'unresolved' = 'auto'
  ): Promise<InsertInvoicePoMatch> {
    return {
      invoiceId,
      poId: poMatch.purchaseOrder.id,
      matchScore: poMatch.matchScore.toString(),
      status,
      matchDetails: poMatch.matchDetails,
    };
  }
}

export const invoicePOMatcher = new InvoicePOMatcherService();
