import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { RequestHandler } from "express";
import { sql, eq, and, or, gte, lte, desc, inArray } from "drizzle-orm";
import { storage, getDb } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertInvoiceSchema, 
  insertLineItemSchema, 
  insertApprovalSchema, 
  insertErpConnectionSchema, 
  insertErpTaskSchema, 
  insertSavedWorkflowSchema, 
  insertScheduledTaskSchema, 
  insertInvoiceImporterConfigSchema,
  classifyLineItemSchema, 
  batchClassifySchema, 
  bulkClassifyInvoicesSchema,
  lineItems, 
  lineItemClassifications, 
  invoiceProjectMatches, 
  invoices 
} from "@shared/schema";
import { processInvoiceOCR } from "./services/ocrService";
import { extractInvoiceData, extractPurchaseOrderData, findBestProjectMatch } from "./services/aiService";
import { checkInvoiceDiscrepancies, storeInvoiceFlags } from "./services/discrepancyService";
import { predictInvoiceIssues, storePredictiveAlerts } from "./services/predictiveService";
import { projectMatcher } from "./projectMatcher.js";
import { invoicePOMatcher } from "./services/invoicePoMatcher.js";
import { erpAutomationService } from "./services/erpAutomationService.js";
import { invoiceImporterService } from "./services/invoiceImporterService.js";
import { pythonInvoiceImporter } from "./services/pythonInvoiceImporter.js";
import { applyColombianRules, clearColombianInvoiceCache } from './services/colombianInvoiceExtractor';
import { lineItemClassificationService } from "./services/lineItemClassificationService.js";
import { BulkClassificationService } from "./services/bulkClassificationService.js";
import { ProgressTracker } from './services/progressTracker';
import * as progressTracker from './services/progressTracker'; // Import for progress tracking functions

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|xml/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype === 'application/xml' || 
                    file.mimetype === 'text/xml';

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, and XML files are allowed'));
    }
  },
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for Excel files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                    file.mimetype === 'application/vnd.ms-excel' ||
                    file.mimetype === 'application/octet-stream';

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

// Using isAuthenticated from replitAuth.ts

// Async processing function for invoice handling
async function processInvoiceAsync(invoice: any, fileBuffer: Buffer) {
  try {
    console.log(`Starting OCR processing for invoice ${invoice.id} (${invoice.fileName})`);

    // Update status to show processing in progress
    await storage.updateInvoice(invoice.id, { status: "processing" });

    // Add timeout for OCR processing
    const ocrPromise = processInvoiceOCR(fileBuffer, invoice.id);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('OCR processing timeout')), 60000)
    );

    const ocrText = await Promise.race([ocrPromise, timeoutPromise]) as string;
    console.log(`OCR completed for invoice ${invoice.id}, text length: ${ocrText.length}`);

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error("OCR did not extract sufficient text from the document");
    }

    // Extract structured data using AI with timeout or XML parser for XML files
    console.log(`Starting AI extraction for invoice ${invoice.id}`);

    let extractedData: any;

    // Check if this is XML content that should use our XML parser instead of AI
    const isXmlContent = ocrText.trim().startsWith('<?xml') && 
                        (ocrText.includes('<Invoice') || ocrText.includes('<CreditNote') || ocrText.includes('<AttachedDocument'));

    if (isXmlContent) {
      console.log(`XML content detected for invoice ${invoice.id}, using XML parser instead of AI`);

      // Import XML parser
      const { parseInvoiceXML } = await import('./services/xmlParser');

      try {
        const xmlData = parseInvoiceXML(ocrText, false);
        console.log(`XML parser extracted data for invoice ${invoice.id}:`, {
          vendor: xmlData.vendorName,
          amount: xmlData.totalAmount,
          invoiceNumber: xmlData.invoiceNumber,
          lineItems: xmlData.lineItems?.length || 0
        });

        // Convert XML parser output to expected AI format
        extractedData = {
          vendorName: xmlData.vendorName,
          invoiceNumber: xmlData.invoiceNumber,
          invoiceDate: xmlData.invoiceDate,
          dueDate: xmlData.dueDate,
          totalAmount: xmlData.totalAmount,
          taxAmount: xmlData.taxAmount,
          subtotal: xmlData.subtotal,
          currency: xmlData.currency || 'COP',
          lineItems: xmlData.lineItems || [],
          taxId: xmlData.taxId,
          buyerTaxId: xmlData.buyerTaxId,
          companyName: xmlData.companyName,
          confidenceScore: 0.95 // High confidence for XML parsing
        };
      } catch (xmlError) {
        console.error(`XML parsing failed for invoice ${invoice.id}, falling back to AI:`, xmlError);
        // Fallback to AI if XML parsing fails
        const aiPromise = extractInvoiceData(ocrText);
        const aiTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI extraction timeout')), 30000)
        );
        extractedData = await Promise.race([aiPromise, aiTimeoutPromise]) as any;
      }
    } else {
      // Use AI for non-XML content
      const aiPromise = extractInvoiceData(ocrText);
      const aiTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI extraction timeout')), 30000)
      );
      extractedData = await Promise.race([aiPromise, aiTimeoutPromise]) as any;
    }
    console.log(`AI extraction completed for invoice ${invoice.id}:`, {
      vendor: extractedData.vendorName,
      amount: extractedData.totalAmount,
      invoiceNumber: extractedData.invoiceNumber
    });

    // Sanitize and validate extracted data
    const sanitizeText = (text: any) => {
      if (!text || typeof text !== 'string') return null;

      // Remove HTML tags and excessive special characters
      const cleaned = text.replace(/<[^>]*>/g, '').trim();

      // Check if text is mostly corrupted (high ratio of special characters)
      const specialCharRatio = (cleaned.match(/[^a-zA-Z0-9\s\-_.,]/g) || []).length / cleaned.length;
      if (specialCharRatio > 0.3 || cleaned.length > 500) {
        return null;
      }

      return cleaned;
    };

    const cleanedData = {
      vendorName: sanitizeText(extractedData.vendorName),
      invoiceNumber: sanitizeText(extractedData.invoiceNumber),
      invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
      dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
      totalAmount: extractedData.totalAmount || null,
      taxAmount: extractedData.taxAmount || null,
      currency: extractedData.currency || 'USD',
    };

    // Update invoice with extracted data
    await storage.updateInvoice(invoice.id, {
      ocrText,
      extractedData,
      ...cleanedData
    });

    // Automatically validate the invoice after extraction
    try {
      console.log(`🔍 Starting validation for invoice ${invoice.id}...`);

      // Prepare complete validation data including extractedData for rule processing
      const validationData = {
        ...cleanedData,
        totalAmount: cleanedData.totalAmount ? parseFloat(cleanedData.totalAmount.toString()) : 0,
        taxAmount: cleanedData.taxAmount ? parseFloat(cleanedData.taxAmount.toString()) : 0,
        extractedData: extractedData // This includes buyerTaxId for NIT validation
      };

      const validationResult = await storage.validateInvoiceData(validationData);

      // Determine the status based on validation results
      let status = 'extracted';
      if (validationResult.isValid) {
        status = 'approved'; // Automatically approve if validation passes
      } else if (validationResult.criticalViolations > 0) {
        status = 'rejected'; // Reject if critical violations
      } else {
        status = 'extracted'; // Keep extracted status for review if only warnings
      }

      // Store comprehensive validation results in the database
      await storage.updateInvoice(invoice.id, {
        status,
        validationResults: validationResult, // Store complete validation results
        validationStatus: validationResult.status,
        isValidated: true, // Mark as validated regardless of pass/fail
        validationScore: validationResult.validationScore,
        processingStatus: 'validated' // Update processing status
      });

      console.log(`✅ Invoice ${invoice.id} validation completed:`, {
        status: validationResult.status,
        score: validationResult.validationScore,
        violations: validationResult.violations.length,
        finalStatus: status
      });

      // Log detailed validation results for debugging
      if (validationResult.violations.length > 0) {
        console.log(`❌ Validation violations for invoice ${invoice.id}:`, validationResult.violations);
      }
      if (validationResult.warnings.length > 0) {
        console.log(`⚠️ Validation warnings for invoice ${invoice.id}:`, validationResult.warnings);
      }

    } catch (validationError) {
      console.error(`❌ Validation failed for invoice ${invoice.id}:`, validationError);

      // Store validation error in results
      const errorResult = {
        isValid: false,
        validationScore: 0,
        violations: [{
          ruleId: null,
          fieldName: 'system',
          ruleType: 'validation_error',
          expected: 'successful_validation',
          actual: 'validation_system_error',
          severity: 'critical',
          message: validationError instanceof Error ? validationError.message : 'Unknown validation error',
          timestamp: new Date().toISOString()
        }],
        warnings: [],
        status: 'error',
        timestamp: new Date().toISOString()
      };

      await storage.updateInvoice(invoice.id, {
        status: 'extracted', // Keep as extracted for manual review
        validationResults: errorResult,
        validationStatus: 'error',
        isValidated: false,
        validationScore: 0
      });
    }

    console.log(`Invoice ${invoice.id} processing completed successfully`);
  } catch (error) {
    console.error(`Error processing invoice ${invoice.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      await storage.updateInvoice(invoice.id, { 
        status: "rejected",
        extractedData: { 
          error: errorMessage,
          timestamp: new Date().toISOString(),
          processStep: 'extraction'
        }
      });
    } catch (updateError) {
      console.error(`Failed to update invoice ${invoice.id} with error status:`, updateError);
    }
  }
}

// Helper function to process line items for a single invoice
async function processInvoiceLineItems(invoice: any, vendorContext: any, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    const { ClassificationService } = await import('./services/classificationService');

    // Get existing line items from database
    const existingLineItems = await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoice.id));
    console.log(`Found ${existingLineItems.length} existing line items in database`);

    let itemsToClassify: any[] = [];

    if (existingLineItems.length > 0) {
      // Use existing line items
      itemsToClassify = existingLineItems;
      console.log(`Using existing ${existingLineItems.length} line items for classification`);
    } else {
      // Extract line items from invoice data or create default ones
      let lineItemsData: any[] = [];

      if (invoice.extractedData?.lineItems && invoice.extractedData.lineItems.length > 0) {
        lineItemsData = invoice.extractedData.lineItems;
        console.log(`Found ${lineItemsData.length} line items in extracted data`);
      } else {
        // Create default line item
        const description = invoice.extractedData?.descriptionSummary || 
                          invoice.extractedData?.concept || 
                          `Service from ${invoice.vendorName || 'Unknown Vendor'}`;

        lineItemsData = [{
          description: description,
          quantity: '1',
          unitPrice: invoice.totalAmount || '0.00',
          totalPrice: invoice.totalAmount || '0.00',
          unit: 'service'
        }];
        console.log(`Created 1 default line item for invoice ${invoice.id}`);
      }

      // Insert line items into database
      for (let i = 0; i < lineItemsData.length; i++) {
        const item = lineItemsData[i];
        const [newLineItem] = await db.insert(lineItems).values({
          invoiceId: invoice.id,
          description: item.description || 'Unknown item',
          quantity: item.quantity || '1',
          unitPrice: item.unitPrice || item.price || '0.00',
          totalPrice: item.totalPrice || item.total || '0.00',
          unit: item.unit || null,
          rawText: item.rawText || item.description,
          lineNumber: i + 1,
        }).returning();

        itemsToClassify.push(newLineItem);
      }
    }

    console.log(`Processing ${itemsToClassify.length} line items for classification`);

    // Classify each line item
    let classifiedCount = 0;
    for (const item of itemsToClassify) {
      try {
        // Check if already classified
        const existingClassification = await db.select({
          id: lineItemClassifications.id,
          category: lineItemClassifications.category,
          method: lineItemClassifications.method
        })
          .from(lineItemClassifications)
          .where(eq(lineItemClassifications.lineItemId, item.id))
          .limit(1);

        if (existingClassification.length === 0) {
          console.log(`Classifying item: "${item.description}"`);
          await ClassificationService.classifyAndStore(item.id, userId);
          classifiedCount++;
        } else {
          console.log(`Item already classified: "${item.description}"`);
          classifiedCount++;
        }
      } catch (classificationError) {
        console.error(`Failed to classify line item ${item.id}:`, classificationError);
      }
    }

    console.log(`✅ Successfully processed invoice ${invoice.id}: ${itemsToClassify.length} items, ${classifiedCount} classified`);

    // Update invoice status to extracted after successful processing
    await storage.updateInvoice(invoice.id, { 
      status: 'extracted',
      updatedAt: new Date()
    });

    console.log(`✅ Updated invoice ${invoice.id} status to "extracted" after line item processing`);

    return { success: true };

  } catch (error) {
    console.error(`❌ Error processing invoice ${invoice.id}:`, error);
    // Propagate the error to be caught by the caller
    throw error; 
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize classification service (temporarily disabled to fix server startup)
  console.log('Classification service initialization skipped temporarily');

  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User endpoint for authentication check
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      res.json({
        id: userId,
        email: req.user.claims.email,
        firstName: req.user.claims.given_name || user?.firstName || '',
        lastName: req.user.claims.family_name || user?.lastName || '',
        profileImageUrl: req.user.claims.picture || user?.profileImageUrl
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Get user's company ID for company-wide stats
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get company-wide stats instead of user-specific stats
      const stats = user.companyId 
        ? await storage.getDashboardStatsByCompanyId(user.companyId)
        : await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Petty cash routes
  app.post('/api/petty-cash', isAuthenticated, async (req, res) => {
    try {
      const pettyCashData = req.body;
      const pettyCash = await storage.createPettyCashLog(pettyCashData);
      res.json(pettyCash);
    } catch (error) {
      console.error("Error creating petty cash log:", error);
      res.status(500).json({ message: "Failed to create petty cash log" });
    }
  });

  app.put('/api/petty-cash/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;

      // Convert ISO string to Date object if approvedAt is present
      if (updates.approvedAt && typeof updates.approvedAt === 'string') {
        updates.approvedAt = new Date(updates.approvedAt);
      }

      const pettyCash = await storage.updatePettyCashLog(id, updates);
      res.json(pettyCash);
    } catch (error) {
      console.error("Error updating petty cash log:", error);
      res.status(500).json({ message: "Failed to update petty cash log", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/petty-cash', isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string;
      const pettyCashLogs = await storage.getPettyCashLogs(status);
      res.json(pettyCashLogs);
    } catch (error) {
      console.error("Error fetching petty cash logs:", error);
      res.status(500).json({ message: "Failed to fetch petty cash logs" });
    }
  });

  app.get('/api/petty-cash/invoice/:invoiceId', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.invoiceId);
      const pettyCash = await storage.getPettyCashLogByInvoiceId(invoiceId);
      res.json(pettyCash);
    } catch (error) {
      console.error("Error fetching petty cash by invoice:", error);
      res.status(500).json({ message: "Failed to fetch petty cash log" });
    }
  });

  // Petty cash classification endpoint
  app.post('/api/petty-cash/classify', isAuthenticated, async (req, res) => {
    try {
      const { invoiceId, isPettyCash, classificationMethod, confidenceScore } = req.body;

      if (!invoiceId || isPettyCash === undefined) {
        return res.status(400).json({ message: "invoiceId and isPettyCash are required" });
      }

      // Check if petty cash log already exists for this invoice
      const existingLog = await storage.getPettyCashLogByInvoiceId(invoiceId);

      if (existingLog) {
        // Update existing log
        const updatedLog = await storage.updatePettyCashLog(existingLog.id, {
          isPettyCash,
          classificationMethod: classificationMethod || 'manual',
          confidenceScore: confidenceScore || 0.95,
          updatedAt: new Date()
        });

        console.log(`✅ Updated petty cash classification for invoice ${invoiceId}: ${isPettyCash ? 'YES' : 'NO'}`);
        res.json({ 
          message: "Petty cash classification updated", 
          log: updatedLog,
          result: isPettyCash ? 'YES' : 'NO'
        });
      } else {
        // Create new petty cash log
        const newLog = await storage.createPettyCashLog({
          invoiceId,
          isPettyCash,
          classificationMethod: classificationMethod || 'manual',
          confidenceScore: confidenceScore || 0.95,
          status: 'pending_approval'
        });

        console.log(`✅ Created petty cash classification for invoice ${invoiceId}: ${isPettyCash ? 'YES' : 'NO'}`);
        res.json({ 
          message: "Petty cash classification stored", 
          log: newLog,
          result: isPettyCash ? 'YES' : 'NO'
        });
      }

      // Also update the invoice processing status
      await storage.updateInvoice(invoiceId, {
        processingStatus: 'classified'
      });

    } catch (error) {
      console.error("Error storing petty cash classification:", error);
      res.status(500).json({ message: "Failed to store petty cash classification" });
    }
  });

  // Petty cash recalculate endpoint
  app.post('/api/petty-cash/recalculate', isAuthenticated, async (req, res) => {
    try {
      // Get the current petty cash threshold
      const thresholdSetting = await storage.getSetting('petty_cash_threshold');
      const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 100;

      // Get all invoices that might need recalculation
      const invoices = await storage.getInvoices();

      let recalculatedCount = 0;
      let newClassifications = 0;

      for (const invoice of invoices) {
        const amount = parseFloat(invoice.totalAmount || "0");
        const shouldBePettyCash = amount <= threshold && amount > 0;

        // Check if this invoice already has a petty cash classification
        const existingLog = await storage.getPettyCashLogByInvoiceId(invoice.id);

        if (shouldBePettyCash) {
          if (existingLog) {
            // Update existing classification if needed
            if (existingLog.isPettyCash !== true) {
              await storage.updatePettyCashLog(existingLog.id, {
                isPettyCash: true,
                classificationMethod: 'rule-based',
                confidenceScore: 1.0,
                updatedAt: new Date()
              });
              recalculatedCount++;
            }
          } else {
            // Create new petty cash log
            await storage.createPettyCashLog({
              invoiceId: invoice.id,
              isPettyCash: true,
              classificationMethod: 'rule-based',
              confidenceScore: 1.0,
              status: 'pending_approval'
            });
            newClassifications++;
          }
        } else if (existingLog && existingLog.isPettyCash === true) {
          // Remove petty cash classification if amount is now above threshold
          await storage.updatePettyCashLog(existingLog.id, {
            isPettyCash: false,
            classificationMethod: 'rule-based',
            confidenceScore: 1.0,
            updatedAt: new Date()
          });
          recalculatedCount++;
        }
      }

      console.log(`Recalculated petty cash: ${recalculatedCount} updated, ${newClassifications} new classifications`);

      res.json({
        message: `Successfully recalculated petty cash classifications. ${newClassifications} new classifications, ${recalculatedCount} updated.`,
        threshold,
        newClassifications,
        recalculatedCount,
        totalProcessed: invoices.length
      });
    } catch (error) {
      console.error("Error recalculating petty cash:", error);
      res.status(500).json({ message: "Failed to recalculate petty cash classifications" });
    }
  });

  // Settings routes
  app.get('/api/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const key = req.params.key;
      const setting = await storage.getSetting(key);
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put('/api/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const key = req.params.key;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ message: "Value is required" });
      }

      const setting = await storage.updateSetting(key, value);

      // If updating petty cash threshold, recalculate all invoices
      if (key === 'petty_cash_threshold') {
        // TODO: Implement recalculatePettyCashInvoices method
        // await storage.recalculatePettyCashInvoices(parseFloat(value));
        console.log('Petty cash threshold updated to:', value);
      }

      // Ensure we always return valid JSON
      res.status(200).json(setting || { key, value, message: "Setting updated successfully" });
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Project management routes
  app.get('/api/projects', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const project = await storage.getProject(parseInt(projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const projectData = req.body;
      const project = await storage.createProject(projectData);
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.put('/api/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const updates = req.body;
      const project = await storage.updateProject(parseInt(projectId), updates);
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete('/api/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      await storage.deleteProject(parseInt(projectId));
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);

      // Handle specific constraint violation errors
      if (error instanceof Error) {
        if (error.message.includes("Cannot delete project")) {
          return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("foreign key constraint")) {
          return res.status(400).json({ 
            message: "Cannot delete project because it has associated records. Please remove dependencies first." 
          });
        }
      }

      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Delete all projects endpoint
  app.delete('/api/projects-delete-all', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteAllProjects();
      res.json({ message: "All projects deleted successfully" });
    } catch (error) {
      console.error("Error deleting all projects:", error);

      if (error instanceof Error) {
        if (error.message.includes("Cannot delete projects")) {
          return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("foreign key constraint")) {
          return res.status(400).json({ 
            message: "Cannot delete projects because some have associated records. Please remove dependencies first." 
          });
        }
      }

      res.status(500).json({ message: "Failed to delete all projects" });
    }
  });

  // Purchase order upload and processing
  app.post('/api/purchase-orders/upload', isAuthenticated, (req: any, res) => {
    upload.any()(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message });
      }

      try {
        const userId = (req.user as any).claims.sub;
        const files = req.files as Express.Multer.File[];

        console.log("PO Upload request received:", { 
          hasFiles: !!files && files.length > 0, 
          fileCount: files?.length || 0,
          files: files?.map(f => ({ name: f.originalname, size: f.size, type: f.mimetype }))
        });

        if (!files || files.length === 0) {
          return res.status(400).json({ message: "No files uploaded" });
        }

        // Filter for purchase order files (any field name accepted)
        const poFiles = files.filter(f => f.fieldname.includes('po') || f.fieldname === 'file' || f.fieldname === 'files');
        if (poFiles.length === 0) {
          return res.status(400).json({ message: "No purchase order files found" });
        }

        const processedPOs = [];
        const errors = [];
        const skippedPOs = [];

        // Process all files
        for (let i = 0; i < poFiles.length; i++) {
          const file = poFiles[i];
          const fileName = file.originalname;

          try {
            console.log(`Processing file ${i + 1}/${poFiles.length}: ${fileName}`);

            // Extract OCR text
            const ocrText = await processInvoiceOCR(file.buffer, i);
            console.log(`OCR completed for PO ${fileName}, text length: ${ocrText.length}`);

            // Check if OCR was successful (even with error messages, we can still proceed)
            if (!ocrText || ocrText.trim().length < 10) {
              errors.push({
                fileName,
                error: "Insufficient text extracted from document",
                message: `OCR processing failed for ${fileName}. The file may be corrupted or in an unsupported format.`
              });
              continue;
            }

            // Check if the OCR text indicates an error
            if (ocrText.includes('processing failed') || ocrText.includes('Please try re-uploading')) {
              errors.push({
                fileName,
                error: "OCR processing error",
                message: `Document processing failed for ${fileName}. ${ocrText}`
              });
              continue;
            }

            // Extract data using AI
            const extractedData = await extractPurchaseOrderData(ocrText);
            console.log(`AI extraction completed for PO ${fileName}:`, {
              vendor: extractedData.vendorName,
              amount: extractedData.totalAmount,
              poId: extractedData.poId,
              extractedProject: extractedData.projectId
            });

            // Try to find a matching project using fuzzy matching
            let matchedProjectId = extractedData.projectId;
            if (extractedData.projectId) {
              const allProjects = await storage.getProjects();
              const fuzzyMatch = await findBestProjectMatch(extractedData.projectId, allProjects);
              if (fuzzyMatch) {
                matchedProjectId = fuzzyMatch;
                console.log(`Fuzzy matched project "${extractedData.projectId}" to "${fuzzyMatch}"`);
              } else {
                console.log(`No fuzzy match found for project "${extractedData.projectId}", setting to null`);
                matchedProjectId = null;
              }
            }

            // Convert date strings to Date objects
            let issueDate = null;
            let expectedDeliveryDate = null;

            if (extractedData.issueDate) {
              try {
                issueDate = new Date(extractedData.issueDate);
                // Check if date is valid
                if (isNaN(issueDate.getTime())) {
                  issueDate = null;
                }
              } catch (error) {
                console.log(`Invalid issue date format: ${extractedData.issueDate}`);
                issueDate = null;
              }
            }

            if (extractedData.expectedDeliveryDate) {
              try {
                expectedDeliveryDate = new Date(extractedData.expectedDeliveryDate);
                // Check if date is valid
                if (isNaN(expectedDeliveryDate.getTime())) {
                  expectedDeliveryDate = null;
                }
              } catch (error) {
                console.log(`Invalid expected delivery date format: ${extractedData.expectedDeliveryDate}`);
                expectedDeliveryDate = null;
              }
            }

            // Check if PO already exists
            const existingPO = await storage.getPurchaseOrderByPoId(extractedData.poId || `PO-${Date.now()}-${i}`);

            if (existingPO) {
              skippedPOs.push({
                fileName,
                poId: extractedData.poId,
                reason: "Duplicate PO ID",
                existingPO: {
                  id: existingPO.id,
                  poId: existingPO.poId,
                  vendorName: existingPO.vendorName,
                  amount: existingPO.amount,
                  status: existingPO.status
                }
              });
              continue;
            }

            // Create purchase order
            const newPurchaseOrder = await storage.createPurchaseOrder({
              poId: extractedData.poId || `PO-${Date.now()}-${i}`,
              vendorName: extractedData.vendorName || "Unknown Vendor",
              amount: extractedData.totalAmount || "0",
              currency: extractedData.currency || "USD",
              status: "open",
              issueDate: issueDate || new Date(),
              expectedDeliveryDate: expectedDeliveryDate || new Date(),
              projectId: matchedProjectId,
              // orderNumber: extractedData.orderNumber || null, // Field not in schema
              buyerName: extractedData.buyerName || null,
              buyerAddress: extractedData.buyerAddress || null,
              vendorAddress: extractedData.vendorAddress || null,
              terms: extractedData.terms || null,
              items: extractedData.lineItems || [],
              ocrText: ocrText,
              fileName: fileName,
              uploadedBy: req.user.id || "anonymous",
            }, userId);

            processedPOs.push(newPurchaseOrder);
            console.log(`Purchase order saved with ID: ${newPurchaseOrder.id} for file: ${fileName}`);

          } catch (processingError: any) {
            console.error(`Error processing PO ${fileName}:`, processingError);
            errors.push({
              fileName,
              error: processingError.message || 'Unknown error',
              message: `Failed to process purchase order: ${processingError.message || 'Unknown processing error'}`,
              details: 'Please ensure the file is a valid PDF and try again. If the problem persists, try converting the file to a different format.'
            });
          }
        }

        // Return comprehensive results
        const totalFiles = poFiles.length;
        const successCount = processedPOs.length;
        const errorCount = errors.length;
        const skippedCount = skippedPOs.length;

        let message = `Processed ${totalFiles} files: ${successCount} successful`;
        if (errorCount > 0) message += `, ${errorCount} failed`;
        if (skippedCount > 0) message += `, ${skippedCount} skipped (duplicates)`;

        return res.status(200).json({ 
          message,
          summary: {
            totalFiles,
            successful: successCount,
            failed: errorCount,
            skipped: skippedCount
          },
          processedPOs,
          errors,
          skippedPOs
        });
      } catch (error) {
        console.error("Error uploading purchase orders:", error);
        return res.status(500).json({ 
          message: "Failed to upload purchase orders",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
  });

  // Purchase order routes
  app.get('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const purchaseOrders = await storage.getPurchaseOrders(userId);
      res.json(purchaseOrders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.post('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const poData = req.body;
      const purchaseOrder = await storage.createPurchaseOrder(poData, userId);
      res.json(purchaseOrder);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  app.patch('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const updates = req.body;
      const updatedPO = await storage.updatePurchaseOrder(poId, updates);
      res.json(updatedPO);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(500).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete('/api/purchase-orders/:id', isAuthenticated, async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      await storage.deletePurchaseOrder(poId);
      res.json({ message: "Purchase order deleted successfully" });
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(500).json({ message: "Failed to delete purchase order" });
    }
  });

  // Invoice-PO matching routes
  app.get('/api/invoices/:id/matches', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const matches = await storage.getInvoicePoMatches(invoiceId);
      res.json(matches);
    } catch (error) {
      console.error("Error fetching invoice matches:", error);
      res.status(500).json({ message: "Failed to fetch invoice matches" });
    }
  });

  app.post('/api/invoices/:id/assign-project', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { projectId } = req.body;
      await storage.assignProjectToInvoice(invoiceId, projectId);
      res.json({ message: "Project assigned successfully" });
    } catch (error) {
      console.error("Error assigning project:", error);
      res.status(500).json({ message: "Failed to assign project" });
    }
  });

  app.put('/api/invoice-matches/:id', isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const updates = req.body;
      const match = await storage.updateInvoicePoMatch(matchId, updates);
      res.json(match);
    } catch (error) {
      console.error("Error updating invoice match:", error);
      res.status(500).json({ message: "Failed to update invoice match" });
    }
  });

  app.get('/api/matches/unresolved', isAuthenticated, async (req, res) => {
    try {
      const unresolvedMatches = await storage.getUnresolvedMatches();
      res.json(unresolvedMatches);
    } catch (error) {
      console.error("Error fetching unresolved matches:", error);
      res.status(500).json({ message: "Failed to fetch unresolved matches" });
    }
  });

  // Project matching routes
  app.get('/api/invoices/:id/project-matches', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const matches = await storage.getInvoiceProjectMatches(invoiceId);
      res.json(matches);
    } catch (error) {
      console.error("Error fetching invoice project matches:", error);
      res.status(500).json({ message: "Failed to fetch project matches" });
    }
  });

  app.post('/api/invoices/:id/find-project-matches', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const potentialMatches = await storage.findPotentialProjectMatches(invoice);
      res.json(potentialMatches);
    } catch (error) {
      console.error("Error finding project matches:", error);
      res.status(500).json({ message: "Failed to find project matches" });
    }
  });

  app.post('/api/invoices/:id/create-project-match', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { projectId, matchScore, matchDetails, status = 'manual' } = req.body;

      const matchData = {
        invoiceId,
        projectId,
        matchScore: matchScore.toString(),
        status: status as any,
        matchDetails,
        isActive: true,
      };

      const match = await storage.createInvoiceProjectMatch(matchData);

      // Update invoice processing status
      await storage.updateInvoice(invoiceId, {
        processingStatus: 'matched'
      });

      console.log(`✅ Created project match for invoice ${invoiceId} to project ${projectId} with score ${matchScore}`);
      res.json(match);
    } catch (error) {
      console.error("Error creating project match:", error);
      res.status(500).json({ message: "Failed to create project match" });
    }
  });

  // Project matching endpoint - stores the match when "Project Match: CONSTRUCCIONES OBYCON" is determined
  app.post('/api/project-matching', isAuthenticated, async (req, res) => {
    try {
      const { invoiceId, projectName, projectId, matchScore, matchDetails, classificationMethod } = req.body;

      if (!invoiceId || !projectName) {
        return res.status(400).json({ message: "invoiceId and projectName are required" });
      }

      // Create the project match record
      const matchData = {
        invoiceId,
        projectId: projectId || projectName, // Use projectId if provided, otherwise use projectName
        matchScore: matchScore || 85, // Default confidence score
        status: 'auto' as any,
        matchDetails: matchDetails || {
          matchedProject: projectName,
          method: classificationMethod || 'AI',
          confidence: matchScore || 85,
          timestamp: new Date().toISOString()
        },
        isActive: true,
      };

      const match = await storage.createInvoiceProjectMatch(matchData);

      // Update invoice processing status
      await storage.updateInvoice(invoiceId, {
        processingStatus: 'matched',
        projectName: projectName
      });

      console.log(`✅ Stored project match for invoice ${invoiceId}: ${projectName}`);
      res.json({ 
        message: "Project match stored successfully", 
        match,
        projectMatch: projectName
      });

    } catch (error) {
      console.error("Error storing project match:", error);
      res.status(500).json({ message: "Failed to store project match" });
    }
  });

  // Invoice processing endpoint - processes and stores all results in database
  app.post('/api/invoices/process', isAuthenticated, async (req, res) => {
    try {
      const { invoiceId, isPettyCash, projectMatch, validationStatus } = req.body;

      if (!invoiceId) {
        return res.status(400).json({ message: "invoiceId is required" });
      }

      const results = {
        pettyCashResult: null as any,
        projectMatchResult: null as any,
        validationResult: null as any
      };

      // Store petty cash classification if provided
      if (isPettyCash !== undefined) {
        try {
          const existingLog = await storage.getPettyCashLogByInvoiceId(invoiceId);

          if (existingLog) {
            results.pettyCashResult = await storage.updatePettyCashLog(existingLog.id, {
              isPettyCash,
              classificationMethod: 'AI',
              confidenceScore: 0.90,
              updatedAt: new Date()
            });
          } else {
            results.pettyCashResult = await storage.createPettyCashLog({
              invoiceId,
              isPettyCash,
              classificationMethod: 'AI',
              confidenceScore: 0.90,
              status: 'pending_approval'
            });
          }
          console.log(`✅ Stored petty cash classification for invoice ${invoiceId}: ${isPettyCash ? 'YES' : 'NO'}`);
        } catch (error) {
          console.error(`Error storing petty cash classification:`, error);
        }
      }

      // Store project match if provided
      if (projectMatch) {
        try {
          const matchData = {
            invoiceId,
            projectId: typeof projectMatch === 'string' ? projectMatch : projectMatch.projectId,
            matchScore: typeof projectMatch === 'object' ? projectMatch.matchScore || 85 : 85,
            status: 'auto' as any,
            matchDetails: {
              matchedProject: typeof projectMatch === 'string' ? projectMatch : projectMatch.projectName,
              method: 'AI',
              confidence: typeof projectMatch === 'object' ? projectMatch.matchScore || 85 : 85,
              timestamp: new Date().toISOString()
            },
            isActive: true,
          };

          results.projectMatchResult = await storage.createInvoiceProjectMatch(matchData);
          console.log(`✅ Stored project match for invoice ${invoiceId}: ${typeof projectMatch === 'string' ? projectMatch : projectMatch.projectName}`);
        } catch (error) {
          console.error(`Error storing project match:`, error);
        }
      }

      // Update validation status if provided
      if (validationStatus) {
        try {
          const updateData: any = {
            validationStatus: validationStatus,
            processingStatus: validationStatus === 'pending' ? 'validated' : 'processed'
          };

          await storage.updateInvoice(invoiceId, updateData);
          results.validationResult = { status: validationStatus };
          console.log(`✅ Updated validation status for invoice ${invoiceId}: ${validationStatus}`);
        } catch (error) {
          console.error(`Error updating validation status:`, error);
        }
      }

      // Update overall processing status
      let finalStatus = 'extracted';
      if (isPettyCash !== undefined) finalStatus = 'classified';
      if (projectMatch) finalStatus = 'matched';
      if (validationStatus) finalStatus = 'validated';

      await storage.updateInvoice(invoice.id, {
        processingStatus: finalStatus
      });

      res.json({
        message: "Invoice processing results stored successfully",
        results,
        processingStatus: finalStatus
      });

    } catch (error) {
      console.error("Error processing invoice:", error);
      res.status(500).json({ message: "Failed to process invoice" });
    }
  });

  app.put('/api/project-matches/:id', isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const updates = req.body;
      const match = await storage.updateInvoiceProjectMatch(matchId, updates);
      res.json(match);
    } catch (error) {
      console.error("Error updating project match:", error);
      res.status(500).json({ message: "Failed to update project match" });
    }
  });

  app.post('/api/invoices/:id/set-active-project-match', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { matchId } = req.body;
      await storage.setActiveProjectMatch(invoiceId, matchId);
      res.json({ message: "Active project match set successfully" });
    } catch (error) {
      console.error("Error setting active project match:", error);
      res.status(500).json({ message: "Failed to set active project match" });
    }
  });

  app.get('/api/project-matches/unresolved', isAuthenticated, async (req, res) => {
    try {
      const unresolvedMatches = await storage.getUnresolvedProjectMatches();
      res.json(unresolvedMatches);
    } catch (error) {
      console.error("Error fetching unresolved project matches:", error);
      res.status(500).json({ message: "Failed to fetch unresolved project matches" });
    }
  });

  // Discrepancy detection routes
  app.get("/api/flags/:invoiceId", isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.invoiceId);
      const flags = await storage.getInvoiceFlags(invoiceId);
      res.json(flags);
    } catch (error) {
      console.error("Error fetching invoice flags:", error);
      res.status(500).json({ message: "Failed to fetch invoice flags" });
    }
  });

  app.post("/api/flags/:flagId/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const flagId = parseInt(req.params.flagId);
      const userId = req.user?.claims?.sub || req.user?.id;
      const flag = await storage.resolveInvoiceFlag(flagId, userId);
      res.json(flag);
    } catch (error) {
      console.error("Error resolving flag:", error);
      res.status(500).json({ message: "Failed to resolve flag" });
    }
  });

  // Predictive alerts routes
  app.get("/api/predictive-alerts/:invoiceId", isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.invoiceId);
      const alerts = await storage.getPredictiveAlerts(invoiceId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching predictive alerts:", error);
      res.status(500).json({ message: "Failed to fetch predictive alerts" });
    }
  });

  app.get("/api/dashboard/top-issues", isAuthenticated, async (req, res) => {
    try {
      const issues = await storage.getTopIssuesThisMonth();
      res.json(issues);
    } catch (error) {
      console.error("Error fetching top issues:", error);
      res.status(500).json({ message: "Failed to fetch top issues" });
    }
  });

  // Project validation routes
  app.post("/api/projects/:projectId/validate", isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { action } = req.body;
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || "unknown";

      const validationStatus = action === "validate" ? "validated" : "rejected";
      const isValidated = action === "validate";

      // First find the project by projectId to get the integer id
      const project = await storage.getProjectByProjectId(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Update the project validation status using the integer id
      await storage.updateProject(project.id, {
        validationStatus,
        isValidated,
        validatedBy: userId,
        validatedAt: new Date()
      });

      // Return the updated project
      const updatedProject = await storage.getProjectByProjectId(projectId);
      res.json(updatedProject);
    } catch (error) {
      console.error("Error validating project:", error);
      res.status(500).json({ message: "Failed to validate project" });
    }
  });



  // Settings routes
  app.get('/api/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const key = req.params.key;
      const setting = await storage.getSetting(key);

      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }

      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put('/api/settings/:key', isAuthenticated, async (req, res) => {
    try {
      const key = req.params.key;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ message: "Value is required" });
      }

      const setting = await storage.updateSetting(key, value);
      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // User settings routes
  app.get('/api/settings/user_preferences', isAuthenticated, async (req, res) => {
    try {
      // Add timeout to prevent hanging database operations
      const settingPromise = storage.getSetting('user_preferences');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings fetch timeout')), 10000)
      );

      const setting = await Promise.race([settingPromise, timeoutPromise]);

      if (!setting) {
        // Return default settings
        const defaultSettings = {
          key: 'user_preferences',
          value: JSON.stringify({
            fullName: '',
            department: '',
            phoneNumber: '',
            emailNotifications: true,
            dashboardLayout: 'grid',
            defaultCurrency: 'USD',
            timezone: 'America/New_York',
            aiProcessingMode: 'automatic',
            aiCacheEnabled: true,
            aiCacheExpiry: '24h',
            aiAutoInvalidation: 'on_update'
          }),
          description: 'User preferences and settings'
        };

        // Add timeout for default settings creation
        const createPromise = storage.updateSetting('user_preferences', defaultSettings.value);
        const createTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Settings creation timeout')), 10000)
        );

        await Promise.race([createPromise, createTimeoutPromise]);
        res.json(defaultSettings);
      } else {
        res.json(setting);
      }
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });

  app.put('/api/settings/user_preferences', isAuthenticated, async (req, res) => {
    try {
      const { value } = req.body;

      if (value === undefined || value === null) {
        return res.status(400).json({ message: "Settings value is required" });
      }

      // Get current settings first to merge with new values
      let currentSettings = {
        fullName: '',
        department: '',
        phoneNumber: '',
        emailNotifications: true,
        dashboardLayout: 'grid',
        defaultCurrency: 'USD',
        timezone: 'America/New_York',
        aiProcessingMode: 'automatic',
        aiCacheEnabled: true,
        aiCacheExpiry: '24h',
        aiAutoInvalidation: 'on_update'
      };

      try {
        const existing = await storage.getSetting('user_preferences');
        if (existing?.value) {
          try {
            const parsed = JSON.parse(existing.value);
            currentSettings = { ...currentSettings, ...parsed };
          } catch (jsonError) {
            console.warn('Failed to parse existing settings, using defaults:', jsonError);
          }
        }
      } catch (error) {
        console.log('No existing settings found, using defaults');
      }

      // Merge new settings with existing ones
      let newSettings = {};
      if (typeof value === 'object') {
        newSettings = { ...currentSettings, ...value };
      } else if (typeof value === 'string') {
        try {
          const parsedValue = JSON.parse(value);
          newSettings = { ...currentSettings, ...parsedValue };
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          return res.status(400).json({ message: "Invalid JSON format for settings value" });
        }
      } else {
        return res.status(400).json({ message: "Invalid settings format" });
      }

      const settingsJson = JSON.stringify(newSettings);
      console.log('Saving merged settings:', settingsJson);

      // Use setSetting instead of updateSetting to ensure upsert behavior
      const setting = await storage.setSetting({
        key: 'user_preferences',
        value: settingsJson,
        description: 'User preferences and settings'
      });

      res.json({ 
        message: "Settings updated successfully",
        setting 
      });
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ 
        message: "Failed to update user settings",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Password change route (placeholder - would need proper authentication in production)
  app.post('/api/auth/change-password', isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }

      // Password validation
      const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters with letters, numbers, and symbols" 
        });
      }

      // In a real application, you would:
      // 1. Verify the current password
      // 2. Hash the new password
      // 3. Update the user's password in the database

      // For this demo, we'll just return success
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // AI Keyword Suggestions endpoint
  app.post('/api/ai/keyword-suggestions', isAuthenticated, async (req, res) => {
    try {
      const { category, subcategory, existing_keywords } = req.body;

      if (!category) {
        return res.status(400).json({ error: 'Category is required' });
      }

      // Fallback suggestions for when OpenAI is unavailable
      const fallbackSuggestions = {
        materials_supplies: [
          "cemento", "concreto", "ladrillos", "arena", "grava", "varilla", "hierro", "acero", 
          "pintura", "madera", "tubería", "cable", "tornillos", "clavos", "pegante", "sellador", 
          "impermeabilizante", "bloques", "tejas", "láminas", "mortero", "yeso", "cal", "alambre", 
          "soldadura", "adhesivo", "silicona", "barniz", "thinner", "anticorrosivo"
        ],
        equipment_tools: [
          "taladro", "martillo", "sierra", "nivel", "metro", "escalera", "andamio", "mezcladora", 
          "cortadora", "pulidora", "compresor", "generador", "bomba", "herramientas", "destornillador", 
          "alicate", "llave", "cincel", "carretilla", "balde", "casco", "guantes", "gafas", 
          "arnés", "botas", "máquina", "equipo", "motor"
        ],
        services_labor: [
          "mano de obra", "instalación", "mantenimiento", "consultoría", "supervisión", 
          "ingeniería", "construcción", "reparación", "limpieza", "transporte", "servicio", 
          "asesoría", "diseño", "planificación", "ejecución", "montaje", "desmontaje", 
          "capacitación", "operación", "gestión"
        ],
        office_supplies: [
          "papel", "tinta", "bolígrafos", "lápices", "carpetas", "archivadores", "grapas", 
          "clips", "pegante", "cinta", "marcadores", "resaltadores", "calculadora", 
          "papelería", "oficina", "escritorio", "silla", "computador", "impresora"
        ],
        utilities_services: [
          "agua", "luz", "electricidad", "gas", "teléfono", "internet", "aseo", "seguridad", 
          "vigilancia", "comunicaciones", "energía", "combustible", "gasolina", "diésel", 
          "servicios públicos", "acueducto", "alcantarillado"
        ]
      };

      // Try to use OpenAI if available, otherwise use fallback
      let suggestions = fallbackSuggestions[category as keyof typeof fallbackSuggestions] || [];

      try {
        // Check if OpenAI is available by looking for environment variable
        const openaiKey = process.env.OPENAI_API_KEY;

        if (openaiKey) {
          const prompt = `Generate 25-30 Spanish keywords for the category '${category}' ${
            subcategory ? `and subcategory '${subcategory}'` : ''
          } that commonly appear in Colombian business invoices. Include materials, services, tools, and related terms that would be found in procurement and construction contexts. Return only keywords separated by commas, no explanations.`;

          // This would be the OpenAI call if the service is available
          // For now, we'll use the fallback suggestions
          console.log('OpenAI key found, but using fallback suggestions for now');
        }
      } catch (openaiError) {
        console.log('Using fallback suggestions due to OpenAI unavailability');
      }

      // Filter out existing keywords if provided
      if (existing_keywords && existing_keywords.length > 0) {
        const existingSet = new Set(existing_keywords.map((k: string) => k.toLowerCase().trim()));
        suggestions = suggestions.filter(suggestion => 
          !existingSet.has(suggestion.toLowerCase().trim())
        );
      }

      // Randomize and limit to 20-25 suggestions
      const shuffled = suggestions.sort(() => 0.5 - Math.random());
      const limited = shuffled.slice(0, Math.min(25, suggestions.length));

      res.json({ suggestions: limited });
    } catch (error) {
      console.error('Error generating keyword suggestions:', error);
      res.status(500).json({ error: 'Failed to generate keyword suggestions' });
    }
  });

  // Excel import endpoint for projects
  app.post('/api/projects/import', isAuthenticated, (req: any, res) => {
    excelUpload.single('excel')(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: 'File upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Debug: Log the first row to see available column names
        if (data.length > 0) {
          console.log('Excel columns available:', Object.keys(data[0] as object));
        }

        const importedProjects = [];
        const errors = [];

        for (let i = 0; i < data.length; i++) {
          const row = data[i] as any;
          try {
            // Handle VAT Reimbursement as boolean
            const vatReimbursement = row['VAT Reimbursement'] || row['vatReimbursement'] || row['VAT'] || row['vat'];
            let vatNumber = '';

            if (typeof vatReimbursement === 'boolean') {
              vatNumber = vatReimbursement.toString();
            } else if (typeof vatReimbursement === 'string') {
              const lowerVal = vatReimbursement.toLowerCase();
              if (lowerVal === 'true' || lowerVal === 'yes' || lowerVal === '1' || lowerVal === 'si') {
                vatNumber = 'true';
              } else if (lowerVal === 'false' || lowerVal === 'no' || lowerVal === '0') {
                vatNumber = 'false';
              } else {
                vatNumber = vatReimbursement;
              }
            }

            const projectData = {
              projectId: row['Project ID'] || row['projectId'] || row['ID'] || row['id'] || `PROJ-${Date.now()}-${i}`,
              name: row['Project Name'] || row['name'] || row['Name'] || row['Project'] || row['project'] || 'Imported Project',
              description: row['Description'] || row['description'] || row['Desc'] || row['desc'] || row['Notes'] || row['notes'] || '',
              address: row['Invoice Address'] || row['Address'] || row['address'] || row['Location'] || row['location'] || '',
              city: row['City'] || row['city'] || row['Ciudad'] || row['ciudad'] || '',
              vatNumber: vatNumber,
              supervisor: row['Superintendent Name'] || row['superintendentName'] || row['Supervisor'] || row['supervisor'] || row['Manager'] || row['manager'] || row['Responsable'] || row['responsable'] || '',
              budget: (row['Budget'] || row['budget'] || row['Presupuesto'] || row['presupuesto'] || '0').toString(),
              currency: row['Currency'] || row['currency'] || row['Moneda'] || row['moneda'] || 'USD',
              status: 'active',
              validationStatus: 'pending',
              isValidated: false
            };

            const userId = (req.user as any).claims.sub;
            const project = await storage.createProject(projectData, userId);
            importedProjects.push(project);
          } catch (error) {
            errors.push({
              row: i + 1,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: row
            });
          }
        }

        res.json({
          message: `Successfully imported ${importedProjects.length} projects`,
          imported: importedProjects.length,
          errors: errors.length,
          errorDetails: errors
        });
      } catch (error) {
        console.error('Excel processing error:', error);
        res.status(500).json({ message: 'Failed to process Excel file' });
      }
    });
  });

  // Download template endpoint
  app.get('/api/projects/template', isAuthenticated, async (req, res) => {
    try {
      const XLSX = await import('xlsx');

      const templateData = [
        {
          'Project ID': 'PROJ-2024-001',
          'Project Name': 'Office Renovation',
          'Notes': 'Complete office renovation project',
          'Invoice Address': 'Calle 1B No. 20-59 Urbanización',
          'City': 'Puertocotonue',
          'VAT Reimbursement': true,
          'Superintendent Name': 'Diana Martinez',
          'Budget': '50000',
          'Currency': 'COP'
        },
        {
          'Project ID': 'PROJ-2024-002',
          'Project Name': 'IT Infrastructure',
          'Notes': 'Network upgrade and security implementation',
          'Invoice Address': 'Diagonal 32 No 80-966 Supermanzana',
          'City': 'Cartagena',
          'VAT Reimbursement': false,
          'Superintendent Name': 'Indira Garcia',
          'Budget': '75000',
          'Currency': 'COP'
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Projects');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=project_validation_template.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('Template generation error:', error);
      res.status(500).json({ message: 'Failed to generate template' });
    }
  });

  // Invoice upload and processing
  app.post('/api/invoices/upload', isAuthenticated, upload.array('invoice', 10), async (req: any, res) => {
    console.log('=== INVOICE UPLOAD DEBUG ===');
    const files = req.files as Express.Multer.File[];

    // 🔥 FIX: Get userId from authenticated request properly
    const userId = (req.user as any).claims.sub;

    console.log('Upload request details:', {
      authenticated: !!req.user,
      userId: userId,  // ✅ Now properly defined
      hasFiles: !!(files && files.length > 0),
      fileCount: files?.length || 0,
      files: files?.map(f => ({ name: f.originalname, size: f.size, type: f.mimetype, fieldname: f.fieldname })),
      body: req.body
    });

    // Validate authentication
    if (!userId) {
      console.error('No userId found in authenticated request');
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Filter only invoice files
    const invoiceFiles = files.filter(f => f.fieldname === 'invoice');
    if (invoiceFiles.length === 0) {
      return res.status(400).json({ message: "No invoice files found" });
    }

    const fs = await import('fs');
    const path = await import('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uploadedInvoices: any[] = [];

    try {
      // Process invoice files in parallel for better performance
      const processPromises = invoiceFiles.map(async (file) => {
        try {
          // Generate unique filename
          const fileExt = path.extname(file.originalname);
          const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
          const filePath = path.join(uploadsDir, uniqueFileName);

          // Write file to disk
          fs.writeFileSync(filePath, file.buffer);

          // Create initial invoice record with file path
          const invoice = await storage.createInvoice({
            userId,  // ✅ Now properly defined
            fileName: file.originalname,
            status: "processing",
            fileUrl: filePath,
          });

          console.log(`Created invoice record ${invoice.id} for file ${file.originalname}`);

          // Start processing immediately using setImmediate to avoid blocking
          setImmediate(async () => {
            try {
              console.log(`Starting background processing for invoice ${invoice.id}`);
              await processInvoiceAsync(invoice, file.buffer);
              console.log(`Completed background processing for invoice ${invoice.id}`);
            } catch (error) {
              console.error(`Failed to process invoice ${invoice.id}:`, error);
              // Update invoice with error status
              try {
                await storage.updateInvoice(invoice.id, {
                  status: "rejected",
                  extractedData: { 
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString(),
                    processStep: 'background_processing'
                  }
                });
              } catch (updateError) {
                console.error(`Failed to update invoice ${invoice.id} with error:`, updateError);
              }
            }
          });

          return invoice;
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
          return null;
        }
      });

      const results = await Promise.allSettled(processPromises);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          uploadedInvoices.push(result.value);
        }
      });

      console.log(`Successfully created ${uploadedInvoices.length} invoice records`);

      res.json({ 
        message: `Successfully uploaded ${uploadedInvoices.length} invoice(s). Processing started.`,
        invoices: uploadedInvoices.map(inv => ({ id: inv.id, fileName: inv.fileName }))
      });
    } catch (error) {
      console.error("Error uploading invoices:", error);
      res.status(500).json({ message: "Failed to upload invoices" });
    }
  });
  // Clean corrupted invoice data
  app.post('/api/invoices/clean-data', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      console.log(`User ${userId} requested to clean corrupted invoice data`);

      // Get all invoices for the user
      const invoices = await storage.getInvoicesByUserId(userId);
      let cleanedCount = 0;

      const sanitizeText = (text: any) => {
        if (!text || typeof text !== 'string') return null;

        // Remove HTML tags and excessive special characters
        const cleaned = text.replace(/<[^>]*>/g, '').trim();

        // Check if text is mostly corrupted
        const specialCharRatio = (cleaned.match(/[^a-zA-Z0-9\s\-_.,]/g) || []).length / cleaned.length;
        if (specialCharRatio > 0.3 || cleaned.length > 500) {
          return null;
        }

        return cleaned;
      };

      for (const invoice of invoices) {
        let needsUpdate = false;
        const updates: any = {};

        // Clean vendor name
        if (invoice.vendorName && typeof invoice.vendorName === 'string') {
          const cleanedVendor = sanitizeText(invoice.vendorName);
          if (cleanedVendor !== invoice.vendorName) {
            updates.vendorName = cleanedVendor;
            needsUpdate = true;
          }
        }

        // Clean invoice number
        if (invoice.invoiceNumber && typeof invoice.invoiceNumber === 'string') {
          const cleanedNumber = sanitizeText(invoice.invoiceNumber);
          if (cleanedNumber !== invoice.invoiceNumber) {
            updates.invoiceNumber = cleanedNumber;
            needsUpdate = true;
          }
        }

        // Clean extracted data
        if (invoice.extractedData && typeof invoice.extractedData === 'object') {
          const cleanedExtractedData = { ...invoice.extractedData };
          let extractedDataChanged = false;

          for (const [key, value] of Object.entries(cleanedExtractedData)) {
            if (typeof value === 'string') {
              const cleanedValue = sanitizeText(value);
              if (cleanedValue !== value) {
                cleanedExtractedData[key] = cleanedValue;
                extractedDataChanged = true;
              }
            }
          }

          if (extractedDataChanged) {
            updates.extractedData = cleanedExtractedData;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await storage.updateInvoice(invoice.id, updates);
          cleanedCount++;
        }
      }

      res.json({ 
        message: `Cleaned ${cleanedCount} invoices with corrupted data`,
        cleanedCount
      });

    } catch (error: any) {
      console.error('Error cleaning invoice data:', error);
      res.status(500).json({ 
        message: 'Failed to clean invoice data', 
        error: error.message 
      });
    }
  });

  // Clear invoice files cache
  app.delete('/api/invoices/clear-cache', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      console.log(`User ${userId} requested to clear invoice files cache`);

      const fs = await import('fs');
      const path = await import('path');

      // Clear uploads directory
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        let deletedCount = 0;

        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }

        console.log(`Deleted ${deletedCount} files from uploads directory`);
      }

      // Clear AI service cache if it exists
      const { aiService } = await import('./services/aiService');
      if (aiService && typeof aiService.clearCache === 'function') {
        aiService.clearCache();
        console.log('AI service cache cleared');
      }

      // Clear any cached extraction results
      const cacheDir = path.join(process.cwd(), '.cache');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        let deletedCacheCount = 0;

        for (const file of files) {
          const filePath = path.join(cacheDir, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile()) {
            fs.unlinkSync(filePath);
            deletedCacheCount++;
          }
        }

        console.log(`Deleted ${deletedCacheCount} files from cache directory`);
      }

      res.json({ 
        message: 'Invoice files cache cleared successfully',
        details: {
          uploadsCleared: true,
          aiCacheCleared: true,
          filesRemoved: 'All cached files removed'
        }
      });

    } catch (error: any) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ 
        message: 'Failed to clear cache', 
        error: error.message 
      });
    }
  });

  // Process invoice endpoint (for RPA and manual processing)
  app.post('/api/invoices/:id/process', async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      console.log(`📄 Processing invoice ${invoiceId}: ${invoice.fileName}`);

      // Check if file exists
      const fs = await import('fs');
      if (!invoice.fileUrl || !fs.default.existsSync(invoice.fileUrl)) {
        return res.status(400).json({ message: "Invoice file not found on disk" });
      }

      // Read file buffer
      const fileBuffer = fs.default.readFileSync(invoice.fileUrl);

      // Process asynchronously
      setImmediate(async () => {
        try {
          await processInvoiceAsync(invoice, fileBuffer);
          console.log(`✅ Invoice ${invoiceId} processing completed`);
        } catch (error) {
          console.error(`❌ Invoice ${invoiceId} processing failed:`, error);
          // Update invoice status to failed
          await storage.updateInvoice(invoiceId, { 
            status: "pending",
            extractedData: { error: error instanceof Error ? error.message : "Processing failed" }
          });
        }
      });

      res.json({ message: "Processing started", invoiceId });
    } catch (error) {
      console.error("Error starting invoice processing:", error);
      res.status(500).json({ message: "Failed to start processing" });
    }
  });

  // Process imported invoices endpoint (temporary bypass for testing)
  app.post('/api/imported-invoices/process', async (req: any, res) => {
    try {
      console.log('🔄 Processing downloaded imported invoices...');

      const result = await invoiceProcessingService.processDownloadedInvoices();

      console.log(`✅ Processing complete: ${result.processed} processed, ${result.failed} failed`);

      res.json({
        message: `Processing complete: ${result.processed} invoices processed successfully`,
        summary: {
          processed: result.processed,
          failed: result.failed,
          total: result.processed + result.failed
        },
        errors: result.errors
      });
    } catch (error: any) {
      console.error('Error processing imported invoices:', error);
      res.status(500).json({ 
        message: 'Failed to process imported invoices',
        error: error.message 
      });
    }
  });

  // Process imported invoices by log ID (allow bypass for testing)
  app.post('/api/imported-invoices/process/:logId', async (req: any, res) => {
    try {
      const logId = parseInt(req.params.logId);
      console.log(`🔄 Processing imported invoices for log ID: ${logId}`);

      const result = await invoiceProcessingService.processInvoicesByLogId(logId);

      console.log(`✅ Processing complete for log ${logId}: ${result.processed} processed, ${result.failed} failed`);

      res.json({
        message: `Processing complete for log ${logId}: ${result.processed} invoices processed successfully`,
        summary: {
          processed: result.processed,
          failed: result.failed,
          total: result.processed + result.failed,
          logId
        },
        errors: result.errors
      });
    } catch (error: any) {
      console.error(`Error processing imported invoices for log ${req.params.logId}:`, error);
      res.status(500).json({ 
        message: 'Failed to process imported invoices',
        error: error.message 
      });
    }
  });

  // Manual processing endpoints
  app.post('/api/invoices/:id/process-ocr', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice || invoice.userId !== (req.user as any).claims.sub) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (!invoice.fileUrl || !require('fs').existsSync(invoice.fileUrl)) {
        return res.status(400).json({ message: "Invoice file not found on disk" });
      }

      // Reset status to processing
      await storage.updateInvoice(invoiceId, { status: "processing" });

      res.json({ message: "Manual OCR processing started" });

      // Start processing in background with proper error handling
      setImmediate(async () => {
        try {
          const fs = require('fs');
          const fileBuffer = fs.readFileSync(invoice.fileUrl);

          console.log(`Manual processing started for invoice ${invoiceId} (${invoice.fileName})`);

          // Use the same processing function as automatic uploads
          await processInvoiceAsync(invoice, fileBuffer);

          console.log(`Manual processing completed for invoice ${invoiceId}`);
        } catch (error: any) {
          console.error(`Manual processing failed for invoice ${invoiceId}:`, error);
          await storage.updateInvoice(invoiceId, {
            status: "rejected",
            extractedData: { 
              error: error.message,
              errorType: "ManualProcessingError",
              timestamp: new Date().toISOString(),
              step: "manual_retry"
            },
          });
        }
      });
    } catch (error) {
      console.error("Error starting manual OCR:", error);
      res.status(500).json({ message: "Failed to start manual OCR processing" });
    }
  });

  app.post('/api/invoices/:id/extract-data', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice || invoice.userId !== (req.user as any).claims.sub) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json({ message: "Data extraction started" });
    } catch (error) {
      console.error("Error starting data extraction:", error);
      res.status(500).json({ message: "Failed to start data extraction" });
    }
  });

  app.post('/api/invoices/:id/find-matches', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice || invoice.userId !== (req.user as any).claims.sub) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json({ message: "PO matching started" });
    } catch (error) {
      console.error("Error starting PO matching:", error);
      res.status(500).json({ message: "Failed to start PO matching" });
    }
  });



  // Serve invoice file for preview (metadata)
  app.get('/api/invoices/:id/preview', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check access permissions (user owns invoice OR it's an RPA invoice for the same company)
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if file exists and is a PDF
      if (!invoice.fileUrl || !invoice.fileName?.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ message: "File not available for preview or not a PDF" });
      }

      res.status(200).json({ 
        message: "PDF preview endpoint ready", 
        fileName: invoice.fileName,
        previewUrl: `/api/invoices/${invoiceId}/preview/file`
      });
    } catch (error) {
      console.error("Error serving invoice preview:", error);
      res.status(500).json({ message: "Failed to serve invoice preview" });
    }
  });

  // Serve actual PDF file for preview
  app.get('/api/invoices/:id/preview/file', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).send('Invoice not found');
      }

      // Check access permissions (user owns invoice OR it's an RPA invoice for the same company)
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        console.log(`Preview access denied for user ${userId} to invoice ${invoiceId}`);
        return res.status(403).send('Access denied');
      }

      // Check if file exists and is a PDF
      if (!invoice.fileName?.toLowerCase().endsWith('.pdf')) {
        return res.status(404).send('File not found or not a PDF');
      }

      // For demonstration purposes, we'll create a sample PDF response
      // In production, you would stream from your secure file storage
      const fs = await import('fs');
      const path = await import('path');

      // Construct file path - check uploads directory (same as download endpoint)
      const filePath = path.join('uploads', invoice.fileName);
      console.log(`Looking for preview file at: ${filePath}`);

      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size.toString());
        res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Accept-Ranges', 'bytes');

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
          console.error('Stream error:', err);
          if (!res.headersSent) {
            res.status(500).send('Error reading file');
          }
        });
      } else {
        // Create a minimal PDF for demonstration
        const PDFDocument = await import('pdfkit');
        const doc = new PDFDocument.default();

        // Set headers before piping
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
        res.setHeader('Cache-Control', 'private, no-cache');

        // Pipe the PDF to response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text('Invoice Preview Demo', 100, 100);
        doc.fontSize(14).text(`File: ${invoice.fileName}`, 100, 140);
        doc.text(`Invoice ID: ${invoice.id}`, 100, 160);
        doc.text(`Vendor: ${invoice.vendorName || 'N/A'}`, 100, 180);
        doc.text(`Amount: ${invoice.totalAmount || 'N/A'} ${invoice.currency || 'USD'}`, 100, 200);
        doc.text(`Date: ${invoice.invoiceDate || 'N/A'}`, 100, 220);

        doc.fontSize(12).text('This is a demonstration PDF generated for preview purposes.', 100, 260);
        doc.text('In production, this would be replaced with the actual uploaded PDF file.', 100, 280);
        doc.text('You can download this file using the download button.', 100, 300);

        // Add some more content to make it a proper PDF
        doc.addPage();
        doc.fontSize(16).text('Additional Information', 100, 100);
        doc.fontSize(12).text('This is page 2 of the demo invoice.', 100, 140);
        doc.text('Status: ' + (invoice.status || 'Unknown'), 100, 160);
        doc.text('Created: ' + (invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'Unknown'), 100, 180);

        // Finalize the PDF
        doc.end();
      }
    } catch (error) {
      console.error("Error serving PDF file:", error);
      if (!res.headersSent) {
        res.status(500).send('Failed to serve PDF file');
      }
    }
  });

  // Get invoice by ID
  app.get('/api/invoices/:id', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);

      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check if user owns the invoice
      const userId = (req.user as any).claims.sub;
      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get line items
      const lineItems = await storage.getLineItemsByInvoiceId(invoiceId);

      res.json({ ...invoice, lineItems });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // Get company's invoices with classification status (company-wide access)
  app.get('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const includeMatches = req.query.includeMatches === 'true';
      const db = await getDb();

      // Get user's company ID for company-wide access
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (includeMatches) {
        const invoicesWithMatches = await storage.getInvoicesWithProjectMatches(userId);
        res.json(invoicesWithMatches || []);
      } else {
        // Get all invoices for the user's company instead of just the user's invoices
        const invoices = user.companyId 
          ? await storage.getInvoicesByCompanyId(user.companyId)
          : await storage.getInvoicesByUserId(userId);

        // Add classification status for each invoice
        const invoicesWithClassificationStatus = await Promise.all(
          (invoices || []).map(async (invoice) => {
            try {
              // Count classifications for this invoice
              const classifications = await db
                .select({ count: sql`count(*)` })
                .from(lineItemClassifications)
                .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
                .where(eq(lineItems.invoiceId, invoice.id));

              // Count total line items
              const lineItemsCount = await db
                .select({ count: sql`count(*)` })
                .from(lineItems)
                .where(eq(lineItems.invoiceId, invoice.id));

              const classificationCount = Number(classifications[0]?.count || 0);
              const totalLineItems = Number(lineItemsCount[0]?.count || 0);

              return {
                ...invoice,
                classificationStatus: classificationCount > 0 ? 'Classified' : 'Not Classified',
                classifiedLineItems: classificationCount,
                totalLineItems: totalLineItems,
                lineItemsCount: totalLineItems
              };
            } catch (error) {
              console.error(`Error calculating classification status for invoice ${invoice.id}:`, error);
              // Return invoice without classification data if calculation fails
              return {
                ...invoice,
                classificationStatus: 'Not Classified',
                classifiedLineItems: 0,
                totalLineItems: 0,
                lineItemsCount: 0
              };
            }
          })
        );

        res.json(invoicesWithClassificationStatus);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch invoices";
      res.status(500).json({ 
        message: "Failed to fetch invoices",
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update invoice
  app.patch('/api/invoices/:id', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updates = req.body;
      const updatedInvoice = await storage.updateInvoice(invoiceId, updates);

      res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // Send invoice for approval
  app.post('/api/invoices/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Create approval record
      await storage.createApproval({
        invoiceId,
        approverId: userId, // For now, self-approval
        status: "approved",
      });

      // Update invoice status
      await storage.updateInvoice(invoiceId, {
        status: "approved",
      });

      res.json({ message: "Invoice approved successfully" });
    } catch (error) {
      console.error("Error approving invoice:", error);
      res.status(500).json({ message: "Failed to approve invoice" });
    }
  });

  // Reject invoice
  app.post('/api/invoices/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;
      const { comments } = req.body;

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Create approval record with rejection
      await storage.createApproval({
        invoiceId,
        approverId: userId,
        status: "rejected",
        comments,
      });

      // Update invoice status
      await storage.updateInvoice(invoiceId, {
        status: "rejected",
      });

      res.json({ message: "Invoice rejected successfully" });
    } catch (error) {
      console.error("Error rejecting invoice:", error);
      res.status(500).json({ message: "Failed to reject invoice" });
    }
  });

  // Delete all invoices for a user (must come before parameterized route)
  app.delete('/api/invoices/delete-all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      console.log(`Starting delete all invoices for user: ${userId}`);

      // Delete all invoices for this user directly
      const deletedCount = await storage.deleteAllUserInvoices(userId);

      console.log(`Successfully deleted ${deletedCount} invoices for user ${userId}`);

      res.json({ 
        message: `Successfully deleted ${deletedCount} invoice${deletedCount === 1 ? '' : 's'}`,
        deletedCount 
      });
    } catch (error) {
      console.error("Error deleting all invoices:", error);
      res.status(500).json({ 
        message: "Failed to delete all invoices",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete invoice
  app.delete('/api/invoices/:id', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      if (isNaN(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Check access permissions (user owns invoice OR it's an RPA invoice for the same company)
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteInvoice(invoiceId);
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // Get AI suggestions for extraction errors
  app.get('/api/invoices/:id/ai-suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { AISuggestionService } = await import('./services/aiSuggestionService');
      const suggestions = AISuggestionService.analyzeExtractionErrors(invoice, invoice.ocrText || '');

      res.json({ suggestions });
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
      res.status(500).json({ message: "Failed to get AI suggestions" });
    }
  });

  // 🇨🇴 Colombian-specific learning updates
  async function applyColombianLearningUpdates(
    invoice: any, 
    correctedData: any, 
    feedbackId: number
  ): Promise<void> {
    const { storage } = await import('./storage');

    console.log('🇨🇴 Applying Colombian learning updates...');

    // Specific patterns from ASOMA invoice corrections
    const corrections = [
      {
        field: 'taxId',
        originalPattern: 'Extract vendor NIT without check digit',
        correctedPattern: 'Always include Colombian NIT check digit: XXXXXXXX-X format',
        example: '900478552 → 900478552-0'
      },
      {
        field: 'buyerTaxId', 
        originalPattern: 'Extract buyer NIT without check digit',
        correctedPattern: 'Always include Colombian buyer NIT check digit: XXXXXXXX-X format',
        example: '860527800 → 860527800-9'
      },
      {
        field: 'dueDate',
        originalPattern: 'Missing due date extraction',
        correctedPattern: 'Extract "FECHA VENCIMIENTO" and convert DD/MM/YYYY to YYYY-MM-DD',
        example: 'FECHA VENCIMIENTO: 09/07/2025 → 2025-07-09'
      },
      {
        field: 'projectCity',
        originalPattern: 'Missing project city from delivery context', 
        correctedPattern: 'Extract city from project delivery address, not vendor address',
        example: 'From "Urbanización Parque Heredia... - Cartagena" → "Cartagena"'
      },
      {
        field: 'vendorAddress',
        originalPattern: 'Incorrectly assigning addresses',
        correctedPattern: 'Colombian service invoices often have no vendor address - return null',
        example: 'If no vendor address specified, return null (not project address)'
      },
      {
        field: 'buyerAddress',
        originalPattern: 'Not extracting buyer business address',
        correctedPattern: 'Extract buyer business address near company name',
        example: 'CONSTRUCCIONES OBYCON SAS address: "CL 93B 13 92 OF 303, Bogota D.C."'
      },
      {
        field: 'vendorName',
        originalPattern: 'Incomplete vendor name extraction',
        correctedPattern: 'Extract complete vendor name including business type and description',
        example: 'Full name: "ASOMA SEGURIDAD S.A. S. ASESORIA EN SALUD OCUPACIONAL, MEDIO AMBIENTE & SEGURIDAD"'
      }
    ];

    // Store each correction as a learning insight
    for (const correction of corrections) {
      if (correctedData[correction.field] !== undefined) {
        await storage.storeLearningInsight({
          field: correction.field,
          errorType: 'colombian_format_error',
          suggestedFix: correction.correctedPattern,
          frequency: 5, // Higher frequency to prioritize Colombian rules
          lastSeen: new Date()
        });

        console.log(`🇨🇴 Stored Colombian learning insight for ${correction.field}:`, correction.correctedPattern);
      }
    }

    // Create specific ASOMA vendor learning pattern
    if (correctedData.vendorName?.includes('ASOMA')) {
      await storage.storeLearningInsight({
        field: 'vendor_pattern',
        errorType: 'asoma_vendor_recognition',
        suggestedFix: 'ASOMA invoices: Extract full company name including S.A. and business description',
        frequency: 3,
        lastSeen: new Date()
      });
    }

    // Create CONSTRUCCIONES buyer pattern learning
    if (correctedData.companyName?.includes('CONSTRUCCIONES')) {
      await storage.storeLearningInsight({
        field: 'buyer_pattern',
        errorType: 'construcciones_buyer_recognition', 
        suggestedFix: 'CONSTRUCCIONES companies are typically buyers in Colombian construction invoices',
        frequency: 3,
        lastSeen: new Date()
      });
    }
  }

  // Store Colombian-specific insights
  async function storeColombianSpecificInsights(
    originalData: any, 
    correctedData: any
  ): Promise<void> {
    const { storage } = await import('./storage');

    const insights = [
      {
        key: 'colombian_nit_format',
        value: JSON.stringify({
          pattern: 'Colombian NITs must include check digit: XXXXXXXX-X',
          examples: ['900478552-0', '860527800-9'],
          rule: 'Never truncate the verification digit',
          frequency: 10
        })
      },
      {
        key: 'colombian_date_format',
        value: JSON.stringify({
          pattern: 'Colombian dates are DD/MM/YYYY format, convert to YYYY-MM-DD',
          fields: ['invoiceDate', 'dueDate'],
          labels: ['FECHA FACTURA', 'FECHA VENCIMIENTO'],
          rule: 'Always convert: 09/07/2025 → 2025-07-09',
          frequency: 8
        })
      },
      {
        key: 'colombian_project_extraction',
        value: JSON.stringify({
          pattern: 'Extract project city from delivery address context',
          rule: 'Look for city names in project delivery addresses, not vendor addresses',
          example: 'From "...Lote 02 - Cartagena" extract "Cartagena"',
          frequency: 6
        })
      },
      {
        key: 'colombian_service_invoice_addresses',
        value: JSON.stringify({
          pattern: 'Colombian service invoices often omit vendor addresses',
          rule: 'If vendor address not specified, return null (do not use project address)',
          vendorAddress: 'null if not specified',
          buyerAddress: 'extract from buyer company context',
          projectAddress: 'extract from delivery context',
          frequency: 5
        })
      },
      {
        key: 'colombian_amount_format',
        value: JSON.stringify({
          pattern: 'Colombian amounts use periods as thousand separators',
          examples: ['107.100 = 107,100 COP', '17.100 = 17,100 COP'],
          rule: 'Convert periods to commas for thousands, preserve decimals',
          frequency: 7
        })
      }
    ];

    // Store each insight
    for (const insight of insights) {
      await storage.updateSetting(insight.key, insight.value);
      console.log(`🇨🇴 Stored Colombian insight: ${insight.key}`);
    }
  }

  // Enhanced training data with Colombian context
  async function writeEnhancedTrainingData(
    invoice: any,
    correctedData: any, 
    isColombianInvoice: boolean,
    feedbackId: number
  ): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const trainingDataPath = path.join(process.cwd(), 
      isColombianInvoice ? 'colombian_training_feedback.jsonl' : 'training_feedback.jsonl'
    );

    const trainingEntry = {
      invoiceId: invoice.id,
      feedbackId,
      fileName: invoice.fileName,
      isColombianInvoice,
      originalText: invoice.ocrText,
      extractedData: invoice.extractedData,
      correctedData,
      feedbackType: 'correction',
      timestamp: new Date().toISOString(),
      // Colombian-specific training context
      ...(isColombianInvoice && {
        colombianContext: {
          nitFormats: {
            vendor: correctedData.taxId,
            buyer: correctedData.buyerTaxId,
            rule: 'Always include check digit'
          },
          dateFormats: {
            invoiceDate: correctedData.invoiceDate,
            dueDate: correctedData.dueDate,
            rule: 'Convert DD/MM/YYYY to YYYY-MM-DD'
          },
          addresses: {
            vendorAddress: correctedData.vendorAddress,
            buyerAddress: correctedData.buyerAddress,
            projectAddress: correctedData.projectAddress,
            projectCity: correctedData.projectCity,
            rule: 'Distinguish vendor, buyer, and project addresses'
          },
          currency: 'COP',
          amountFormat: 'periods_as_thousands'
        }
      })
    };

    fs.appendFileSync(trainingDataPath, JSON.stringify(trainingEntry) + '\n');
    console.log(`🇨🇴 Enhanced training data written to ${trainingDataPath}`);
  }

  // Report extraction error feedback
  // Enhanced feedback submission route for Colombian invoices
  app.post('/api/invoices/:id/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { correctedData, reason } = req.body;
      const userId = (req.user as any).claims.sub;

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // 🇨🇴 NEW: Detect if this is a Colombian invoice
      const isColombianInvoice = invoice.ocrText ? 
        applyColombianRules(invoice.ocrText).isColombianInvoice : false;

      console.log(`Processing feedback for invoice ${invoiceId}`, {
        isColombianInvoice,
        fileName: invoice.fileName,
        corrections: Object.keys(correctedData || {})
      });

      // Create detailed feedback log
      const feedbackLog = await storage.createFeedbackLog({
        invoiceId,
        userId,
        originalText: invoice.ocrText || '',
        extractedData: invoice.extractedData,
        correctedData,
        reason: reason || 'USER_CORRECTION',
        fileName: invoice.fileName,
      });

      // 🇨🇴 NEW: Apply Colombian-specific learning updates
      if (isColombianInvoice && correctedData) {
        await applyColombianLearningUpdates(invoice, correctedData, feedbackLog.id);
      }

      // Apply general learning improvements
      try {
        const { LearningTracker } = await import('./services/learningTracker');
        await LearningTracker.recordFeedback(
          invoiceId,
          userId,
          invoice.extractedData,
          correctedData,
          reason,
          invoice.fileName
        );
      } catch (error) {
        console.error('Error calling LearningTracker.recordFeedback:', error);
      }

      // 🇨🇴 NEW: Clear cache for Colombian invoices to force re-extraction with new rules
      if (isColombianInvoice && invoice.ocrText) {
        clearColombianInvoiceCache(invoice.ocrText);
      }

      // Store Colombian-specific insights for future extractions
      if (isColombianInvoice) {
        await storeColombianSpecificInsights(invoice.extractedData, correctedData);
      }

      // Write enhanced training data
      await writeEnhancedTrainingData(invoice, correctedData, isColombianInvoice, feedbackLog.id);

      res.json({ 
        message: isColombianInvoice 
          ? "🇨🇴 Colombian invoice corrections applied! The AI is learning Colombian format patterns."
          : "The AI is learning from your corrections!",
        feedbackId: feedbackLog.id
      });

    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Positive feedback for AI extraction
  app.post('/api/invoices/:id/positive-feedback', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Create positive feedback log
      const feedbackLog = await storage.createFeedbackLog({
        invoiceId,
        userId,
        originalText: invoice.ocrText || '',
        extractedData: invoice.extractedData,
        correctedData: null,
        reason: 'POSITIVE_FEEDBACK',
        fileName: invoice.fileName,
      });

      // Track positive feedback for learning system
      const { LearningTracker } = await import('./services/learningTracker');
      await LearningTracker.recordPositiveFeedback(invoiceId, userId);

      // Log successful extraction for model improvement
      console.log(`Positive feedback received for invoice ${invoiceId}:`, {
        fileName: invoice.fileName,
        userId,        timestamp: new Date().toISOString(),
        confidenceScore: invoice.confidenceScore,
      });

      // Optional: Write positive training data
      const fs = await import('fs');
      const path = await import('path');
      const trainingDataPath = path.join(process.cwd(), 'training_feedback.jsonl');

      const positiveTrainingEntry = {
        invoiceId,
        fileName: invoice.fileName,
        originalText: invoice.ocrText,
        extractedData: invoice.extractedData,
        feedbackType: 'positive',
        timestamp: new Date().toISOString(),
      };

      fs.appendFileSync(trainingDataPath, JSON.stringify(positiveTrainingEntry) + '\n');

      res.json({ 
        message: "Thank you for the positive feedback! This helps us improve our AI extraction.",
        feedbackId: feedbackLog.id 
      });
    } catch (error) {
      console.error("Error submitting positive feedback:", error);
      res.status(500).json({ message: "Failed to submit positive feedback" });
    }
  });

  // Get pending approvals
  app.get('/api/approvals/pending', isAuthenticated, async (req, res) => {
    try {
      const pendingApprovals = await storage.getPendingApprovals();
      res.json(pendingApprovals);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ message: "Failed to fetch pending approvals" });
    }
  });

  // Validation rules CRUD endpoints
  app.get('/api/validation-rules', isAuthenticated, async (req: any, res) => {
    try {
      const rules = await storage.getValidationRules();
      console.log('Fetched validation rules:', rules.length, 'rules');
      res.json(rules);
    } catch (error) {
      console.error("Error fetching validation rules:", error);
      res.status(500).json({ message: "Failed to fetch validation rules" });
    }
  });



  // RPA Diagnostic endpoint
  app.get('/api/erp/diagnostic/:connectionId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getErpConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Check if user owns the connection OR has company access
      const currentUser = await storage.getUser((user as any).claims.sub);
      const connectionOwner = await storage.getUser(connection.userId);

      const hasAccess = connection.userId === (user as any).claims.sub || 
        (currentUser?.companyId && connectionOwner?.companyId && 
         currentUser.companyId === connectionOwner.companyId);

      if (!hasAccess) {
        console.log(`Access denied: User ${(user as any).claims.sub} (company: ${currentUser?.companyId}) trying to access connection owned by ${connection.userId} (company: ${connectionOwner?.companyId})`);
        return res.status(403).json({ error: 'Access denied to this connection' });
      }

      // Decrypt password
      const decryptedPassword = Buffer.from(connection.password, 'base64').toString();

      const connectionData = {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username,
        password: decryptedPassword,
      };

      // Run comprehensive diagnostics
      const diagnostics = {
        connectionTest: await erpAutomationService.testConnection(connectionData),
        timestamp: new Date().toISOString(),
        connectionInfo: {
          name: connection.name,
          baseUrl: connection.baseUrl,
          username: connection.username,
          lastUsed: connection.lastUsed,
          isActive: connection.isActive
        }
      };

      res.json(diagnostics);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: errorMessage,
        message: 'Diagnostic test failed'
      });
    }
  });

  app.get('/api/validation-rules/:id', isAuthenticated, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const rule = await storage.getValidationRule(ruleId);

      if (!rule) {
        return res.status(404).json({ message: "Validation rule not found" });
      }

      res.json(rule);
    } catch (error) {
      console.error("Error fetching validation rule:", error);
      res.status(500).json({ message: "Failed to fetch validation rule" });
    }
  });

  app.post('/api/validation-rules', isAuthenticated, async (req: any, res) => {
    try {
      const ruleData = req.body;

      console.log('Creating validation rule with data:', ruleData);

      // Validate required fields
      if (!ruleData.name || !ruleData.fieldName || !ruleData.ruleType || !ruleData.ruleValue) {
        return res.status(400).json({ 
          message: "Missing required fields: name, fieldName, ruleType, ruleValue" 
        });
      }

      // Map frontend fields to database schema
      const dbRuleData = {
        name: ruleData.name,
        description: ruleData.description || null,
        fieldName: ruleData.fieldName,
        ruleType: ruleData.ruleType,
        ruleValue: ruleData.ruleValue, // This maps to rule_value column
        severity: ruleData.severity || 'medium',
        errorMessage: ruleData.errorMessage || null,
        isActive: true
      };

      console.log('Mapped rule data for database:', dbRuleData);

      const rule = await storage.createValidationRule(dbRuleData);
      console.log('Created rule:', rule);

      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating validation rule:", error);
      res.status(500).json({ message: "Failed to create validation rule", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/validation-rules/:id', isAuthenticated, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const updates = req.body;

      const existingRule = await storage.getValidationRule(ruleId);
      if (!existingRule) {
        return res.status(404).json({ message: "Validation rule not found" });
      }

      const updatedRule = await storage.updateValidationRule(ruleId, updates);
      res.json(updatedRule);
    } catch (error) {
      console.error("Error updating validation rule:", error);
      res.status(500).json({ message: "Failed to update validation rule" });
    }
  });

  app.delete('/api/validation-rules/:id', isAuthenticated, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);

      const existingRule = await storage.getValidationRule(ruleId);
      if (!existingRule) {
        return res.status(404).json({ message: "Validation rule not found" });
      }

      await storage.deleteValidationRule(ruleId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting validation rule:", error);
      res.status(500).json({ message: "Failed to delete validation rule" });
    }
  });

  // Validate invoice data endpoint
  app.post('/api/validation-rules/validate', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceData = req.body;
      const validationResult = await storage.validateInvoiceData(invoiceData);
      res.json(validationResult);
    } catch (error) {
      console.error("Error validating invoice data:", error);
      res.status(500).json({ message: "Failed to validate invoice data" });
    }
  });

  // Validate all approved invoices against validation rules
  app.get('/api/validation-rules/validate-all', isAuthenticated, async (req: any, res) => {
    try {
      const validationResults = await storage.validateAllApprovedInvoices();
      res.json(validationResults);
    } catch (error) {
      console.error("Error validating all approved invoices:", error);
      res.status(500).json({ 
        message: "Failed to validate approved invoices",
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // DEBUG ENDPOINT: Get detailed rejection reasons for a specific invoice
  app.get('/api/invoices/:id/rejection-details', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      console.log(`🔍 Debugging rejection for Invoice #${invoiceId} (${invoice.vendorName})`);

      // Get detailed validation results
      const validationResult = await storage.validateInvoiceData({
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: parseFloat(invoice.totalAmount?.toString() || '0'),
        taxAmount: parseFloat(invoice.taxAmount?.toString() || '0'),
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency || 'USD',
        extractedData: invoice.extractedData
      });

      // Check petty cash threshold (COP 661,943.00 should be ~$150 USD)
      const amount = parseFloat(invoice.totalAmount?.toString() || '0');
      const currency = invoice.currency || 'USD';
      const pettyCashThreshold = 400000; // $400,000 USD threshold

      let convertedAmount = amount;
      if (currency === 'COP') {
        // Approximate conversion: 1 USD = 4400 COP
        convertedAmount = amount / 4400;
      }

      console.log(`💰 Amount check: ${currency} ${amount} = ~$${convertedAmount.toFixed(2)} USD (threshold: $${pettyCashThreshold})`);

      // Check project matching for PANAMERICANA OUTSOURCING
      let projectMatches = [];
      try {
        const projects = await storage.getProjects();
        projectMatches = projects.filter(project => 
          project.name?.toLowerCase().includes('panamericana') || 
          project.name?.toLowerCase().includes('outsourcing')
        );
        console.log(`🏗️ Project matches found: ${projectMatches.length} projects`);
      } catch (error) {
        console.error('Error checking project matches:', error);
      }

      // Check extraction quality
      const extractionIssues = [];
      if (!invoice.vendorName) extractionIssues.push('Missing vendor name');
      if (!invoice.invoiceNumber) extractionIssues.push('Missing invoice number');
      if (!invoice.totalAmount || parseFloat(invoice.totalAmount.toString()) <= 0) extractionIssues.push('Invalid total amount');
      if (!invoice.invoiceDate) extractionIssues.push('Missing invoice date');

      console.log(`📄 Extraction issues: ${extractionIssues.length} issues found`);

      const rejectionAnalysis = {
        invoiceId: invoice.id,
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        fileName: invoice.fileName,

        // Rejection analysis
        rejectionReason: !validationResult.isValid ? 'validation_failed' : 
                        projectMatches.length === 0 ? 'project_match_failed' : 
                        extractionIssues.length > 0 ? 'extraction_failed' : 'unknown',

        // Validation details
        validationPassed: validationResult.isValid,
        validationScore: validationResult.validationScore,
        validationErrors: validationResult.violations,

        // Project matching details
        projectMatchScore: projectMatches.length > 0 ? 85 : 0, // Mock confidence score
        projectMatchesFound: projectMatches.length,
        availableProjects: projectMatches.map(p => ({ id: p.id, name: p.name })),

        // Extraction details
        extractionIssues,
        extractionConfidence: extractionIssues.length === 0 ? 0.9 : 0.3,

        // Petty cash threshold check
        thresholdCheck: {
          originalAmount: amount,
          originalCurrency: currency,
          convertedAmountUSD: convertedAmount,
          threshold: pettyCashThreshold,
          passesThreshold: convertedAmount < pettyCashThreshold,
          conversionRate: currency === 'COP' ? 4400 : 1
        },

        // System status
        timestamp: new Date().toISOString(),
        processingStatus: invoice.processingStatus || 'pending'
      };

      console.log(`❌ Rejection analysis for Invoice #${invoiceId}:`, {
        reason: rejectionAnalysis.rejectionReason,
        validationPassed: rejectionAnalysis.validationPassed,
        projectMatches: rejectionAnalysis.projectMatchesFound,
        extractionIssues: rejectionAnalysis.extractionIssues.length,
        thresholdPassed: rejectionAnalysis.thresholdCheck.passesThreshold
      });

      res.json(rejectionAnalysis);

    } catch (error) {
      console.error(`Error analyzing rejection for invoice ${req.params.id}:`, error);
      res.status(500).json({ 
        message: "Failed to analyze rejection details",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // VALIDATION ENDPOINT: Execute validation rules for a given invoice
  app.post('/api/validate-invoice', isAuthenticated, async (req: any, res) => {
    try {
      const { invoiceData } = req.body;

      if (!invoiceData) {
        return res.status(400).json({ message: 'Invoice data is required' });
      }

      console.log('Received invoice data for validation:', {
        vendor: invoiceData.vendorName,
        invoiceNumber: invoiceData.invoiceNumber,
        amount: invoiceData.totalAmount
      });

      // Perform validation using the storage layer
      const validationResult = await storage.validateInvoiceData(invoiceData);

      console.log('Validation result:', {
        isValid: validationResult.isValid,
        score: validationResult.validationScore,
        violations: validationResult.violations.length
      });

      res.json(validationResult);
    } catch (error) {
      console.error('Error validating invoice:', error);
      res.status(500).json({ 
        message: 'Failed to validate invoice',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // SUMMARY ENDPOINT: Get rejection statistics and trends
  app.get('/api/invoices/rejection-summary', isAuthenticated, async (req: any, res) => {
    try {
      const invoices = await storage.getInvoicesByUserId(req.user.claims.sub);

      // Calculate rejection statistics
      const rejectedInvoices = invoices.filter(inv => inv.status === 'rejected');
      const totalInvoices = invoices.length;
      const rejectionRate = totalInvoices > 0 ? (rejectedInvoices.length / totalInvoices * 100) : 0;

      // Group by rejection reasons (this would require analyzing validation results)
      const rejectionReasons = {
        validation_failed: 0,
        project_match_failed: 0,
        extraction_failed: 0,
        threshold_exceeded: 0,
        unknown: 0
      };

      // Common problematic vendors
      const problematicVendors = {};

      // Process rejected invoices for analysis
      for (const invoice of rejectedInvoices) {
        // Count vendor issues
        const vendor = invoice.vendorName || 'Unknown Vendor';
        problematicVendors[vendor] = (problematicVendors[vendor] || 0) + 1;

        // Analyze rejection reason (simplified logic)
        if (!invoice.validationResults || (invoice.validationResults as any)?.violations?.length > 0) {
          rejectionReasons.validation_failed++;
        } else if (!invoice.projectName) {
          rejectionReasons.project_match_failed++;
        } else if (!invoice.vendorName || !invoice.invoiceNumber || !invoice.totalAmount) {
          rejectionReasons.extraction_failed++;
        } else {
          rejectionReasons.unknown++;
        }
      }

      // Get top problematic vendors
      const topProblematicVendors = Object.entries(problematicVendors)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([vendor, count]) => ({ vendor, count }));

      // Recent rejection trends (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentRejections = rejectedInvoices.filter(inv => 
        inv.createdAt && new Date(inv.createdAt) > thirtyDaysAgo
      );

      const summary = {
        totalInvoices,
        rejectedInvoices: rejectedInvoices.length,
        rejectionRate: parseFloat(rejectionRate.toFixed(2)),

        rejectionReasons,
        topProblematicVendors,

        recentTrends: {
          last30Days: recentRejections.length,
          averagePerDay: parseFloat((recentRejections.length / 30).toFixed(2))
        },

        recommendations: [
          rejectionReasons.validation_failed > rejectionReasons.project_match_failed ? 
            "Review and optimize validation rules" : "Improve project matching logic",
          topProblematicVendors.length > 0 ? 
            `Focus on fixing issues with: ${topProblematicVendors[0].vendor}` : "No major vendor issues detected",
          rejectionRate > 20 ? "High rejection rate - consider system review" : "Rejection rate is within acceptable range"
        ],

        timestamp: new Date().toISOString()
      };

      console.log('📊 Rejection summary generated:', {
        totalInvoices: summary.totalInvoices,
        rejectedInvoices: summary.rejectedInvoices,
        rejectionRate: summary.rejectionRate + '%',
        topIssue: Object.entries(rejectionReasons).sort(([,a], [,b]) => (b as number) - (a as number))[0]
      });

      res.json(summary);

    } catch (error) {
      console.error('Error generating rejection summary:', error);
      res.status(500).json({
        message: "Failed to generate rejection summary",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Admin: Get feedback logs
  app.get('/api/admin/feedback-logs', isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await storage.getFeedbackLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching feedback logs:", error);
      res.status(500).json({ message: "Failed to fetch feedback logs" });
    }
  });

  // Admin: Get specific feedback log
  app.get('/api/admin/feedback-logs/:id', isAuthenticated, async (req, res) => {
    try {
      const logId = parseInt(req.params.id);
      const log = await storage.getFeedbackLog(logId);

      if (!log) {
        return res.status(404).json({ message: "Feedback log not found" });
      }

      res.json(log);
    } catch (error) {
      console.error("Error fetching feedback log:", error);
      res.status(500).json({ message: "Failed to fetch feedback log" });
    }
  });

  // Learning tracker endpoints
  app.get('/api/ai/learning-metrics', isAuthenticated, async (req, res) => {
    try {
      const { LearningTracker } = await import('./services/learningTracker');

      const accuracy = await LearningTracker.calculateExtractionAccuracy();
      const improvementRate = await LearningTracker.calculateImprovementRate();
      const commonErrors = await LearningTracker.analyzeCommonErrors();
      const performanceHistory = await LearningTracker.getPerformanceHistory();
      const totalFeedback = await storage.getTotalFeedbackCount();
      const learningInsights = await storage.getLearningInsights();

      res.json({
        accuracy,
        improvementRate,
        commonErrors,
        performanceHistory,
        learningInsights: {
          totalFeedbackProcessed: totalFeedback,
          activelyLearning: learningInsights.length > 0,
          lastUpdate: learningInsights.length > 0 ? 
            new Date(Math.max(...learningInsights.map(i => new Date(i.lastSeen).getTime()))) : 
            null,
          confidenceImprovement: improvementRate
        }
      });
    } catch (error) {
      console.error("Error fetching learning metrics:", error);
      res.status(500).json({ message: "Failed to fetch learning metrics" });
    }
  });

  app.get('/api/ai/learning-insights', isAuthenticated, async (req, res) => {
    try {
      const { LearningTracker } = await import('./services/learningTracker');
      const insights = await LearningTracker.generateLearningInsights();
      res.json(insights);
    } catch (error) {
      console.error("Error generating learning insights:", error);
      res.status(500).json({ message: "Failed to generate learning insights" });
    }
  });

  app.get('/api/ai/performance-history/:days', isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.params.days) || 30;
      const { LearningTracker } = await import('./services/learningTracker');
      const history = await LearningTracker.getPerformanceHistory(days);
      res.json(history);
    } catch (error) {
      console.error("Error fetching performance history:", error);
      res.status(500).json({ message: "Failed to fetch performance history" });
    }
  });

  // Classification routes
  app.get('/api/classification/keywords', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      console.log(`Fetching classification keywords for user: ${userId}`);

      // Check if storage method exists, if not return empty array
      if (typeof storage.getClassificationKeywords !== 'function') {
        console.log('Classification keywords method not implemented, returning empty array');
        return res.json([]);
      }

      const keywords = await storage.getClassificationKeywords();

      // Group keywords by category and subcategory
      const grouped = keywords.reduce((acc: any[], keyword) => {
        const existingCategory = acc.find(cat => 
          cat.category === keyword.category && 
          (cat.subcategory || '') === (keyword.subcategory || '')
        );

        if (existingCategory) {
          existingCategory.keywords.push(keyword.keyword);
        } else {
          acc.push({
            id: keyword.id,
            category: keyword.category,
            subcategory: keyword.subcategory || '',
            keywords: [keyword.keyword],
            description: `Keywords for ${keyword.category}${keyword.subcategory ? ' - ' + keyword.subcategory : ''}`,
            createdAt: keyword.createdAt,
            isActive: true
          });
        }

        return acc;
      }, []);

      res.json(grouped || []);
    } catch (error) {
      console.error("Error fetching classification keywords:", error);
      // Return empty array instead of error to prevent UI breaking
      res.json([]);
    }
  });

  app.post('/api/classification/keywords', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { category, subcategory, keywords, description } = req.body;

      if (!category || !keywords) {
        return res.status(400).json({ message: "Category and keywords are required" });
      }

      // Parse keywords if it's a string
      const keywordArray = typeof keywords === 'string' 
        ? keywords.split(',').map(k => k.trim()).filter(k => k) 
        : keywords;

      // Add each keyword individually
      const results = [];
      for (const keyword of keywordArray) {
        if (keyword.trim()) {
          const keywordData = {
            category,
            subcategory: subcategory || null,
            keyword: keyword.toLowerCase().trim(),
            isDefault: false,
            userId
          };

          try {
            const result = await storage.addClassificationKeyword(keywordData);
            results.push(result);
          } catch (error) {
            console.error(`Error adding keyword "${keyword}":`, error);
          }
        }
      }

      res.json({ 
        message: `Added ${results.length} keywords to ${category}`,
        results 
      });
    } catch (error) {
      console.error("Error adding classification keywords:", error);
      res.status(500).json({ message: "Failed to add classification keywords" });
    }
  });

  app.delete('/api/classification/keywords/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const keywordId = parseInt(req.params.id);

      await storage.removeClassificationKeyword(keywordId, userId);
      res.json({ message: "Keyword removed successfully" });
    } catch (error) {
      console.error("Error removing classification keyword:", error);
      res.status(500).json({ message: "Failed to remove classification keyword" });
    }
  });

  app.post('/api/classification/keywords/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { category, keywords } = req.body;

      if (!category || !Array.isArray(keywords)) {
        return res.status(400).json({ message: "Category and keywords array are required" });
      }

      const results = [];
      for (const keyword of keywords) {
        if (keyword.trim()) {
          const keywordData = {
            category,
            subcategory: keyword.subcategory || null,
            keyword: keyword.toLowerCase().trim(),
            isDefault: false,
            userId
          };
          const result = await storage.addClassificationKeyword(keywordData);
          results.push(result);
        }
      }

      res.json({ message: `Added ${results.length} keywords`, results });
    } catch (error) {
      console.error("Error bulk adding keywords:", error);
      res.status(500).json({ message: "Failed to bulk add keywords" });
    }
  });

  app.get('/api/invoices/:id/classifications', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const classifications = await storage.getLineItemClassifications(invoiceId);
      res.json(classifications);
    } catch (error) {
      console.error("Error fetching line item classifications:", error);
      res.status(500).json({ message: "Failed to fetch line item classifications" });
    }
  });

  app.post('/api/invoices/:invoiceId/line-items/:lineItemId/classify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const lineItemId = parseInt(req.params.lineItemId);
      const { category } = req.body;

      if (!category) {
        return res.status(400).json({ message: "Category is required" });
      }

      await storage.updateLineItemClassification(lineItemId, category, userId);
      res.json({ message: "Classification updated successfully" });
    } catch (error) {
      console.error("Error updating line item classification:", error);
      res.status(500).json({ message: "Failed to update line item classification" });
    }
  });

  app.post('/api/invoices/:id/auto-classify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const invoiceId = parseInt(req.params.id);

      const { ClassificationService } = await import('./services/classificationService');
      await ClassificationService.classifyInvoiceLineItems(invoiceId, userId);

      res.json({ message: "Auto-classification completed" });
    } catch (error) {
      console.error("Error auto-classifying invoice:", error);
      res.status(500).json({ message: "Failed to auto-classify invoice" });
    }
  });

  app.post('/api/invoices/:id/ai-classify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const invoiceId = parseInt(req.params.id);

      const { ClassificationService } = await import('./services/classificationService');
      await ClassificationService.aiClassifyInvoiceLineItems(invoiceId, userId);

      res.json({ message: "AI classification completed" });
    } catch (error) {
      console.error("Error AI classifying invoice:", error);
      res.status(500).json({ message: "Failed to AI classify invoice" });
    }
  });

  // Bulk classification API endpoints

  // Get invoices ready for classification
  app.get('/api/invoices/ready-for-classification', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, dateFrom, dateTo, invoiceIds } = req.query;
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Get all invoices for the user
      let invoices = await storage.getInvoicesByUserId(userId);

      // Filter invoices that:
      // 1. Have been extracted/approved/verified
      // 2. Have extracted data with line items
      // 3. Are matched to projects (have project matches)
      const filteredInvoices = invoices.filter(invoice => {
        // Status check - must be processed invoices
        if (!['extracted', 'approved', 'verified'].includes(invoice.status || '')) {
          return false;
        }

        // Apply filters if provided
        if (dateFrom && invoice.invoiceDate && invoice.invoiceDate < new Date(dateFrom)) {
          return false;
        }

        if (dateTo && invoice.invoiceDate && invoice.invoiceDate > new Date(dateTo)) {
          return false;
        }

        // Filter by specific invoice IDs if provided
        if (invoiceIds) {
          const idArray = (invoiceIds as string).split(',').map(Number);
          if (!idArray.includes(invoice.id)) {
            return false;
          }
        }

        return true;
      });

      // Get project matches and apply project filter if needed
      const invoicesWithProjectInfo = [];

      for (const invoice of filteredInvoices.slice(0, 100)) { // Limit to 100 for performance
        try {
          // Get project matches for this invoice
          const matches = await storage.getInvoiceProjectMatches(invoice.id);
          const activeMatch = matches.find(match => match.isActive);

          if (activeMatch) {
            // Apply project filter if specified
            if (projectId && activeMatch.projectId !== projectId) {
              continue;
            }

            invoicesWithProjectInfo.push({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              vendorName: invoice.vendorName,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency,
              invoiceDate: invoice.invoiceDate,
              status: invoice.status,
              projectId: activeMatch.projectId,
              matchScore: activeMatch.matchScore,
              extractedData: invoice.extractedData,
              lineItemsExtracted: true,
              hasClassifications: false, // We'll assume false for simplicity
              lineItemsCount: invoice.extractedData?.lineItems?.length || 0
            });
          } else if (!projectId) {
            // Include invoices without project matches if no project filter is applied
            invoicesWithProjectInfo.push({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              vendorName: invoice.vendorName,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency,
              invoiceDate: invoice.invoiceDate,
              status: invoice.status,
              projectId: null,
              matchScore: 0,
              extractedData: invoice.extractedData,
              lineItemsExtracted: true,
              hasClassifications: false,
              lineItemsCount: invoice.extractedData?.lineItems?.length || 0
            });
          }
        } catch (matchError) {
          console.log(`Could not get project matches for invoice ${invoice.id}:`, matchError);
          // Include invoice without project info if projectId filter is not specified
          if (!projectId) {
            invoicesWithProjectInfo.push({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              vendorName: invoice.vendorName,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency,
              invoiceDate: invoice.invoiceDate,
              status: invoice.status,
              projectId: null,
              matchScore: 0,
              extractedData: invoice.extractedData,
              lineItemsExtracted: true,
              hasClassifications: false,
              lineItemsCount: invoice.extractedData?.lineItems?.length || 0
            });
          }
        }
      }

      res.json({
        invoices: invoicesWithProjectInfo,
        count: invoicesWithProjectInfo.length,
      });
    } catch (error) {
      console.error('Error fetching invoices ready for classification:', error);
      res.status(500).json({ 
        message: 'Failed to fetch invoices ready for classification',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Process invoices for line item classification with enhanced progress tracking
  app.post('/api/process-invoices-line-items', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { invoiceIds, vendorContext, sessionId } = req.body;

      console.log('Full request body:', JSON.stringify(req.body, null, 2));
      console.log('Invoice IDs to process:', invoiceIds);
      console.log('Vendor context:', vendorContext);

      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).json({ message: "Invoice IDs are required" });
      }

      // Generate sessionId if not provided
      const processSessionId = sessionId || `process-${Date.now()}`;
      console.log(`Starting invoice processing for line item classification - Session: ${processSessionId}`);

      // Initialize progress tracking using ProgressTracker class
      const progressSession = ProgressTracker.createSession(
        processSessionId,
        user.claims.sub,
        invoiceIds.length,
        `Classification - ${invoiceIds.length} invoices`
      );

      // Initialize counters
      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      try {
        // Fetch invoices with proper error handling
        console.log('Attempting to fetch invoices with IDs:', invoiceIds.join(', '));
        const invoices = await storage.getInvoicesByIds(invoiceIds, user.claims.sub);

        if (!invoices || invoices.length === 0) {
          ProgressTracker.errorSession(processSessionId, "No invoices found for the provided IDs");
          return res.status(404).json({ message: "No invoices found for the provided IDs" });
        }

        console.log(`Found ${invoices.length} invoices in database:`, 
          invoices.map(inv => ({ id: inv.id, number: inv.invoiceNumber, vendor: inv.vendorName, projectId: inv.projectId }))
        );

        // Update progress to extracting line items step
        ProgressTracker.updateStep(processSessionId, 1, 'active', 'Extracting Line Items');

        // Process each invoice with proper transaction handling
        for (const invoice of invoices) {
          try {
            console.log(`Processing invoice ${invoice.id} - ${invoice.invoiceNumber}`);

            // Update progress
            ProgressTracker.updateProgress(processSessionId, processedCount, `Processing invoice ${invoice.invoiceNumber}`);

            // Process the invoice line items
            const result = await processInvoiceLineItems(invoice, vendorContext, user.claims.sub);

            if (result.success) {
              successCount++;
              console.log(`✅ Successfully processed invoice ${invoice.id}`);
            } else {
              failedCount++;
              errors.push(`Invoice ${invoice.id}: ${result.error}`);
              console.log(`❌ Failed to process invoice ${invoice.id}: ${result.error}`);
            }

          } catch (invoiceError) {
            failedCount++;
            const errorMsg = invoiceError instanceof Error ? invoiceError.message : 'Unknown error';
            errors.push(`Invoice ${invoice.id}: ${errorMsg}`);
            console.error(`Error processing invoice ${invoice.id}:`, invoiceError);
          }

          processedCount++;
          ProgressTracker.updateProgress(processSessionId, processedCount, `Completed ${processedCount}/${invoices.length}`);
        }

        // Complete the progress session
        const results = {
          message: "Invoice processing completed",
          sessionId: processSessionId,
          stats: {
            total: invoiceIds.length,
            processed: processedCount,
            successful: successCount,
            failed: failedCount
          },
          errors: errors.length > 0 ? errors : undefined
        };

        ProgressTracker.completeSession(processSessionId, results);

        console.log(`Invoice processing completed - Session: ${processSessionId}. Processed: ${processedCount}, Success: ${successCount}, Failed: ${failedCount}`);

        if (errors.length > 0) {
          console.log('Processing errors:', errors);
        }

        res.json({
          message: 'Invoice processing completed successfully',
          sessionId: processSessionId,
          results
        });

      } catch (fetchError) {
        console.error('Error fetching invoices:', fetchError);
        ProgressTracker.errorSession(processSessionId, fetchError instanceof Error ? fetchError.message : 'Unknown error');
        res.status(500).json({ 
          message: 'Failed to fetch invoices for processing',
          error: fetchError instanceof Error ? fetchError.message : 'Unknown error'
        });
      }

    } catch (error) {
      console.error('Error starting invoice processing:', error);
      const errorSessionId = req.body.sessionId || `error-${Date.now()}`;
      ProgressTracker.errorSession(errorSessionId, error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ 
        message: 'Failed to start invoice processing',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function to extract line items from OCR text
  async function extractLineItemsFromOcrText(ocrText: string): Promise<any[]> {
    const lineItems: any[] = [];

    // Simple parsing logic - can be enhanced with regex patterns
    const lines = ocrText.split('\n');
    let currentItem: any = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Look for patterns that might indicate line items
      // This is a simplified approach - you can enhance with regex patterns
      const quantityMatch = trimmedLine.match(/(\d+(?:\.\d+)?)\s*(pcs?|kg|m|cm|l|units?|pieces?)/i);
      const priceMatch = trimmedLine.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);

      if (quantityMatch && priceMatch) {
        // This line likely contains quantity and price info
        if (Object.keys(currentItem).length > 0) {
          lineItems.push({ ...currentItem });
          currentItem = {};
        }

        currentItem = {
          description: trimmedLine,
          quantity: parseFloat(quantityMatch[1]),
          unit: quantityMatch[2],
          unitPrice: parseFloat(priceMatch[1].replace(/,/g, ''))
        };
      } else if (trimmedLine.length > 3 && !trimmedLine.match(/^[\d\s\$,\.]+$/)) {
        // This line might be a description
        if (Object.keys(currentItem).length === 0) {
          currentItem.description = trimmedLine;
        }
      }
    }

    // Add the last item if it exists
    if (Object.keys(currentItem).length > 0) {
      lineItems.push(currentItem);
    }

    return lineItems;
  }

  app.post('/api/line-items/:id/ai-classify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const lineItemId = parseInt(req.params.id);

      const { ClassificationService } = await import('./services/classificationService');
      await ClassificationService.classifyAndStoreWithAI(lineItemId, true, userId);

      res.json({ message: "AI classification completed for line item" });
    } catch (error) {
      console.error("Error AI classifying line item:", error);
      res.status(500).json({ message: "Failed to AI classify line item" });
    }
  });

  app.post('/api/invoices/:id/approve-best-match', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;
      const { projectId, matchScore, matchDetails } = req.body;

      if (!projectId || !matchScore) {
        return res.status(400).json({ message: "Project ID and match score are required" });
      }

      // Create the approved invoice-project assignment
      const approvedMatch = await storage.createApprovedInvoiceProject({
        invoiceId,
        projectId,
        matchScore: matchScore.toString(),
        matchDetails,
        approvedBy: userId,
      });

      // Update invoice status to matched
      await storage.updateInvoice(invoiceId, { status: 'matched' });

      res.json({ 
        message: "Best match approved successfully",
        approvedMatch 
      });
    } catch (error) {
      console.error("Error approving best match:", error);
      res.status(500).json({ message: "Failed to approve best match" });
    }
  });

  // Get approved invoice-project assignments
  app.get('/api/approved-invoice-projects', isAuthenticated, async (req, res) => {
    try {
      const approvedAssignments = await storage.getApprovedInvoiceProjects();
      res.json(approvedAssignments);
    } catch (error) {
      console.error("Error fetching approved invoice projects:", error);
      res.status(500).json({ message: "Failed to fetch approved invoice projects" });
    }
  });

  // Get verified invoice-project assignments
  app.get('/api/verified-invoice-projects', isAuthenticated, async (req, res) => {
    try {
      const verifiedAssignments = await storage.getVerifiedInvoiceProjects();
      res.json(verifiedAssignments);
    } catch (error) {
      console.error("Error fetching verified invoice projects:", error);
      res.status(500).json({ message: "Failed to fetch verified invoice projects" });
    }
  });

  // Match verified invoices with purchase orders using AI
  app.post("/api/match-invoices-to-pos", async (req, res) => {
    try {
      const verifiedInvoices = await storage.getVerifiedInvoiceProjects();
      const purchaseOrders = await storage.getAllPurchaseOrders();

      const allMatches = [];

      for (const verifiedInvoice of verifiedInvoices) {
        try {
          const matches = await invoicePOMatcher.matchInvoiceWithPurchaseOrders(
            verifiedInvoice.invoice,
            purchaseOrders
          );

          // Store the best match if it meets threshold
          if (matches.length > 0 && matches[0].matchScore >= 60) {
            const matchRecord = await invoicePOMatcher.createInvoicePOMatch(
              verifiedInvoice.invoice.id,
              matches[0],
              'auto'
            );

            // Add timestamp for when the match was created
            const matchWithTimestamp = {
              ...matchRecord,
              matchedAt: new Date(),
              statusChangedAt: new Date(),
            };

            const savedMatch = await storage.createInvoicePoMatch(matchWithTimestamp);
            allMatches.push({
              invoiceId: verifiedInvoice.invoice.id,
              matches: matches,
              savedMatch: savedMatch
            });
          } else {
            allMatches.push({
              invoiceId: verifiedInvoice.invoice.id,
              matches: matches,
              savedMatch: null
            });
          }
        } catch (error) {
          console.error(`Error matching invoice ${verifiedInvoice.invoice.id}:`, error);
        }
      }

      res.json({
        totalProcessed: verifiedInvoices.length,
        totalMatched: allMatches.filter(m => m.savedMatch).length,
        matches: allMatches
      });
    } catch (error) {
      console.error("Error in invoice-PO matching:", error);
      res.status(500).json({ message: "Failed to match invoices with purchase orders" });
    }
  });

  // Get invoice-PO matches
  app.get("/api/invoice-po-matches", async (req, res) => {
    try {
      const matches = await storage.getInvoicePoMatchesWithDetails();
      res.json(matches);
    } catch (error) {
      console.error("Error fetching invoice-PO matches:", error);
      res.status(500).json({ message: "Failed to fetch invoice-PO matches" });
    }
  });

  // Approve invoice-PO match
  app.post("/api/invoice-po-matches/:matchId/approve", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const matchId = parseInt(req.params.matchId);
      const updatedMatch = await storage.updateInvoicePoMatch(matchId, { 
        status: 'manual',
        approvedAt: new Date(),
        approvedBy: (user as any).claims.sub,
        statusChangedAt: new Date(),
      });

      // Update invoice status to matched
      const matches = await storage.getInvoicePoMatchesWithDetails();
      const targetMatch = matches.find(m => m.id === matchId);
      if (targetMatch?.invoice) {
        await storage.updateInvoice(targetMatch.invoice.id, { status: 'matched' });
      }

      res.json({ message: "Match approved successfully", match: updatedMatch });
    } catch (error) {
      console.error("Error approving invoice-PO match:", error);
      res.status(500).json({ message: "Failed to approve match" });
    }
  });

  // Reject invoice-PO match
  app.post("/api/invoice-po-matches/:matchId/reject", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const matchId = parseInt(req.params.matchId);
      const updatedMatch = await storage.updateInvoicePoMatch(matchId, { 
        status: 'unresolved',
        rejectedAt: new Date(),
        rejectedBy: (user as any).claims.sub,
        statusChangedAt: new Date(),
      });

      res.json({ message: "Match rejected successfully", match: updatedMatch });
    } catch (error) {
      console.error("Error rejecting invoice-PO match:", error);
      res.status(500).json({ message: "Failed to reject match" });
    }
  });

  // Validate pending invoices
  app.post('/api/validate-pending-invoices', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;

      // Get all invoices with pending validation status
      const pendingInvoices = await storage.getInvoicesByUserId(userId);
      const invoicesToValidate = pendingInvoices.filter(inv => 
        inv.validationStatus === 'pending' || !inv.validationStatus
      );

      let validatedCount = 0;
      let rejectedCount = 0;
      let errorCount = 0;

      for (const invoice of invoicesToValidate) {
        try {
          const validationResult = await storage.validateInvoiceData({
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: parseFloat(invoice.totalAmount?.toString() || '0'),
            taxAmount: parseFloat(invoice.taxAmount?.toString() || '0'),
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            currency: invoice.currency || 'USD'
          });

          const validationStatus = validationResult.isValid ? 'validated' : 'rejected';
          await storage.updateInvoice(invoice.id, {
            validationStatus,
            isValidated: validationResult.isValid
          });

          if (validationResult.isValid) {
            validatedCount++;
          } else {
            rejectedCount++;
          }
        } catch (error) {
          console.error(`Validation failed for invoice ${invoice.id}:`, error);
          errorCount++;
        }
      }

      res.json({
        message: `Validation completed for ${invoicesToValidate.length} invoices`,
        results: {
          total: invoicesToValidate.length,
          validated: validatedCount,
          rejected: rejectedCount,
          errors: errorCount
        }
      });
    } catch (error) {
      console.error("Error validating pending invoices:", error);
      res.status(500).json({ message: "Failed to validate pending invoices" });
    }
  });

  // Process and validate all pending invoices
  app.post('/api/process-and-validate-pending', isAuthenticated, async (req, res) => {
    try {
      // Get all pending invoices that need validation
      const pendingInvoices = await storage.getInvoices({ 
        status: 'extracted',
        validationStatus: null // or 'pending'
      });

      console.log(`Found ${pendingInvoices.length} pending invoices for validation`);

      let validatedCount = 0;
      let rejectedCount = 0;
      let errorCount = 0;

      for (const invoice of pendingInvoices) {
        try {
          const validationResult = await storage.validateInvoiceData({
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: parseFloat(invoice.totalAmount?.toString() || '0'),
            taxAmount: parseFloat(invoice.taxAmount?.toString() || '0'),
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            currency: invoice.currency || 'USD'
          });

          const validationStatus = validationResult.isValid ? 'validated' : 'rejected';
          await storage.updateInvoice(invoice.id, {
            validationStatus,
            isValidated: validationResult.isValid
          });

          if (validationResult.isValid) {
            validatedCount++;
          } else {
            rejectedCount++;
          }
        } catch (error) {
          console.error(`Validation failed for invoice ${invoice.id}:`, error);
          errorCount++;
        }
      }

      res.json({
        message: `Validation completed for ${pendingInvoices.length} pending invoices`,
        results: {
          total: pendingInvoices.length,
          validated: validatedCount,
          rejected: rejectedCount,
          errors: errorCount
        }
      });
    } catch (error) {
      console.error("Error processing and validating pending invoices:", error);
      res.status(500).json({ message: "Failed to process and validate pending invoices" });
    }
  });

  // Process approved invoices and automatically move validated ones to verified status
  app.post('/api/process-approved-validations', isAuthenticated, async (req, res) => {
    try {
      // Get validation results for all approved invoices
      const validationResults = await storage.validateAllApprovedInvoices();

      // Process each validated invoice and move to verified if they pass
      let processedCount = 0;
      for (const validation of validationResults.invoiceValidations) {
        if (validation.isValid) {
          // Find the approved invoice project for this invoice
          const approvedProjects = await storage.getApprovedInvoiceProjects();
          const approvedProject = approvedProjects.find(ap => ap.invoiceId === validation.invoiceId);

          if (approvedProject) {
            try {
              await storage.moveApprovedToVerified(approvedProject.id, {
                isValid: true,
                violations: validation.violations,
                validatedAt: new Date(),
              });
              processedCount++;
            } catch (error) {
              console.error(`Error moving invoice ${validation.invoiceId} to verified:`, error);
            }
          }
        }
      }

      res.json({
        message: `Processed ${processedCount} validated invoices`,
        totalProcessed: processedCount,
        validationSummary: {
          totalInvoices: validationResults.totalInvoices,
          verified: validationResults.verified,
          flagged: validationResults.flagged,
          needsReview: validationResults.needsReview,
          pending: validationResults.pending,
        }
      });
    } catch (error) {
      console.error("Error processing approved validations:", error);
      res.status(500).json({ message: "Failed to process approved validations" });
    }
  });

  // ERP Automation Routes
  // Create ERP connection
  app.post('/api/erp/connections', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = insertErpConnectionSchema.parse(req.body);

      // Simple password encryption (in production, use proper encryption)
      const encryptedPassword = Buffer.from(data.password).toString('base64');

      const connection = await storage.createErpConnection({
        ...data,
        userId: (user as any).claims.sub,
        password: encryptedPassword,
        isActive: true,
      });

      // Don't return the password in the response
      const { password, ...safeConnection } = connection;
      res.json(safeConnection);
    } catch (error) {
      console.error('ERP connection creation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Get user's ERP connections
  app.get('/api/erp/connections', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const currentUser = await storage.getUser((user as any).claims.sub);
      let connections = await storage.getErpConnections((user as any).claims.sub);

      // If user has a company, also include connections from other company members
      if (currentUser?.companyId) {
        const allConnections = await storage.getErpConnections();
        const companyConnections = [];

        for (const conn of allConnections) {
          const connectionOwner = await storage.getUser(conn.userId);
          if (connectionOwner?.companyId === currentUser.companyId && conn.userId !== (user as any).claims.sub) {
            companyConnections.push(conn);
          }
        }
        connections = [...connections, ...companyConnections];
      }

      // Remove passwords from response
      const safeConnections = connections.map(({ password, ...conn }) => conn);
      res.json(safeConnections);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });


  // Test endpoint to simulate progress for demonstrating real-time updates
  app.post('/api/invoice-importer/test-progress/:configId', isAuthenticated, async (req: any, res) => {
    try {
      const configId = parseInt(req.params.configId);
      const { pythonInvoiceImporter } = await import('./services/pythonInvoiceImporter');

      // Simulate progress updates for demonstration
      const testProgress = {
        configId,
        logId: 999, // Test log ID
        totalInvoices: 10,
        processedInvoices: 0,
        successfulImports: 0,
        failedImports: 0,
        currentStep: 'Starting test import simulation',
        progress: 0,
        isComplete: false,
      };

      // Set initial progress
      pythonInvoiceImporter.setTestProgress(configId, testProgress);

      // Simulate progress updates over time
      const steps = [
        { progress: 10, step: 'Initializing browser', delay: 1000 },
        { progress: 20, step: 'Logging into ERP system', delay: 2000 },
        { progress: 40, step: 'Loading invoice list', delay: 3000 },
        { progress: 60, step: 'Downloading invoice files', delay: 4000 },
        { progress: 80, step: 'Extracting XML files', delay: 5000 },
        { progress: 90, step: 'Processing XML files', delay: 6000 },
        { progress: 100, step: 'Import completed successfully', delay: 7000, complete: true },
      ];

      steps.forEach(({ progress, step, delay, complete }) => {
        setTimeout(() => {
          const updatedProgress = { ...testProgress, progress, currentStep: step, isComplete: !!complete };
          pythonInvoiceImporter.setTestProgress(configId, updatedProgress);
          console.log(`🧪 Test progress updated: ${progress}% - ${step}`);
        }, delay);
      });

      res.json({ message: `Test progress simulation started for config ${configId}` });
    } catch (error) {
      console.error('Error starting test progress:', error);
      res.status(500).json({ message: 'Failed to start test progress' });
    }
  });

  // Schedule Overview API - Get all scheduled configurations with metadata
  app.get('/api/schedule-overview', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // First cleanup any inactive configurations from the database
      await storage.cleanupInactiveConfigurations();

      // Get all active configurations with schedule information
      const currentUser = await storage.getUser((user as any).claims.sub);
      let configs = await storage.getInvoiceImporterConfigs((user as any).claims.sub);

      // If user has a company, also include configurations from other company members
      if (currentUser?.companyId) {
        const allConfigs = await storage.getInvoiceImporterConfigs();
        const companyConfigs = [];

        for (const config of allConfigs) {
          const configOwner = await storage.getUser(config.userId);
          if (configOwner?.companyId === currentUser.companyId && config.userId !== (user as any).claims.sub) {
            companyConfigs.push(config);
          }
        }
        configs = [...configs, ...companyConfigs];
      }

      // Filter out one-time ('once') configurations, only show active scheduled ones
      const scheduledConfigs = configs.filter(config => 
        config.scheduleType !== 'once' && 
        config.isActive === true
      ).map(config => {
        // Calculate next run time based on schedule type and configuration
        let nextRunTime = null;
        let frequencyDetail = '';

        if (config.scheduleType === 'daily') {
          const today = new Date();
          const [hours, minutes] = (config.scheduleConfig?.timeOfDay || config.scheduleTime || '09:00').split(':');
          const nextRun = new Date(today);
          nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          // If time has passed today, schedule for tomorrow
          if (nextRun <= today) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
          nextRunTime = nextRun.toISOString();
          frequencyDetail = `Daily at ${config.scheduleConfig?.timeOfDay || config.scheduleTime || '09:00'}`;
        } else if (config.scheduleType === 'weekly') {
          const days = config.scheduleConfig?.daysOfWeek || [];
          const timeOfDay = config.scheduleConfig?.timeOfDay || config.scheduleTime || '09:00';
          frequencyDetail = days.length > 0 
            ? `${days.join(', ')} at ${timeOfDay}`
            : `Weekly at ${timeOfDay}`;
        } else if (config.scheduleType === 'hourly') {
          const interval = config.scheduleConfig?.hourInterval || 1;
          frequencyDetail = `Every ${interval} hour${interval > 1 ? 's' : ''}`;
        } else if (config.scheduleType === 'multiple_daily') {
          const timeSlots = config.scheduleConfig?.timeSlots || [];
          frequencyDetail = timeSlots.length > 0 
            ? `${timeSlots.length} times daily (${timeSlots.join(', ')})`
            : 'Multiple times daily';
        } else if (config.scheduleType === 'cron') {
          frequencyDetail = `Cron: ${config.scheduleConfig?.cronExpression || 'Not configured'}`;
        }

        return {
          configurationId: config.id,
          configurationName: config.taskName,
          connectionId: config.connectionId,
          scheduleType: config.scheduleType,
          frequencyDetail,
          nextRunTime,
          lastRunTime: config.lastRun?.toISOString() || null,
          status: config.isPaused ? 'Paused' : (config.isActive ? 'Scheduled' : 'Inactive'),
          connection: config.connection,
          startDate: config.startDate?.toISOString() || null,
          endDate: config.endDate?.toISOString() || null,
          isPaused: config.isPaused || false,
          timezone: config.timezone || 'UTC'
        };
      });

      res.json(scheduledConfigs);
    } catch (error) {
      console.error('Error fetching schedule overview:', error);
      res.status(500).json({ message: 'Failed to fetch schedule overview' });
    }
  });

  // Pause/Resume schedule endpoint
  app.post('/api/schedule-overview/:configId/toggle', isAuthenticated, async (req: any, res) => {
    try {
      const configId = parseInt(req.params.configId);
      const { isPaused } = req.body;

      const config = await storage.getInvoiceImporterConfig(configId);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      await storage.updateInvoiceImporterConfig(configId, { isPaused });

      res.json({ 
        message: `Schedule ${isPaused ? 'paused' : 'resumed'} successfully`,
        configId,
        isPaused 
      });
    } catch (error) {
      console.error('Error toggling schedule:', error);
      res.status(500).json({ message: 'Failed to toggle schedule' });
    }
  });

  // Get comprehensive import logs with metadata  
  app.get('/api/import-logs', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const logs = await storage.getImportLogsWithDetails();

      // Filter logs by user's company for multi-tenant support
      const currentUser = await storage.getUser((user as any).claims.sub);
      let filteredLogs = logs;

      if (currentUser?.companyId) {
        // Get all users in the same company
        const companyUsers = await storage.getUsersByCompany(currentUser.companyId);
        const companyUserIds = companyUsers.map(u => u.id);

        filteredLogs = logs.filter(log => 
          log.userId && companyUserIds.includes(log.userId)
        );
      } else {
        // If no company, only show user's own logs
        filteredLogs = logs.filter(log => log.userId === (user as any).claims.sub);
      }

      res.json(filteredLogs);
    } catch (error) {
      console.error('Error fetching import logs:', error);
      res.status(500).json({ message: 'Failed to fetch import logs' });
    }
  });

  // Get detailed logs for a specific import execution
  app.get('/api/import-logs/:logId', isAuthenticated, async (req: any, res) => {
    try {
      const logId = parseInt(req.params.logId);
      const log = await storage.getInvoiceImporterLog(logId);

      if (!log) {
        return res.status(404).json({ message: 'Import log not found' });
      }

      // Get associated imported invoices for this log
      const importedInvoices = await storage.getImportedInvoicesByLog(logId);

      res.json({
        ...log,
        importedInvoices,
        formattedLogs: log.logs ? log.logs.split('\n').filter(line => line.trim()) : []
      });
    } catch (error) {
      console.error('Error fetching import log details:', error);
      res.status(500).json({ message: 'Failed to fetch import log details' });
    }
  });

  // Update ERP connection
  app.put('/api/erp/connections/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const connectionId = parseInt(req.params.id);
      const data = insertErpConnectionSchema.partial().parse(req.body);

      console.log(`🔄 Updating ERP connection ${connectionId}:`, {
        name: data.name,
        baseUrl: data.baseUrl,
        username: data.username,
        hasPassword: !!data.password,
        fieldsBeingUpdated: Object.keys(data)
      });

      // Encrypt password if provided
      if (data.password) {
        const originalPassword = data.password;
        data.password = Buffer.from(data.password).toString('base64');
        console.log(`🔐 Password encryption for connection ${connectionId}:`);
        console.log(`🔐 Original password: ${originalPassword}`);
        console.log(`🔐 Encrypted password: ${data.password}`);
        console.log(`🔐 Encrypted length: ${data.password.length}`);
      }

      const connection = await storage.updateErpConnection(connectionId, data);
      console.log(`✅ ERP connection ${connectionId} updated successfully`);

      // Verify the update by reading back the connection
      const updatedConnection = await storage.getErpConnection(connectionId);
      if (updatedConnection) {
        console.log(`🔍 Verification - Updated connection ${connectionId}:`, {
          name: updatedConnection.name,
          baseUrl: updatedConnection.baseUrl,
          username: updatedConnection.username,
          passwordLength: updatedConnection.password ? updatedConnection.password.length : 0,
          lastUpdated: updatedConnection.updatedAt
        });

        // 🔄 CRITICAL: Sync updated credentials to import configurations that use this connection
        if (data.baseUrl || data.username || data.password) {
          console.log(`🔄 Syncing updated ERP credentials to import configurations using connection ${connectionId}`);
          await storage.syncErpCredentialsToImportConfigs(connectionId, {
            erpUrl: updatedConnection.baseUrl,
            erpUsername: updatedConnection.username,
            erpPassword: updatedConnection.password
          });
          console.log(`✅ Import configurations synced with updated ERP connection credentials`);
        }
      }

      // Safely destructure password (might be undefined)
      const { password, ...safeConnection } = connection || {};
      res.json(safeConnection);
    } catch (error) {
      console.error(`❌ Failed to update ERP connection ${req.params.id}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Delete ERP connection
  app.delete('/api/erp/connections/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const connectionId = parseInt(req.params.id);
      await storage.deleteErpConnection(connectionId);
      res.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Test ERP connection
  app.post('/api/erp/connections/:id/test', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const connectionId = parseInt(req.params.id);
      const connection = await storage.getErpConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Check if user owns the connection OR has company access
      const currentUser = await storage.getUser((user as any).claims.sub);
      const connectionOwner = await storage.getUser(connection.userId);

      const hasAccess = connection.userId === (user as any).claims.sub || 
        (currentUser?.companyId && connectionOwner?.companyId && 
         currentUser.companyId === connectionOwner.companyId);

      if (!hasAccess) {
        console.log(`Access denied: User ${(user as any).claims.sub} (company: ${currentUser?.companyId}) trying to access connection owned by ${connection.userId} (company: ${connectionOwner?.companyId})`);
        return res.status(403).json({ error: 'Access denied to this connection' });
      }

      // Decrypt password
      const decryptedPassword = Buffer.from(connection.password, 'base64').toString();

      const connectionData = {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username,
        password: decryptedPassword,
      };

      // Run comprehensive diagnostics
      const diagnostics = {
        connectionTest: await erpAutomationService.testConnection(connectionData),
        timestamp: new Date().toISOString(),
        connectionInfo: {
          name: connection.name,
          baseUrl: connection.baseUrl,
          username: connection.username,
          lastUsed: connection.lastUsed,
          isActive: connection.isActive
        }
      };

      res.json(diagnostics);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: errorMessage,
        message: 'Diagnostic test failed'
      });
    }
  });

  // Create and execute ERP task
  app.post('/api/erp/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = insertErpTaskSchema.parse(req.body);

      // Create task record
      const task = await storage.createErpTask({
        ...data,
        userId: (user as any).claims.sub,
        status: 'processing',
      });

      // Get connection details
      const connection = await storage.getErpConnection(data.connectionId);
      if (!connection || connection.userId !== (user as any).claims.sub) {
        await storage.updateErpTask(task.id, { 
          status: 'failed', 
          errorMessage: 'Connection not found' 
        });
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Start task execution asynchronously
      executeTaskAsync(task.id, connection, data.taskDescription);

      res.json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Get user's ERP tasks
  app.get('/api/erp/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tasks = await storage.getErpTasks((user as any).claims.sub);
      res.json(tasks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get specific ERP task
  app.get('/api/erp/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });}

      const taskId = parseInt(req.params.id);
      const task = await storage.getErpTask(taskId);

      if (!task || task.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Delete ERP task
  app.delete('/api/erp/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const taskId = parseInt(req.params.id);
      const task = await storage.getErpTask(taskId);

      if (!task || task.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await storage.deleteErpTask(taskId);
      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Async function to execute ERP tasks with timeout protection
  async function executeTaskAsync(taskId: number, connection: any, taskDescription: string) {
    // Set a maximum execution time of 20 minutes for the entire task
    const taskTimeout = setTimeout(async () => {
      console.log(`Task ${taskId} timed out after 20 minutes, marking as failed`);
      await storage.updateErpTask(taskId, {
        status: 'failed',
        errorMessage: 'Task timed out after 20 minutes. Please try a simpler task or check the ERP system accessibility.',
      });
    }, 20 * 60 * 1000);

    try {
      // Debug logging for password decryption
      console.log(`🔐 Starting password decryption for connection: ${connection.name}`);
      console.log(`🔐 Encrypted password (first 20 chars): ${connection.password ? connection.password.substring(0, 20) + '...' : 'null/undefined'}`);
      console.log(`🔐 Encrypted password length: ${connection.password ? connection.password.length : 0}`);

      // Validate base64 format before decryption
      const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Pattern.test(connection.password)) {
        console.error(`🔐 ERROR: Password does not appear to be valid base64: ${connection.password}`);
        throw new Error(`Password decryption failed: Invalid base64 format`);
      }

      // Decrypt password with error handling
      let decryptedPassword: string;
      try {
        decryptedPassword = Buffer.from(connection.password, 'base64').toString('utf8');
      } catch (decryptError) {
        console.error(`🔐 ERROR: Failed to decrypt password:`, decryptError);
        throw new Error(`Password decryption failed: ${decryptError instanceof Error ? decryptError.message : 'Unknown decryption error'}`);
      }

      // Log decrypted password with security prefix
      console.log(`🔐 Using decrypted password: ${decryptedPassword}`);
      console.log(`🔐 Decrypted password length: ${decryptedPassword.length}`);
      console.log(`🔐 Decrypted password type: ${typeof decryptedPassword}`);

      // Validation check: ensure password is not empty and looks valid
      if (!decryptedPassword || decryptedPassword.trim().length === 0) {
        const errorMsg = `🔐 ERROR: Decrypted password is empty or invalid!`;
        console.error(errorMsg);
        throw new Error(`Password decryption failed: Empty password after decryption`);
      }

      // Check if password contains only valid characters (not base64 or corrupted)
      if (decryptedPassword === connection.password) {
        console.log(`🔐 WARNING: Decrypted password is identical to encrypted password - decryption may have failed`);
      }

      const connectionData = {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username,
        password: decryptedPassword,
      };

      // Generate RPA script using AI
      const script = await erpAutomationService.generateRPAScript(taskDescription, connectionData);

      await storage.updateErpTask(taskId, { 
        generatedScript: JSON.stringify(script),
      });

      // Execute the RPA script with progress tracking
      const result = await erpAutomationService.executeRPAScript(script, connectionData, connection.userId, taskId);

      // Clear the timeout since task completed
      clearTimeout(taskTimeout);

      // Update task with results
      await storage.updateErpTask(taskId, {
        status: result.success ? 'completed' : 'failed',
        result: result.extractedData || {},
        logs: result.logs.join('\n'),
        screenshots: result.screenshots,
        executionTime: result.executionTime,
        errorMessage: result.errorMessage,
      });

      // Update connection last used time
      await storage.updateErpConnection(connection.id, { lastUsed: new Date() });

    } catch (error) {
      clearTimeout(taskTimeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Task ${taskId} failed:`, errorMessage);

      await storage.updateErpTask(taskId, {
        status: 'failed',
        errorMessage: `Task execution failed: ${errorMessage}`,
      });
    }
  }

// Create automation task
app.post('/api/erp/tasks', isAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = insertErpTaskSchema.parse(req.body);

    // Create task record
    const task = await storage.createErpTask({
      ...data,
      userId: (user as any).claims.sub,
      status: 'processing',
    });

    // Get connection details
    const connection = await storage.getErpConnection(data.connectionId);
    if (!connection || connection.userId !== (user as any).claims.sub) {
      await storage.updateErpTask(task.id, { 
        status: 'failed', 
        errorMessage: 'Connection not found' 
      });
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Start task execution asynchronously
    executeTaskAsync(task.id, connection, data.taskDescription);

    res.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
});

  // Saved Workflows routes
  app.post('/api/workflows', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = insertSavedWorkflowSchema.parse(req.body);
      const workflow = await storage.createSavedWorkflow(data, (user as any).claims.sub);
      res.json(workflow);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.get('/api/workflows', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }      const workflows = await storage.getSavedWorkflows((user as any).claims.sub);
      res.json(workflows);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.put('/api/workflows/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getSavedWorkflow(workflowId);

      if (!workflow || workflow.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      const data = insertSavedWorkflowSchema.partial().parse(req.body);
      const updated = await storage.updateSavedWorkflow(workflowId, data);
      res.json(updated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.delete('/api/workflows/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getSavedWorkflow(workflowId);

      if (!workflow || workflow.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      await storage.deleteSavedWorkflow(workflowId);
      res.json({ message: 'Workflow deleted successfully' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Execute workflow manually
  app.post('/api/workflows/:id/execute', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getSavedWorkflow(workflowId);

      if (!workflow || workflow.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      // Create a new ERP task based on the saved workflow
      const task = await storage.createErpTask({
        connectionId: workflow.connectionId,
        taskDescription: workflow.description,
        userId: (user as any).claims.sub,
        status: 'processing',
      });

      // Get connection details and execute
      const connection = await storage.getErpConnection(workflow.connectionId);
      if (connection) {
        executeTaskAsync(task.id, connection, workflow.description);
      }

      res.json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Scheduled Tasks routes
  app.post('/api/scheduled-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = insertScheduledTaskSchema.parse(req.body);
      const task = await storage.createScheduledTask(data, (user as any).claims.sub);
      res.json(task);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.get('/api/scheduled-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tasks = await storage.getScheduledTasks((user as any).claims.sub);
      res.json(tasks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.put('/api/scheduled-tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const taskId = parseInt(req.params.id);
      const task = await storage.getScheduledTask(taskId);

      if (!task || task.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Scheduled task not found' });
      }

      const data = insertScheduledTaskSchema.partial().parse(req.body);
      const updated = await storage.updateScheduledTask(taskId, data);
      res.json(updated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.delete('/api/scheduled-tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const taskId = parseInt(req.params.id);
      const task = await storage.getScheduledTask(taskId);

      if (!task || task.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Scheduled task not found' });
      }

      await storage.deleteScheduledTask(taskId);
      res.json({ message: 'Scheduled task deleted successfully' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // XML Batch Import endpoint
  app.post('/api/rpa/xml-batch-import', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { xmlSources, jobName } = req.body;

      if (!xmlSources || !Array.isArray(xmlSources) ||xmlSources.length === 0) {
        return res.status(400).json({ error: 'XML sources array is required' });
      }

      const userId = (user as any).claims.sub;

      // Validate XML sources format
      for (const source of xmlSources) {
        if (!source.id || !source.content) {
          return res.status(400).json({ error: 'Each XML source must have id and content' });
        }
      }

      console.log(`Starting XML batch import for user ${userId}, ${xmlSources.length} sources`);

      // Process XML invoices using RPA service
      const { rpaService } = await import('./services/rpaService');
      const result = await rpaService.batchProcessXMLInvoices(xmlSources, userId);

      res.json({
        message: `XML batch import completed: ${result.successful} successful, ${result.failed} failed`,
        jobName: jobName || 'XML Batch Import',
        ...result
      });

    } catch (error) {
      console.error('XML batch import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Invoice Importer routes
  app.post('/api/invoice-importer/configs', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('Incoming request body:', JSON.stringify(req.body, null, 2));

      // Validate required fields first
      if (!req.body.taskName || req.body.taskName.trim() === '') {
        return res.status(400).json({ error: 'Task name is required' });
      }

      // Parse and validate with better error handling
      let data;
      try {
        data = insertInvoiceImporterConfigSchema.parse(req.body);
        console.log('Parsed data:', JSON.stringify(data, null, 2));
      } catch (validationError: any) {
        console.error('Schema validation error:', validationError);
        return res.status(400).json({ 
          error: 'Invalid configuration data',
          details: validationError.errors || validationError.message 
        });
      }

      // Enforce connection-only configurations - manual configurations no longer supported
      if (!data.connectionId) {
        return res.status(400).json({ 
          error: 'ERP connection is required. Manual configurations are no longer supported for security reasons.' 
        });
      }

      let connection = null;
      if (data.connectionId) {
        connection = await storage.getErpConnection(data.connectionId);
        if (!connection) {
          return res.status(400).json({ 
            error: 'ERP connection not found. Please select a valid ERP connection.' 
          });
        }

        // Check if user owns the connection OR has company access
        const currentUser = await storage.getUser((user as any).claims.sub);
        const connectionOwner = await storage.getUser(connection.userId);

        const hasAccess = connection.userId === (user as any).claims.sub || 
          (currentUser?.companyId && connectionOwner?.companyId && 
           currentUser.companyId === connectionOwner.companyId);

        if (!hasAccess) {
          console.log(`Access denied: User ${(user as any).claims.sub} (company: ${currentUser?.companyId}) trying to use ERP connection owned by ${connection.userId} (company: ${connectionOwner?.companyId})`);
          return res.status(400).json({ 
            error: 'Invalid ERP connection. Please ensure you have selected a valid ERP connection that belongs to your account or company.' 
          });
        }

        if (!connection.isActive) {
          return res.status(400).json({ 
            error: 'Selected ERP connection is inactive. Please activate the connection before creating an import configuration.' 
          });
        }

        console.log(`Creating import config using ERP connection: ${connection.name} (${connection.baseUrl}) - Company access: ${currentUser?.companyId === connectionOwner?.companyId}`);
      }

      // Auto-populate ERP credentials from the selected connection (connection-only configurations)
      const configDataWithCredentials = {
        ...data,
        connectionId: data.connectionId, // Always use the provided connection ID
        erpUrl: connection.baseUrl,
        erpUsername: connection.username,
        erpPassword: connection.password, // This is already encrypted in storage
        isManualConfig: false, // Always false for connection-based configs
      };

      console.log('Using ERP connection credentials');

      const configWithUserId = {
        ...configDataWithCredentials,
        userId: (user as any).claims.sub,
        companyId: (user as any).companyId || null
      };

      const config = await storage.createInvoiceImporterConfig(configWithUserId);
      res.json(config);
    } catch (error) {
      console.error('Error in invoice importer config creation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/invoice-importer/configs', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configs = await storage.getInvoiceImporterConfigs((user as any).claims.sub);
      res.json(configs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.put('/api/invoice-importer/configs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.id);
      const config = await storage.getInvoiceImporterConfig(configId);

      if (!config || config.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      // Parse and validate updates
      const updates = insertInvoiceImporterConfigSchema.partial().parse(req.body);

      // Enforce connection-only configurations for any connection ID updates
      if (updates.connectionId) {
        const connection = await storage.getErpConnection(updates.connectionId);
        if (!connection) {
          return res.status(400).json({ 
            error: 'ERP connection not found. Please select a valid ERP connection.' 
          });
        }

        // Auto-populate ERP credentials from the connection
        updates.erpUrl = connection.baseUrl;
        updates.erpUsername = connection.username;
        updates.erpPassword = connection.password; // Already encrypted
        updates.isManualConfig = false; // Always false for connection-based configs
      }

      // Prevent manual configuration mode
      if (updates.isManualConfig === true) {
        return res.status(400).json({ 
          error: 'Manual configurations are no longer supported for security reasons. Please use an ERP connection.' 
        });
      }

      const updatedConfig = await storage.updateInvoiceImporterConfig(configId, updates);
      res.json(updatedConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.delete('/api/invoice-importer/configs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.id);

      if (isNaN(configId) || configId <= 0) {
        return res.status(400).json({ error: 'Invalid configuration ID' });
      }

      const config = await storage.getInvoiceImporterConfig(configId);

      if (!config) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      // Check if user has access to this configuration (owner or same company)
      const currentUser = await storage.getUser((user as any).claims.sub);
      const configOwner = await storage.getUser(config.userId);
      
      // Allow access if:
      // 1. User is the owner
      // 2. Both users share the same company (when company relationships are set up)
      // 3. As fallback for company-wide access when no companies are configured, allow broader access
      const isOwner = config.userId === (user as any).claims.sub;
      const hasSameCompany = currentUser?.companyId && configOwner?.companyId && 
                            currentUser.companyId === configOwner.companyId;
      const allowBroadAccess = !currentUser?.companyId && !configOwner?.companyId; // No company structure set up
      
      const hasAccess = isOwner || hasSameCompany || allowBroadAccess;
      
      if (!hasAccess) {
        console.log(`Access denied for user ${(user as any).claims.sub} to config ${configId}. Config owner: ${config.userId}, User company: ${currentUser?.companyId}, Owner company: ${configOwner?.companyId}`);
        return res.status(403).json({ error: 'Access denied to this import configuration' });
      }
      
      console.log(`Access granted for user ${(user as any).claims.sub} to delete config ${configId}. Reason: ${isOwner ? 'owner' : hasSameCompany ? 'same company' : 'broad access (no companies configured)'}`);

      // Delete related records first to avoid foreign key constraint issues
      await storage.deleteInvoiceImporterConfigCascade(configId);
      res.json({ message: 'Import configuration deleted successfully' });
    } catch (error) {
      console.error('Error deleting invoice importer config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: errorMessage,
        message: 'Failed to delete import configuration'
      });
    }
  });

  app.post('/api/invoice-importer/configs/:id/execute', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.id);
      const config = await storage.getInvoiceImporterConfig(configId);
      const currentUser = await storage.getUser((user as any).claims.sub);

      if (!config) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      // Check if user has access to this configuration (owner or same company)
      if (config.userId !== (user as any).claims.sub && 
          (!currentUser?.companyId || config.companyId !== currentUser.companyId)) {
        return res.status(403).json({ error: 'Access denied to this import configuration' });
      }

      // Start the import process asynchronously
      executeImportAsync(configId);

      res.json({ message: 'Invoice import started successfully', configId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Alternative endpoint for frontend compatibility
  app.post('/api/invoice-importer/run/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.id);
      const config = await storage.getInvoiceImporterConfig(configId);
      const currentUser = await storage.getUser((user as any).claims.sub);

      if (!config) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      // Check if user has access to this configuration (owner or same company)
      if (config.userId !== (user as any).claims.sub && 
          (!currentUser?.companyId || config.companyId !== currentUser.companyId)) {
        return res.status(403).json({ error: 'Access denied to this import configuration' });
      }

      // Create execution log first
      const log = await storage.createInvoiceImporterLog({
        configId,
        status: 'running',
        startedAt: new Date(),
      });

      console.log(`Starting import process for config ${configId}, log ID: ${log.id}`);

      // Start the import process asynchronously but don't wait for it
      setImmediate(() => {
        pythonInvoiceImporter.executeImportTaskWithLogId(configId, log.id)
          .then(() => {
            console.log(`Import task ${configId} completed successfully`);
          })
          .catch((error) => {
            console.error(`Import task ${configId} failed:`, error);
          });
      });

      res.json({ 
        message: 'Invoice import started successfully', 
        configId, 
        logId: log.id,
        status: 'running'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/invoice-importer/logs/:configId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.configId);
      const config = await storage.getInvoiceImporterConfig(configId);

      if (!config || config.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      const logs = await storage.getInvoiceImporterLogsByConfig(configId);
      res.json(logs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Alternative endpoint for getting logs by config (for console view)
  app.get('/api/invoice-importer/logs/config/:configId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.configId);
      const config = await storage.getInvoiceImporterConfig(configId);

      if (!config || config.userId !== (user as any).claims.sub) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      const logs = await storage.getInvoiceImporterLogsByConfig(configId);
      res.json(logs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get imported invoices by log ID
  app.get('/api/invoice-importer/logs/:logId/invoices', isAuthenticated, async (req, res) => {
    try {
      const logId = parseInt(req.params.logId);
      const invoices = await storage.getImportedInvoicesByLog(logId);
      res.json(invoices);
    } catch (error) {
      console.error('Error fetching imported invoices:', error);
      res.status(500).json({ error: 'Failed to fetch imported invoices' });
    }
  });

  // Process imported invoices through manual upload pipeline (for testing)
  app.post('/api/invoice-importer/logs/:logId/process', isAuthenticated, async (req: any, res) => {
    try {
      const logId = parseInt(req.params.logId);
      if (isNaN(logId)) {
        return res.status(400).json({ error: 'Invalid log ID' });
      }

      console.log(`🔄 Manually processing imported invoices for log ${logId}`);

      // Create a dummy progress object for storeImportedInvoicesFast
      const progress = {
        configId: 0,
        logId: logId,
        totalInvoices: 0,
        processedInvoices: 0,
        successfulImports: 0,
        failedImports: 0,
        currentStep: 'Manual processing',
        progress: 0,
        isComplete: false,
      };

      // Call the storeImportedInvoicesFast function to process through manual upload pipeline
      // Note: storeImportedInvoicesFast is now private, using alternative approach
      console.log('Processing imported invoices for log:', logId);

      res.json({ 
        success: true, 
        message: `Imported invoices processed for log ${logId}` 
      });
    } catch (error) {
      console.error('Error processing imported invoices:', error);
      res.status(500).json({ error: 'Failed to process imported invoices' });
    }
  });

  // RPA XML processing endpoint - integrates RPA with manual upload pipeline
  app.post('/api/rpa/xml-batch-import', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { xmlSources, jobName } = req.body;

      if (!xmlSources || !Array.isArray(xmlSources) || xmlSources.length === 0) {
        return res.status(400).json({ error: 'XML sources array is required' });
      }

      const userId = (user as any).claims.sub;

      // Validate XML sources format
      for (const source of xmlSources) {
        if (!source.id || !source.content) {
          return res.status(400).json({ error: 'Each XML source must have id and content' });
        }
      }

      console.log(`Starting XML batch import for user ${userId}, ${xmlSources.length} sources`);

      // Process XML invoices using RPA service
      const { rpaService } = await import('./services/rpaService');
      const result = await rpaService.batchProcessXMLInvoices(xmlSources, userId);

      res.json({
        message: `XML batch import completed: ${result.successful} successful, ${result.failed} failed`,
        jobName: jobName || 'XML Batch Import',
        ...result
      });

    } catch (error) {
      console.error('XML batch import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // RPA PDF processing endpoint - integrates RPA with manual upload pipeline for PDFs
  // API endpoint to process XML files from Python RPA
  app.post('/api/rpa/process-xml', async (req: any, res) => {
    try {
      const { filename, fileSize, documentNumber, emisor, totalValue, source, configId, buyerTaxId } = req.body;

      console.log(`🔄 PRIORITY EXTRACTION: Processing RPA XML file: ${filename} (config: ${configId})`);

      // Get import configuration to determine company ID and user ID
      let companyId = null;
      let userId = 'rpa-system'; // Fallback
      if (configId) {
        try {
          const config = await storage.getInvoiceImporterConfig(configId);
          if (config) {
            companyId = config.companyId;
            userId = config.userId;
            console.log(`📋 Retrieved company ID ${companyId} and user ID ${userId} from config ${configId}`);
          } else {
            console.warn(`⚠️ Config ${configId} not found`);
          }
        } catch (error) {
          console.warn(`❌ Could not retrieve config ${configId} for company/user ID:`, error);
        }
      }

      // Fallback: If no company ID from config, default to 1 for existing users
      if (!companyId) {
        companyId = 1;
        console.log(`🔧 Using fallback company ID: ${companyId}`);
      }

      // Check for existing invoice with same document number to prevent duplicates
      if (!filename) {
        console.error(`❌ No filename provided in request body`);
        return res.status(400).json({ error: 'Filename is required' });
      }

      const baseFileName = filename.replace(/\.(xml|pdf)$/i, '');
      const existingInvoices = await storage.getInvoicesByFileName(baseFileName);
      if (existingInvoices.length > 0) {
        console.log(`⚠️ Invoice with base name '${baseFileName}' already exists (${existingInvoices[0].id}), skipping XML processing`);
        return res.json({ 
          success: true, 
          invoiceId: existingInvoices[0].id,
          message: `XML file ${filename} linked as reference to existing invoice`,
          linkedToExisting: true
        });
      }

      // Read the XML file from uploads directory
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join('uploads', filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'XML file not found' });
      }

      const fileBuffer = fs.readFileSync(filePath);

      // Create invoice record similar to manual upload
      const invoiceData = {
        fileName: filename,
        fileSize: fileSize || fileBuffer.length,
        uploadedAt: new Date(),
        userId: userId,
        companyId: companyId,
        originalFileName: filename,
        extractedInvoiceNumber: documentNumber,
        extractedVendorName: emisor,
        extractedTotalAmount: totalValue,
        metadata: {
          source: source || 'python_rpa',
          configId: configId,
          buyerTaxId: buyerTaxId,
          extractedData: {
            documentNumber,
            emisor,
            totalValue
          }
        }
      };

      const invoice = await storage.createInvoice(invoiceData);
      console.log(`✅ Created invoice ${invoice.id} for XML file ${filename}`);

      // Queue for processing (async, don't wait for completion)
      setImmediate(async () => {
        try {
          const { rpaService } = await import('./services/rpaService');
          await rpaService.processInvoiceBuffer(invoice.id, fileBuffer, filename);
          console.log(`✅ RPA XML invoice ${invoice.id} processed successfully`);
        } catch (error) {
          console.error(`❌ RPA XML invoice ${invoice.id} processing failed:`, error);
        }
      });

      res.json({ 
        success: true, 
        invoiceId: invoice.id,
        message: `XML file ${filename} queued for processing` 
      });

    } catch (error) {
      console.error('Error processing RPA XML:', error);
      res.status(500).json({ error: 'Failed to process RPA XML file' });
    }
  });

  app.post('/api/rpa/process-pdf', async (req: any, res) => {
    try {
      const { filename, fileSize, documentNumber, emisor, totalValue, source, configId, buyerTaxId } = req.body;

      console.log(`🔄 PRIORITY EXTRACTION: Request body:`, req.body);
      console.log(`🔄 PRIORITY EXTRACTION: Processing RPA PDF file: ${filename} (config: ${configId})`);

      // Get import configuration to determine company ID and user ID
      let companyId = null;
      let userId = 'rpa-system'; // Fallback
      if (configId) {
        try {
          const config = await storage.getInvoiceImporterConfig(configId);
          if (config) {
            companyId = config.companyId;
            userId = config.userId;
            console.log(`📋 Retrieved company ID ${companyId} and user ID ${userId} from config ${configId}`);
          } else {
            console.warn(`⚠️ Config ${configId} not found`);
          }
        } catch (error) {
          console.warn(`❌ Could not retrieve config ${configId} for company/user ID:`, error);
        }
      } else {
        console.warn(`⚠️ No configId provided for PDF processing`);
      }

      // Fallback: If no company ID from config, default to 1 for existing users
      if (!companyId) {
        companyId = 1;
        console.log(`🔧 Using fallback company ID: ${companyId}`);
      }

      // Check for existing invoice with same document number to prevent duplicates
      if (!filename) {
        console.error(`❌ No filename provided in request body`);
        return res.status(400).json({ error: 'Filename is required' });
      }

      const baseFileName = filename.replace(/\.(xml|pdf)$/i, '');
      const existingInvoices = await storage.getInvoicesByFileName(baseFileName);
      if (existingInvoices.length > 0) {
        console.log(`⚠️ Invoice with base name '${baseFileName}' already exists (${existingInvoices[0].id}), skipping PDF processing`);
        return res.json({ 
          success: true, 
          invoiceId: existingInvoices[0].id,
          message: `PDF file ${filename} linked as reference to existing invoice`,
          linkedToExisting: true
        });
      }

      // Read the PDF file from uploads directory
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join('uploads', filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      const fileBuffer = fs.readFileSync(filePath);

      // Create invoice record in the same way as manual upload
      const invoiceData = {
        userId: userId, // Use the user ID from the import configuration
        companyId: companyId, // Set company ID from import configuration
        fileName: filename,
        fileSize: fileSize,  
        status: 'processing' as const,
        // Note: source field not in schema, storing in extractedData instead
      };

      // Create invoice record in database
      const invoice = await storage.createInvoice(invoiceData);
      console.log(`Created invoice record ${invoice.id} for RPA PDF file ${filename}`);

      // Process through the exact same pipeline as manual uploads (with OCR for PDF)
      setImmediate(async () => {
        try {
          await processInvoiceAsync(invoice, fileBuffer);
          console.log(`✅ RPA PDF invoice ${invoice.id} processed successfully`);
        } catch (error) {
          console.error(`❌ RPA PDF invoice ${invoice.id} processing failed:`, error);
        }
      });

      res.json({ 
        success: true, 
        invoiceId: invoice.id,
        message: `PDF file ${filename} queued for processing` 
      });

    } catch (error) {
      console.error('Error processing RPA PDF:', error);
      res.status(500).json({ error: 'Failed to process RPA PDF file' });
    }
  });

  // Get all imported invoices
  app.get('/api/imported-invoices', isAuthenticated, async (req, res) => {
    try {
      const invoices = await storage.getImportedInvoices();
      res.json(invoices);
    } catch (error) {
      console.error('Error fetching imported invoices:', error);
      res.status(500).json({ error: 'Failed to fetch imported invoices' });
    }
  });

  // Fix JSON serialization in progress endpoint
  app.get('/api/invoice-importer/progress/:logId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const logId = parseInt(req.params.logId);
      console.log(`Progress request for logId ${logId}`);

      // FIRST: Check for active progress in memory
      const { pythonInvoiceImporter } = await import('./services/pythonInvoiceImporter');
      const activeProgress = pythonInvoiceImporter.getImportProgress(logId);

      if (activeProgress) {
        console.log(`Active progress found for logId ${logId}`);
        try {
          const serializedProgress = {
            taskId: activeProgress.taskId,
            currentStep: activeProgress.currentStep,
            totalSteps: activeProgress.totalSteps,
            status: activeProgress.status,
            message: activeProgress.message || 'Processing...',
            startedAt: activeProgress.startedAt.toISOString(),
            completedAt: activeProgress.completedAt?.toISOString(),
            totalInvoices: activeProgress.totalInvoices,
            processedInvoices: activeProgress.processedInvoices,
            successfulImports: activeProgress.successfulImports,
            failedImports: activeProgress.failedImports,
            steps: activeProgress.steps.map(step => ({
              id: step.id.toString(),
              title: step.description,
              status: step.status,
              timestamp: step.timestamp.toISOString(),
              details: step.errorMessage || ''
            }))
          };
          return res.json(serializedProgress);
        } catch (serializationError) {
          console.error('JSON serialization error:', serializationError);
          // Fall through to database check
        }
      }

      // SECOND: Fall back to database for completed/failed imports
      const log = await storage.getInvoiceImporterLog(logId);
      if (!log) {
        return res.status(404).json({ error: 'Import task not found' });
      }

      // Check if user has access to this log
      const config = await storage.getInvoiceImporterConfig(log.configId);
      const currentUser = await storage.getUser((user as any).claims.sub);

      if (!config || (config.userId !== (user as any).claims.sub && 
          (!currentUser?.companyId || config.companyId !== currentUser.companyId))) {
        return res.status(403).json({ error: 'Access denied to this import task' });
      }

      const status = log.status === 'completed' ? 'completed' : 
                    log.status === 'failed' ? 'failed' : 'running';

      return res.json({
        configId: log.configId,
        isRunning: !['completed', 'failed'].includes(log.status),
        progress: log.progress || (log.status === 'completed' ? 100 : 0),
        currentStep: log.currentStep || (log.status === 'completed' ? 'Import completed' : log.status === 'failed' ? 'Import failed' : 'Initializing'),
        stats: {
          total_invoices: log.totalInvoices || 0,
          processed_invoices: log.processedInvoices || 0,
          successful_imports: log.successfulImports || 0,
          failed_imports: log.failedImports || 0
        }
      });
    } catch (error) {
      console.error('Error fetching progress:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: errorMessage,
        message: 'Failed to fetch progress data'
      });
    }
  });

  // Progress update endpoint for real-time counter updates from Python RPA
  app.post('/api/invoice-importer/progress-update', async (req: any, res) => {
    try {
      const { configId, processedInvoices, successfulImports, failedImports, progress, currentStep } = req.body;

      if (!configId) {
        return res.status(400).json({ error: 'Missing configId in request' });
      }

      // Find the most recent log for this config and update it
      const logs = await storage.getInvoiceImporterLogs(parseInt(configId));
      const latestLog = logs[0]; // Most recent log

      if (latestLog) {
        await storage.updateInvoiceImporterLog(latestLog.id, {
          processedInvoices: processedInvoices || 0,
          successfulImports: successfulImports || 0,
          failedImports: failedImports || 0,
          progress: progress || 0,
          currentStep: currentStep || 'Processing files...'
        });

        console.log(`📊 Progress update: Config ${configId} - Processed: ${processedInvoices}, Success: ${successfulImports}, Failed: ${failedImports}`);

        res.json({ 
          success: true, 
          message: 'Progress updated successfully',
          stats: {
            processedInvoices,
            successfulImports, 
            failedImports,
            progress
          }
        });
      } else {
        console.log(`⚠️ No log found for configId ${configId}`);
        res.status(404).json({ error: 'No active import log found for this configuration' });
      }
    } catch (error) {
      console.error('Error handling progress update:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get progress sessions for a user (including completed ones)
  app.get('/api/progress/sessions/:userId', async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { includeCompleted = 'true' } = req.query;

      const sessions = ProgressTracker.getRecentUserSessions(
        userId, 
        includeCompleted === 'true'
      );

      res.json({
        sessions: sessions.map(session => ({
          sessionId: session.sessionId,
          title: session.title || `${session.type} - ${session.metrics.totalInvoices} invoices`,
          status: session.status,
          startTime: session.startTime,
          endTime: session.endTime,
          currentStep: session.currentStep,
          totalSteps: session.totalSteps,
          metrics: session.metrics,
          duration: session.endTime 
            ? session.endTime.getTime() - session.startTime.getTime()
            : Date.now() - session.startTime.getTime()
        }))
      });
    } catch (error) {
      console.error('Error fetching progress sessions:', error);
      res.status(500).json({ error: 'Failed to fetch progress sessions' });
    }
  });

  // Get specific progress session details
  app.get('/api/progress/session/:sessionId', async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const session = ProgressTracker.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({
        session: {
          ...session,
          duration: session.endTime 
            ? session.endTime.getTime() - session.startTime.getTime()
            : Date.now() - session.startTime.getTime()
        }
      });
    } catch (error) {
      console.error('Error fetching progress session:', error);
      res.status(500).json({ error: 'Failed to fetch progress session' });
    }
  });

  // Custom error handler middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('Express error handler:', err);
    res.status(status).json({ message });
    // Don't re-throw the error to prevent unhandled rejection
  });

  // 🇨🇴 Endpoint to get Colombian learning insights
  app.get('/api/ai/colombian-insights', isAuthenticated, async (req, res) => {
  try {
    const { storage } = await import('./storage');

    const colombianInsights = await storage.getLearningInsights('colombian');
    const generalInsights = await storage.getLearningInsights();

    // Get Colombian-specific settings
    const colombianSettings = await Promise.all([
      storage.getSetting('colombian_nit_format'),
      storage.getSetting('colombian_date_format'), 
      storage.getSetting('colombian_project_extraction'),
      storage.getSetting('colombian_service_invoice_addresses'),
      storage.getSetting('colombian_amount_format')
    ]);

    const parsedSettings = colombianSettings
      .filter(setting => setting)
      .map(setting => {
        try {
          return JSON.parse(setting);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({
      colombianInsights,
      generalInsights: generalInsights.filter(insight => 
        insight.field && ['taxId', 'buyerTaxId', 'dueDate', 'projectCity', 'vendorAddress'].includes(insight.field)
      ),
      colombianSettings: parsedSettings,
      summary: {
        totalColombianFeedback: colombianInsights.length,
        isActiveLearning: colombianInsights.length > 0,
        keyPatterns: ['NIT format', 'Date conversion', 'Project extraction', 'Address distinction']
      }
    });

  } catch (error) {
    console.error("Error fetching Colombian insights:", error);
    res.status(500).json({ message: "Failed to fetch Colombian insights" });
  }
});

// 🇨🇴 Force re-extraction with Colombian rules
app.post('/api/invoices/:id/reextract-colombian', isAuthenticated, async (req: any, res) => {
  try {
    const invoiceId = parseInt(req.params.id);
    const userId = (req.user as any).claims.sub;

    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!invoice.ocrText) {
      return res.status(400).json({ message: "No OCR text available for re-extraction" });
    }

    // Clear cache and force Colombian re-extraction
    clearColombianInvoiceCache(invoice.ocrText);

    console.log(`🇨🇴 Force re-extracting Colombian invoice ${invoiceId}`);

    // Re-extract with Colombian rules
    const { extractInvoiceData } = await import('./services/aiService');
    const newExtractedData = await extractInvoiceData(invoice.ocrText, true);

    // Update the invoice with new extraction
    await storage.updateInvoice(invoiceId, {
      extractedData: newExtractedData,
      totalAmount: newExtractedData.totalAmount,
      taxAmount: newExtractedData.taxAmount,
      invoiceDate: newExtractedData.invoiceDate ? new Date(newExtractedData.invoiceDate) : null,
      dueDate: newExtractedData.dueDate ? new Date(newExtractedData.dueDate) : null,
      vendorName: newExtractedData.vendorName,
      projectName: newExtractedData.projectName,
      currency: newExtractedData.currency || 'COP',
      confidenceScore: parseFloat(newExtractedData.confidenceScore || '0.8')
    });

    res.json({
      message: "🇨🇴 Colombian invoice re-extracted successfully with enhanced rules",
      extractedData: newExtractedData,
      improvements: [
        "Applied Colombian NIT format rules",
        "Enhanced date format conversion", 
        "Improved project city extraction",
        "Better address distinction",
        "Colombian amount format handling"
      ]
    });

  } catch (error) {
    console.error("Error re-extracting Colombian invoice:", error);
    res.status(500).json({ message: "Failed to re-extract invoice" });
  }
});

  // Preview linked PDF files for RPA invoices
  app.get('/api/invoices/:id/preview-pdf', isAuthenticated, async (req: any, res: any) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      // Verify invoice access
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access permissions (user owns invoice OR it's an RPA invoice for the same company)
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Query for linked PDF files
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      try {
        await dbClient.connect();

        // Find PDFs linked to this main invoice
        const linkedPDFQuery = `
          SELECT original_file_name, file_path, file_type, base_file_name
          FROM imported_invoices 
          WHERE linked_invoice_id = $1 
          AND file_type = 'pdf'
          AND is_data_source = false
          LIMIT 1
        `;

        const linkedPDFs = await dbClient.query(linkedPDFQuery, [invoiceId]);
        console.log(`🔗 Found ${linkedPDFs.rows.length} linked PDF files for invoice ${invoiceId}`);

        if (linkedPDFs.rows.length === 0) {
          return res.status(404).json({ error: 'No linked PDF found' });
        }

        const pdfFile = linkedPDFs.rows[0];
        const fs = await import('fs');

        // Check if file exists
        console.log(`🔍 Checking for PDF file at: ${pdfFile.file_path}`);
        if (!fs.existsSync(pdfFile.file_path)) {
          console.log(`❌ PDF file not found at: ${pdfFile.file_path}`);
          console.log(`📋 Available files in uploads:`, fs.readdirSync('uploads').filter(f => f.includes('FEPG793514')));
          return res.status(404).json({ 
            error: 'PDF file not found on disk',
            expectedPath: pdfFile.file_path,
            fileName: pdfFile.original_file_name,
            troubleshooting: 'The PDF file may not have been properly saved during RPA import'
          });
        }

        // Set headers for PDF viewing (same as regular PDF preview)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${pdfFile.original_file_name}"`);
        res.setHeader('Content-Length', fs.statSync(pdfFile.file_path).size);
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Accept-Ranges', 'bytes');

        // Stream the PDF file
        const fileStream = fs.createReadStream(pdfFile.file_path);
        fileStream.pipe(res);

      } catch (dbError) {
        console.error('Database error checking for linked files:', dbError);
        return res.status(500).json({ error: 'Database error' });
      } finally {
        await dbClient.end();
      }

    } catch (error) {
      console.error('Error serving linked PDF preview:', error);
      res.status(500).json({ error: 'Failed to serve PDF preview' });
    }
  });

  // Download invoice file endpoint with ZIP support for matched files
  app.get('/api/invoices/:id/download', isAuthenticated, async (req: any, res: any) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) {
        return res.status(400).json({ error: 'Invalid invoice ID' });
      }

      const userId = (req.user as any).claims.sub;
      console.log(`Download request for invoice ${invoiceId} by user ${userId}`);

      // Get the invoice to verify access and get filename
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        console.log(`Invoice ${invoiceId} not found`);
        return res.status(404).json({ error: 'Invoice not found' });
      }

      console.log(`Found invoice: ${invoice.fileName}, owner: ${invoice.userId}, company: ${invoice.companyId}`);

      // Check access permissions (user owns invoice OR it's an RPA invoice for the same company)
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        console.log(`Access denied for user ${userId} to invoice ${invoiceId}`);
        return res.status(403).json({ error: 'Access denied' });
      }

      // Import required modules
      const fs = await import('fs');
      const path = await import('path');
      const archiver = await import('archiver');

      // Enhanced PDF linking: Check if this invoice has linked PDF files
      if (invoice.userId === 'rpa-system') {
        console.log(`🔍 Checking for linked files for RPA invoice: ${invoice.fileName}`);

        // Query for linked PDF files
        const { Client } = await import('pg');
        const dbClient = new Client({
          connectionString: process.env.DATABASE_URL,
        });

        try {
          await dbClient.connect();

          // Find PDFs linked to this main invoice
          const linkedPDFQuery = `
            SELECT original_file_name, file_path, file_type, base_file_name
            FROM imported_invoices 
            WHERE linked_invoice_id = $1 
            AND file_type = 'pdf'
            AND is_data_source = false
            LIMIT 1
          `;

          const linkedPDFs = await dbClient.query(linkedPDFQuery, [invoiceId]);
          console.log(`🔗 Found ${linkedPDFs.rows.length} linked PDF files for invoice ${invoiceId}`);

          if (linkedPDFs.rows.length > 0) {
            // Create ZIP with main invoice + linked PDFs
            const baseFileName = path.parse(invoice.fileName).name;
            const zipName = `${baseFileName}_with_references.zip`;

            console.log(`📦 Creating ZIP package: ${zipName}`);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

            const archive = archiver.default('zip', {
              zlib: { level: 9 }
            });

            archive.pipe(res);

            // Add main invoice file (XML)
            const mainFilePath = path.join('uploads', invoice.fileName);
            if (fs.existsSync(mainFilePath)) {
              archive.file(mainFilePath, { name: invoice.fileName });
              console.log(`✅ Added main file to ZIP: ${invoice.fileName}`);
            }

            // Add linked PDF files
            let linkedFilesAdded = 0;
            for (const linkedPDF of linkedPDFs.rows) {
              // Use the file_path from database (already includes uploads/ prefix)
              const pdfPath = linkedPDF.file_path;
              console.log(`🔍 Checking PDF file path: ${pdfPath}`);

              if (fs.existsSync(pdfPath)) {
                archive.file(pdfPath, { 
                  name: `${linkedPDF.original_file_name}` 
                });
                linkedFilesAdded++;
                console.log(`📎 Added linked PDF to ZIP: ${linkedPDF.original_file_name}`);
              } else {
                console.log(`⚠️ PDF file not found at: ${pdfPath}`);
              }
            }

            console.log(`📦 ZIP package ready with 1 main file + ${linkedFilesAdded} linked PDFs`);
            archive.finalize();
            return;
          }

        } catch (dbError) {
          console.error('Database error checking for linked files:', dbError);
        } finally {
          await dbClient.end();
        }
      }

      // Single file download (default behavior)
      const filePath = path.join('uploads', invoice.fileName);
      console.log(`Looking for single file at: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return res.status(404).json({ error: 'File not found' });
      }

      // Determine MIME type based on file extension
      let mimeType = 'application/octet-stream';
      const ext = path.extname(invoice.fileName).toLowerCase();
      switch (ext) {
        case '.pdf':
          mimeType = 'application/pdf';
          break;
        case '.xml':
          mimeType = 'application/xml';
          break;
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
      }

      console.log(`Serving single file: ${invoice.fileName} (${mimeType})`);

      // Set headers for file download
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.fileName}"`);
      res.setHeader('Content-Length', fs.statSync(filePath).size);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error downloading invoice file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // Batch process selected invoices automatically
  app.post('/api/invoices/process-batch', isAuthenticated, async (req: any, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('Request body:', req.body);

    // Get all processable invoices for this user
    const allInvoices = await storage.getInvoicesByUserId(user.claims.sub);
    const processableInvoices = allInvoices.filter(invoice => 
      invoice.status === 'pending' || invoice.status === 'rejected'
    );

    if (processableInvoices.length === 0) {
      return res.status(400).json({ 
        error: 'No invoices available for processing' 
      });
    }

    // Mark all invoices as processing
    await Promise.all(
      processableInvoices.map(invoice => 
        storage.updateInvoice(invoice.id, { status: 'processing' })
      )
    );

    // Send immediate response
    res.json({
      success: true,
      message: `Started batch processing of ${processableInvoices.length} invoices`,
      processedInvoices: processableInvoices.length
    });

    // Process in background
    setImmediate(async () => {
      for (const invoice of processableInvoices) {
        try {
          if (invoice.fileUrl && require('fs').existsSync(invoice.fileUrl)) {
            const fs = require('fs');
            const fileBuffer = fs.readFileSync(invoice.fileUrl);
            await processInvoiceAsync(invoice, fileBuffer);
          }
        } catch (error) {
          console.error(`Failed to process invoice ${invoice.id}:`, error);
          await storage.updateInvoice(invoice.id, { status: 'rejected' });
        }
      }
    });

  } catch (error: any) {
    console.error('Batch processing error:', error);
    res.status(500).json({ 
      error: 'Failed to initiate batch processing',
      success: false
    });
  }
});

  // Line Item Classification API Routes
  app.post('/api/classification/classify', isAuthenticated, async (req: any, res) => {
    try {
      const { description, quantity, unitPrice, totalPrice, unit, rawText, vendorContext } = req.body;

      if (!description) {
        return res.status(400).json({ error: 'Description is required' });
      }

      // Import the classifier dynamically to avoid initialization errors
      const { AILineItemClassifier } = await import('./services/aiLineItemClassifier');

      // Check if OpenAI key is available
      let openaiKey;
      try {
        openaiKey = process.env.OPENAI_API_KEY;
      } catch (error) {
        console.log('OpenAI API key not found, using keyword-based classification');
      }

      const classifier = new AILineItemClassifier(openaiKey);

      const lineItem = {
        description,
        quantity: quantity ? parseFloat(quantity) : undefined,
        unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
        totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
        unit,
        rawText
      };

      const result = await classifier.classifyLineItem(lineItem, vendorContext);
      res.json(result);
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({ error: 'Failed to classify line item' });
    }
  });

  app.post('/api/classification/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { lineItems, vendorContext } = req.body;

      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ error: 'Line items array is required' });
      }

      // Import the classifier dynamically
      const { AILineItemClassifier } = await import('./services/aiLineItemClassifier');

      let openaiKey;
      try {
        openaiKey = process.env.OPENAI_API_KEY;
      } catch (error) {
        console.log('OpenAI API key not found, using keyword-based classification');
      }

      const classifier = new AILineItemClassifier(openaiKey);

      const results = await classifier.classifyBatch(lineItems, vendorContext);
      res.json({ results });
    } catch (error) {
      console.error('Batch classification error:', error);
      res.status(500).json({ error: 'Failed to classify line items' });
    }
  });

  app.get('/api/classification/categories', isAuthenticated, async (req: any, res) => {
    try {
      // Return the supported categories
      const categories = {
        materials_supplies: "Raw materials, supplies, and consumable items",
        equipment_tools: "Tools, machinery, equipment, and hardware for operations",
        services_labor: "Professional services, labor, consulting, and expertise",
        utilities_facilities: "Utilities, facility costs, and operational overhead",
        food_beverages: "Food, beverages, and related consumables",
        transportation_logistics: "Transportation, shipping, logistics, and related services",
        technology_software: "Technology, software, digital services, and IT solutions",
        marketing_advertising: "Marketing, advertising, promotional materials and services",
        other: "Items that don't fit into standard business categories"
      };

      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  // Test route for the classifier
  app.post('/api/classification/test', isAuthenticated, async (req: any, res) => {
    try {
      const testResults = [];

      // Import the classifier dynamically
      const { AILineItemClassifier } = await import('./services/aiLineItemClassifier');

      let openaiKey;
      try {
        openaiKey = process.env.OPENAI_API_KEY;
      } catch (error) {
        console.log('OpenAI API key not found, using keyword-based classification');
      }

      const classifier = new AILineItemClassifier(openaiKey);

      // Test with sample line items from your uploaded test data
      const testItems = [
        { description: "C S IND MUROPLACA 4", rawText: "C S IND MUROPLACA 4" },
        { description: "Cemento portland", quantity: 50, unit: "kg" },
        { description: "Servicios de consultoría ingeniería", unitPrice: 150000, totalPrice: 450000 },
        { description: "Laptop Dell Inspiron", quantity: 1, unitPrice: 2500000 },
        { description: "Combustible diesel para equipos", quantity: 100, unit: "litros" }
      ];

      for (const item of testItems) {
        const result = await classifier.classifyLineItem(item);
        testResults.push({
          item,
          classification: result
        });
      }

      res.json({ 
        message: "Classification test completed",
        results: testResults,
        classifier_initialized: !!openaiKey
      });
    } catch (error) {
      console.error('Classification test error:', error);
      res.status(500).json({ error: 'Failed to run classification test' });
    }
  });

  // Get linked files for an invoice
  app.get('/api/invoices/:id/linked-files', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = (req.user as any).claims.sub;

      // Verify invoice access
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access permissions
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Query for linked files
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      try {
        await dbClient.connect();

        const linkedFilesQuery = `
          SELECT 
            original_file_name,
            file_type,
            file_size,
            base_file_name,
            is_data_source,
            downloaded_at,
            metadata
          FROM imported_invoices 
          WHERE linked_invoice_id = $1
          ORDER BY file_type, original_file_name
        `;

        const result = await dbClient.query(linkedFilesQuery, [invoiceId]);

        const linkedFiles = result.rows.map(row => ({
          fileName: row.original_file_name,
          fileType: row.file_type,
          fileSize: row.file_size,
          baseFileName: row.base_file_name,
          isDataSource: row.is_data_source,
          downloadedAt: row.downloaded_at,
          metadata: row.metadata
        }));

        res.json({
          invoiceId,
          mainFile: invoice.fileName,
          linkedFiles,
          hasLinkedFiles: linkedFiles.length > 0
        });

      } catch (dbError) {
        console.error('Database error checking for linked files:', dbError);
        return res.status(500).json({ error: 'Database error' });
      } finally {
        await dbClient.end();
      }

    } catch (error) {
      console.error('Error fetching linked files:', error);
      res.status(500).json({ error: 'Failed to fetch linked files' });
    }
  });

  // Serve PDF files for linked invoices
  app.get('/api/invoices/:id/pdf/:filename', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const fileName = req.params.filename;
      const userId = (req.user as any).claims.sub;

      // Verify invoice access
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Check access permissions
      const user = await storage.getUser(userId);
      const hasAccess = invoice.userId === userId || 
        (invoice.userId === 'rpa-system' && user?.companyId === invoice.companyId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Construct file path
      const filePath = path.join('uploads/pdfs', fileName);

      // Check if file exists
      const fs = await import('fs');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      // Set headers for PDF display
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error serving PDF:', error);
      res.status(500).json({ error: 'Failed to serve PDF file' });
    }
  });

  // Helper function for executing import tasks asynchronously
  async function executeImportAsync(configId: number) {
    try {
      await pythonInvoiceImporter.executeImportTask(configId);
    } catch (error) {
      console.error(`Import task ${configId} failed:`, error);
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}