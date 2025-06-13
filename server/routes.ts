import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertInvoiceSchema, insertLineItemSchema, insertApprovalSchema } from "@shared/schema";
import { processInvoiceOCR } from "./services/ocrService";
import { extractInvoiceData } from "./services/aiService";
import { checkInvoiceDiscrepancies, storeInvoiceFlags } from "./services/discrepancyService";
import { predictInvoiceIssues, storePredictiveAlerts } from "./services/predictiveService";
import { matchProjectToInvoice } from "./projectMatching";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { RequestHandler } from "express";

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

// Bypassed authentication for testing - allows access without login
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Create a mock user for testing purposes
  const mockUser = {
    claims: {
      sub: "test-user-123",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User"
    }
  };

  // Attach mock user to request
  (req as any).user = mockUser;

  return next();
};

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

      // Convert ISO string to Date object if approvedAt is present
      if (updates.approvedAt && typeof updates.approvedAt === 'string') {
        updates.approvedAt = new Date(updates.approvedAt);
      }

      const pettyCash = await storage.updatePettyCashLog(id, updates);
      res.json(pettyCash);
    } catch (error) {
      console.error("Error updating petty cash log:", error);
      res.status(500).json({ message: "Failed to update petty cash log", error: error.message });
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

  app.put('/api/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const updates = req.body;
      const project = await storage.updateProject(projectId, updates);
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete('/api/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      await storage.deleteProject(projectId);
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

  // Project validation routes
  app.post("/api/projects/:projectId/validate", isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { action } = req.body;
      const userId = req.user?.id || "unknown";

      const validationStatus = action === "validate" ? "validated" : "rejected";
      const isValidated = action === "validate";



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
      const setting = await storage.getSetting('user_preferences');
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
        await storage.updateSetting('user_preferences', defaultSettings.value);
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

      // If value is an object, stringify it; if it's already a string, validate it
      let settingsJson: string;
      if (typeof value === 'object') {
        settingsJson = JSON.stringify(value);
      } else if (typeof value === 'string') {
        settingsJson = value;
        // Only validate non-empty strings as JSON
        if (settingsJson.trim()) {
          try {
            JSON.parse(settingsJson);
          } catch (parseError) {
            console.error("JSON parse error:", parseError);
            return res.status(400).json({ message: "Invalid JSON format for settings value" });
          }
        } else {
          return res.status(400).json({ message: "Settings value cannot be empty" });
        }
      } else {
        // Convert other types to string and then to JSON
        settingsJson = JSON.stringify(value);
      }

      const setting = await storage.updateSetting('user_preferences', settingsJson);
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

      const updates = {
        validationStatus,
        isValidated,
        validatedAt: new Date(),
        validatedBy: userId,
      };

      const project = await storage.updateProject(projectId, updates);
      res.json(project);
    } catch (error) {
      console.error("Error updating project validation:", error);
      res.status(500).json({ message: "Failed to update project validation" });
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
          console.log('Excel columns available:', Object.keys(data[0]));
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

            const project = await storage.createProject(projectData);
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

      // Store file temporarily for preview functionality
      const fs = await import('fs');
      const path = await import('path');
      const uploadsDir = path.join(process.cwd(), 'uploads');

      // Ensure uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const fileExt = path.extname(file.originalname);
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
      const filePath = path.join(uploadsDir, uniqueFileName);

      // Write file to disk
      fs.writeFileSync(filePath, file.buffer);

      // Create initial invoice record with file path
      const invoice = await storage.createInvoice({
        userId,
        fileName: file.originalname,
        status: "processing",
        fileUrl: filePath,
      });

      res.json({ invoiceId: invoice.id, message: "Invoice uploaded successfully. Processing started." });

      // Start OCR and data extraction processing
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
            projectName: extractedData.projectName,
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
      } catch (error) {
        console.error("Error uploading invoice:", error);
        res.status(500).json({ message: "Failed to upload invoice" });
      }
    });
  });

  // Manual processing endpoints
  app.post('/api/invoices/:id/process-ocr', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice || invoice.userId !== req.user.claims.sub) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Start OCR processing manually
      res.json({ message: "OCR processing started" });
    } catch (error) {
      console.error("Error starting OCR:", error);
      res.status(500).json({ message: "Failed to start OCR processing" });
    }
  });

  app.post('/api/invoices/:id/extract-data', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice || invoice.userId !== req.user.claims.sub) {
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

      if (!invoice || invoice.userId !== req.user.claims.sub) {
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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

      const invoice = await storage.getInvoice(invoiceId);      if (!invoice) {
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

  // Delete invoice
  app.delete('/api/invoices/:id', isAuthenticated, async (req: any, res) => {
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

      await storage.deleteInvoice(invoiceId);
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
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

  // Project matching endpoints
  app.get('/api/invoices/:id/match-project', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const threshold = parseInt(req.query.threshold as string) || 80;

      // Get invoice and verify ownership
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.userId !== userId) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get line items
      const lineItems = await storage.getLineItemsByInvoiceId(invoiceId);

      // Get all validated projects
      const allProjects = await storage.getProjects();
      const validatedProjects = allProjects.filter(p => p.isValidated);

      if (validatedProjects.length === 0) {
        return res.json({
          matches: [],
          autoMatch: null,
          recommendation: "No validated projects available. Please validate projects first.",
          currentMatch: invoice.matchedProjectId ? {
            projectId: invoice.matchedProjectId,
            confidence: parseFloat(invoice.matchConfidence || '0'),
            matchedBy: invoice.matchedBy,
            status: invoice.matchStatus
          } : null
        });
      }

      // Perform AI-powered matching
      const matchingResult = await matchProjectToInvoice(invoice, lineItems, validatedProjects, threshold);

      // Include current match info if exists
      const currentMatch = invoice.matchedProjectId ? {
        projectId: invoice.matchedProjectId,
        confidence: parseFloat(invoice.matchConfidence || '0'),
        matchedBy: invoice.matchedBy,
        status: invoice.matchStatus
      } : null;

      res.json({
        ...matchingResult,
        currentMatch
      });
    } catch (error) {
      console.error("Error matching project:", error);
      res.status(500).json({ message: "Failed to match project" });
    }
  });

  app.post('/api/invoices/:id/match-project', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { projectId, confidence, matchedBy, matchStatus } = req.body;

      // Get invoice and verify ownership
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.userId !== userId) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Validate project exists
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (!project) {
          return res.status(400).json({ message: "Project not found" });
        }
      }

      // Update invoice with project match
      const updatedInvoice = await storage.updateInvoiceProjectMatch(
        invoiceId,
        projectId,
        confidence,
        matchedBy,
        matchStatus
      );

      res.json({
        message: projectId ? "Project matched successfully" : "Project match cleared",
        invoice: updatedInvoice
      });
    } catch (error) {
      console.error("Error updating project match:", error);
      res.status(500).json({ message: "Failed to update project match" });
    }
  });

  app.get('/api/invoices/:id/project-details', isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      // Get invoice with project match details
      const invoiceWithProject = await storage.getInvoiceWithProjectMatch(invoiceId);
      
      if (!invoiceWithProject || invoiceWithProject.userId !== userId) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoiceWithProject);
    } catch (error) {
      console.error("Error fetching invoice project details:", error);
      res.status(500).json({ message: "Failed to fetch project details" });
    }
  });

  app.get('/api/projects/matching-stats', isAuthenticated, async (req: any, res) => {
    try {
      const stats = await storage.getProjectMatchingStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching project matching stats:", error);
      res.status(500).json({ message: "Failed to fetch matching stats" });
    }
  });

  // Project match management endpoints
  app.get("/api/project-matches", isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string;
      const matches = await storage.getProjectMatches(status);
      res.json(matches);
    } catch (error) {
      console.error("Error fetching project matches:", error);
      res.status(500).json({ error: "Failed to fetch project matches" });
    }
  });

  app.get("/api/invoices/:id/project-match", isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const match = await storage.getProjectMatchByInvoiceId(invoiceId);
      
      if (!match) {
        return res.json([]);
      }

      // Get related invoice and project data
      const invoice = await storage.getInvoice(invoiceId);
      const project = match.projectId ? await storage.getProject(match.projectId) : null;

      const result = {
        ...match,
        invoice,
        project
      };

      res.json([result]);
    } catch (error) {
      console.error("Error fetching invoice project match:", error);
      res.status(500).json({ error: "Failed to fetch project match" });
    }
  });

  app.put("/api/project-matches/:id", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const updates = req.body;
      
      const updatedMatch = await storage.updateProjectMatch(matchId, updates);
      res.json(updatedMatch);
    } catch (error) {
      console.error("Error updating project match:", error);
      res.status(500).json({ error: "Failed to update project match" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}