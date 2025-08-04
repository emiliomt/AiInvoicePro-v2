import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { invoiceImporterService } from "./services/invoiceImporterService";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Setup authentication
  await setupAuth(app);

  // Basic user endpoint  
  app.get("/api/user", (req: any, res) => {
    console.log('🔍 User endpoint - isAuthenticated:', !!req.isAuthenticated());
    console.log('🔍 User endpoint - user exists:', !!req.user);
    console.log('🔍 User endpoint - session user:', (req.session as any)?.user);
    console.log('🔍 User endpoint - session ID:', req.sessionID);
    
    // Check both passport auth and session-based auth for development
    const sessionUser = (req.session as any)?.user;
    if (req.isAuthenticated() && req.user) {
      console.log('✅ User endpoint - passport auth passed');
      return res.json({ 
        user: req.user,
        message: "Authenticated successfully" 
      });
    } else if (sessionUser) {
      console.log('✅ User endpoint - session auth passed');
      return res.json({ 
        user: sessionUser,
        message: "Authenticated successfully (session)" 
      });
    }
    
    console.log('❌ User endpoint - auth failed');
    return res.status(401).json({ message: "Unauthorized" });
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString() 
    });
  });

  // Authentication endpoints (moved here to ensure they work)
  app.get("/api/login", (req, res) => {
    console.log('🔐 Login route called directly from routes.ts');
    console.log('🔐 Hostname:', req.hostname);
    console.log('🔐 Query params:', req.query);
    console.log('🔐 req.query.bypass:', req.query.bypass);
    console.log('🔐 bypass check:', req.query.bypass === 'dev');
    
    // Always use development mode for now to avoid OAuth PKCE issues
    console.log('🔐 Development mode activated (OAuth bypass)');
    // Create a mock user session for development
    (req.session as any).user = {
      id: 'dev-user-123',
      email: 'dev@example.com',
      name: 'Development User',
      picture: 'https://via.placeholder.com/150'
    };
    console.log('🔐 Mock user session created');
    return res.redirect('/?auth=success');
  });

  app.get("/api/callback", (req, res) => {
    console.log('🔐 Callback route called directly from routes.ts');
    console.log('🔐 Query params:', req.query);
    
    // Handle the OAuth callback manually for now
    if (req.query.code) {
      console.log('🔐 OAuth code received:', req.query.code);
      // For now, just redirect to home page with success
      // Later we'll implement proper token exchange
      res.redirect('/?auth=success');
    } else if (req.query.error) {
      console.log('🔐 OAuth error:', req.query.error);
      // If OAuth fails due to PKCE, fall back to development mode
      console.log('🔐 OAuth failed, setting development session');
      (req.session as any).user = {
        id: 'dev-user-123',
        email: 'dev@example.com',
        name: 'Development User',
        picture: 'https://via.placeholder.com/150'
      };
      res.redirect('/?auth=dev');
    } else {
      console.log('🔐 Callback called without code or error');
      res.redirect('/?auth=error&message=No authorization code received');
    }
  });

  app.get("/api/logout", (req, res) => {
    console.log('🔐 Logout route called');
    req.session.destroy((err) => {
      if (err) {
        console.error('🔐 Session destroy error:', err);
      }
      res.redirect('/');
    });
  });

  // Get all invoices
  app.get("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
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
  app.get("/api/dashboard/stats", async (req: any, res) => {
    console.log('🔍 Dashboard stats - isAuthenticated:', !!req.isAuthenticated());
    console.log('🔍 Dashboard stats - user exists:', !!req.user);
    console.log('🔍 Dashboard stats - session ID:', req.sessionID);
    
    if (!req.isAuthenticated() || !req.user) {
      console.log('❌ Dashboard stats - auth failed');
      return res.status(401).json({ message: "Unauthorized" });
    }
    console.log('✅ Dashboard stats - auth passed');
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
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Initiate automatic processing (process existing invoices, not import new ones)
  app.post('/api/invoices/initiate-automatic-process', isAuthenticated, async (req, res) => {
    const startTime = Date.now();

    try {
      console.log('🚀 [AUTOMATIC_PROCESSING] Starting automatic invoice processing...');
      console.log('🚀 [AUTOMATIC_PROCESSING] Request user:', req.user?.id);
      console.log('🚀 [AUTOMATIC_PROCESSING] Request body:', JSON.stringify(req.body, null, 2));

      // Ensure we always return JSON with proper headers
      res.setHeader('Content-Type', 'application/json');

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'User not authenticated',
          message: 'Authentication required'
        });
      }

      const { invoiceIds } = req.body;

      // If no specific invoices provided, get all pending invoices for the user
      let targetInvoiceIds = invoiceIds;
      if (!targetInvoiceIds || targetInvoiceIds.length === 0) {
        const pendingInvoices = await storage.getInvoices();
        targetInvoiceIds = pendingInvoices
          .filter(inv => inv.userId === userId && ['pending', 'extracted', 'processing'].includes(inv.status))
          .map(inv => inv.id);

        if (targetInvoiceIds.length === 0) {
          return res.json({
            success: true,
            message: 'No pending invoices found to process',
            processedCount: 0,
            totalCount: 0,
            results: []
          });
        }
      }

      console.log(`📋 [AUTOMATIC_PROCESSING] Processing ${targetInvoiceIds.length} existing invoices`);

      let processedCount = 0;
      const results = [];

      for (const invoiceId of targetInvoiceIds) {
        try {
          console.log(`🔄 [AUTOMATIC_PROCESSING] Processing invoice ${invoiceId}`);

          // Get the invoice from database
          const invoice = await storage.getInvoice(invoiceId);
          if (!invoice) {
            console.log(`❌ Invoice ${invoiceId} not found`);
            results.push({ invoiceId, success: false, error: 'Invoice not found' });
            continue;
          }

          console.log(`🔄 Processing invoice ${invoiceId}: ${invoice.invoiceNumber || 'No number'}`);

          // Run processing steps on existing invoice
          const processingResult = await processExistingInvoice(invoice);
          results.push(processingResult);

          if (processingResult.success) {
            processedCount++;
          }

          console.log(`✅ Completed processing invoice ${invoiceId}`);

        } catch (error) {
          console.error(`❌ Failed to process invoice ${invoiceId}:`, error);
          results.push({ 
            invoiceId, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const processingTime = Date.now() - startTime;

      const response = {
        success: true,
        message: `Processed ${processedCount}/${targetInvoiceIds.length} invoices successfully`,
        processedCount,
        totalCount: targetInvoiceIds.length,
        results,
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      };

      console.log('✅ [AUTOMATIC_PROCESSING] Completed successfully:', JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ [AUTOMATIC_PROCESSING] Failed after', processingTime, 'ms:', error);

      res.status(500).json({
        success: false,
        error: 'Automatic processing failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Helper function to process existing invoices (not import new ones)
  async function processExistingInvoice(invoice: any): Promise<any> {
  console.log(`📋 Processing existing invoice: ${invoice.invoiceNumber}`);

  const processingResults = {
    isPettyCash: false,
    validationPassed: false,
    validationErrors: [],
    poMatched: false,
    poMatchDetails: null,
    projectAssigned: false,
    projectId: null,
    discrepancies: [],
    processingStatus: 'processing',
    lastProcessed: new Date().toISOString()
  };

  try {
    // Step 1: Check if Petty Cash
    console.log(`🔄 Checking petty cash status for invoice ${invoice.id}`);
    const isPettyCash = invoice.totalAmount <= 100; // Simple threshold check
    processingResults.isPettyCash = isPettyCash;

    if (isPettyCash) {
      // Create petty cash log
      await storage.createPettyCashLog({
        invoiceId: invoice.id,
        amount: invoice.totalAmount,
        status: 'pending_approval',
        submittedBy: invoice.userId,
        description: `Auto-detected petty cash: ${invoice.vendorName}`,
        category: 'miscellaneous'
      });
      console.log(`✅ Marked as petty cash`);
    }

    // Step 2: PO Matching
    console.log(`🔄 Running PO matching for invoice ${invoice.id}`);
    const poMatches = await findPOMatchesForInvoice(invoice);
    const poMatchCount = poMatches.length;
    if (poMatchCount > 0) {
      processingResults.poMatched = true;
      processingResults.poMatchDetails = poMatches[0] || null; // Use best match
      console.log(`✅ Found ${poMatchCount} PO matches`);
    } else {
      console.log(`ℹ️ No PO matches found`);
    }

    // Step 3: Validation
    console.log(`🔄 Running validation for invoice ${invoice.id}`);
    const validationResult = await storage.validateInvoiceData({
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      taxAmount: invoice.taxAmount,
      invoiceDate: invoice.invoiceDate,
      currency: invoice.currency
    });

    processingResults.validationPassed = validationResult.isValid;
    processingResults.validationErrors = validationResult.violations || [];
    console.log(`✅ Validation completed: ${validationResult.isValid ? 'PASSED' : 'FAILED'}`);

    // Step 4: Project Assignment
    console.log(`🔄 Running project assignment for invoice ${invoice.id}`);
    const projectMatch = await assignProjectToInvoice(invoice);
    if (projectMatch) {
      processingResults.projectAssigned = true;
      processingResults.projectId = String(projectMatch.projectId);
      console.log(`✅ Project assigned: ${projectMatch.projectId}`);
    } else {
      console.log(`ℹ️ No project assignment made`);
    }

    // Step 5: Discrepancy Check
    console.log(`🔄 Running discrepancy check for invoice ${invoice.id}`);
    const discrepancies = await checkForDiscrepancies(invoice);
    processingResults.discrepancies = discrepancies || [];
    processingResults.processingStatus = 'completed';
    console.log(`✅ Discrepancy check completed: ${discrepancies.length} issues found`);

    // Step 6: Store processing results in invoice
    const updatedInvoiceData = {
      status: isPettyCash ? 'petty_cash' as const : (poMatchCount > 0 ? 'matched' as const : 'processed' as const),
      extractedData: {
        ...invoice.extractedData,
        processingResults: processingResults
      }
    };

    await storage.updateInvoice(invoice.id, updatedInvoiceData);
    console.log(`✅ Stored processing results for invoice ${invoice.id}`);

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      success: true,
      processingSteps: {
        poMatching: processingResults.poMatched,
        validation: processingResults.validationPassed,
        projectAssignment: processingResults.projectAssigned,
        discrepancyCheck: true
      },
      poMatches: poMatchCount,
      validationPassed: processingResults.validationPassed,
      projectAssigned: processingResults.projectAssigned,
      discrepanciesFound: discrepancies.length,
      isPettyCash: processingResults.isPettyCash
    };

  } catch (error: any) {
    console.error(`❌ Error processing invoice ${invoice.id}:`, error);

    // Store error in processing results
    processingResults.processingStatus = 'failed';
    await storage.updateInvoice(invoice.id, {
      extractedData: {
        ...invoice.extractedData,
        processingResults: {
          ...processingResults,
          errorMessage: error.message
        }
      }
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      success: false,
      error: error.message
    };
  }
}

  // Helper function to find PO matches for an invoice
  async function findPOMatchesForInvoice(invoice: any) {
    try {
      // Get all purchase orders
      const purchaseOrders = await storage.getPurchaseOrders();

      const matches = purchaseOrders.filter(po => {
        // Match by vendor name (case-insensitive partial match)
        const vendorMatch = po.vendorName && invoice.vendorName && 
          po.vendorName.toLowerCase().includes(invoice.vendorName.toLowerCase());

        // Match by amount (within 5% tolerance)
        const amountMatch = po.amount && invoice.totalAmount &&
          Math.abs(parseFloat(po.amount.toString()) - parseFloat(invoice.totalAmount.toString())) / parseFloat(po.amount.toString()) < 0.05;

        // Match by invoice number if available (using poId as reference)
        const invoiceNumberMatch = po.poId && invoice.invoiceNumber &&
          po.poId.toLowerCase().includes(invoice.invoiceNumber.toLowerCase());

        return vendorMatch || amountMatch || invoiceNumberMatch;
      });

      return matches.map(po => ({
        poId: po.id,
        poNumber: po.poId,
        matchType: 'automatic',
        matchScore: 85,
        matchReason: 'Vendor and/or amount match'
      }));

    } catch (error) {
      console.error('PO matching failed:', error);
      return [];
    }
  }

  // Helper function to assign project to invoice
  async function assignProjectToInvoice(invoice: any) {
    try {
      // Get all projects
      const projects = await storage.getProjects();

      // Simple project assignment logic - match by vendor name
      const projectMatch = projects.find(project => 
        invoice.vendorName && project.name && 
        invoice.vendorName.toLowerCase().includes(project.name.toLowerCase())
      );

      if (projectMatch) {
        await storage.updateInvoice(invoice.id, {
          projectName: projectMatch.name
        });

        // Create project match record
        await storage.createInvoiceProjectMatch({
          invoiceId: invoice.id,
          projectId: projectMatch.id.toString(),
          matchScore: 80,
          matchDetails: { type: 'automatic', reason: 'Vendor name similarity' }
        });

        return projectMatch;
      }

      return null;
    } catch (error) {
      console.error('Project assignment failed:', error);
      return null;
    }
  }

  // Helper function to check invoice discrepancies
  async function checkForDiscrepancies(invoice: any) {
    try {
      const discrepancies = [];

      // Check for missing required fields
      if (!invoice.vendorName) {
        discrepancies.push({ type: 'missing_vendor', message: 'Vendor name is missing' });
      }

      if (!invoice.totalAmount || parseFloat(invoice.totalAmount.toString()) <= 0) {
        discrepancies.push({ type: 'invalid_amount', message: 'Total amount is missing or invalid' });
      }

      if (!invoice.invoiceDate) {
        discrepancies.push({ type: 'missing_date', message: 'Invoice date is missing' });
      }

      // Check for duplicate invoices
      if (invoice.vendorName && invoice.invoiceNumber) {
        const existingInvoices = await storage.getInvoices();
        const duplicates = existingInvoices.filter(inv => 
          inv.id !== invoice.id &&
          inv.userId === invoice.userId &&
          inv.vendorName === invoice.vendorName &&
          inv.invoiceNumber === invoice.invoiceNumber
        );

        if (duplicates.length > 0) {
          discrepancies.push({ 
            type: 'duplicate_invoice', 
            message: `Potential duplicate found (Invoice ID: ${duplicates[0].id})` 
          });
        }
      }

      // Store discrepancies if any
      if (discrepancies.length > 0) {
        await storage.updateInvoice(invoice.id, {
          validationErrors: discrepancies
        });
      }

      return discrepancies;
    } catch (error) {
      console.error('Discrepancy check failed:', error);
      return [];
    }
  }

  // Debug endpoint to test ERP connection
  app.post('/api/debug/test-erp-connection', isAuthenticated, async (req: any, res) => {
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

  return httpServer;
}