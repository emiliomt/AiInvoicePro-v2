import { getStorage, getDb } from "../storage";
import { classificationKeywords, lineItemClassifications, lineItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { InsertLineItemClassification, LineItem, LineItemClassification } from "@shared/schema";
import { OpenAI } from 'openai';

export interface ClassificationResult {
  category: string;
  subcategory?: string;
  matchedKeywords: string[];
  confidence: number;
  method: 'keyword' | 'ai' | 'fuzzy' | 'context' | 'learned' | 'manual';
  reasoning?: string;
  vendorContext?: string;
  userVerified: boolean;
}

export interface VendorContext {
  name?: string;
  industry?: string;
  businessType?: string;
  typicalCategories?: string[];
  country?: string;
  taxId?: string;
}

export interface InvoiceContext {
  vendorContext: VendorContext;
  invoiceMetadata: Record<string, any>;
  lineItems: LineItem[];
  fullText: string;
  language: string;
}

export interface LineItemData {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

// Enhanced AI-powered line item classifier inspired by your Python code
export class AILineItemClassifier {
  private openaiClient: OpenAI | null = null;
  private fuzzyThreshold = 0.6;

  constructor(openaiApiKey?: string) {
    if (openaiApiKey && typeof openaiApiKey === 'string' && openaiApiKey.trim()) {
      try {
        this.openaiClient = new OpenAI({
          apiKey: openaiApiKey,
        });
      } catch (error) {
        console.warn('Failed to initialize OpenAI client:', error);
      }
    }
  }

  // Default classification keywords matching your Python implementation
  private getDefaultKeywords() {
    return {
      materials_supplies: [
        'cement', 'concrete', 'steel', 'rebar', 'paper', 'pens', 'folders', 
        'hard hat', 'safety vest', 'office supplies', 'construction materials',
        'lumber', 'wood', 'paint', 'nails', 'screws', 'bolts', 'wire'
      ],
      equipment_tools: [
        'power tools', 'machinery', 'computer hardware', 'vehicles', 'furniture',
        'drill', 'hammer', 'saw', 'equipment', 'generator', 'compressor'
      ],
      services_labor: [
        'consulting', 'engineering', 'legal services', 'maintenance', 
        'outsourced labor', 'installation', 'repair', 'professional services',
        'labor', 'technician', 'supervisor', 'contractor'
      ],
      utilities_facilities: [
        'electricity', 'internet', 'rent', 'cleaning', 'security', 
        'telecommunications', 'water', 'gas', 'utilities', 'facility'
      ],
      food_beverages: [
        'coffee', 'meals', 'catering', 'restaurant supplies', 'kitchen items',
        'food', 'beverages', 'drinks'
      ],
      transportation_logistics: [
        'shipping', 'freight', 'courier', 'fuel', 'vehicle maintenance', 
        'logistics', 'transport', 'delivery'
      ],
      technology_software: [
        'software licenses', 'cloud services', 'IT support', 'digital tools',
        'technology', 'software', 'computer', 'system'
      ],
      marketing_advertising: [
        'advertising', 'promotional items', 'marketing services', 'branding',
        'promotion', 'marketing'
      ]
    };
  }

  // Keyword-based classification
  private async classifyWithKeywords(lineItem: LineItemData): Promise<ClassificationResult> {
    const description = lineItem.description.toLowerCase();
    const keywords = this.getDefaultKeywords();
    let bestMatch: ClassificationResult = {
      category: 'other',
      matchedKeywords: [],
      confidence: 0.0,
      method: 'keyword',
      userVerified: false
    };

    for (const [category, categoryKeywords] of Object.entries(keywords)) {
      for (const keyword of categoryKeywords) {
        if (description.includes(keyword.toLowerCase())) {
          const confidence = keyword.length / description.length; // Simple confidence metric
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category,
              matchedKeywords: [keyword],
              confidence: Math.min(confidence, 1.0),
              method: 'keyword',
              reasoning: `Exact keyword match: "${keyword}"`,
              userVerified: false
            };
          }
        }
      }
    }

    return bestMatch;
  }

  // Fuzzy matching classification (simplified implementation)
  private async classifyWithFuzzy(lineItem: LineItemData): Promise<ClassificationResult> {
    const description = lineItem.description.toLowerCase();
    const keywords = this.getDefaultKeywords();
    let bestMatch: ClassificationResult = {
      category: 'other',
      matchedKeywords: [],
      confidence: 0.0,
      method: 'fuzzy',
      userVerified: false
    };

    for (const [category, categoryKeywords] of Object.entries(keywords)) {
      for (const keyword of categoryKeywords) {
        // Simple fuzzy matching - check for partial matches
        const similarity = this.calculateSimilarity(description, keyword.toLowerCase());
        if (similarity >= this.fuzzyThreshold && similarity > bestMatch.confidence) {
          bestMatch = {
            category,
            matchedKeywords: [keyword],
            confidence: similarity,
            method: 'fuzzy',
            reasoning: `Fuzzy matched '${keyword}' (score:${similarity.toFixed(2)})`,
            userVerified: false
          };
        }
      }
    }

    return bestMatch;
  }

  // Simple similarity calculation (Jaccard similarity)
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);
    const intersection = words1Array.filter(x => words2.has(x));
    const union = [...words1Array, ...words2Array.filter(x => !words1.has(x))];
    return intersection.length / union.length;
  }

  // AI-powered classification using OpenAI
  private async classifyWithAI(
    lineItem: LineItemData, 
    context?: InvoiceContext
  ): Promise<ClassificationResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const categories = Object.keys(this.getDefaultKeywords());
    const prompt = this.createAIPrompt(lineItem, categories, context);

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert invoice line item classifier. Analyze the line item and classify it into the most appropriate business category. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse AI response
      const aiResult = JSON.parse(content.trim());
      
      return {
        category: aiResult.category || 'other',
        subcategory: aiResult.subcategory,
        matchedKeywords: aiResult.keywords || [],
        confidence: aiResult.confidence || 0.8,
        method: 'ai',
        reasoning: aiResult.reasoning,
        vendorContext: context?.vendorContext ? JSON.stringify(context.vendorContext) : undefined,
        userVerified: false
      };

    } catch (error) {
      console.error('AI classification failed:', error);
      // Fallback to keyword classification
      return this.classifyWithKeywords(lineItem);
    }
  }

  // Create AI prompt similar to your Python implementation
  private createAIPrompt(
    lineItem: LineItemData, 
    categories: string[], 
    context?: InvoiceContext
  ): string {
    let prompt = `Classify this invoice line item into one of these categories: ${categories.join(', ')}\n\n`;
    
    prompt += `Line Item Details:\n`;
    prompt += `- Description: "${lineItem.description}"\n`;
    if (lineItem.quantity) prompt += `- Quantity: ${lineItem.quantity}\n`;
    if (lineItem.unitPrice) prompt += `- Unit Price: ${lineItem.unitPrice}\n`;
    if (lineItem.totalPrice) prompt += `- Total Price: ${lineItem.totalPrice}\n`;
    if (lineItem.unit) prompt += `- Unit: ${lineItem.unit}\n`;

    if (context?.vendorContext) {
      prompt += `\nVendor Context:\n`;
      if (context.vendorContext.name) prompt += `- Vendor: ${context.vendorContext.name}\n`;
      if (context.vendorContext.industry) prompt += `- Industry: ${context.vendorContext.industry}\n`;
      if (context.vendorContext.businessType) prompt += `- Business Type: ${context.vendorContext.businessType}\n`;
    }

    prompt += `\nRespond with JSON in this format:
{
  "category": "most_appropriate_category",
  "subcategory": "optional_subcategory",
  "keywords": ["relevant", "keywords", "found"],
  "confidence": 0.95,
  "reasoning": "Brief explanation of classification decision"
}`;

    return prompt;
  }

  // Main classification method
  public async classifyLineItem(
    lineItem: LineItemData,
    context?: InvoiceContext,
    preferredMethod?: 'keyword' | 'ai' | 'fuzzy' | 'auto'
  ): Promise<ClassificationResult> {
    const method = preferredMethod || 'auto';

    try {
      // Auto method: try AI first, fallback to keyword/fuzzy
      if (method === 'auto') {
        if (this.openaiClient) {
          try {
            return await this.classifyWithAI(lineItem, context);
          } catch (error) {
            console.warn('AI classification failed, falling back to keyword:', error);
          }
        }
        
        // Try fuzzy matching first, then keyword
        const fuzzyResult = await this.classifyWithFuzzy(lineItem);
        if (fuzzyResult.confidence >= this.fuzzyThreshold) {
          return fuzzyResult;
        }
        
        return await this.classifyWithKeywords(lineItem);
      }

      // Specific method requested
      switch (method) {
        case 'ai':
          return await this.classifyWithAI(lineItem, context);
        case 'fuzzy':
          return await this.classifyWithFuzzy(lineItem);
        case 'keyword':
        default:
          return await this.classifyWithKeywords(lineItem);
      }
    } catch (error) {
      console.error('Classification failed:', error);
      // Ultimate fallback
      return {
        category: 'other',
        matchedKeywords: [],
        confidence: 0.0,
        method: 'keyword',
        reasoning: 'Classification failed, defaulted to other',
        userVerified: false
      };
    }
  }

  // Batch classification
  public async classifyBatch(
    lineItems: LineItemData[],
    context?: InvoiceContext
  ): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    
    for (let i = 0; i < lineItems.length; i++) {
      console.log(`Classifying item ${i + 1}/${lineItems.length}`);
      const result = await this.classifyLineItem(lineItems[i], context);
      results.push(result);
    }

    return results;
  }

  // Store classification result in database
  public async storeClassification(
    lineItemId: number,
    result: ClassificationResult,
    classifiedBy?: string
  ): Promise<void> {
    const classificationData: InsertLineItemClassification = {
      lineItemId,
      category: result.category as any,
      subcategory: result.subcategory,
      matchedKeywords: result.matchedKeywords,
      confidence: result.confidence.toString(),
      method: result.method,
      reasoning: result.reasoning,
      vendorContext: result.vendorContext,
      isUserVerified: result.userVerified,
      isManualOverride: result.method === 'manual',
      classifiedBy
    };

    const db = await getDb();
    await db.insert(lineItemClassifications).values(classificationData);
  }

  // Get stored classification for a line item
  public async getStoredClassification(lineItemId: number): Promise<LineItemClassification | null> {
    const db = await getDb();
    const result = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    return result[0] || null;
  }
}