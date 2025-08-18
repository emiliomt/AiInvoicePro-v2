import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes_clean";
import { setupVite, serveStatic, log } from "./vite";
import { progressTracker } from "./services/progressTracker";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS middleware to allow cross-origin requests
app.use((req, res, next) => {
  // Allow requests from Replit domains and localhost
  const allowedOrigins = [
    "http://localhost:5000",
    "http://localhost:3000",
    "http://localhost:5173",
    "https://replit.com",
    "https://*.replit.dev",
    "https://*.replit.co",
  ];

  const origin = req.headers.origin;
  if (origin) {
    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed.includes("*")) {
        // Handle wildcard patterns like "https://*.replit.dev"
        const pattern = allowed.replace("*", "");
        // For wildcard patterns, check if origin ends with the pattern
        // e.g., "https://*.replit.dev" should match "https://anything.replit.dev"
        if (pattern.endsWith(".replit.dev")) {
          return (
            origin.endsWith(".replit.dev") && origin.startsWith("https://")
          );
        }
        if (pattern.endsWith(".replit.co")) {
          return origin.endsWith(".replit.co") && origin.startsWith("https://");
        }
        // Fallback for other wildcard patterns
        return origin.startsWith(pattern);
      }
      return origin === allowed;
    });

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin);
    }
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Add global error handlers
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Don't exit the process, just log the error
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    // For uncaught exceptions, we should exit gracefully
    process.exit(1);
  });

  // Add timeout for server operations
  const serverTimeout = setTimeout(() => {
    console.error("Server startup timeout after 30 seconds");
    process.exit(1);
  }, 30000);

  console.log("Starting server initialization...");

  try {
    const server = await registerRoutes(app);
    console.log("Routes registered successfully");

    // Initialize progress tracker WebSocket
    progressTracker.initialize(server);
    console.log("Progress tracker initialized");

    // Initialize the proper WebSocket server for progress tracking
    // const { setupWebSocketServer } = await import('./websocketServer');
    // setupWebSocketServer(server);
    console.log("WebSocket server for progress tracking initialized (skipped)");

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error(`Error ${status}: ${message}`);
      res.status(status).json({ message });
    });

    await setupVite(app, server);
    console.log("Vite setup complete");

    // Configure port and host based on environment
    const port = parseInt(process.env.PORT || "5000", 10);
    const host = process.env.HOST || "0.0.0.0";

    console.log(`🚀 Server configuration:`);
    console.log(`   - Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`   - Port: ${port}`);
    console.log(`   - Host: ${host}`);
    console.log(`   - Replit ID: ${process.env.REPL_ID || "not set"}`);
    console.log(
      `   - Replit Domains: ${process.env.REPLIT_DOMAINS || "not set"}`,
    );

    server.listen(port, host, () => {
      clearTimeout(serverTimeout);
      log(`serving on ${host}:${port}`);

      // Log accessible URLs
      if (host === "0.0.0.0") {
        log(`🌐 Accessible at:`);
        log(`   - Local: http://localhost:${port}`);
        log(`   - Network: http://0.0.0.0:${port}`);
      }
    });
  } catch (error) {
    console.error("Error during server initialization:", error);
    process.exit(1);
  }
})();
