
import { db } from "../db";
import { classificationKeywords, lineItemClassifications, lineItems } from "@shared/schema";
import { eq, and, or, like, inArray } from "drizzle-orm";
import type { InsertClassificationKeyword, InsertLineItemClassification, LineItem } from "@shared/schema";

export interface ClassificationResult {
  category: string;
  matchedKeyword: string | null;
  confidence: number;
  isManualOverride: boolean;
}

// Default classification keywords
const DEFAULT_KEYWORDS = {
  consumable_materials: [
    'cement', 'concrete', 'sand', 'gravel', 'steel bars', 'rebar', 'wire', 'nails', 'screws', 'bolts',
    'paint', 'primer', 'adhesive', 'glue', 'sealant', 'caulk', 'tape', 'plastic sheeting', 'lumber',
    'wood', 'plywood', 'drywall', 'insulation', 'roofing material', 'shingles', 'tiles', 'piping',
    'electrical wire', 'conduit', 'fuel', 'gasoline', 'diesel', 'oil', 'grease', 'welding rods',
    'consumables', 'supplies', 'materials', 'aggregate', 'mortar', 'brick', 'block'
  ],
  non_consumable_materials: [
    'equipment', 'machinery', 'generator', 'compressor', 'pump', 'motor', 'engine', 'transmission',
    'gearbox', 'hydraulic', 'pneumatic', 'electrical panel', 'transformer', 'switch', 'breaker',
    'control system', 'sensor', 'instrument', 'meter', 'gauge', 'valve', 'fitting', 'coupling',
    'bearing', 'seal', 'gasket', 'filter', 'radiator', 'cooler', 'heater', 'fan', 'blower',
    'conveyor', 'crane', 'hoist', 'winch', 'cable', 'chain', 'rope', 'asset', 'capital'
  ],
  labor: [
    'labor', 'labour', 'worker', 'technician', 'engineer', 'operator', 'mechanic', 'electrician',
    'welder', 'supervisor', 'foreman', 'manager', 'inspector', 'consultant', 'contractor',
    'subcontractor', 'service', 'installation', 'maintenance', 'repair', 'overhaul', 'inspection',
    'commissioning', 'testing', 'calibration', 'training', 'hours', 'overtime', 'shift',
    'personnel', 'manpower', 'workforce', 'professional services', 'consulting', 'engineering'
  ],
  tools_equipment: [
    'drill', 'hammer', 'wrench', 'screwdriver', 'saw', 'grinder', 'welder', 'torch', 'cutter',
    'pliers', 'clamp', 'vise', 'level', 'measure', 'ruler', 'caliper', 'multimeter', 'tester',
    'oscilloscope', 'analyzer', 'scanner', 'camera', 'computer', 'laptop', 'tablet', 'software',
    'tool', 'toolkit', 'toolbox', 'scaffolding', 'ladder', 'platform', 'safety equipment',
    'protective gear', 'helmet', 'harness', 'gloves', 'boots', 'glasses', 'respirator', 'mask'
  ]
};

export class ClassificationService {
  
  // Initialize default keywords in database
  static async initializeDefaultKeywords(): Promise<void> {
    try {
      // Check if defaults already exist
      const existingDefaults = await db
        .select()
        .from(classificationKeywords)
        .where(eq(classificationKeywords.isDefault, true))
        .limit(1);

      if (existingDefaults.length > 0) {
        return; // Defaults already initialized
      }

      // Insert default keywords
      const defaultKeywordEntries: InsertClassificationKeyword[] = [];
      
      for (const [category, keywords] of Object.entries(DEFAULT_KEYWORDS)) {
        for (const keyword of keywords) {
          defaultKeywordEntries.push({
            category: category as any,
            keyword: keyword.toLowerCase(),
            isDefault: true,
            userId: null,
          });
        }
      }

      await db.insert(classificationKeywords).values(defaultKeywordEntries);
      console.log('Default classification keywords initialized');
    } catch (error) {
      console.error('Error initializing default keywords:', error);
    }
  }

  // Get all keywords for a category
  static async getKeywordsByCategory(category: string, userId?: string): Promise<string[]> {
    const conditions = [eq(classificationKeywords.category, category as any)];
    
    if (userId) {
      const userCondition = or(
        eq(classificationKeywords.isDefault, true),
        eq(classificationKeywords.userId, userId)
      );
      if (userCondition) {
        conditions.push(userCondition);
      }
    } else {
      conditions.push(eq(classificationKeywords.isDefault, true));
    }

    const keywords = await db
      .select()
      .from(classificationKeywords)
      .where(and(...conditions));

    return keywords.map(k => k.keyword);
  }

  // Classify a line item
  static async classifyLineItem(lineItem: LineItem, userId?: string): Promise<ClassificationResult> {
    const description = lineItem.description.toLowerCase();
    
    // Get all keywords
    const allKeywords = await db
      .select()
      .from(classificationKeywords)
      .where(
        userId 
          ? or(
              eq(classificationKeywords.isDefault, true),
              eq(classificationKeywords.userId, userId)
            )
          : eq(classificationKeywords.isDefault, true)
      );

    // Score each category
    const categoryScores: Record<string, { score: number; matchedKeywords: string[] }> = {
      consumable_materials: { score: 0, matchedKeywords: [] },
      non_consumable_materials: { score: 0, matchedKeywords: [] },
      labor: { score: 0, matchedKeywords: [] },
      tools_equipment: { score: 0, matchedKeywords: [] }
    };

    // Check for keyword matches
    for (const keywordEntry of allKeywords) {
      const keyword = keywordEntry.keyword.toLowerCase();
      if (description.includes(keyword)) {
        const category = keywordEntry.category;
        // Weight longer keywords higher
        const weight = keyword.length > 3 ? 2 : 1;
        categoryScores[category].score += weight;
        categoryScores[category].matchedKeywords.push(keyword);
      }
    }

    // Find best category
    let bestCategory = 'consumable_materials';
    let bestScore = 0;
    let matchedKeywords: string[] = [];

    for (const [category, data] of Object.entries(categoryScores)) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestCategory = category;
        matchedKeywords = data.matchedKeywords;
      }
    }

    // Calculate confidence based on score and number of matches
    const confidence = Math.min(bestScore / 10, 1); // Cap at 1.0

    return {
      category: bestCategory,
      matchedKeyword: matchedKeywords.length > 0 ? matchedKeywords[0] : null,
      confidence,
      isManualOverride: false
    };
  }

  // Classify and store classification for line item
  static async classifyAndStore(lineItemId: number, userId?: string): Promise<void> {
    // Get line item
    const lineItem = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.id, lineItemId))
      .limit(1);

    if (lineItem.length === 0) {
      throw new Error('Line item not found');
    }

    const classification = await this.classifyLineItem(lineItem[0], userId);

    // Check if classification already exists
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    if (existingClassification.length > 0) {
      // Update existing classification (only if not manually overridden)
      if (!existingClassification[0].isManualOverride) {
        await db
          .update(lineItemClassifications)
          .set({
            category: classification.category as any,
            matchedKeyword: classification.matchedKeyword,
            confidence: classification.confidence.toString(),
            classifiedAt: new Date(),
            classifiedBy: userId || 'system'
          })
          .where(eq(lineItemClassifications.lineItemId, lineItemId));
      }
    } else {
      // Create new classification
      await db.insert(lineItemClassifications).values({
        lineItemId,
        category: classification.category as any,
        matchedKeyword: classification.matchedKeyword,
        confidence: classification.confidence.toString(),
        isManualOverride: false,
        classifiedBy: userId || 'system'
      });
    }
  }

  // Bulk classify line items for an invoice
  static async classifyInvoiceLineItems(invoiceId: number, userId?: string): Promise<void> {
    const invoiceLineItems = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));

    for (const lineItem of invoiceLineItems) {
      await this.classifyAndStore(lineItem.id, userId);
    }
  }

  // Add custom keyword
  static async addCustomKeyword(category: string, keyword: string, userId: string): Promise<void> {
    await db.insert(classificationKeywords).values({
      category: category as any,
      keyword: keyword.toLowerCase().trim(),
      isDefault: false,
      userId
    });
  }

  // Remove custom keyword
  static async removeCustomKeyword(keywordId: number, userId: string): Promise<void> {
    await db
      .delete(classificationKeywords)
      .where(
        and(
          eq(classificationKeywords.id, keywordId),
          eq(classificationKeywords.userId, userId),
          eq(classificationKeywords.isDefault, false)
        )
      );
  }

  // Get user's custom keywords
  static async getUserKeywords(userId: string): Promise<Record<string, { id: number; keyword: string }[]>> {
    const keywords = await db
      .select()
      .from(classificationKeywords)
      .where(eq(classificationKeywords.userId, userId));

    const grouped: Record<string, { id: number; keyword: string }[]> = {
      consumable_materials: [],
      non_consumable_materials: [],
      labor: [],
      tools_equipment: []
    };

    for (const keyword of keywords) {
      grouped[keyword.category].push({
        id: keyword.id,
        keyword: keyword.keyword
      });
    }

    return grouped;
  }

  // Manual override classification
  static async manualOverride(lineItemId: number, category: string, userId: string): Promise<void> {
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    if (existingClassification.length > 0) {
      await db
        .update(lineItemClassifications)
        .set({
          category: category as any,
          isManualOverride: true,
          matchedKeyword: 'manual override',
          confidence: '1.00',
          classifiedAt: new Date(),
          classifiedBy: userId
        })
        .where(eq(lineItemClassifications.lineItemId, lineItemId));
    } else {
      await db.insert(lineItemClassifications).values({
        lineItemId,
        category: category as any,
        isManualOverride: true,
        matchedKeyword: 'manual override',
        confidence: '1.00',
        classifiedBy: userId
      });
    }
  }

  // Re-classify all line items when keywords are updated
  static async reclassifyAllLineItems(userId?: string): Promise<void> {
    const allLineItems = await db.select().from(lineItems);
    
    for (const lineItem of allLineItems) {
      await this.classifyAndStore(lineItem.id, userId);
    }
  }

  // AI-powered classification using OpenAI
  static async classifyLineItemWithAI(lineItem: LineItem, userId?: string): Promise<ClassificationResult> {
    try {
      const { extractInvoiceData } = await import('./aiService');
      
      // Create a focused prompt for line item classification
      const classificationPrompt = `Classify this invoice line item into one of these categories:
1. consumable_materials - Materials that are used up during construction/operations (cement, sand, fuel, etc.)
2. non_consumable_materials - Durable materials and equipment that are reusable (machinery, tools, equipment)
3. labor - Human resources and professional services (workers, consultants, services)
4. tools_equipment - Tools, machinery, and equipment for construction

Line Item Details:
- Description: ${lineItem.description}
- Quantity: ${lineItem.quantity}
- Unit Price: ${lineItem.unitPrice}
- Total Price: ${lineItem.totalPrice}

Respond with JSON in this format:
{
  "category": "one of the four categories above",
  "confidence": "0.0-1.0 confidence score",
  "reasoning": "brief explanation of classification decision",
  "matchedKeywords": ["relevant keywords that influenced decision"]
}`;

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
      });

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert construction invoice line item classifier. Analyze line items and categorize them accurately based on construction industry standards."
          },
          {
            role: "user",
            content: classificationPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 500
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        category: aiResult.category || 'consumable_materials',
        matchedKeyword: aiResult.matchedKeywords?.[0] || 'AI Classification',
        confidence: parseFloat(aiResult.confidence || '0.8'),
        isManualOverride: false
      };

    } catch (error) {
      console.error('AI classification failed:', error);
      // Fallback to keyword-based classification
      return await this.classifyLineItem(lineItem, userId);
    }
  }

  // Classify and store with AI option
  static async classifyAndStoreWithAI(lineItemId: number, useAI: boolean = false, userId?: string): Promise<void> {
    // Get line item
    const lineItem = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.id, lineItemId))
      .limit(1);

    if (lineItem.length === 0) {
      throw new Error('Line item not found');
    }

    const classification = useAI 
      ? await this.classifyLineItemWithAI(lineItem[0], userId)
      : await this.classifyLineItem(lineItem[0], userId);

    // Check if classification already exists
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    if (existingClassification.length > 0) {
      // Update existing classification (only if not manually overridden)
      if (!existingClassification[0].isManualOverride) {
        await db
          .update(lineItemClassifications)
          .set({
            category: classification.category as any,
            matchedKeyword: classification.matchedKeyword,
            confidence: classification.confidence.toString(),
            classifiedAt: new Date(),
            classifiedBy: userId || 'system'
          })
          .where(eq(lineItemClassifications.lineItemId, lineItemId));
      }
    } else {
      // Create new classification
      await db.insert(lineItemClassifications).values({
        lineItemId,
        category: classification.category as any,
        matchedKeyword: classification.matchedKeyword,
        confidence: classification.confidence.toString(),
        isManualOverride: false,
        classifiedBy: userId || 'system'
      });
    }
  }

  // Bulk AI classify line items for an invoice
  static async aiClassifyInvoiceLineItems(invoiceId: number, userId?: string): Promise<void> {
    const invoiceLineItems = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));

    for (const lineItem of invoiceLineItems) {
      await this.classifyAndStoreWithAI(lineItem.id, true, userId);
    }
  }
}
