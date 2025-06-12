import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertInvoiceSchema, insertLineItemSchema, insertApprovalSchema } from "@shared/schema";
import { processInvoiceOCR } from "./services/ocrService";
import { extractInvoiceData } from "./services/aiService";
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

  // Invoice upload and processing
  app.post('/api/invoices/upload', isAuthenticated, upload.single('invoice'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;
      
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

          // Create line items if present
          if (extractedData.lineItems && extractedData.lineItems.length > 0) {
            const lineItemsData = extractedData.lineItems.map((item: any) => ({
              invoiceId: invoice.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            }));
            await storage.createLineItems(lineItemsData);
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

  // Get validation rules
  app.get('/api/validation-rules', isAuthenticated, async (req: any, res) => {
    try {
      const rules = await storage.getValidationRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching validation rules:", error);
      res.status(500).json({ message: "Failed to fetch validation rules" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
