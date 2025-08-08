import express from "express";
import { z } from "zod";
import { ClassificationService } from "../services/classificationServiceNew";
import { getDb } from "../storage";
import { lineItems, invoices } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = express.Router();
const db = getDb();

// Input validation schemas
const classifyLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
  unit: z.string().optional(),
  rawText: z.string().optional(),
});

const classifyBatchSchema = z.object({
  items: z.array(classifyLineItemSchema),
  useAI: z.boolean().default(false),
});

const manualOverrideSchema = z.object({
  lineItemId: z.number(),
  category: z.string(),
});

const addKeywordSchema = z.object({
  category: z.string(),
  keyword: z.string(),
});

// Initialize default keywords on startup
ClassificationService.initializeDefaultKeywords();

// GET /api/classification/categories - Get available categories
router.get("/categories", async (req, res) => {
  try {
    const categories = ClassificationService.getAvailableCategories();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/classification/classify-single - Classify a single line item
router.post("/classify-single", async (req, res) => {
  try {
    const { description, quantity, unitPrice, totalPrice, unit, rawText } = 
      classifyLineItemSchema.parse(req.body);
    
    const useAI = req.body.useAI === true;
    const userId = req.user?.id;

    // Create a temporary line item object for classification
    const tempLineItem = {
      id: 0,
      invoiceId: 0,
      description,
      quantity: quantity?.toString(),
      unitPrice: unitPrice?.toString(),
      totalPrice: totalPrice?.toString(),
      unit: unit || null,
      rawText: rawText || null,
      lineNumber: null,
      createdAt: new Date(),
    };

    const result = useAI 
      ? await ClassificationService.classifyLineItemWithAI(tempLineItem, userId)
      : await ClassificationService.classifyLineItem(tempLineItem, userId);

    res.json(result);
  } catch (error) {
    console.error("Error classifying line item:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Classification failed" });
    }
  }
});

// POST /api/classification/classify-batch - Classify multiple line items
router.post("/classify-batch", async (req, res) => {
  try {
    const { items, useAI } = classifyBatchSchema.parse(req.body);
    const userId = req.user?.id;

    const results = [];
    for (const item of items) {
      // Create temporary line item object
      const tempLineItem = {
        id: 0,
        invoiceId: 0,
        description: item.description,
        quantity: item.quantity?.toString(),
        unitPrice: item.unitPrice?.toString(),
        totalPrice: item.totalPrice?.toString(),
        unit: item.unit || null,
        rawText: item.rawText || null,
        lineNumber: null,
        createdAt: new Date(),
      };

      const result = useAI 
        ? await ClassificationService.classifyLineItemWithAI(tempLineItem, userId)
        : await ClassificationService.classifyLineItem(tempLineItem, userId);

      results.push({
        ...item,
        classification: result
      });
    }

    res.json(results);
  } catch (error) {
    console.error("Error in batch classification:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Batch classification failed" });
    }
  }
});

// POST /api/classification/classify-invoice/:invoiceId - Classify all line items in an invoice
router.post("/classify-invoice/:invoiceId", async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const useAI = req.body.useAI === true;
    const userId = req.user?.id;

    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice ID" });
    }

    // Check if invoice exists
    const invoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (invoice.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const results = await ClassificationService.classifyInvoiceLineItems(invoiceId, useAI, userId);
    
    res.json({
      invoiceId,
      classificationsCount: results.length,
      results
    });
  } catch (error) {
    console.error("Error classifying invoice line items:", error);
    res.status(500).json({ error: "Failed to classify invoice line items" });
  }
});

// GET /api/classification/invoice/:invoiceId - Get classifications for an invoice
router.get("/invoice/:invoiceId", async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice ID" });
    }

    const classifications = await ClassificationService.getInvoiceClassifications(invoiceId);
    
    res.json(classifications);
  } catch (error) {
    console.error("Error fetching invoice classifications:", error);
    res.status(500).json({ error: "Failed to fetch classifications" });
  }
});

// POST /api/classification/manual-override - Manually override a classification
router.post("/manual-override", async (req, res) => {
  try {
    const { lineItemId, category } = manualOverrideSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User authentication required" });
    }

    await ClassificationService.manualOverride(lineItemId, category, userId);
    
    res.json({ success: true, message: "Classification overridden successfully" });
  } catch (error) {
    console.error("Error in manual override:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to override classification" });
    }
  }
});

// GET /api/classification/keywords - Get user's custom keywords
router.get("/keywords", async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User authentication required" });
    }

    const keywords = await ClassificationService.getUserKeywords(userId);
    
    res.json(keywords);
  } catch (error) {
    console.error("Error fetching user keywords:", error);
    res.status(500).json({ error: "Failed to fetch keywords" });
  }
});

// POST /api/classification/keywords - Add custom keyword
router.post("/keywords", async (req, res) => {
  try {
    const { category, keyword } = addKeywordSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User authentication required" });
    }

    await ClassificationService.addCustomKeyword(category, keyword, userId);
    
    res.json({ success: true, message: "Keyword added successfully" });
  } catch (error) {
    console.error("Error adding keyword:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to add keyword" });
    }
  }
});

// DELETE /api/classification/keywords/:keywordId - Remove custom keyword
router.delete("/keywords/:keywordId", async (req, res) => {
  try {
    const keywordId = parseInt(req.params.keywordId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User authentication required" });
    }

    if (isNaN(keywordId)) {
      return res.status(400).json({ error: "Invalid keyword ID" });
    }

    await ClassificationService.removeCustomKeyword(keywordId, userId);
    
    res.json({ success: true, message: "Keyword removed successfully" });
  } catch (error) {
    console.error("Error removing keyword:", error);
    res.status(500).json({ error: "Failed to remove keyword" });
  }
});

// GET /api/classification/stats - Get classification statistics
router.get("/stats", async (req, res) => {
  try {
    const userId = req.user?.id;
    const stats = await ClassificationService.getClassificationStats(userId);
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching classification stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// POST /api/classification/upload-csv - Process CSV file upload
router.post("/upload-csv", async (req, res) => {
  try {
    // This would handle CSV file upload and processing
    // For now, return a placeholder response
    res.status(501).json({ error: "CSV upload not implemented yet" });
  } catch (error) {
    console.error("Error processing CSV upload:", error);
    res.status(500).json({ error: "Failed to process CSV upload" });
  }
});

export default router;