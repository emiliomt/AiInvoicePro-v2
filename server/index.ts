import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { progressTracker } from "./services/progressTracker";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // For uncaught exceptions, we should exit gracefully
    process.exit(1);
  });

  // Add timeout for server operations
  const serverTimeout = setTimeout(() => {
    console.error('Server startup timeout after 30 seconds');
    process.exit(1);
  }, 30000);

  console.log('Starting server initialization...');
  
  try {
    const server = await registerRoutes(app);
    console.log('Routes registered successfully');

  // Initialize progress tracker WebSocket
    progressTracker.initialize(server);
    console.log('Progress tracker initialized');

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error('Express error handler triggered:', err);
      res.status(status).json({ message });
      // Don't throw error here - it causes unhandled rejection
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      console.log('Setting up Vite development server...');
      await setupVite(app, server);
      console.log('Vite setup complete');
    } else {
      console.log('Setting up static file serving...');
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = 5000;

    server.listen(port, "0.0.0.0", () => {
      clearTimeout(serverTimeout);
      log(`serving on port ${port}`);
    }).on('error', (err: any) => {
      clearTimeout(serverTimeout);
      if (err.code === 'EADDRINUSE') {
        log(`Port ${port} is already in use, trying to find and kill existing process...`);
        process.exit(1);
      } else {
        log(`Server error: ${err.message}`);
        process.exit(1);
      }
    });
  
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();