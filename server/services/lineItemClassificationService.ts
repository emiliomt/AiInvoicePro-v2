import { storage } from '../storage';
import { spawn } from 'child_process';
import path from 'path';
import { extractInvoiceData } from './aiService';

export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

export interface ClassificationResult {
  category: string;
  confidence: number;
  method: 'keyword' | 'ai' | 'fuzzy' | 'context' | 'learned' | 'manual';
  subcategory?: string;
  reasoning?: string;
  keywords_matched?: string[];
}

export interface VendorContext {
  vendorName?: string;
  industry?: string;
  businessType?: string;
}

class LineItemClassificationService {
  private pythonClassifierPath: string;

  constructor() {
    this.pythonClassifierPath = path.join(process.cwd(), 'server', 'services', 'lineItemClassifier.py');
  }

  /**
   * Classify a single line item using the Python classifier
   */
  async classifyLineItem(lineItem: LineItem, vendorContext?: VendorContext): Promise<ClassificationResult> {
    try {
      // Try Python classifier first
      const pythonResult = await this.classifyWithPython([lineItem], vendorContext);
      if (pythonResult && pythonResult.length > 0) {
        return pythonResult[0];
      }
    } catch (error) {
      console.warn('Python classifier failed, falling back to keyword classification:', error);
    }

    // Fallback to keyword-based classification
    return this.classifyWithKeywords(lineItem);
  }

  /**
   * Classify multiple line items in batch
   */
  async classifyBatch(lineItems: LineItem[], vendorContext?: VendorContext): Promise<ClassificationResult[]> {
    try {
      // Try Python classifier first
      const pythonResults = await this.classifyWithPython(lineItems, vendorContext);
      if (pythonResults && pythonResults.length === lineItems.length) {
        return pythonResults;
      }
    } catch (error) {
      console.warn('Python batch classifier failed, falling back to keyword classification:', error);
    }

    // Fallback to keyword-based classification for each item
    const results: ClassificationResult[] = [];
    for (const item of lineItems) {
      results.push(await this.classifyWithKeywords(item));
    }
    return results;
  }

  /**
   * Call Python classifier service
   */
  private async classifyWithPython(lineItems: LineItem[], vendorContext?: VendorContext): Promise<ClassificationResult[]> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [this.pythonClassifierPath, '--classify']);
      
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const results = JSON.parse(stdout);
            resolve(results);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python classifier output: ${parseError}`));
          }
        } else {
          reject(new Error(`Python classifier failed with code ${code}: ${stderr}`));
        }
      });

      // Send input data to Python process
      const inputData = {
        line_items: lineItems,
        vendor_context: vendorContext || {}
      };
      
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();
    });
  }

  /**
   * Keyword-based classification fallback
   */
  private async classifyWithKeywords(lineItem: LineItem): Promise<ClassificationResult> {
    try {
      // Get keywords from database
      const keywords = await storage.getClassificationKeywords();
      
      const description = lineItem.description.toLowerCase();
      let bestMatch: ClassificationResult = {
        category: 'other',
        confidence: 0.1,
        method: 'keyword',
        reasoning: 'No matching keywords found'
      };

      // Check each category for keyword matches
      for (const keyword of keywords) {
        if (description.includes(keyword.keyword.toLowerCase())) {
          const confidence = this.calculateKeywordConfidence(keyword.keyword, description);
          
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category: keyword.category,
              confidence,
              method: 'keyword',
              keywords_matched: [keyword.keyword],
              reasoning: `Matched keyword: "${keyword.keyword}"`
            };
          }
        }
      }

      return bestMatch;
    } catch (error) {
      console.error('Keyword classification error:', error);
      return {
        category: 'other',
        confidence: 0.05,
        method: 'keyword',
        reasoning: 'Classification failed'
      };
    }
  }

  /**
   * Calculate confidence score for keyword matches
   */
  private calculateKeywordConfidence(keyword: string, description: string): number {
    const keywordLength = keyword.length;
    const descriptionLength = description.length;
    
    // Base confidence based on keyword match
    let confidence = 0.6;
    
    // Boost confidence for longer, more specific keywords
    if (keywordLength > 10) confidence += 0.2;
    else if (keywordLength > 5) confidence += 0.1;
    
    // Boost if keyword appears multiple times
    const matches = (description.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
    if (matches > 1) confidence += 0.1;
    
    // Boost if keyword is a significant portion of the description
    const ratio = keywordLength / descriptionLength;
    if (ratio > 0.3) confidence += 0.1;
    
    return Math.min(confidence, 0.95); // Cap at 95%
  }

  /**
   * Get available classification categories
   */
  async getCategories(): Promise<Record<string, string>> {
    return {
      materials_supplies: "Raw materials, supplies, and consumable items",
      equipment_tools: "Tools, machinery, equipment, and hardware for operations", 
      services_labor: "Professional services, labor, consulting, and expertise",
      utilities_facilities: "Utilities, facility costs, and operational overhead",
      food_beverages: "Food, beverages, and related consumables",
      transportation_logistics: "Transportation, shipping, logistics, and related services",
      technology_software: "Technology, software, digital services, and IT solutions",
      marketing_advertising: "Marketing, advertising, promotional materials and services",
      other: "Items that don't fit into standard business categories",
      consumable_materials: "Materials that are consumed during production",
      non_consumable_materials: "Durable materials that are not consumed",
      labor: "Direct and indirect labor costs",
      tools_equipment: "Tools and equipment for operations"
    };
  }

  /**
   * Store classification result in database
   */
  async storeClassification(
    invoiceId: number,
    lineItemIndex: number,
    lineItem: LineItem,
    result: ClassificationResult
  ): Promise<void> {
    try {
      await storage.createLineItemClassification({
        invoiceId,
        lineItemIndex,
        description: lineItem.description,
        category: result.category as any,
        confidence: result.confidence,
        method: result.method as any,
        subcategory: result.subcategory,
        reasoning: result.reasoning,
        keywordsMatched: result.keywords_matched || [],
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        totalPrice: lineItem.totalPrice,
        unit: lineItem.unit,
        rawText: lineItem.rawText
      });
    } catch (error) {
      console.error('Error storing classification:', error);
      throw error;
    }
  }

  /**
   * Get classification history for an invoice
   */
  async getInvoiceClassifications(invoiceId: number) {
    try {
      return await storage.getLineItemClassificationsByInvoice(invoiceId);
    } catch (error) {
      console.error('Error fetching invoice classifications:', error);
      throw error;
    }
  }

  /**
   * Update classification result
   */
  async updateClassification(
    classificationId: number,
    updates: Partial<ClassificationResult>
  ): Promise<void> {
    try {
      await storage.updateLineItemClassification(classificationId, {
        category: updates.category as any,
        confidence: updates.confidence,
        method: updates.method as any,
        subcategory: updates.subcategory,
        reasoning: updates.reasoning,
        keywordsMatched: updates.keywords_matched || []
      });
    } catch (error) {
      console.error('Error updating classification:', error);
      throw error;
    }
  }
}

export const lineItemClassificationService = new LineItemClassificationService();