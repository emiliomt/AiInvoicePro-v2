import { Request, Response } from 'express';

// Auth test service for testing authentication functionality
export const authTestService = {
  // Test user authentication status
  testAuth: (req: Request): boolean => {
    return !!req.user;
  },

  // Get current user info for testing
  getCurrentUser: (req: Request) => {
    return req.user || null;
  },

  // Test session validity
  testSession: (req: Request): boolean => {
    return !!req.session && !!req.user;
  },

  // Generate test authentication report
  generateAuthReport: (req: Request) => {
    return {
      isAuthenticated: !!req.user,
      hasSession: !!req.session,
      user: req.user || null,
      sessionId: req.sessionID || null,
      timestamp: new Date().toISOString()
    };
  }
};

// Test route handlers
export const authTestHandlers = {
  // Test authentication status endpoint
  testStatus: (req: Request, res: Response) => {
    const report = authTestService.generateAuthReport(req);
    res.json(report);
  },

  // Test protected route access
  testProtected: (req: Request, res: Response) => {
    if (!authTestService.testAuth(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({
      message: 'Access granted to protected resource',
      user: authTestService.getCurrentUser(req),
      timestamp: new Date().toISOString()
    });
  }
};