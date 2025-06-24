import express from 'express';
import { createServer } from 'http';

export function registerRoutes(app: express.Application) {
  app.get('/test', (req, res) => {
    res.json({ message: 'Test endpoint working' });
  });
  
  // Return the HTTP server as expected by index.ts
  const httpServer = createServer(app);
  return httpServer;
}