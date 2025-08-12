
import { db } from "../storage";
import { classificationKeywords, lineItemClassifications, invoices } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface ClassificationResult {
  lineItem: string;
  category: string;
  subcategory?: string;
  confidence: number;
  matchedKeywords: string[];
}

interface KeywordCategory {
  id: number;
  category: string;
  subcategory?: string;
  keywords: string[];
  description?: string;
}

export class KeywordClassificationService {
  private keywordCache: KeywordCategory[] = [];
  private cacheExpiry = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async loadKeywords(): Promise<void> {
    if (Date.now() < this.cacheExpiry && this.keywordCache.length > 0) {
      return;
    }

    try {
      const keywords = await db.select().from(classificationKeywords)
        .where(eq(classificationKeywords.isActive, true));

      this.keywordCache = keywords.map(k => ({
        id: k.id,
        category: k.category,
        subcategory: k.subcategory || undefined,
        keywords: Array.isArray(k.keywords) ? k.keywords : [],
        description: k.description || undefined,
      }));

      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
    } catch (error) {
      console.error("Error loading classification keywords:", error);
      throw error;
    }
  }

  private normalizeText(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateJaccardSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private findBestMatch(lineItem: string): ClassificationResult | null {
    const normalizedLineItem = this.normalizeText(lineItem);
    let bestMatch: ClassificationResult | null = null;
    let highestScore = 0;

    for (const keywordGroup of this.keywordCache) {
      const matchedKeywords: string[] = [];
      let totalScore = 0;
      let keywordMatches = 0;

      for (const keyword of keywordGroup.keywords) {
        const normalizedKeyword = this.normalizeText(keyword);
        
        // Exact match (highest score)
        if (normalizedLineItem.includes(normalizedKeyword)) {
          matchedKeywords.push(keyword);
          totalScore += 1.0;
          keywordMatches++;
        }
        // Fuzzy match using Jaccard similarity
        else {
          const similarity = this.calculateJaccardSimilarity(normalizedLineItem, normalizedKeyword);
          if (similarity > 0.3) { // Threshold for fuzzy matching
            matchedKeywords.push(keyword);
            totalScore += similarity;
            keywordMatches++;
          }
        }
      }

      if (keywordMatches > 0) {
        const confidence = totalScore / keywordGroup.keywords.length;
        
        if (confidence > highestScore) {
          highestScore = confidence;
          bestMatch = {
            lineItem,
            category: keywordGroup.category,
            subcategory: keywordGroup.subcategory,
            confidence: Math.min(confidence, 1.0),
            matchedKeywords,
          };
        }
      }
    }

    return bestMatch;
  }

  async classifyLineItems(invoiceId: number, lineItems: string[]): Promise<ClassificationResult[]> {
    await this.loadKeywords();

    if (this.keywordCache.length === 0) {
      throw new Error("No classification keywords available. Please add keywords first.");
    }

    const results: ClassificationResult[] = [];

    for (const lineItem of lineItems) {
      if (!lineItem || lineItem.trim() === '') continue;

      const match = this.findBestMatch(lineItem);
      if (match) {
        results.push(match);
      } else {
        // Create unclassified result
        results.push({
          lineItem,
          category: 'unclassified',
          confidence: 0,
          matchedKeywords: [],
        });
      }
    }

    // Save classifications to database
    await this.saveClassifications(invoiceId, results);

    return results;
  }

  private async saveClassifications(invoiceId: number, results: ClassificationResult[]): Promise<void> {
    try {
      // Delete existing classifications for this invoice
      await db.delete(lineItemClassifications)
        .where(eq(lineItemClassifications.invoiceId, invoiceId));

      // Insert new classifications
      if (results.length > 0) {
        const classifications = results.map(result => ({
          invoiceId,
          lineItemDescription: result.lineItem,
          predictedCategory: result.category,
          subcategory: result.subcategory || null,
          confidence: result.confidence,
          matchedKeywords: result.matchedKeywords,
          classificationMethod: 'keyword_matching',
          isVerified: false,
          createdAt: new Date(),
        }));

        await db.insert(lineItemClassifications).values(classifications);
      }
    } catch (error) {
      console.error("Error saving classifications:", error);
      throw error;
    }
  }

  async getClassificationStats(): Promise<{
    totalKeywords: number;
    totalCategories: number;
    keywordsByCategory: Record<string, number>;
  }> {
    await this.loadKeywords();

    const stats = {
      totalKeywords: 0,
      totalCategories: this.keywordCache.length,
      keywordsByCategory: {} as Record<string, number>,
    };

    for (const keywordGroup of this.keywordCache) {
      const categoryKey = keywordGroup.subcategory 
        ? `${keywordGroup.category}.${keywordGroup.subcategory}`
        : keywordGroup.category;
      
      stats.keywordsByCategory[categoryKey] = keywordGroup.keywords.length;
      stats.totalKeywords += keywordGroup.keywords.length;
    }

    return stats;
  }
}

export const keywordClassificationService = new KeywordClassificationService();
