import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { invoiceImporterService } from "./services/invoiceImporterService";

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

  // Debug endpoint for validation rules troubleshooting
  app.get('/api/validation-rules/debug', isAuthenticated, async (req: any, res) => {
    try {
      console.log("🐛 Debug: Checking validation rules table structure and data");

      // Import database connection
      const { drizzle } = await import("drizzle-orm/neon-http");
      const { neon } = await import("@neondatabase/serverless");
      const { sql } = await import("drizzle-orm");
      const client = neon(process.env.DATABASE_URL!);
      const debugDb = drizzle(client);

      // Get database table structure
      const tableInfoResult = await debugDb.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'validation_rules' 
        ORDER BY ordinal_position;
      `);

      // Check if table exists
      const tableExistsResult = await debugDb.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'validation_rules'
        );
      `);

      // Get current rules using raw SQL
      const rawRulesResult = await debugDb.execute(sql`
        SELECT * FROM validation_rules ORDER BY created_at DESC;
      `);

      // Get current rules using storage method
      const currentRules = await storage.getValidationRules();

      // Get sample invoice structure
      const sampleInvoice = await debugDb.execute(sql`
        SELECT id, vendor_name, total_amount, extracted_data 
        FROM invoices 
        ORDER BY created_at DESC 
        LIMIT 1;
      `);

      console.log("🐛 Debug results:", {
        tableExists: tableExistsResult.rows[0]?.exists,
        tableColumns: tableInfoResult.rows.length,
        rawRulesCount: rawRulesResult.rows.length,
        storageRulesCount: currentRules.length
      });

      res.json({
        tableExists: tableExistsResult.rows[0]?.exists || false,
        tableStructure: tableInfoResult.rows,
        rawRulesFromDb: {
          count: rawRulesResult.rows.length,
          rules: rawRulesResult.rows
        },
        storageMethodRules: {
          count: currentRules.length,
          rules: currentRules
        },
        sampleInvoiceStructure: sampleInvoice.rows[0] || null,
        debugInfo: {
          databaseUrl: process.env.DATABASE_URL ? "✅ Set" : "❌ Missing",
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error("🐛 Debug endpoint error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "No stack trace",
        debugTimestamp: new Date().toISOString()
      });
    }
  });

  // Initiate automatic processing
  app.post('/api/invoices/initiate-automatic-process', isAuthenticated, async (req, res) => {
    const startTime = Date.now();
    let processingTimeout: NodeJS.Timeout;

    try {
      console.log('🚀 [AUTOMATIC_PROCESSING] Starting automatic invoice processing...');
      console.log('🚀 [AUTOMATIC_PROCESSING] Request user:', req.user?.claims?.sub);
      console.log('🚀 [AUTOMATIC_PROCESSING] Request body:', JSON.stringify(req.body, null, 2));

      // Ensure we always return JSON with proper headers
      res.setHeader('Content-Type', 'application/json');

      // Set up timeout to prevent hanging
      processingTimeout = setTimeout(() => {
        console.error('⏰ [AUTOMATIC_PROCESSING] Processing timeout after 25 seconds');
        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: 'Processing timeout',
            message: 'Automatic processing took too long and was cancelled',
            timestamp: new Date().toISOString()
          });
        }
      }, 25000); // 25 second timeout (less than frontend timeout)

      // Call the Invoice Importer service for automatic processing
      let result;
      try {
        console.log('🔄 [AUTOMATIC_PROCESSING] Starting invoice importer service...');
        
        // Get all active invoice importer configurations
        const configs = await storage.getInvoiceImporterConfigs();
        console.log(`📋 [AUTOMATIC_PROCESSING] Found ${configs.length} importer configurations`);
        
        if (configs.length === 0) {
          throw new Error('No invoice importer configurations found');
        }
        
        // Process each configuration
        const processedConfigurations = [];
        for (const config of configs) {
          if (config.isActive) {
            console.log(`🚀 [AUTOMATIC_PROCESSING] Processing configuration: ${config.taskName}`);
            try {
              await invoiceImporterService.executeImportTask(config.id);
              processedConfigurations.push({
                configId: config.id,
                taskName: config.taskName,
                status: 'completed'
              });
            } catch (configError) {
              console.error(`❌ [AUTOMATIC_PROCESSING] Failed to process config ${config.id}:`, configError);
              processedConfigurations.push({
                configId: config.id,
                taskName: config.taskName,
                status: 'failed',
                error: configError.message
              });
            }
          }
        }
        
        result = {
          success: true,
          message: `Processed ${processedConfigurations.length} import configurations`,
          processedConfigurations,
          processedInvoices: processedConfigurations.filter(c => c.status === 'completed').length,
          timestamp: new Date().toISOString()
        };
        
        console.log('✅ [AUTOMATIC_PROCESSING] Invoice importer service completed:', JSON.stringify(result, null, 2));
      } catch (importerError) {
        console.error('❌ [AUTOMATIC_PROCESSING] Invoice importer service failed:', importerError.message);
        
        // Return error response instead of fallback
        result = {
          success: false,
          error: true,
          message: importerError.message || 'Automatic processing failed',
          processedInvoices: 0,
          timestamp: new Date().toISOString()
        };
      }

      // Clear timeout since we're responding
      clearTimeout(processingTimeout);

      const processingTime = Date.now() - startTime;
      console.log(`✅ [AUTOMATIC_PROCESSING] Completed successfully in ${processingTime}ms`);

      // Ensure result is a valid JSON object
      const jsonResponse = {
        success: true,
        message: 'Automatic processing initiated successfully',
        data: result || {},
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      };

      console.log('📤 [AUTOMATIC_PROCESSING] Sending response:', JSON.stringify(jsonResponse, null, 2));

      if (!res.headersSent) {
        res.status(200).json(jsonResponse);
      } else {
        console.warn('⚠️ [AUTOMATIC_PROCESSING] Response already sent, skipping');
      }

    } catch (error) {
      // Clear timeout
      if (processingTimeout) {
        clearTimeout(processingTimeout);
      }

      const processingTime = Date.now() - startTime;
      console.error('❌ [AUTOMATIC_PROCESSING] Failed after', processingTime, 'ms:', error);
      console.error('❌ [AUTOMATIC_PROCESSING] Error stack:', error.stack);
      console.error('❌ [AUTOMATIC_PROCESSING] Error name:', error.name);
      console.error('❌ [AUTOMATIC_PROCESSING] Error message:', error.message);

      // Always return JSON, never let Express return HTML
      res.setHeader('Content-Type', 'application/json');
      
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Automatic processing failed',
          message: error.message || 'Unknown error occurred',
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString()
        });
      } else {
        console.warn('⚠️ [AUTOMATIC_PROCESSING] Error occurred but response already sent');
      }
    }
  });

  return httpServer;
}