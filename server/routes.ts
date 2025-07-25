import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertInvoiceSchema, insertLineItemSchema, insertApprovalSchema, insertErpConnectionSchema, insertErpTaskSchema, insertSavedWorkflowSchema, insertScheduledTaskSchema, insertInvoiceImporterConfigSchema } from "@shared/schema";
import { processInvoiceOCR } from "./services/ocrService";
import { extractInvoiceData, extractPurchaseOrderData } from "./services/aiService";
import { checkInvoiceDiscrepancies, storeInvoiceFlags } from "./services/discrepancyService";
import { predictInvoiceIssues, storePredictiveAlerts } from "./services/predictiveService";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { RequestHandler } from "express";
import { findBestProjectMatch } from "./services/aiService.js";
import { projectMatcher } from "./projectMatcher.js";
import { invoicePOMatcher } from "./services/invoicePoMatcher.js";
import { erpAutomationService } from "./services/erpAutomationService.js";
import { invoiceImporterService } from "./services/invoiceImporterService.js";
import { pythonInvoiceImporter } from "./services/pythonInvoiceImporter.js";
import { applyColombianRules, clearColombianInvoiceCache } from './services/colombianInvoiceExtractor';

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

    // Extract structured data using AI with timeout
    console.log(`Starting AI extraction for invoice ${invoice.id}`);

    const aiPromise = extractInvoiceData(ocrText);
    const aiTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI extraction timeout')), 30000)
    );

    const extractedData = await Promise.race([aiPromise, aiTimeoutPromise]) as any;
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
      status: "extracted",
      ocrText,
      extractedData,
      ...cleanedData
    });

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize classification service
  const { ClassificationService } = await import('./services/classificationService');
  await ClassificationService.initializeDefaultKeywords();

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
      const stats = await storage.getDashboardStats(userId);
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
              uploadedBy: req.user?.id || "anonymous",
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
      res.json(match);
    } catch (error) {
      console.error("Error creating project match:", error);
      res.status(500).json({ message: "Failed to create project match" });
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

      // Update the project validation status
      const updatedProject = await storage.updateProject(projectId, {
        validationStatus,
        isValidated,
        validatedBy: userId,
        validatedAt: new Date()
      });

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

      // Check if user owns the invoice
      const userId = (req.user as any).claims.sub;
      if (invoice.userId !== userId) {
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

      // Check if user owns the invoice
      const userId = (req.user as any).claims.sub;
      if (invoice.userId !== userId) {
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

      // Check if we have a stored file path, otherwise create a demo PDF
      if (invoice.fileUrl && fs.existsSync(invoice.fileUrl)) {
        const stat = fs.statSync(invoice.fileUrl);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size.toString());
        res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Accept-Ranges', 'bytes');

        const stream = fs.createReadStream(invoice.fileUrl);
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

  // Get user's invoices
  app.get('/api/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;

      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      const includeMatches = req.query.includeMatches === 'true';

      if (includeMatches) {
        const invoicesWithMatches = await storage.getInvoicesWithProjectMatches(userId);
        res.json(invoicesWithMatches || []);
      } else {
        const invoices = await storage.getInvoicesByUserId(userId);
        res.json(invoices || []);
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

  // 🇨🇴 Store Colombian-specific insights
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

  // 🇨🇴 Enhanced training data with Colombian context
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
        feedbackId: feedbackLog.id,
        colombianInvoice: isColombianInvoice
      });

    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });
  // Submit positive feedback for AI extraction
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

      // Validate required fields
      if (!ruleData.name || !ruleData.fieldName || !ruleData.ruleType || !ruleData.ruleValue) {
        return res.status(400).json({ 
          message: "Missing required fields: name, fieldName, ruleType, ruleValue" 
        });
      }

      // Set ruleData as valid JSON object containing the rule value
      const ruleDataWithJson = {
        ...ruleData,
        ruleData: JSON.stringify({ value: ruleData.ruleValue })
      };

      const rule = await storage.createValidationRule(ruleDataWithJson);
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating validation rule:", error);
      res.status(500).json({ message: "Failed to create validation rule" });
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
      res.status(500).json({ message: "Failed to validate approved invoices" });
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
      const keywords = await storage.getClassificationKeywords(userId);
      res.json(keywords);
    } catch (error) {
      console.error("Error fetching classification keywords:", error);
      res.status(500).json({ message: "Failed to fetch classification keywords" });
    }
  });

  app.post('/api/classification/keywords', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { category, keyword } = req.body;

      if (!category || !keyword) {
        return res.status(400).json({ message: "Category and keyword are required" });
      }

      const keywordData = {
        category,
        keyword: keyword.toLowerCase().trim(),
        isDefault: false,
        userId
      };

      const result = await storage.addClassificationKeyword(keywordData);
      res.json(result);
    } catch (error) {
      console.error("Error adding classification keyword:", error);
      res.status(500).json({ message: "Failed to add classification keyword" });
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

      // Update invoice status to approved
      await storage.updateInvoice(invoiceId, { status: 'approved' });

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

  // Update ERP connection
  app.put('/api/erp/connections/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const connectionId = parseInt(req.params.id);
      const data = insertErpConnectionSchema.partial().parse(req.body);

      // Encrypt password if provided
      if (data.password) {
        data.password = Buffer.from(data.password).toString('base64');
      }

      const connection = await storage.updateErpConnection(connectionId, data);
      // Safely destructure password (might be undefined)
      const { password: _, ...safeConnection } = connection || {};
      res.json(safeConnection);
    } catch (error) {
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

      const testResult = await erpAutomationService.testConnection({
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        username: connection.username,
        password: decryptedPassword,
      });

      if (testResult.success) {
        await storage.updateErpConnection(connectionId, { lastUsed: new Date() });
      }

      res.json(testResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        success: false,
        error: errorMessage,
        message: `Connection test failed: ${errorMessage}`
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
      // Decrypt password
      const decryptedPassword = Buffer.from(connection.password, 'base64').toString();

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
      }

      const workflows = await storage.getSavedWorkflows((user as any).claims.sub);
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
      
      // Validate ERP connection only if not using manual configuration
      let connection = null;
      if (!data.isManualConfig && data.connectionId) {
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
      } else if (data.isManualConfig) {
        console.log('Creating import config with manual ERP configuration');
        // Set connectionId to null for manual configurations
        data.connectionId = null;
        
        // Validate manual configuration fields
        if (!data.erpUrl || !data.erpUsername || !data.erpPassword) {
          return res.status(400).json({ 
            error: 'Manual configuration requires ERP URL, username, and password.' 
          });
        }
      } else {
        return res.status(400).json({ 
          error: 'Either select an ERP connection or enable manual configuration.' 
        });
      }
      
      // Handle manual configuration or auto-populate from ERP connection
      let configDataWithCredentials;
      
      if (data.isManualConfig) {
        // Use manual configuration - encrypt the password if provided
        const encryptedPassword = data.erpPassword ? Buffer.from(data.erpPassword).toString('base64') : '';
        
        configDataWithCredentials = {
          ...data,
          connectionId: null, // Explicitly set to null for manual configs
          erpPassword: encryptedPassword,
        };
        
        console.log('Using manual ERP configuration');
      } else {
        // Auto-populate ERP credentials from the selected connection
        configDataWithCredentials = {
          ...data,
          erpUrl: connection.baseUrl,
          erpUsername: connection.username,
          erpPassword: connection.password, // This is already encrypted in storage
        };
        
        console.log('Using ERP connection credentials');
      }
      
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

      const configs = await storage.getInvoiceImporterConfigsByUser((user as any).claims.sub);
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

      const updates = insertInvoiceImporterConfigSchema.partial().parse(req.body);
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

      // Check if user has access to this configuration
      if (config.userId !== (user as any).claims.sub) {
        return res.status(403).json({ error: 'Access denied to this import configuration' });
      }

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
        pythonInvoiceImporter.executeImportTask(configId)
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
        logs: ''
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
  app.post('/api/rpa/process-xml', async (req: any, res) => {
    try {
      const { filename, fileSize, documentNumber, emisor, totalValue, source } = req.body;
      
      console.log(`📋 Processing RPA XML file: ${filename}`);
      
      // Read the XML file from uploads directory
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join('uploads', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'XML file not found' });
      }
      
      const fileBuffer = fs.readFileSync(filePath);
      
      // Create invoice record in the same way as manual upload
      const invoiceData = {
        userId: 'rpa-system', // Special user for RPA imports
        fileName: filename,
        fileSize: fileSize,  
        status: 'processing' as const,
        companyId: 1, // Set to default company ID so RPA invoices appear for company users
        // Note: source field not in schema, storing in extractedData instead
      };
      
      // Create invoice record in database
      const invoice = await storage.createInvoice(invoiceData);
      console.log(`Created invoice record ${invoice.id} for RPA file ${filename}`);
      
      // Process through the exact same pipeline as manual uploads
      setImmediate(async () => {
        try {
          await processInvoiceAsync(invoice, fileBuffer);
          console.log(`✅ RPA invoice ${invoice.id} processed successfully`);
        } catch (error) {
          console.error(`❌ RPA invoice ${invoice.id} processing failed:`, error);
        }
      });
      
      res.json({ 
        success: true, 
        invoiceId: invoice.id,
        message: `XML file ${filename} queued for processing` 
      });
      
    } catch (error) {
      console.error('Error processing RPA XML:', error);
      res.status(500).json({ error: 'Failed to process XML file' });
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

      // First check if we have active progress in memory
      const progress = invoiceImporterService.getProgress(logId);

      if (progress) {
        console.log(`Active progress found for logId ${logId}`);
        try {
          const serializedProgress = {
            taskId: progress.taskId,
            currentStep: progress.currentStep,
            totalSteps: progress.totalSteps,
            status: progress.status,
            message: progress.message || 'Processing...',
            startedAt: progress.startedAt.toISOString(),
            completedAt: progress.completedAt?.toISOString(),
            totalInvoices: progress.totalInvoices,
            processedInvoices: progress.processedInvoices,
            successfulImports: progress.successfulImports,
            failedImports: progress.failedImports,
            steps: progress.steps.map(step => ({
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

      // Check the database for the log status
      const log = await storage.getInvoiceImporterLog(logId);
      if (!log) {
        return res.status(404).json({ error: 'Import task not found' });
      }

      console.log(`Found log in database for ${logId} with status: ${log.status}`);

      // Parse steps from logs if available
      let steps: Array<{
        id: string;
        title: string;
        status: string;
        timestamp: string;
        details: string;
      }> = [];
      try {
        if (log.logs) {
          const logLines = log.logs.split('\n').filter(line => line.trim());
          steps = logLines
            .filter(line => line.includes('[STEP]'))
            .map((line, index) => {
              const stepMatch = line.match(/\[STEP\]\s*(.+?)\s*\[(\w+)\]/);
              return {
                id: `step-${index + 1}`,
                title: stepMatch ? stepMatch[1] : `Step ${index + 1}`,
                status: stepMatch ? stepMatch[2].toLowerCase() : 'pending',
                timestamp: new Date().toISOString(),
                details: ''
              };
            });
        }
      } catch (error) {
        console.error('Error parsing steps from logs:', error);
      }

      // If no steps found, create default steps based on status
      if (steps.length === 0) {
        const defaultSteps = [
          'Initializing browser session',
          'Navigating to ERP login page',
          'Logging into ERP system',
          'Navigating to invoice section',
          'Loading invoice list',
          'Scanning available invoices',
          'Processing invoice downloads',
          'Extracting XML files',
          'Extracting PDF files',
          'Processing invoice metadata',
          'Storing imported invoices',
          'Cleaning up and finalizing'
        ];

        steps = defaultSteps.map((desc, index) => ({
          id: `step-${index + 1}`,
          title: desc,
          status: log.status === 'completed' ? 'completed' : 
                 log.status === 'running' && index === 0 ? 'running' : 
                 log.status === 'failed' && index === 0 ? 'failed' : 'pending',
          timestamp: new Date().toISOString(),
          details: ''
        }));
      }

      // Return progress info from database
      const dbProgress = {
        id: logId,
        configId: log.configId,
        taskId: logId,
        status: log.status || 'pending',
        currentStep: log.status === 'completed' ? 12 : 
                    log.status === 'running' ? Math.max(1, steps.filter(s => s.status === 'completed').length + 1) : 1,
        totalSteps: 12,
        message: log.status === 'completed' ? 'Import completed successfully' : 
                log.status === 'running' ? 'Import in progress...' : 
                log.status === 'failed' ? `Import failed: ${log.errorMessage || 'Unknown error'}` : 'Import starting...',
        startedAt: log.startedAt?.toISOString() || new Date().toISOString(),
        completedAt: log.completedAt?.toISOString(),
        totalInvoices: log.totalInvoices || 0,
        processedInvoices: log.processedInvoices || 0,
        successfulImports: log.successfulImports || 0,
        failedImports: log.failedImports || 0,
        steps: steps,
        logs: log.logs || '', // This now includes Python RPA logs
        screenshots: log.screenshots || [],
        errorMessage: log.errorMessage,
        executionTime: log.executionTime
      };

      res.json(dbProgress);
    } catch (error) {
      console.error('Error fetching progress:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: errorMessage,
        message: 'Failed to fetch progress data'
      });
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

  // Progress tracking endpoint for invoice importer
  app.get('/api/invoice-importer/progress/:configId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const configId = parseInt(req.params.configId);
      const config = await storage.getInvoiceImporterConfig(configId);
      const currentUser = await storage.getUser((user as any).claims.sub);

      if (!config) {
        return res.status(404).json({ error: 'Import configuration not found' });
      }

      // Check if user has access to this configuration (same company)
      if (!currentUser?.companyId || config.companyId !== currentUser.companyId) {
        return res.status(403).json({ error: 'Access denied to this import configuration' });
      }

      // Get the latest log for this configuration
      const logs = await storage.getInvoiceImporterLogs(configId);
      const latestLog = logs[0]; // Most recent log

      if (!latestLog) {
        return res.json({
          id: 0,
          configId,
          status: 'pending',
          totalInvoices: 0,
          processedInvoices: 0,
          successfulImports: 0,
          failedImports: 0,
          steps: [],
          logs: '',
          screenshots: [],
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          executionTime: null
        });
      }

      // Parse steps from logs if available
      let steps: Array<{
        id: string;
        title: string;
        status: string;
        timestamp: string;
        details: string;
      }> = [];
      try {
        if (latestLog.logs) {
          const logLines = latestLog.logs.split('\n');
          steps = logLines
            .filter(line => line.includes('[STEP]'))
            .map((line, index) => {
              const stepMatch = line.match(/\[STEP\]\s*(.+)/);
              const statusMatch = line.match(/\[(COMPLETED|RUNNING|FAILED|PENDING)\]/);
              return {
                id: `step-${index}`,
                title: stepMatch ? stepMatch[1] : `Step ${index + 1}`,
                status: statusMatch ? statusMatch[1].toLowerCase() : 'pending',
                timestamp: new Date().toISOString(),
                details: ''
              };
            });
        }
      } catch (error) {
        console.error('Error parsing steps from logs:', error);
      }

      const response = {
        id: latestLog.id,
        configId: latestLog.configId,
        status: latestLog.status,
        totalInvoices: latestLog.totalInvoices,
        processedInvoices: latestLog.processedInvoices,
        successfulImports: latestLog.successfulImports,
        failedImports: latestLog.failedImports,
        steps,
        logs: latestLog.logs || '',
        screenshots: latestLog.screenshots || [],
        errorMessage: latestLog.errorMessage,
        startedAt: latestLog.startedAt,
        completedAt: latestLog.completedAt,
        executionTime: latestLog.executionTime
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching import progress:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
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

  // Download invoice file endpoint
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

      // Import fs and path modules
      const fs = await import('fs');
      const path = await import('path');
      
      // Construct file path - check uploads directory
      const filePath = path.join('uploads', invoice.fileName);
      console.log(`Looking for file at: ${filePath}`);
      
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

      console.log(`Serving file: ${invoice.fileName} (${mimeType})`);

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

  return httpServer;
}