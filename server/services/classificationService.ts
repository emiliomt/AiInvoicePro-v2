import { db } from "../db.js";
import {
  lineItems,
  lineItemClassifications,
  classificationKeywords,
} from "../../shared/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import storage from "../storage";

export interface ClassificationResult {
  category:
    | "consumable_materials"
    | "non_consumable_materials"
    | "labor"
    | "tools_equipment";
  matchedKeyword: string | null;
  confidence: number;
  isManualOverride: boolean;
}

export interface LineItem {
  id: number;
  invoiceId: number;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class ClassificationService {
  // Initialize default keywords
  static async initializeDefaultKeywords(): Promise<void> {
    try {
      const defaultKeywords = {
        consumable_materials: [
          "cement",
          "cemento",
          "concrete",
          "concreto",
          "sand",
          "arena",
          "gravel",
          "grava",
          "fuel",
          "combustible",
          "gasoline",
          "gasolina",
          "diesel",
          "oil",
          "aceite",
          "paint",
          "pintura",
          "adhesive",
          "adhesivo",
          "sealant",
          "sellador",
          "wire",
          "cable",
          "alambre",
          "nail",
          "clavo",
          "screw",
          "tornillo",
          "pipe",
          "tuberia",
          "fitting",
          "accesorio",
          "valve",
          "valvula",
        ],
        non_consumable_materials: [
          "equipment",
          "equipo",
          "machinery",
          "maquinaria",
          "tool",
          "herramienta",
          "pump",
          "bomba",
          "generator",
          "generador",
          "compressor",
          "compresor",
          "crane",
          "grua",
          "excavator",
          "excavadora",
          "bulldozer",
          "tractor",
          "vehicle",
          "vehiculo",
          "truck",
          "camion",
          "trailer",
          "remolque",
        ],
        labor: [
          "worker",
          "trabajador",
          "labor",
          "mano de obra",
          "service",
          "servicio",
          "engineer",
          "ingeniero",
          "architect",
          "arquitecto",
          "supervisor",
          "technician",
          "tecnico",
          "operator",
          "operador",
          "driver",
          "conductor",
          "consultant",
          "consultor",
          "contractor",
          "contratista",
        ],
        tools_equipment: [
          "hammer",
          "martillo",
          "drill",
          "taladro",
          "saw",
          "sierra",
          "wrench",
          "llave",
          "pliers",
          "alicates",
          "level",
          "nivel",
          "measuring",
          "medicion",
          "safety",
          "seguridad",
          "helmet",
          "casco",
          "gloves",
          "guantes",
          "boots",
          "botas",
          "harness",
          "arnes",
        ],
      };

      const existingKeywords = await db
        .select()
        .from(classificationKeywords)
        .limit(1);

      if (existingKeywords.length === 0) {
        console.log("🔧 Initializing default classification keywords...");

        for (const [category, keywords] of Object.entries(defaultKeywords)) {
          for (const keyword of keywords) {
            try {
              await db.insert(classificationKeywords).values({
                category: category as any,
                keyword: keyword.toLowerCase(),
                isDefault: true,
                userId: "system",
              });
            } catch (error) {
              if (!error.message?.includes("duplicate key")) {
                console.error(`Error inserting keyword ${keyword}:`, error);
              }
            }
          }
        }

        console.log("✅ Default classification keywords initialized");
      }
    } catch (error) {
      console.error("Error initializing default keywords:", error);
    }
  }

  static async getKeywords(userId?: string): Promise<Record<string, any[]>> {
    try {
      const keywords = await db.select().from(classificationKeywords);

      const keywordsByCategory: Record<string, any[]> = {
        consumable_materials: [],
        non_consumable_materials: [],
        labor: [],
        tools_equipment: [],
      };

      keywords.forEach((keyword) => {
        if (keywordsByCategory[keyword.category]) {
          keywordsByCategory[keyword.category].push(keyword);
        }
      });

      return keywordsByCategory;
    } catch (error) {
      console.error("Error fetching keywords:", error);
      return {
        consumable_materials: [],
        non_consumable_materials: [],
        labor: [],
        tools_equipment: [],
      };
    }
  }

  static async classifyLineItem(
    lineItem: LineItem,
    userId?: string,
  ): Promise<ClassificationResult> {
    try {
      const keywords = await this.getKeywords(userId);
      const description = lineItem.description.toLowerCase();

      const categoryScores: Record<
        string,
        { score: number; matchedKeywords: string[] }
      > = {
        consumable_materials: { score: 0, matchedKeywords: [] },
        non_consumable_materials: { score: 0, matchedKeywords: [] },
        labor: { score: 0, matchedKeywords: [] },
        tools_equipment: { score: 0, matchedKeywords: [] },
      };

      for (const [category, categoryKeywords] of Object.entries(keywords)) {
        for (const keywordObj of categoryKeywords) {
          const keyword = keywordObj.keyword.toLowerCase();

          if (description.includes(keyword)) {
            const score = description === keyword ? 10 : 5;
            categoryScores[category].score += score;
            categoryScores[category].matchedKeywords.push(keyword);
          }
        }
      }

      const bestMatch = Object.entries(categoryScores).reduce(
        (best, [category, data]) => {
          return data.score > best.score ? { category, ...data } : best;
        },
        { category: "consumable_materials", score: 0, matchedKeywords: [] },
      );

      const confidence = Math.min(bestMatch.score / 10, 1.0);

      return {
        category: bestMatch.category as any,
        matchedKeyword:
          bestMatch.matchedKeywords.length > 0
            ? bestMatch.matchedKeywords[0]
            : null,
        confidence: Math.max(confidence, 0.3),
        isManualOverride: false,
      };
    } catch (error) {
      console.error("Classification error:", error);
      return {
        category: "consumable_materials",
        matchedKeyword: null,
        confidence: 0.3,
        isManualOverride: false,
      };
    }
  }

  static async classifyAndStore(
    lineItemId: number,
    userId?: string,
  ): Promise<void> {
    try {
      console.log(`🔍 Classifying line item ${lineItemId}`);

      const lineItemResult = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.id, lineItemId))
        .limit(1);

      if (lineItemResult.length === 0) {
        throw new Error(`Line item ${lineItemId} not found`);
      }

      const lineItem = lineItemResult[0];
      console.log(`📝 Classifying: "${lineItem.description}"`);

      const classification = await this.classifyLineItem(lineItem, userId);
      console.log(
        `📊 Classification result: ${classification.category} (confidence: ${classification.confidence})`,
      );

      const existingClassification = await db
        .select()
        .from(lineItemClassifications)
        .where(eq(lineItemClassifications.lineItemId, lineItemId))
        .limit(1);

      if (existingClassification.length > 0) {
        if (!existingClassification[0].isManualOverride) {
          await db
            .update(lineItemClassifications)
            .set({
              category: classification.category,
              matchedKeyword: classification.matchedKeyword || "unknown",
              method: "keyword",
              confidence: classification.confidence.toString(),
              classifiedAt: new Date(),
              classifiedBy: userId || "system",
            })
            .where(eq(lineItemClassifications.lineItemId, lineItemId));

          console.log(`✅ Updated classification for line item ${lineItemId}`);
        } else {
          console.log(
            `⚠️ Skipped update for line item ${lineItemId} - manually overridden`,
          );
        }
      } else {
        await db.insert(lineItemClassifications).values({
          lineItemId,
          category: classification.category,
          matchedKeyword: classification.matchedKeyword || "unknown",
          method: "keyword",
          confidence: classification.confidence.toString(),
          isManualOverride: false,
          classifiedBy: userId || "system",
        });

        console.log(
          `✅ Created new classification for line item ${lineItemId}`,
        );
      }
    } catch (error) {
      console.error(`❌ Failed to classify line item ${lineItemId}:`, error);
      throw error;
    }
  }

  static async classifyInvoiceLineItems(
    invoiceId: number,
    userId?: string,
  ): Promise<void> {
    try {
      console.log(`🏷️ Classifying line items for invoice ${invoiceId}`);

      const lineItems = await storage.getLineItemsByInvoiceId(invoiceId);

      if (!lineItems || lineItems.length === 0) {
        console.log(`⚠️ No line items found for invoice ${invoiceId}`);
        return;
      }

      console.log(`📊 Found ${lineItems.length} line items to classify`);

      for (const lineItem of lineItems) {
        try {
          await this.classifyAndStore(lineItem.id, userId);
        } catch (error) {
          console.error(
            `❌ Failed to classify line item ${lineItem.id}:`,
            error,
          );
        }
      }

      console.log(`✅ Completed classification for invoice ${invoiceId}`);
    } catch (error) {
      console.error(
        `❌ Failed to classify invoice ${invoiceId} line items:`,
        error,
      );
      throw error;
    }
  }

  static async aiClassifyInvoiceLineItems(
    invoiceId: number,
    userId?: string,
  ): Promise<void> {
    try {
      console.log(`🤖 AI classifying line items for invoice ${invoiceId}`);

      const lineItems = await storage.getLineItemsByInvoiceId(invoiceId);

      if (!lineItems || lineItems.length === 0) {
        console.log(`⚠️ No line items found for invoice ${invoiceId}`);
        return;
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || "",
      });

      for (const lineItem of lineItems) {
        try {
          await this.classifyLineItemWithAI(lineItem, userId, openai);
        } catch (error) {
          console.error(
            `❌ Failed to AI classify line item ${lineItem.id}:`,
            error,
          );
          await this.classifyAndStore(lineItem.id, userId);
        }
      }

      console.log(`✅ Completed AI classification for invoice ${invoiceId}`);
    } catch (error) {
      console.error(`❌ Failed to AI classify invoice ${invoiceId}:`, error);
      throw error;
    }
  }

  static async classifyLineItemWithAI(
    lineItem: LineItem,
    userId?: string,
    openai?: any,
  ): Promise<void> {
    try {
      if (!openai) {
        const OpenAI = (await import("openai")).default;
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      }

      const prompt = `Classify this construction invoice line item into one of these categories:
1. consumable_materials - Materials consumed during construction (cement, fuel, paint, etc.)
2. non_consumable_materials - Durable materials and equipment (machinery, vehicles, etc.)
3. labor - Human resources and services (workers, consultants, etc.)
4. tools_equipment - Tools, safety equipment, measuring instruments, etc.

Line Item: "${lineItem.description}"
Quantity: ${lineItem.quantity || "N/A"}
Unit Price: ${lineItem.unitPrice || "N/A"}
Total: ${lineItem.totalPrice || "N/A"}

Respond with JSON: {"category": "category_name", "confidence": 0.95, "reasoning": "brief explanation"}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert construction invoice classifier.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");

      await db.insert(lineItemClassifications).values({
        lineItemId: lineItem.id,
        category: result.category || "consumable_materials",
        matchedKeyword: "AI Classification",
        method: "ai",
        confidence: (result.confidence || 0.8).toString(),
        isManualOverride: false,
        classifiedBy: userId || "system",
      });

      console.log(
        `🤖 AI classified line item ${lineItem.id}: ${result.category}`,
      );
    } catch (error) {
      console.error(
        `❌ AI classification failed for line item ${lineItem.id}:`,
        error,
      );
      throw error;
    }
  }

  static async classifyAndStoreWithAI(
    lineItemId: number,
    useAI: boolean = false,
    userId?: string,
  ): Promise<void> {
    if (useAI) {
      const lineItemResult = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.id, lineItemId))
        .limit(1);

      if (lineItemResult.length === 0) {
        throw new Error(`Line item ${lineItemId} not found`);
      }

      await this.classifyLineItemWithAI(lineItemResult[0], userId);
    } else {
      await this.classifyAndStore(lineItemId, userId);
    }
  }
}
