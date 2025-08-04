import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { invoiceImporterService } from "./services/invoiceImporterService";
import passport from "passport";
import * as replitAuthModule from "./replitAuth";
import { authMonitoring, monitorProtectedRoute, monitorApiResponse } from './services/authMonitoringService.js';
import { authTestService } from './services/authTestService.js';

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Create a dedicated API router with higher precedence
  const apiRouter = express.Router();

  // Setup authentication on the main app first (for session setup)
  setupAuth(app);

  // Add global API response monitoring
  app.use('/api', monitorApiResponse());

  // Mount the API router BEFORE any other middleware
  app.use('/api', apiRouter);

  // Add authentication routes to the API router
  apiRouter.get("/login", (req, res, next) => {
    console.log(`🔐 LOGIN HANDLER CALLED - hostname: ${req.hostname}`);
    console.log(`🔐 Using strategy: replitauth`);

    const authHandler = passport.authenticate('replitauth', {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    });

    console.log(`🔐 Calling authentication handler...`);
    authHandler(req, res, next);
  });

  apiRouter.get("/callback", (req, res, next) => {
    console.log('🔄 Auth callback - using strategy: replitauth');
    console.log('🔄 Callback query params:', req.query);

    passport.authenticate('replitauth', {
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
  apiRouter.get("/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('📋 User endpoint called - Claims:', req.headers['x-replit-user-id'] ? 'present' : 'missing');

      // Get user from Replit headers directly
      const userId = req.headers['x-replit-user-id'] as string;
      const userName = req.headers['x-replit-user-name'] as string;
      const userEmail = req.headers['x-replit-user-email'] as string;
      const userImage = req.headers['x-replit-user-profile-image'] as string;

      const user = {
        id: userId,
        email: userEmail,
        firstName: userName?.split(' ')[0] || '',
        lastName: userName?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: userImage
      };

      if (!userId) {
        console.log('❌ No user found in request');
        await authMonitoring.logAuthEvent({
          event: 'user_endpoint_access',
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          success: false,
          details: { error: 'No user in request' }
        });
        return res.status(401).json({ error: 'Not authenticated' });
      }

      console.log('✅ Returning user data:', {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl
      });

      await authMonitoring.logAuthEvent({
        event: 'user_endpoint_access',
        userId: user.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        success: true,
        details: { email: user.email }
      });

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl
      });
    } catch (error) {
      console.error('❌ Error in user endpoint:', error);
      await authMonitoring.logAuthEvent({
        event: 'user_endpoint_error',
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Health check endpoint
  apiRouter.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  // Get all invoices
  apiRouter.get("/invoices", monitorProtectedRoute("get_invoices"), async (req: any, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || req.headers['x-replit-user-id'];
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
  apiRouter.get("/invoices/:id", monitorProtectedRoute("get_invoice_by_id"), async (req: any, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || req.headers['x-replit-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

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
  apiRouter.get("/dashboard/stats", monitorProtectedRoute("get_dashboard_stats"), async (req: any, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || req.headers['x-replit-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

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
  apiRouter.get("/validation-rules", monitorProtectedRoute("get_validation_rules"), async (req: any, res: Response) => {
    try {
      console.log("🔍 API: GET /api/validation-rules - Starting request");
      console.log("🔍 API: User authenticated:", !!req.user);
      
      const userId = (req.user as any)?.claims?.sub || req.headers['x-replit-user-id'];
      console.log("🔍 API: User ID:", userId);
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

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
  app.post("/api/validation-rules", monitorProtectedRoute("create_validation_rule"), async (req: any, res: Response) => {
    try {
      console.log("📝 API: POST /api/validation-rules - Starting request");
      console.log("📝 API: Request headers:", JSON.stringify(req.headers, null, 2));
      console.log("📝 API: Request body:", JSON.stringify(req.body, null, 2));
      console.log("📝 API: User authenticated:", !!req.user);
      
      const userId = (req.user as any)?.claims?.sub || req.headers['x-replit-user-id'];
      console.log("📝 API: User ID:", userId);
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

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
  app.get('/api/validation-rules/debug', monitorProtectedRoute("debug_validation_rules"), async (req: any, res: Response) => {
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
  app.post('/api/invoices/initiate-automatic-process', monitorProtectedRoute("initiate_automatic_process"), async (req, res) => {
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
        console.error('⏰ [AUTOMATIC_PROCESSING] Processing timeout after 2 minutes');
        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: 'Processing timeout',
            message: 'Automatic processing took too long and was cancelled',
            timestamp: new Date().toISOString()
          });
        }
      }, 120000); // 2 minute timeout for browser automation

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

  // Debug endpoint to test ERP connection
  app.post('/api/debug/test-erp-connection', monitorProtectedRoute("test_erp_connection"), async (req: any, res: Response) => {
    try {
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({ error: 'Connection ID is required' });
      }

      const connection = await storage.getErpConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'ERP connection not found' });
      }

      console.log('🔍 [DEBUG] Testing ERP connection:', connection.name);

      // Import the ERP automation service
      const { erpAutomationService } = await import('./services/erpAutomationService');

      const testResult = await erpAutomationService.testConnection(connection);

      res.json({
        success: testResult.success,
        message: testResult.message,
        details: testResult.details,
        connectionInfo: {
          id: connection.id,
          name: connection.name,
          baseUrl: connection.baseUrl,
          username: connection.username
        }
      });

    } catch (error) {
      console.error('ERP connection test failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Authentication monitoring and testing endpoints
  app.get('/api/auth/stats', monitorProtectedRoute('auth_stats'), async (req: Request, res: Response) => {
    try {
      const stats = await authMonitoring.getAuthStats(24);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching auth stats:', error);
      res.status(500).json({ error: 'Failed to fetch auth stats' });
    }
  });

  app.get('/api/auth/logs', monitorProtectedRoute('auth_logs'), async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await authMonitoring.getRecentAuthEvents(limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching auth logs:', error);
      res.status(500).json({ error: 'Failed to fetch auth logs' });
    }
  });

  app.post('/api/auth/test', monitorProtectedRoute('auth_test'), async (req: Request, res: Response) => {
    try {
      console.log('🧪 Running comprehensive authentication tests...');
      const testResults = await authTestService.runComprehensiveTests();

      const overallSuccess = testResults.every(suite => suite.overallSuccess);
      const totalTests = testResults.reduce((sum, suite) => sum + suite.results.length, 0);
      const passedTests = testResults.reduce((sum, suite) =>
        sum + suite.results.filter(r => r.passed).length, 0);

      console.log(`🧪 Tests completed: ${passedTests}/${totalTests} passed`);

      res.json({
        overallSuccess,
        summary: {
          totalTests,
          passedTests,
          failedTests: totalTests - passedTests
        },
        testSuites: testResults
      });
    } catch (error) {
      console.error('Error running auth tests:', error);
      res.status(500).json({ error: 'Failed to run auth tests' });
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    schedulerService.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    schedulerService.stop();
    process.exit(0);
  });

  return httpServer;
}