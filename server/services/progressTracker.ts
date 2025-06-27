import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface ProgressUpdate {
  taskId: number;
  step: number;
  totalSteps: number;
  status: 'started' | 'processing' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  screenshot?: string;
  data?: any;
}

class ProgressTracker {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, WebSocket>();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/progress' });
    
    this.wss.on('connection', (ws, req) => {
      const userId = this.extractUserIdFromRequest(req);
      if (userId) {
        this.connections.set(userId, ws);
        console.log(`Progress WebSocket connected for user ${userId}`);
        
        ws.on('close', () => {
          this.connections.delete(userId);
          console.log(`Progress WebSocket disconnected for user ${userId}`);
        });

        ws.on('error', (error) => {
          console.error(`Progress WebSocket error for user ${userId}:`, error);
          this.connections.delete(userId);
        });
      }
    });
  }

  private extractUserIdFromRequest(req: any): string | null {
    // Extract user ID from session or query params
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('userId');
  }

  sendProgress(userId: string, update: ProgressUpdate) {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'progress',
          ...update
        }));
      } catch (error) {
        console.error('Failed to send progress update:', error);
        this.connections.delete(userId);
      }
    }
  }

  sendStepUpdate(userId: string, taskId: number, step: number, totalSteps: number, message: string, screenshot?: string) {
    this.sendProgress(userId, {
      taskId,
      step,
      totalSteps,
      status: 'processing',
      message,
      timestamp: new Date(),
      screenshot
    });
  }

  sendTaskStart(userId: string, taskId: number, totalSteps: number, message: string) {
    this.sendProgress(userId, {
      taskId,
      step: 0,
      totalSteps,
      status: 'started',
      message,
      timestamp: new Date()
    });
  }

  sendTaskComplete(userId: string, taskId: number, message: string, data?: any) {
    this.sendProgress(userId, {
      taskId,
      step: -1,
      totalSteps: -1,
      status: 'completed',
      message,
      timestamp: new Date(),
      data
    });
  }

  sendTaskFailed(userId: string, taskId: number, message: string, error?: any) {
    this.sendProgress(userId, {
      taskId,
      step: -1,
      totalSteps: -1,
      status: 'failed',
      message,
      timestamp: new Date(),
      data: { error }
    });
  }
}

export const progressTracker = new ProgressTracker();