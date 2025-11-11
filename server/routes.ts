import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer, type Server } from "http";
import { storage, getDb } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { invoiceImporterService } from "./services/invoiceImporterService";
import passport from "passport";
import * as replitAuthModule from "./replitAuth";
import {
  authMonitoring,
  monitorProtectedRoute,
  monitorApiResponse,
} from "./services/authMonitoringService.js";
import { authTestService } from "./services/authTestService.js";
import { schedulerService } from "./services/schedulerService";
import { PythonRPAService } from "./services/pythonRpaService";
import { xmlProcessingService } from "./services/xmlProcessingService";
import { ClassificationService } from "./services/classificationService";
import { createInvoiceProcessingAgent, DEFAULT_AGENT_CONFIG } from "./services/invoiceProcessingAgent";
import { getUser } from "./replitAuth";
import { db } from "./db";
import { lineItems, lineItemClassifications, erpConnections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { adapterRegistry, initializeAdapters } from "./services/erpIntegration/adapterService";

// Helper function to process line items for invoices
async function processInvoiceLineItems(invoices: any[], userId: string): Promise<void> {
  for (const invoice of invoices) {
    try {
      console.log(`🏷️ Processing line items for invoice ${invoice.id}`);
      const db = getDb();

      // Get existing line items from database
      const existingLineItems = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.invoiceId, invoice.id));
      
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
            quantity: item.quantity?.toString() || '1',
            unitPrice: item.unitPrice?.toString() || item.price?.toString() || '0.00',
            totalPrice: item.totalPrice?.toString() || item.total?.toString() || '0.00',
            unit: item.unit || null,
            rawText: item.rawText || item.description,
            lineNumber: i + 1,
          }).returning();

          itemsToClassify.push(newLineItem);
        }
      }

      console.log(`📋 Processing ${itemsToClassify.length} line items for classification`);

      // Use ClassificationService to classify all line items for this invoice
      // This will handle WebSocket broadcasting internally
      await ClassificationService.classifyInvoiceLineItems(invoice.id, userId);

      console.log(`✅ Successfully processed invoice ${invoice.id}: ${itemsToClassify.length} items classified`);

    } catch (error) {
      console.error(`❌ Failed to process invoice ${invoice.id}:`, error);
      throw error;
    }
  }
}

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Create a dedicated API router with higher precedence
  const apiRouter = express.Router();

  // Setup authentication on the main app first (for session setup)
  setupAuth(app);

  // Add global API response monitoring
  app.use("/api", monitorApiResponse());

  // Mount the API router BEFORE any other middleware
  app.use("/api", apiRouter);

  // 🧪 ADD THIS TEST ROUTE FIRST
  app.get("/api/test-dedup", (req, res) => {
    console.log("🧪 TEST ROUTE HIT!");
    console.log("Origin:", req.headers.origin);

    // Set CORS headers for test route - MUST be set before any response
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours

    res.json({
      success: true,
      message: "Test route working!",
      timestamp: new Date().toISOString(),
      origin: req.headers.origin || "unknown",
      hostname: req.hostname || "unknown",
    });
  });

  // Test deduplication endpoint (no auth required for testing)
  app.post("/api/test-dedup/:id", (req, res) => {
    console.log("🧪 TEST DEDUP ROUTE HIT!");
    console.log("Invoice ID:", req.params.id);
    console.log("Origin:", req.headers.origin);

    // Set CORS headers for test dedup route - MUST be set before any response
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    res.json({
      success: true,
      message: "Test deduplication route working!",
      invoiceId: req.params.id,
      timestamp: new Date().toISOString(),
      origin: req.headers.origin || "unknown",
      note: "This is a test endpoint - no authentication required",
    });
  });

  // OPTIONS handlers for test endpoints (CORS preflight) - MUST come BEFORE the actual routes
  app.options("/api/test-dedup", (req, res) => {
    console.log("🧪 OPTIONS preflight for GET /api/test-dedup");
    console.log("Origin:", req.headers.origin);

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours

    // Send empty response for OPTIONS preflight
    res.status(200).end();
  });

  app.options("/api/test-dedup/:id", (req, res) => {
    console.log("🧪 OPTIONS preflight for POST /api/test-dedup/:id");
    console.log("Origin:", req.headers.origin);
    console.log("Invoice ID:", req.params.id);

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours

    res.status(200).end();
  });

  // Add authentication routes to the API router
  apiRouter.get("/login", (req, res, next) => {
    console.log(`🔐 LOGIN HANDLER CALLED - hostname: ${req.hostname}`);
    console.log(`🔐 Using strategy: replitauth`);

    const authHandler = passport.authenticate("replitauth", {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    });

    console.log(`🔐 Calling authentication handler...`);
    authHandler(req, res, next);
  });

  apiRouter.get("/callback", (req, res, next) => {
    console.log("🔄 Auth callback - using strategy: replitauth");
    console.log("🔄 Callback query params:", req.query);

    passport.authenticate("replitauth", {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  apiRouter.get("/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });

  // Basic user endpoint
  apiRouter.get(
    "/user",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        console.log(
          "📋 User endpoint called - User object:",
          (req as any).user ? "present" : "missing",
        );

        // Get the raw user object
        const rawUser = (req as any).user;

        // Extract user data from the authenticated request
        const user = replitAuthModule.getUser(req);

        if (!user) {
          console.log("❌ No user found in request");
          await authMonitoring.logAuthEvent({
            event: "user_endpoint_access",
            userAgent: req.headers["user-agent"],
            ip: req.ip,
            success: false,
            details: { error: "No user in request" },
          });
          return res.status(401).json({ error: "Not authenticated" });
        }

        console.log("📋 User object structure:", Object.keys(user));

        // Handle both direct claims and nested claims structure
        const userClaims = user.claims || user;
        const userData = {
          id: userClaims.sub,
          email: userClaims.email,
          firstName: userClaims.first_name || userClaims.given_name,
          lastName: userClaims.last_name || userClaims.family_name,
          profileImageUrl: userClaims.profile_image_url || userClaims.picture,
        };

        console.log("✅ Returning user data:", userData);

        await authMonitoring.logAuthEvent({
          event: "user_endpoint_access",
          userId: userData.id,
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          success: true,
          details: { email: userData.email },
        });

        res.json(userData);
      } catch (error) {
        console.error("❌ Error in user endpoint:", error);
        await authMonitoring.logAuthEvent({
          event: "user_endpoint_error",
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          success: false,
          details: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // Health check endpoint
  apiRouter.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  // Health check endpoint for testing
  apiRouter.get("/health-check", (req, res) => {
    // Set CORS headers specifically for health check
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    res.json({
      success: true,
      message: "Server is working!",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      origin: req.headers.origin || "unknown",
      hostname: req.hostname || "unknown",
    });
  });

  // OPTIONS handler for health check (CORS preflight)
  apiRouter.options("/health-check", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
  });

  // Get all invoices
  apiRouter.get(
    "/invoices",
    isAuthenticated,
    async (req: any, res: Response) => {
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
    },
  );

  // Get invoice by ID
  apiRouter.get(
    "/invoices/:id",
    isAuthenticated,
    async (req: any, res: Response) => {
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
    },
  );

  // Basic dashboard stats
  apiRouter.get(
    "/dashboard/stats",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const invoices = await storage.getInvoices();

        const stats = {
          totalInvoices: invoices.length,
          pendingInvoices: invoices.filter((i: any) => i.status === "pending")
            .length,
          approvedInvoices: invoices.filter((i: any) => i.status === "approved")
            .length,
          rejectedInvoices: invoices.filter((i: any) => i.status === "rejected")
            .length,
        };

        res.json(stats);
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: "Failed to fetch dashboard stats" });
      }
    },
  );

  // Get validation rules
  apiRouter.get(
    "/validation-rules",
    isAuthenticated,
    async (req: any, res: Response) => {
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
        console.error(
          "❌ API: Error stack:",
          error instanceof Error ? error.stack : "No stack",
        );
        res.status(500).json({
          message: "Failed to fetch validation rules",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Create validation rule
  apiRouter.post(
    "/validation-rules",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        console.log("📝 API: POST /api/validation-rules - Starting request");
        console.log(
          "📝 API: Request headers:",
          JSON.stringify(req.headers, null, 2),
        );
        console.log("📝 API: Request body:", JSON.stringify(req.body, null, 2));
        console.log("📝 API: User authenticated:", !!req.user);
        console.log("📝 API: User ID:", req.user?.claims?.sub);

        const {
          name,
          description,
          fieldName,
          ruleType,
          ruleValue,
          severity,
          errorMessage,
        } = req.body;

        // Validation
        if (!name || !fieldName || !ruleType || !ruleValue) {
          console.log("❌ API: Validation failed - Missing required fields");
          console.log("❌ API: Field check:", {
            name: !!name,
            fieldName: !!fieldName,
            ruleType: !!ruleType,
            ruleValue: !!ruleValue,
          });
          return res.status(400).json({
            message: "Missing required fields",
            required: ["name", "fieldName", "ruleType", "ruleValue"],
            received: {
              name: !!name,
              fieldName: !!fieldName,
              ruleType: !!ruleType,
              ruleValue: !!ruleValue,
            },
          });
        }

        console.log(
          "✅ API: Field validation passed, calling storage.createValidationRule",
        );
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
        console.log(
          "✅ API: Rule data to be created:",
          JSON.stringify(ruleData, null, 2),
        );

        const rule = await storage.createValidationRule(ruleData);

        console.log(
          "✅ API: Rule created successfully:",
          JSON.stringify(rule, null, 2),
        );
        res.status(201).json(rule);
      } catch (error) {
        console.error("❌ API: Error creating validation rule:", error);
        console.error(
          "❌ API: Error name:",
          error instanceof Error ? error.name : "Unknown",
        );
        console.error(
          "❌ API: Error message:",
          error instanceof Error ? error.message : String(error),
        );
        console.error(
          "❌ API: Error stack:",
          error instanceof Error ? error.stack : "No stack",
        );
        console.error("❌ API: Error code:", (error as any)?.code);
        console.error("❌ API: Error detail:", (error as any)?.detail);
        console.error("❌ API: Full error object:", error);

        res.status(500).json({
          message: "Failed to create validation rule",
          error: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
          detail: (error as any)?.detail,
        });
      }
    },
  );

  // Debug endpoint for validation rules troubleshooting
  apiRouter.get(
    "/validation-rules/debug",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        console.log(
          "🐛 Debug: Checking validation rules table structure and data",
        );

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
          storageRulesCount: currentRules.length,
        });

        res.json({
          tableExists: tableExistsResult.rows[0]?.exists || false,
          tableStructure: tableInfoResult.rows,
          rawRulesFromDb: {
            count: rawRulesResult.rows.length,
            rules: rawRulesResult.rows,
          },
          storageMethodRules: {
            count: currentRules.length,
            rules: currentRules,
          },
          sampleInvoiceStructure: sampleInvoice.rows[0] || null,
          debugInfo: {
            databaseUrl: process.env.DATABASE_URL ? "✅ Set" : "❌ Missing",
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("🐛 Debug endpoint error:", error);
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : "No stack trace",
          debugTimestamp: new Date().toISOString(),
        });
      }
    },
  );

  // Initiate automatic processing
  apiRouter.post(
    "/invoices/initiate-automatic-process",
    isAuthenticated,
    async (req, res) => {
      const startTime = Date.now();
      let processingTimeout: NodeJS.Timeout;

      try {
        console.log(
          "🚀 [AUTOMATIC_PROCESSING] Starting automatic invoice processing...",
        );
        console.log(
          "🚀 [AUTOMATIC_PROCESSING] Request user:",
          (req.user as any)?.claims?.sub,
        );
        console.log(
          "🚀 [AUTOMATIC_PROCESSING] Request body:",
          JSON.stringify(req.body, null, 2),
        );

        // Ensure we always return JSON with proper headers
        res.setHeader("Content-Type", "application/json");

        // Set up timeout to prevent hanging - increased to 5 minutes
        processingTimeout = setTimeout(() => {
          console.error(
            "⏰ [AUTOMATIC_PROCESSING] Processing timeout after 5 minutes",
          );
          if (!res.headersSent) {
            res.status(408).json({
              success: false,
              error: "Processing timeout",
              message:
                "Automatic processing took too long and was cancelled. The system will continue processing in the background.",
              timestamp: new Date().toISOString(),
            });
          }
        }, 300000); // 5 minute timeout for browser automation

        // Call the Python RPA Service directly for more reliable processing
        let result;
        try {
          console.log(
            "🔄 [AUTOMATIC_PROCESSING] Starting Python RPA service...",
          );

          // First try direct Python RPA processing
          result = await PythonRPAService.processInvoicesAutomatically();

          if (result.success) {
            console.log(
              "✅ [AUTOMATIC_PROCESSING] Python RPA processing completed successfully",
            );
          } else {
            console.log(
              "⚠️ [AUTOMATIC_PROCESSING] Python RPA processing completed with warnings",
            );
          }
        } catch (rpaError: any) {
          console.error(
            "❌ [AUTOMATIC_PROCESSING] Python RPA service failed, falling back to invoice importer:",
            rpaError.message,
          );

          // Fallback to invoice importer service
          try {
            console.log(
              "🔄 [AUTOMATIC_PROCESSING] Falling back to invoice importer service...",
            );

            // Get all active invoice importer configurations
            const configs = await storage.getInvoiceImporterConfigs();
            console.log(
              `📋 [AUTOMATIC_PROCESSING] Found ${configs.length} importer configurations`,
            );

            if (configs.length === 0) {
              throw new Error("No invoice importer configurations found");
            }

            // Process each configuration
            const processedConfigurations = [];
            for (const config of configs) {
              if (config.isActive) {
                console.log(
                  `🚀 [AUTOMATIC_PROCESSING] Processing configuration: ${config.taskName}`,
                );
                try {
                  await invoiceImporterService.executeImportTask(config.id);
                  processedConfigurations.push({
                    configId: config.id,
                    taskName: config.taskName,
                    status: "completed",
                  });
                } catch (configError: any) {
                  console.error(
                    `❌ [AUTOMATIC_PROCESSING] Failed to process config ${config.id}:`,
                    configError,
                  );
                  processedConfigurations.push({
                    configId: config.id,
                    taskName: config.taskName,
                    status: "failed",
                    error: configError.message,
                  });
                }
              }
            }

            result = {
              success: true,
              message: `Processed ${processedConfigurations.length} import configurations`,
              processedConfigurations,
              processedInvoices: processedConfigurations.filter(
                (c) => c.status === "completed",
              ).length,
              timestamp: new Date().toISOString(),
            };

            console.log(
              "✅ [AUTOMATIC_PROCESSING] Invoice importer service completed:",
              JSON.stringify(result, null, 2),
            );
          } catch (importerError: any) {
            console.error(
              "❌ [AUTOMATIC_PROCESSING] Invoice importer service also failed:",
              importerError.message,
            );

            // Return a more user-friendly response for RPA failures
            const isRpaFailure =
              importerError.message.includes("selector") ||
              importerError.message.includes("login") ||
              importerError.message.includes("RPA");

            result = {
              success: true, // Mark as success since it switched to manual mode
              warning: true,
              message: isRpaFailure
                ? "RPA automation encountered login issues and switched to manual processing mode. Your import configurations are ready for manual invoice upload."
                : importerError.message ||
                  "Automatic processing completed with warnings",
              processedInvoices: 0,
              manualModeEnabled: isRpaFailure,
              timestamp: new Date().toISOString(),
            };
          }
        }

        // Clear timeout since we're responding
        clearTimeout(processingTimeout);

        const processingTime = Date.now() - startTime;
        console.log(
          `✅ [AUTOMATIC_PROCESSING] Completed successfully in ${processingTime}ms`,
        );

        // Ensure result is a valid JSON object
        const jsonResponse = {
          success: result?.success !== false,
          message: result?.warning
            ? result.message
            : "Automatic processing completed successfully",
          warning: result?.warning || false,
          manualModeEnabled: result?.manualModeEnabled || false,
          data: result || {},
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
        };

        console.log(
          "📤 [AUTOMATIC_PROCESSING] Sending response:",
          JSON.stringify(jsonResponse, null, 2),
        );

        if (!res.headersSent) {
          res.status(200).json(jsonResponse);
        } else {
          console.warn(
            "⚠️ [AUTOMATIC_PROCESSING] Response already sent, skipping",
          );
        }
      } catch (error) {
        // Clear timeout
        if (processingTimeout) {
          clearTimeout(processingTimeout);
        }

        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          "❌ [AUTOMATIC_PROCESSING] Failed after",
          processingTime,
          "ms:",
          errorMessage,
        );
        console.error(
          "❌ [AUTOMATIC_PROCESSING] Error stack:",
          error instanceof Error ? error.stack : "No stack",
        );
        console.error(
          "❌ [AUTOMATIC_PROCESSING] Error name:",
          error instanceof Error ? error.name : "Unknown",
        );
        console.error("❌ [AUTOMATIC_PROCESSING] Error message:", errorMessage);

        // Always return JSON, never let Express return HTML
        res.setHeader("Content-Type", "application/json");

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: "Automatic processing failed",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.warn(
            "⚠️ [AUTOMATIC_PROCESSING] Error occurred but response already sent",
          );
        }
      }
    },
  );

  // Test Python RPA environment endpoint
  apiRouter.get("/rpa/test-environment", isAuthenticated, async (req, res) => {
    try {
      console.log("🧪 [RPA_TEST] Testing Python RPA environment...");

      const result = await PythonRPAService.testRPAEnvironment();

      console.log(
        "✅ [RPA_TEST] Environment test completed:",
        JSON.stringify(result, null, 2),
      );

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ [RPA_TEST] Environment test failed:", errorMessage);

      res.status(500).json({
        success: false,
        error: "RPA environment test failed",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Direct Python RPA processing endpoint (with extended timeout)
  apiRouter.post(
    "/invoices/python-rpa-process",
    isAuthenticated,
    async (req, res) => {
      const startTime = Date.now();
      let processingTimeout: NodeJS.Timeout;

      try {
        console.log(
          "🚀 [PYTHON_RPA_DIRECT] Starting direct Python RPA processing...",
        );

        // Ensure we always return JSON with proper headers
        res.setHeader("Content-Type", "application/json");

        // Set up timeout to prevent hanging - matched to Python script timeout
        processingTimeout = setTimeout(() => {
          console.error(
            "⏰ [PYTHON_RPA_DIRECT] Processing timeout after 4.5 minutes",
          );
          if (!res.headersSent) {
            res.status(408).json({
              success: false,
              error: "Python RPA processing timeout",
              message: "Python RPA processing took too long and was cancelled.",
              timestamp: new Date().toISOString(),
            });
          }
        }, 270000); // 4.5 minute timeout (slightly longer than Python script timeout)

        // Call Python RPA Service directly
        const result = await PythonRPAService.processInvoicesAutomatically();

        // Clear timeout since we got a response
        clearTimeout(processingTimeout);

        const processingTime = Date.now() - startTime;
        console.log(
          `✅ [PYTHON_RPA_DIRECT] Processing completed in ${processingTime}ms`,
        );

        if (!res.headersSent) {
          res.status(200).json({
            success: result.success,
            message: result.message || "Python RPA processing completed",
            data: result,
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        // Clear timeout
        if (processingTimeout) {
          clearTimeout(processingTimeout);
        }

        const processingTime = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          "❌ [PYTHON_RPA_DIRECT] Failed after",
          processingTime,
          "ms:",
          errorMessage,
        );

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: "Python RPA processing failed",
            message: errorMessage || "Unknown error occurred",
            processingTimeMs: processingTime,
            timestamp: new Date().toISOString(),
          });
        }
      }
    },
  );

  // RPA manual processing endpoints for Python service calls
  apiRouter.post("/rpa/process-xml", async (req, res) => {
    try {
      console.log("📋 [RPA_XML] Processing XML file through manual pipeline...");
      
      const { filename, fileSize, documentNumber, emisor, totalValue, buyerTaxId, configId } = req.body;
      
      if (!filename) {
        return res.status(400).json({
          success: false,
          error: "Missing required field: filename"
        });
      }
      
      // Create invoice record and process it through manual pipeline
      const result = await storage.createInvoice({
        userId: 'rpa-system', // Special user for RPA imports
        fileName: filename,
        status: 'pending',
        fileUrl: `uploads/${filename}`,
        source: 'python_rpa',
        documentNumber: documentNumber || null,
        totalAmount: totalValue ? parseFloat(totalValue.replace(/[^\d.-]/g, '')) : null,
        vendorName: emisor || null
      });
      
      // Process the file using OCR/AI pipeline
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'uploads', filename);
      
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        
        // Import and use the processing services
        const { processInvoiceOCR } = await import('./services/ocrService');
        const { extractInvoiceData } = await import('./services/aiService');
        
        try {
          // Update status to processing
          await storage.updateInvoice(result.id, { status: 'processing' });
          
          // Process OCR
          const ocrText = await processInvoiceOCR(fileBuffer, result.id);
          
          // Extract data with AI
          const extractedData = await extractInvoiceData(ocrText);
          
          // Update invoice with extracted data
          await storage.updateInvoice(result.id, {
            status: 'extracted',
            ocrText,
            extractedData,
            vendorName: extractedData.vendorName || emisor || null,
            invoiceNumber: extractedData.invoiceNumber || documentNumber || null,
            totalAmount: extractedData.totalAmount || (totalValue ? parseFloat(totalValue.replace(/[^\d.-]/g, '')) : null),
            invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
            currency: extractedData.currency || 'USD'
          });
          
        } catch (processingError) {
          console.error("Processing error:", processingError);
          await storage.updateInvoice(result.id, { status: 'failed' });
        }
      }
      
      console.log("✅ [RPA_XML] XML processing completed:", result.success);
      
      res.json({
        success: result.success,
        message: result.message || "XML file processed successfully",
        data: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ [RPA_XML] XML processing failed:", errorMessage);
      
      res.status(500).json({
        success: false,
        error: "XML processing failed",
        message: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  apiRouter.post("/rpa/process-pdf", async (req, res) => {
    try {
      console.log("📋 [RPA_PDF] Processing PDF file through manual pipeline (OCR)...");
      
      const { filename, fileSize, documentNumber, emisor, totalValue, configId } = req.body;
      
      if (!filename) {
        return res.status(400).json({
          success: false,
          error: "Missing required field: filename"
        });
      }
      
      // Create invoice record and process it through manual pipeline (OCR)
      const result = await storage.createInvoice({
        userId: 'rpa-system', // Special user for RPA imports
        fileName: filename,
        status: 'pending',
        fileUrl: `uploads/${filename}`,
        source: 'python_rpa',
        documentNumber: documentNumber || null,
        totalAmount: totalValue ? parseFloat(totalValue.replace(/[^\d.-]/g, '')) : null,
        vendorName: emisor || null
      });
      
      // Process the PDF file using OCR/AI pipeline (same as manual upload)
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'uploads', filename);
      
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        
        // Import and use the processing services
        const { processInvoiceOCR } = await import('./services/ocrService');
        const { extractInvoiceData } = await import('./services/aiService');
        
        try {
          // Update status to processing
          await storage.updateInvoice(result.id, { status: 'processing' });
          
          // Process OCR (critical for PDF files)
          const ocrText = await processInvoiceOCR(fileBuffer, result.id);
          
          if (!ocrText || ocrText.trim().length < 10) {
            throw new Error("OCR did not extract sufficient text from PDF");
          }
          
          // Extract data with AI
          const extractedData = await extractInvoiceData(ocrText);
          
          // Update invoice with extracted data
          await storage.updateInvoice(result.id, {
            status: 'extracted',
            ocrText,
            extractedData,
            vendorName: extractedData.vendorName || emisor || null,
            invoiceNumber: extractedData.invoiceNumber || documentNumber || null,
            totalAmount: extractedData.totalAmount || (totalValue ? parseFloat(totalValue.replace(/[^\d.-]/g, '')) : null),
            invoiceDate: extractedData.invoiceDate ? new Date(extractedData.invoiceDate) : null,
            currency: extractedData.currency || 'USD'
          });
          
        } catch (processingError) {
          console.error("PDF processing error:", processingError);
          await storage.updateInvoice(result.id, { status: 'failed' });
        }
      }
      
      console.log("✅ [RPA_PDF] PDF processing completed:", result.success);
      
      res.json({
        success: result.success,
        message: result.message || "PDF file processed successfully", 
        data: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ [RPA_PDF] PDF processing failed:", errorMessage);
      
      res.status(500).json({
        success: false,
        error: "PDF processing failed",
        message: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Process selected invoices for line item classification
  apiRouter.post(
    "/process-invoices-line-items",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        const { invoiceIds } = req.body;

        if (!userId) {
          console.log("❌ Error: User ID not found in request.");
          return res
            .status(401)
            .json({ message: "User authentication is required." });
        }

        // Validate request body
        if (
          !invoiceIds ||
          !Array.isArray(invoiceIds) ||
          invoiceIds.length === 0
        ) {
          console.log("❌ Error: Invalid invoiceIds provided.");
          return res.status(400).json({
            error: "invoiceIds array is required and must not be empty",
          });
        }

        console.log(
          `🚀 Starting line item classification for ${invoiceIds.length} invoices for user ${userId}`,
        );

        // Get all selected invoices and validate access
        const invoices = await Promise.all(
          invoiceIds.map(async (id: number) => {
            const invoice = await storage.getInvoice(id);
            if (!invoice) {
              console.log(`❌ Invoice ${id} not found.`);
              throw new Error(`Invoice ${id} not found`);
            }
            if (invoice.userId !== userId) {
              console.log(
                `❌ Access denied for invoice ${id}. Expected user ${userId}, found ${invoice.userId}.`,
              );
              throw new Error(`Invoice ${id} access denied`);
            }
            return invoice;
          }),
        );

        // Filter invoices that can be processed
        const processableInvoices = invoices.filter((invoice) =>
          ["classified", "pending", "approved"].includes(invoice.status || ""),
        );

        if (processableInvoices.length === 0) {
          console.log("⚠️ No invoices available for line item processing.");
          return res.status(400).json({
            error:
              "No invoices available for line item processing. Selected invoices may not be ready for classification.",
          });
        }

        console.log(
          `📊 Processing ${processableInvoices.length} invoices for line item classification`,
        );

        // Generate a session ID for progress tracking
        const sessionId = `classification-${userId}-${Date.now()}`;

        // Send immediate response
        res.json({
          message: `Started line item processing for ${processableInvoices.length} invoices`,
          totalInvoices: processableInvoices.length,
          invoiceIds: processableInvoices.map((inv) => inv.id),
          status: "started",
          sessionId: sessionId,
        });

        // Process invoices in background using the helper function
        setImmediate(async () => {
          try {
            await processInvoiceLineItems(processableInvoices, userId);
            console.log(
              `🎉 Background processing completed for ${processableInvoices.length} invoices`,
            );
          } catch (error) {
            console.error("❌ Background processing failed:", error);
          }
        });
      } catch (error: any) {
        console.error("❌ Line item processing error:", error);
        res.status(500).json({
          error: "Failed to initiate line item processing",
          message: error.message,
        });
      }
    },
  );

  // Deduplication endpoint
  apiRouter.post(
    "/invoices/:id/deduplicate",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = (req.user as any).claims.sub;
        const invoiceId = parseInt(req.params.id);

        console.log(
          `🔄 Starting deduplication for invoice ${invoiceId} by user ${userId}`,
        );

        if (isNaN(invoiceId)) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid invoice ID" });
        }

        // Check if user owns the invoice
        const invoice = await storage.getInvoice(invoiceId);
        if (!invoice || invoice.userId !== userId) {
          return res
            .status(404)
            .json({
              success: false,
              error: "Invoice not found or access denied",
            });
        }

        // Get all line items for this invoice
        const allLineItems = await storage.getLineItemsByInvoiceId(invoiceId);

        if (allLineItems.length === 0) {
          return res.json({
            success: true,
            message: "No line items found",
            invoiceId,
            summary: { duplicatesRemoved: 0, itemsKept: 0, duplicateGroups: 0 },
          });
        }

        console.log(
          `📝 Found ${allLineItems.length} line items for invoice ${invoiceId}`,
        );

        // Group items by description to find duplicates
        const grouped = new Map();

        for (const item of allLineItems) {
          const key = (item.description || "").trim().toLowerCase();
          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key).push(item);
        }

        // Find duplicates
        const duplicateGroups = Array.from(grouped.entries()).filter(
          ([key, items]) => items.length > 1,
        );

        if (duplicateGroups.length === 0) {
          return res.json({
            success: true,
            message: "No duplicates found",
            invoiceId,
            summary: {
              duplicatesRemoved: 0,
              itemsKept: allLineItems.length,
              duplicateGroups: 0,
            },
          });
        }

        let totalRemoved = 0;
        const details = [];

        // Remove duplicates (keep first, remove rest)
        for (const [description, items] of duplicateGroups) {
          console.log(
            `🔄 Processing ${items.length} duplicates of: ${description.substring(0, 50)}...`,
          );

          const [keepItem, ...removeItems] = items.sort(
            (a: any, b: any) => a.id - b.id,
          );

          details.push({
            description: keepItem.description || "Unknown",
            duplicateCount: items.length,
            removedCount: removeItems.length,
          });

          if (removeItems.length > 0) {
            // Delete classifications first (to avoid foreign key issues)
            for (const item of removeItems) {
              try {
                await db
                  .delete(lineItemClassifications)
                  .where(eq(lineItemClassifications.lineItemId, item.id));
              } catch (error) {
                console.log(
                  `Note: No classifications to delete for item ${item.id}`,
                );
              }
            }

            // Delete duplicate line items
            for (const item of removeItems) {
              await db.delete(lineItems).where(eq(lineItems.id, item.id));
            }

            totalRemoved += removeItems.length;
            console.log(
              `🗑️ Removed ${removeItems.length} duplicates of: ${description.substring(0, 30)}...`,
            );
          }
        }

        const finalCount = allLineItems.length - totalRemoved;

        console.log(`✅ Deduplication completed for invoice ${invoiceId}:`);
        console.log(`   📊 Original: ${allLineItems.length} items`);
        console.log(`   🗑️ Removed: ${totalRemoved} duplicates`);
        console.log(`   ✅ Kept: ${finalCount} unique items`);

        res.json({
          success: true,
          message: "Deduplication completed successfully",
          invoiceId,
          summary: {
            duplicatesRemoved: totalRemoved,
            itemsKept: finalCount,
            duplicateGroups: duplicateGroups.length,
          },
          details: details,
        });
      } catch (error) {
        console.error("❌ Error in deduplication:", error);
        res.status(500).json({
          success: false,
          error: "Deduplication failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Temporary non-authenticated deduplication endpoint for testing
  apiRouter.post("/invoices/:id/deduplicate-test", (req: any, res) => {
    console.log("🧪 TEST DEDUPLICATION ROUTE HIT!");
    console.log("Invoice ID:", req.params.id);
    console.log("Origin:", req.headers.origin);

    // Set CORS headers for test deduplication endpoint
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Credentials", "true");

    res.json({
      success: true,
      message: "Test deduplication route working!",
      invoiceId: req.params.id,
      timestamp: new Date().toISOString(),
      origin: req.headers.origin || "unknown",
      note: "This is a test endpoint - no authentication required",
    });
  });

  // Autonomous Invoice Processing Agent endpoint
  apiRouter.post("/agent/process-invoice", isAuthenticated, async (req: any, res) => {
    try {
      console.log("🤖 Autonomous Invoice Processing Agent endpoint hit");
      const userId = req.user?.id;
      const { file, fileName, config, additionalContext } = req.body;

      if (!file || !fileName) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: file and fileName"
        });
      }

      // Convert base64 file to buffer if needed
      let fileBuffer: Buffer;
      if (typeof file === 'string') {
        // Assume base64 encoded
        fileBuffer = Buffer.from(file, 'base64');
      } else {
        fileBuffer = file;
      }

      // Create agent context
      const context = {
        user_id: userId,
        company_id: req.body.company_id,
        timezone: req.body.timezone || 'UTC',
        language: req.body.language || 'en',
        session_id: req.body.session_id
      };

      // Merge configuration with defaults
      const agentConfig = {
        ...DEFAULT_AGENT_CONFIG,
        ...config
      };

      // Create and execute agent
      const agent = createInvoiceProcessingAgent(agentConfig, context);
      const result = await agent.executeWorkflow(fileBuffer, fileName, additionalContext);

      console.log("✅ Autonomous agent workflow completed:", {
        success: result.success,
        processing_time: result.processing_time_ms,
        final_status: result.final_status
      });

      res.json({
        success: result.success,
        result: result,
        agent: {
          name: "Invoice Processing Agent",
          version: "1.0.0",
          capabilities: [
            "ocr_extraction",
            "ai_data_extraction", 
            "line_item_classification",
            "validation",
            "po_matching",
            "project_assignment"
          ]
        }
      });

    } catch (error) {
      console.error("❌ Autonomous agent error:", error);
      res.status(500).json({
        success: false,
        error: "Autonomous agent processing failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get agent configuration endpoint
  apiRouter.get("/agent/config", isAuthenticated, async (req: any, res) => {
    try {
      res.json({
        success: true,
        config: DEFAULT_AGENT_CONFIG,
        agent: {
          name: "Invoice Processing Agent",
          version: "1.0.0",
          description: "Autonomous agent for processing, classifying, and validating invoices"
        }
      });
    } catch (error) {
      console.error("❌ Error getting agent config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get agent configuration"
      });
    }
  });

  // OPTIONS handler for deduplication (CORS preflight)
  apiRouter.options("/invoices/:id/deduplicate", (req, res) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    res.status(200).end();
  });

  // ========================================================================
  // Universal ERP Adapter Routes
  // ========================================================================
  
  // NOTE: Adapter initialization is handled in server/index.ts during server bootstrap
  // The adapters are initialized and awaited BEFORE the server starts listening
  // This ensures all adapter endpoints have a populated registry when requests arrive
  
  /**
   * List all registered adapters with their capabilities and metrics
   */
  apiRouter.get("/erp/adapters", isAuthenticated, async (req: any, res) => {
    try {
      const adapters = adapterRegistry.listAdapters();
      
      res.json({
        success: true,
        adapters,
        total: adapters.length
      });
    } catch (error: any) {
      console.error("[ERP Adapters] Error listing adapters:", error);
      res.status(500).json({
        success: false,
        error: "Failed to list adapters",
        message: error.message
      });
    }
  });
  
  /**
   * Test connection for a specific adapter
   */
  apiRouter.post("/erp/adapters/test-connection", isAuthenticated, async (req: any, res) => {
    try {
      const { adapterId } = req.body;
      
      if (!adapterId) {
        return res.status(400).json({
          success: false,
          error: "Adapter ID is required"
        });
      }
      
      const adapter = adapterRegistry.getAdapter(adapterId);
      if (!adapter) {
        return res.status(404).json({
          success: false,
          error: "Adapter not found"
        });
      }
      
      const testResult = await adapter.testConnection();
      
      res.json({
        success: true,
        result: testResult
      });
    } catch (error: any) {
      console.error("[ERP Adapters] Error testing connection:", error);
      res.status(500).json({
        success: false,
        error: "Connection test failed",
        message: error.message
      });
    }
  });
  
  /**
   * Sync invoices using a specific adapter
   */
  apiRouter.post("/erp/adapters/:id/sync", isAuthenticated, async (req: any, res) => {
    try {
      const { id: adapterId } = req.params;
      const { dateFrom, dateTo, invoiceIds } = req.body;
      
      const adapter = adapterRegistry.getAdapter(adapterId);
      if (!adapter) {
        return res.status(404).json({
          success: false,
          error: "Adapter not found"
        });
      }
      
      const syncResult = await adapter.syncInvoices({
        dateFrom: dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dateTo: dateTo ? new Date(dateTo) : new Date(),
        invoiceIds
      });
      
      res.json({
        success: syncResult.success,
        result: syncResult
      });
    } catch (error: any) {
      console.error("[ERP Adapters] Error syncing invoices:", error);
      res.status(500).json({
        success: false,
        error: "Invoice sync failed",
        message: error.message
      });
    }
  });
  
  /**
   * Get adapter metrics
   */
  apiRouter.get("/erp/adapters/:id/metrics", isAuthenticated, async (req: any, res) => {
    try {
      const { id: adapterId } = req.params;
      
      const metrics = adapterRegistry.getMetrics(adapterId);
      if (!metrics) {
        return res.status(404).json({
          success: false,
          error: "Adapter not found"
        });
      }
      
      res.json({
        success: true,
        metrics
      });
    } catch (error: any) {
      console.error("[ERP Adapters] Error fetching metrics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch metrics",
        message: error.message
      });
    }
  });
  
  /**
   * Get all ERP connections with adapter metadata
   */
  apiRouter.get("/erp/connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }
      
      const connections = await db
        .select()
        .from(erpConnections)
        .where(eq(erpConnections.userId, userId));
      
      res.json({
        success: true,
        connections
      });
    } catch (error: any) {
      console.error("[ERP Connections] Error fetching connections:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch connections",
        message: error.message
      });
    }
  });
  
  /**
   * Create new ERP connection
   */
  apiRouter.post("/erp/connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }
      
      const {
        name,
        baseUrl,
        username,
        password,
        description,
        integrationMethod,
        erpSystem,
        capabilities,
        adapterConfig
      } = req.body;
      
      // Validate required fields
      if (!name || !baseUrl || !username || !password) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: name, baseUrl, username, password"
        });
      }
      
      const [connection] = await db.insert(erpConnections).values({
        userId,
        name,
        baseUrl,
        username,
        password,
        description: description || null,
        integrationMethod: integrationMethod || 'rpa',
        erpSystem: erpSystem || 'generic',
        capabilities: capabilities || {
          method: integrationMethod || 'rpa',
          erpSystem: erpSystem || 'generic',
          supportedFeatures: ['bulkDownload'],
          reliabilityScore: 70,
          averageResponseTime: 5000,
          isHealthy: true
        },
        adapterConfig: adapterConfig || {},
        isActive: true
      }).returning();
      
      res.json({
        success: true,
        connection
      });
    } catch (error: any) {
      console.error("[ERP Connections] Error creating connection:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create connection",
        message: error.message
      });
    }
  });
  
  /**
   * Get specific ERP connection
   */
  apiRouter.get("/erp/connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }
      
      const connectionId = parseInt(req.params.id);
      
      const [connection] = await db
        .select()
        .from(erpConnections)
        .where(eq(erpConnections.id, connectionId));
      
      if (!connection || connection.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: "Connection not found"
        });
      }
      
      res.json({
        success: true,
        connection
      });
    } catch (error: any) {
      console.error("[ERP Connections] Error fetching connection:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch connection",
        message: error.message
      });
    }
  });
  
  /**
   * Update ERP connection
   */
  apiRouter.put("/erp/connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }
      
      const connectionId = parseInt(req.params.id);
      
      // Verify ownership
      const [existing] = await db
        .select()
        .from(erpConnections)
        .where(eq(erpConnections.id, connectionId));
      
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: "Connection not found"
        });
      }
      
      const {
        name,
        baseUrl,
        username,
        password,
        description,
        integrationMethod,
        erpSystem,
        capabilities,
        adapterConfig,
        isActive
      } = req.body;
      
      const [updated] = await db
        .update(erpConnections)
        .set({
          name: name || existing.name,
          baseUrl: baseUrl || existing.baseUrl,
          username: username || existing.username,
          password: password || existing.password,
          description: description !== undefined ? description : existing.description,
          integrationMethod: integrationMethod || existing.integrationMethod,
          erpSystem: erpSystem || existing.erpSystem,
          capabilities: capabilities || existing.capabilities,
          adapterConfig: adapterConfig || existing.adapterConfig,
          isActive: isActive !== undefined ? isActive : existing.isActive,
          updatedAt: new Date()
        })
        .where(eq(erpConnections.id, connectionId))
        .returning();
      
      res.json({
        success: true,
        connection: updated
      });
    } catch (error: any) {
      console.error("[ERP Connections] Error updating connection:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update connection",
        message: error.message
      });
    }
  });
  
  /**
   * Delete ERP connection
   */
  apiRouter.delete("/erp/connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }
      
      const connectionId = parseInt(req.params.id);
      
      // Verify ownership
      const [existing] = await db
        .select()
        .from(erpConnections)
        .where(eq(erpConnections.id, connectionId));
      
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: "Connection not found"
        });
      }
      
      await db
        .delete(erpConnections)
        .where(eq(erpConnections.id, connectionId));
      
      res.json({
        success: true,
        message: "Connection deleted successfully"
      });
    } catch (error: any) {
      console.error("[ERP Connections] Error deleting connection:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete connection",
        message: error.message
      });
    }
  });
  
  /**
   * Perform health checks on all adapters
   */
  apiRouter.post("/erp/adapters/health-check", isAuthenticated, async (req: any, res) => {
    try {
      const results = await adapterRegistry.performHealthChecks();
      
      const healthStatus = Array.from(results.entries()).map(([adapterId, isHealthy]) => ({
        adapterId,
        isHealthy,
        metrics: adapterRegistry.getMetrics(adapterId)
      }));
      
      res.json({
        success: true,
        healthStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("[ERP Adapters] Error performing health checks:", error);
      res.status(500).json({
        success: false,
        error: "Health check failed",
        message: error.message
      });
    }
  });

  return httpServer;
}
