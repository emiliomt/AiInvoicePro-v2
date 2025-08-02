import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Setup authentication
  setupAuth(app);

  // Basic user endpoint
  app.get("/api/user", isAuthenticated, (req: any, res) => {
    res.json({ 
      user: req.user,
      message: "Authenticated successfully" 
    });
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString() 
    });
  });

  // Get all invoices
  app.get("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Get invoice by ID
  app.get("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoice = await storage.getInvoice(invoiceId);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // Basic dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      const invoices = await storage.getInvoices();

      const stats = {
        totalInvoices: invoices.length,
        pendingInvoices: invoices.filter((i: any) => i.status === 'pending').length,
        approvedInvoices: invoices.filter((i: any) => i.status === 'approved').length,
        rejectedInvoices: invoices.filter((i: any) => i.status === 'rejected').length,
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Get validation rules
  app.get("/api/validation-rules", isAuthenticated, async (req: any, res) => {
    try {
      console.log("🔍 API: GET /api/validation-rules - Starting request");
      console.log("🔍 API: User authenticated:", !!req.user);
      console.log("🔍 API: User ID:", req.user?.claims?.sub);

      const rules = await storage.getValidationRules();
      console.log(`✅ API: Retrieved ${rules.length} validation rules`);
      console.log("✅ API: Rules data:", JSON.stringify(rules, null, 2));

      res.json(rules);
    } catch (error) {
      console.error("❌ API: Error fetching validation rules:", error);
      console.error("❌ API: Error stack:", error instanceof Error ? error.stack : "No stack");
      res.status(500).json({ 
        message: "Failed to fetch validation rules",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create validation rule
  app.post("/api/validation-rules", isAuthenticated, async (req: any, res) => {
    try {
      console.log("📝 API: POST /api/validation-rules - Starting request");
      console.log("📝 API: Request headers:", JSON.stringify(req.headers, null, 2));
      console.log("📝 API: Request body:", JSON.stringify(req.body, null, 2));
      console.log("📝 API: User authenticated:", !!req.user);
      console.log("📝 API: User ID:", req.user?.claims?.sub);

      const { name, description, fieldName, ruleType, ruleValue, severity, errorMessage } = req.body;

      // Validation
      if (!name || !fieldName || !ruleType || !ruleValue) {
        console.log("❌ API: Validation failed - Missing required fields");
        console.log("❌ API: Field check:", { 
          name: !!name, 
          fieldName: !!fieldName, 
          ruleType: !!ruleType, 
          ruleValue: !!ruleValue 
        });
        return res.status(400).json({ 
          message: "Missing required fields",
          required: ["name", "fieldName", "ruleType", "ruleValue"],
          received: { name: !!name, fieldName: !!fieldName, ruleType: !!ruleType, ruleValue: !!ruleValue }
        });
      }

      console.log("✅ API: Field validation passed, calling storage.createValidationRule");
      const ruleData = {
        name,
        description: description || null,
        fieldName,
        ruleType,
        ruleValue,
        severity: severity || "medium",
        errorMessage: errorMessage || null,
        isActive: true,
      };
      console.log("✅ API: Rule data to be created:", JSON.stringify(ruleData, null, 2));

      const rule = await storage.createValidationRule(ruleData);

      console.log("✅ API: Rule created successfully:", JSON.stringify(rule, null, 2));
      res.status(201).json(rule);
    } catch (error) {
      console.error("❌ API: Error creating validation rule:", error);
      console.error("❌ API: Error name:", error instanceof Error ? error.name : "Unknown");
      console.error("❌ API: Error message:", error instanceof Error ? error.message : String(error));
      console.error("❌ API: Error stack:", error instanceof Error ? error.stack : "No stack");
      console.error("❌ API: Error code:", (error as any)?.code);
      console.error("❌ API: Error detail:", (error as any)?.detail);
      console.error("❌ API: Full error object:", error);

      res.status(500).json({ 
        message: "Failed to create validation rule",
        error: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        detail: (error as any)?.detail
      });
    }
  });

  return httpServer;
}