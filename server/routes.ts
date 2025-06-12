import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertInvoiceSchema, insertLineItemSchema, insertApprovalSchema } from "@shared/schema";
import { processInvoiceOCR } from "./services/ocrService";
import { extractInvoiceData } from "./services/aiService";
import { checkInvoiceDiscrepancies, storeInvoiceFlags } from "./services/discrepancyService";
import { predictInvoiceIssues, storePredictiveAlerts } from "./services/predictiveService";
import multer from "multer";
import path from "path";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, and PNG files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const pettyCash = await storage.updatePettyCashLog(id, updates);
      res.json(pettyCash);
    } catch (error) {
      console.error("Error updating petty cash log:", error);
      res.status(500).json({ message: "Failed to update petty cash log" });
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
      const setting = await storage.updateSetting(key, value);
      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Project management routes
  app.get('/api/projects', isAuthenticated, async (req, res) => {
    try {
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
      const project = await storage.getProject(projectId);
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
      const projectData = req.body;
      const project = await storage.createProject(projectData);
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Purchase order routes
  app.get('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const purchaseOrders = await storage.getPurchaseOrders();
      res.json(purchaseOrders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.post('/api/purchase-orders', isAuthenticated, async (req, res) => {
    try {
      const poData = req.body;
      const purchaseOrder = await storage.createPurchaseOrder(poData);
      res.json(purchaseOrder);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ message: "Failed to create purchase order" });
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

  app.post("/api/flags/:flagId/resolve", isAuthenticated, async (req, res) => {
    try {
      const flagId = parseInt(req.params.flagId);
      const userId = req.user.claims.sub;
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

  // Invoice upload and processing
  app.post('/api/invoices/upload', isAuthenticated, (req: any, res) => {
    upload.single('invoice')(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message });
      }
      
      try {
        const userId = req.user.claims.sub;
        const file = req.file;
        
        console.log("Upload request received:", { 
          hasFile: !!file, 
          fieldname: file?.fieldname,
          originalname: file?.originalname,
          mimetype: file?.mimetype,
          size: file?.size 
        });
        
        if (!file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

      // Create initial invoice record
      const invoice = await storage.createInvoice({
        userId,
        fileName: file.originalname,
        status: "processing",
      });

      // Process OCR in background
      processInvoiceOCR(file.buffer, invoice.id)
        .then(async (ocrText) => {
          // Extract structured data using AI
          const extractedData = await extractInvoiceData(ocrText);
          
          // Update invoice with extracted data
          await storage.updateInvoice(invoice.id, {
            status: "extracted",
            ocrText,
            extractedData,
            vendorName: extractedData.vendorName,
            invoiceNumber: extractedData.invoiceNumber,
            invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
            dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
            totalAmount: extractedData.totalAmount,
            taxAmount: extractedData.taxAmount,
            subtotal: extractedData.subtotal,
            confidenceScore: extractedData.confidenceScore,
          });

          // Check if this is a petty cash invoice
          const isPettyCash = await storage.isPettyCashInvoice(extractedData.totalAmount || "0");
          
          if (isPettyCash) {
            // Create petty cash log entry
            await storage.createPettyCashLog({
              invoiceId: invoice.id,
              status: "pending_approval",
            });
            
            // Update invoice status to indicate petty cash
            await storage.updateInvoice(invoice.id, {
              status: "petty_cash_pending" as any,
            });
          } else {
            // For non-petty cash invoices, perform PO matching
            const lineItems = extractedData.lineItems && extractedData.lineItems.length > 0 
              ? extractedData.lineItems.map((item: any) => ({
                  id: 0,
                  invoiceId: invoice.id,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  createdAt: new Date(),
                }))
              : [];

            // Find potential PO matches
            const potentialMatches = await storage.findPotentialMatches(invoice, lineItems);
            
            if (potentialMatches.length > 0) {
              // Create match records for all potential matches
              for (const match of potentialMatches) {
                const matchStatus = match.matchScore >= 80 ? 'auto' : 'unresolved';
                
                await storage.createInvoicePoMatch({
                  invoiceId: invoice.id,
                  poId: match.purchaseOrder.id,
                  matchScore: match.matchScore.toString(),
                  status: matchStatus as any,
                  matchDetails: match.matchDetails,
                });
              }
              
              // If we have a high-confidence match, assign the project automatically
              const bestMatch = potentialMatches[0];
              if (bestMatch.matchScore >= 80 && bestMatch.purchaseOrder.projectId) {
                await storage.assignProjectToInvoice(invoice.id, bestMatch.purchaseOrder.projectId);
              }
            }
          }

          // Create line items if present
          let createdLineItems: any[] = [];
          if (extractedData.lineItems && extractedData.lineItems.length > 0) {
            const lineItemsData = extractedData.lineItems.map((item: any) => ({
              invoiceId: invoice.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            }));
            createdLineItems = await storage.createLineItems(lineItemsData);
          }

          // Get the updated invoice for discrepancy detection
          const updatedInvoice = await storage.getInvoice(invoice.id);
          
          if (updatedInvoice) {
            // Run discrepancy detection
            const discrepancyResult = await checkInvoiceDiscrepancies(updatedInvoice, createdLineItems);
            if (discrepancyResult.hasDiscrepancies) {
              await storeInvoiceFlags(discrepancyResult.flags);
            }

            // Run predictive analysis
            const predictions = await predictInvoiceIssues(updatedInvoice, createdLineItems);
            if (predictions.length > 0) {
              await storePredictiveAlerts(invoice.id, predictions);
            }
          }
        })
        .catch(async (error) => {
          console.error("Error processing invoice:", error);
          await storage.updateInvoice(invoice.id, {
            status: "rejected",
            extractedData: { error: error.message },
          });
        });

      res.json({ invoiceId: invoice.id, message: "Invoice uploaded and processing started" });
      } catch (error) {
        console.error("Error uploading invoice:", error);
        res.status(500).json({ message: "Failed to upload invoice" });
      }
    });
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const invoices = await storage.getInvoicesByUserId(userId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Update invoice
  app.patch('/api/invoices/:id', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
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
      const userId = req.user.claims.sub;
      
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
      const userId = req.user.claims.sub;
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

  // Get pending approvals
  app.get('/api/approvals/pending', isAuthenticated, async (req: any, res) => {
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

      const rule = await storage.createValidationRule(ruleData);
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

  const httpServer = createServer(app);
  return httpServer;
}
