import { Request, Response, NextFunction } from 'express';

// Auth monitoring service to track authentication events and security
export const authMonitoring = {
  logAuthEvent: (event: string, userId?: string, details?: any) => {
    console.log(`🔐 Auth Event: ${event}`, {
      userId,
      details,
      timestamp: new Date().toISOString()
    });
  },

  logSecurityIssue: (issue: string, req: Request, details?: any) => {
    console.warn(`🚨 Security Issue: ${issue}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware to monitor protected routes
export function monitorProtectedRoute() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log route access
    authMonitoring.logAuthEvent('protected_route_access', req.user?.id, {
      route: req.path,
      method: req.method
    });

    // Monitor response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (res.statusCode === 401 || res.statusCode === 403) {
        authMonitoring.logSecurityIssue('unauthorized_access_attempt', req, {
          statusCode: res.statusCode,
          duration
        });
      }
    });

    next();
  };
}

// Middleware to monitor API responses
export function monitorApiResponse() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      // Log slow requests
      if (duration > 5000) {
        console.warn(`⚠️ Slow API request: ${req.method} ${req.path} took ${duration}ms`);
      }

      // Log error responses
      if (res.statusCode >= 400) {
        authMonitoring.logSecurityIssue('api_error_response', req, {
          statusCode: res.statusCode,
          duration
        });
      }
    });

    next();
  };
}