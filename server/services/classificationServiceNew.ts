import { getDb } from "../storage";
import { classificationKeywords, lineItemClassifications, lineItems } from "@shared/schema";
import { eq, and, or, like, inArray } from "drizzle-orm";
import type { InsertClassificationKeyword, InsertLineItemClassification, LineItem } from "@shared/schema";

const db = getDb();

export interface ClassificationResult {
  category: string;
  matchedKeywords: string[];
  confidence: number;
  method: 'keyword' | 'ai' | 'fuzzy' | 'context' | 'learned' | 'manual';
  reasoning?: string;
  isManualOverride: boolean;
}

// Default classification keywords aligned with new categories
const DEFAULT_KEYWORDS = {
  materials_supplies: [
    'cement', 'concrete', 'sand', 'gravel', 'steel bars', 'rebar', 'wire', 'nails', 'screws', 'bolts',
    'paint', 'primer', 'adhesive', 'glue', 'sealant', 'caulk', 'tape', 'plastic sheeting', 'lumber',
    'wood', 'plywood', 'drywall', 'insulation', 'roofing material', 'shingles', 'tiles', 'piping',
    'electrical wire', 'conduit', 'fuel', 'gasoline', 'diesel', 'oil', 'grease', 'welding rods',
    'consumables', 'supplies', 'materials', 'aggregate', 'mortar', 'brick', 'block', 'material',
    'materiales', 'suministros', 'cemento', 'arena', 'grava', 'hierro', 'alambre', 'combustible'
  ],
  equipment_tools: [
    'equipment', 'machinery', 'generator', 'compressor', 'pump', 'motor', 'engine', 'transmission',
    'gearbox', 'hydraulic', 'pneumatic', 'electrical panel', 'transformer', 'switch', 'breaker',
    'control system', 'sensor', 'instrument', 'meter', 'gauge', 'valve', 'fitting', 'coupling',
    'bearing', 'seal', 'gasket', 'filter', 'radiator', 'cooler', 'heater', 'fan', 'blower',
    'conveyor', 'crane', 'hoist', 'winch', 'cable', 'chain', 'rope', 'asset', 'capital',
    'drill', 'hammer', 'wrench', 'screwdriver', 'saw', 'grinder', 'welder', 'torch', 'cutter',
    'herramienta', 'equipo', 'maquinaria', 'taladro', 'martillo', 'soldadora'
  ],
  services_labor: [
    'labor', 'labour', 'worker', 'technician', 'engineer', 'operator', 'mechanic', 'electrician',
    'welder', 'supervisor', 'foreman', 'manager', 'inspector', 'consultant', 'contractor',
    'subcontractor', 'service', 'installation', 'maintenance', 'repair', 'overhaul', 'inspection',
    'commissioning', 'testing', 'calibration', 'training', 'hours', 'overtime', 'shift',
    'personnel', 'manpower', 'workforce', 'professional services', 'consulting', 'engineering',
    'servicio', 'mano de obra', 'trabajo', 'instalacion', 'mantenimiento', 'reparacion',
    'consultoria', 'ingenieria', 'horas', 'personal'
  ],
  utilities_facilities: [
    'electricity', 'water', 'gas', 'utilities', 'facility', 'rent', 'lease', 'office',
    'warehouse', 'storage', 'cleaning', 'security', 'insurance', 'property tax',
    'electricidad', 'agua', 'gas', 'servicios publicos', 'alquiler', 'arriendo',
    'oficina', 'bodega', 'limpieza', 'seguridad', 'seguro'
  ],
  food_beverages: [
    'food', 'beverage', 'water', 'coffee', 'lunch', 'meal', 'catering', 'restaurant',
    'comida', 'bebida', 'almuerzo', 'cafe', 'restaurante', 'catering'
  ],
  transportation_logistics: [
    'transport', 'shipping', 'delivery', 'freight', 'logistics', 'truck', 'vehicle',
    'fuel', 'gasoline', 'diesel', 'travel', 'flight', 'hotel',
    'transporte', 'envio', 'entrega', 'vehiculo', 'combustible', 'viaje'
  ],
  technology_software: [
    'software', 'computer', 'laptop', 'tablet', 'phone', 'technology', 'IT', 'internet',
    'website', 'system', 'database', 'cloud', 'subscription', 'license',
    'computador', 'tecnologia', 'sistema', 'licencia', 'suscripcion'
  ],
  marketing_advertising: [
    'marketing', 'advertising', 'promotion', 'branding', 'website', 'social media',
    'mercadeo', 'publicidad', 'promocion', 'marca'
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

  // Classify a line item using keyword matching
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
    const categoryScores: Record<string, { score: number; matchedKeywords: string[] }> = {};
    
    // Initialize all categories
    const allCategories = [
      'materials_supplies', 'equipment_tools', 'services_labor', 'utilities_facilities',
      'food_beverages', 'transportation_logistics', 'technology_software', 'marketing_advertising', 'other'
    ];
    
    allCategories.forEach(cat => {
      categoryScores[cat] = { score: 0, matchedKeywords: [] };
    });

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
    let bestCategory = 'other';
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
      matchedKeywords,
      confidence,
      method: 'keyword',
      isManualOverride: false
    };
  }

  // AI-powered classification using OpenAI
  static async classifyLineItemWithAI(lineItem: LineItem, userId?: string): Promise<ClassificationResult> {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || ""
      });

      // Create a focused prompt for line item classification
      const classificationPrompt = `Classify this invoice line item into one of these categories:
1. materials_supplies - Raw materials, supplies, and consumable items used in construction/operations
2. equipment_tools - Tools, machinery, equipment, and hardware for operations
3. services_labor - Professional services, labor, consulting, and expertise
4. utilities_facilities - Utilities, facility costs, and operational overhead
5. food_beverages - Food, beverages, and related consumables
6. transportation_logistics - Transportation, shipping, logistics, and related services
7. technology_software - Technology, software, digital services, and IT solutions
8. marketing_advertising - Marketing, advertising, promotional materials and services
9. other - Items that don't fit into standard business categories

Line Item Details:
- Description: ${lineItem.description}
- Quantity: ${lineItem.quantity}
- Unit Price: ${lineItem.unitPrice}
- Total Price: ${lineItem.totalPrice}
- Unit: ${lineItem.unit}

Respond with JSON in this format:
{
  "category": "one of the nine categories above",
  "confidence": "0.0-1.0 confidence score",
  "reasoning": "brief explanation of classification decision",
  "matchedKeywords": ["relevant keywords that influenced decision"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert invoice line item classifier. Analyze line items and categorize them accurately based on business standards."
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
        category: aiResult.category || 'other',
        matchedKeywords: aiResult.matchedKeywords || ['AI Classification'],
        confidence: parseFloat(aiResult.confidence || '0.8'),
        method: 'ai',
        reasoning: aiResult.reasoning,
        isManualOverride: false
      };

    } catch (error) {
      console.error('AI classification failed:', error);
      // Fallback to keyword-based classification
      return await this.classifyLineItem(lineItem, userId);
    }
  }

  // Classify and store classification for line item
  static async classifyAndStore(lineItemId: number, useAI: boolean = false, userId?: string): Promise<ClassificationResult> {
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

    const classificationData = {
      lineItemId,
      category: classification.category as any,
      matchedKeywords: classification.matchedKeywords,
      confidence: classification.confidence.toString(),
      method: classification.method as any,
      reasoning: classification.reasoning,
      isManualOverride: false,
      originalText: lineItem[0].description,
      classifiedBy: userId || 'system'
    };

    if (existingClassification.length > 0) {
      // Update existing classification (only if not manually overridden)
      if (!existingClassification[0].isManualOverride) {
        await db
          .update(lineItemClassifications)
          .set({
            ...classificationData,
            classifiedAt: new Date(),
          })
          .where(eq(lineItemClassifications.lineItemId, lineItemId));
      }
    } else {
      // Create new classification
      await db.insert(lineItemClassifications).values(classificationData);
    }

    return classification;
  }

  // Bulk classify line items for an invoice
  static async classifyInvoiceLineItems(invoiceId: number, useAI: boolean = false, userId?: string): Promise<ClassificationResult[]> {
    const invoiceLineItems = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));

    const results: ClassificationResult[] = [];
    for (const lineItem of invoiceLineItems) {
      const result = await this.classifyAndStore(lineItem.id, useAI, userId);
      results.push(result);
    }
    
    return results;
  }

  // Get classifications for an invoice
  static async getInvoiceClassifications(invoiceId: number) {
    return await db
      .select({
        id: lineItemClassifications.id,
        lineItemId: lineItemClassifications.lineItemId,
        description: lineItems.description,
        quantity: lineItems.quantity,
        unitPrice: lineItems.unitPrice,
        totalPrice: lineItems.totalPrice,
        unit: lineItems.unit,
        category: lineItemClassifications.category,
        subcategory: lineItemClassifications.subcategory,
        matchedKeywords: lineItemClassifications.matchedKeywords,
        confidence: lineItemClassifications.confidence,
        method: lineItemClassifications.method,
        reasoning: lineItemClassifications.reasoning,
        isUserVerified: lineItemClassifications.isUserVerified,
        isManualOverride: lineItemClassifications.isManualOverride,
        classifiedAt: lineItemClassifications.classifiedAt,
        classifiedBy: lineItemClassifications.classifiedBy,
      })
      .from(lineItemClassifications)
      .leftJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .where(eq(lineItems.invoiceId, invoiceId));
  }

  // Manual override classification
  static async manualOverride(lineItemId: number, category: string, userId: string): Promise<void> {
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    const overrideData = {
      category: category as any,
      method: 'manual' as any,
      isManualOverride: true,
      matchedKeywords: ['manual override'],
      confidence: '1.00',
      classifiedAt: new Date(),
      classifiedBy: userId
    };

    if (existingClassification.length > 0) {
      await db
        .update(lineItemClassifications)
        .set(overrideData)
        .where(eq(lineItemClassifications.lineItemId, lineItemId));
    } else {
      await db.insert(lineItemClassifications).values({
        lineItemId,
        ...overrideData
      });
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

    const grouped: Record<string, { id: number; keyword: string }[]> = {};
    
    for (const keyword of keywords) {
      if (!grouped[keyword.category]) {
        grouped[keyword.category] = [];
      }
      grouped[keyword.category].push({
        id: keyword.id,
        keyword: keyword.keyword
      });
    }

    return grouped;
  }

  // Get available categories
  static getAvailableCategories() {
    return [
      { value: 'materials_supplies', label: 'Materials & Supplies' },
      { value: 'equipment_tools', label: 'Equipment & Tools' }, 
      { value: 'services_labor', label: 'Services & Labor' },
      { value: 'utilities_facilities', label: 'Utilities & Facilities' },
      { value: 'food_beverages', label: 'Food & Beverages' },
      { value: 'transportation_logistics', label: 'Transportation & Logistics' },
      { value: 'technology_software', label: 'Technology & Software' },
      { value: 'marketing_advertising', label: 'Marketing & Advertising' },
      { value: 'other', label: 'Other' }
    ];
  }

  // Get classification statistics
  static async getClassificationStats(userId?: string) {
    const classifications = await db
      .select()
      .from(lineItemClassifications);

    const stats = {
      total: classifications.length,
      byCategory: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      avgConfidence: 0,
      manualOverrides: 0,
      userVerified: 0
    };

    let totalConfidence = 0;

    classifications.forEach(classification => {
      // Count by category
      stats.byCategory[classification.category] = (stats.byCategory[classification.category] || 0) + 1;
      
      // Count by method
      stats.byMethod[classification.method] = (stats.byMethod[classification.method] || 0) + 1;
      
      // Sum confidence
      totalConfidence += parseFloat(classification.confidence || '0');
      
      // Count manual overrides
      if (classification.isManualOverride) stats.manualOverrides++;
      
      // Count user verified
      if (classification.isUserVerified) stats.userVerified++;
    });

    stats.avgConfidence = stats.total > 0 ? totalConfidence / stats.total : 0;

    return stats;
  }
}