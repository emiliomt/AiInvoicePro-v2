
import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

interface AuthEvent {
  timestamp: string;
  event: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  success: boolean;
  details?: any;
}

class AuthMonitoringService {
  private logFile = path.join(process.cwd(), 'logs', 'auth.log');

  constructor() {
    this.ensureLogDirectory();
  }

  private async ensureLogDirectory() {
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  async logAuthEvent(event: Partial<AuthEvent>) {
    const authEvent: AuthEvent = {
      timestamp: new Date().toISOString(),
      event: event.event || 'unknown',
      userId: event.userId,
      userAgent: event.userAgent,
      ip: event.ip,
      success: event.success || false,
      details: event.details
    };

    try {
      const logEntry = JSON.stringify(authEvent) + '\n';
      await fs.appendFile(this.logFile, logEntry);
      
      // Also log to console for immediate visibility
      const logLevel = authEvent.success ? 'info' : 'error';
      console.log(`🔐 [${logLevel.toUpperCase()}] Auth Event:`, {
        event: authEvent.event,
        userId: authEvent.userId,
        success: authEvent.success,
        details: authEvent.details
      });
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }

  async getRecentAuthEvents(limit = 100): Promise<AuthEvent[]> {
    try {
      const data = await fs.readFile(this.logFile, 'utf-8');
      const lines = data.trim().split('\n').slice(-limit);
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      console.error('Failed to read auth log:', error);
      return [];
    }
  }

  async getAuthStats(hours = 24): Promise<any> {
    const events = await this.getRecentAuthEvents(1000);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const recentEvents = events.filter(e => new Date(e.timestamp) > cutoff);
    
    const stats = {
      totalEvents: recentEvents.length,
      successfulLogins: recentEvents.filter(e => e.event === 'login' && e.success).length,
      failedLogins: recentEvents.filter(e => e.event === 'login' && !e.success).length,
      logouts: recentEvents.filter(e => e.event === 'logout').length,
      protectedRouteAccess: recentEvents.filter(e => e.event === 'protected_route_access').length,
      unauthorizedAccess: recentEvents.filter(e => e.event === 'unauthorized_access').length,
      sessionRefreshes: recentEvents.filter(e => e.event === 'session_refresh').length,
      uniqueUsers: new Set(recentEvents.map(e => e.userId).filter(Boolean)).size
    };

    return stats;
  }
}

export const authMonitoring = new AuthMonitoringService();

// Middleware to monitor protected routes
export function monitorProtectedRoute(routeName: string) {
  return async (req: Request, res: Response, next: Function) => {
    const userId = req.headers['x-replit-user-id'] as string;
    const isAuthenticated = !!userId;
    
    await authMonitoring.logAuthEvent({
      event: isAuthenticated ? 'protected_route_access' : 'unauthorized_access',
      userId: userId || undefined,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      success: isAuthenticated,
      details: {
        route: routeName,
        method: req.method,
        path: req.path
      }
    });

    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

// Middleware to monitor API responses
export function monitorApiResponse() {
  return async (req: Request, res: Response, next: Function) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Check if we're accidentally sending HTML from API routes
      if (req.path.startsWith('/api/') && typeof data === 'string' && data.includes('<!DOCTYPE html>')) {
        console.error('🚨 WARNING: HTML response detected from API route:', req.path);
        authMonitoring.logAuthEvent({
          event: 'api_html_response_error',
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          success: false,
          details: {
            path: req.path,
            method: req.method,
            responseLength: data.length
          }
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}
