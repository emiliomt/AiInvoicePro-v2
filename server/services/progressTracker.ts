import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface ProgressUpdate {
  type: 'progress' | 'log' | 'error' | 'completed';
  taskId: number;
  step?: number;
  totalSteps?: number;
  status?: 'running' | 'completed' | 'failed' | 'idle';
  message: string;
  data?: {
    total_invoices?: number;
    processed_invoices?: number;
    successful_imports?: number;
    failed_imports?: number;
    progress?: number;
  };
  timestamp: Date;
}

interface UserConnection {
  ws: WebSocket;
  taskIds: Set<string>;
}

export class ProgressTracker {
  private wss: WebSocketServer;
  private connections = new Map<string, UserConnection[]>();
  private taskProgress = new Map<string, ProgressUpdate>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      verifyClient: (info: any) => {
        // Basic verification - in production, add proper auth
        return true;
      }
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('Progress tracker WebSocket server initialized');
  }

  private handleConnection(ws: WebSocket, request: any) {
    console.log('New WebSocket connection established');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleDisconnection(ws);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: new Date().toISOString()
    }));
  }

  private handleMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'subscribe':
        this.subscribeToTask(ws, message.taskId, message.userId);
        break;
      case 'unsubscribe':
        this.unsubscribeFromTask(ws, message.taskId, message.userId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private subscribeToTask(ws: WebSocket, taskId: string, userId?: string) {
    const connectionKey = userId || 'anonymous';
    
    if (!this.connections.has(connectionKey)) {
      this.connections.set(connectionKey, []);
    }

    const userConnections = this.connections.get(connectionKey)!;
    let connection = userConnections.find(conn => conn.ws === ws);
    
    if (!connection) {
      connection = { ws, taskIds: new Set() };
      userConnections.push(connection);
    }

    connection.taskIds.add(taskId);

    // Send current progress if available
    const currentProgress = this.taskProgress.get(taskId);
    if (currentProgress) {
      ws.send(JSON.stringify(currentProgress));
    }

    console.log(`Subscribed to task ${taskId} for user ${connectionKey}`);
  }

  private unsubscribeFromTask(ws: WebSocket, taskId: string, userId?: string) {
    const connectionKey = userId || 'anonymous';
    const userConnections = this.connections.get(connectionKey);
    
    if (userConnections) {
      const connection = userConnections.find(conn => conn.ws === ws);
      if (connection) {
        connection.taskIds.delete(taskId);
      }
    }

    console.log(`Unsubscribed from task ${taskId} for user ${connectionKey}`);
  }

  private handleDisconnection(ws: WebSocket) {
    // Remove this WebSocket from all connections
    for (const [userId, connections] of Array.from(this.connections.entries())) {
      const index = connections.findIndex((conn: UserConnection) => conn.ws === ws);
      if (index !== -1) {
        connections.splice(index, 1);
        if (connections.length === 0) {
          this.connections.delete(userId);
        }
        break;
      }
    }
    console.log('WebSocket connection closed and cleaned up');
  }

  public sendProgress(taskId: number | string, update: Partial<ProgressUpdate>) {
    const taskIdStr = taskId.toString();
    
    const progressUpdate: ProgressUpdate = {
      type: 'progress',
      taskId: parseInt(taskIdStr),
      message: 'Processing...',
      timestamp: new Date(),
      ...update
    };

    // Store the latest progress
    this.taskProgress.set(taskIdStr, progressUpdate);

    // Send to all subscribed connections
    const message = JSON.stringify(progressUpdate);
    
    for (const userConnections of Array.from(this.connections.values())) {
      for (const connection of userConnections) {
        if (connection.taskIds.has(taskIdStr) && connection.ws.readyState === WebSocket.OPEN) {
          try {
            connection.ws.send(message);
          } catch (error) {
            console.error('Error sending progress update:', error);
          }
        }
      }
    }

    console.log(`Progress update sent for task ${taskId}:`, update.message);
  }

  public sendLog(taskId: number | string, message: string, level: 'info' | 'warning' | 'error' = 'info') {
    const taskIdStr = taskId.toString();
    
    const logUpdate = {
      type: 'log',
      taskId: parseInt(taskIdStr),
      message,
      level,
      timestamp: new Date().toISOString()
    };

    const messageStr = JSON.stringify(logUpdate);
    
    for (const userConnections of Array.from(this.connections.values())) {
      for (const connection of userConnections) {
        if (connection.taskIds.has(taskIdStr) && connection.ws.readyState === WebSocket.OPEN) {
          try {
            connection.ws.send(messageStr);
          } catch (error) {
            console.error('Error sending log update:', error);
          }
        }
      }
    }
  }

  public getTaskProgress(taskId: string): ProgressUpdate | undefined {
    return this.taskProgress.get(taskId);
  }

  public clearTaskProgress(taskId: string) {
    this.taskProgress.delete(taskId);
  }

  // Parse Python stdout for progress updates
  public parseProgressFromOutput(output: string): Partial<ProgressUpdate> | null {
    try {
      // Look for STATS: {json} format in output
      const statsMatch = output.match(/STATS:\s*(\{[^}]+\})/);
      if (statsMatch) {
        const stats = JSON.parse(statsMatch[1]);
        return {
          data: stats,
          message: `Processed ${stats.processed_invoices || 0} of ${stats.total_invoices || 0} invoices`
        };
      }

      // Look for step indicators
      const stepMatch = output.match(/STEP:\s*(\d+)(?:\/(\d+))?\s*-\s*(.+)/);
      if (stepMatch) {
        const [, step, totalSteps, message] = stepMatch;
        return {
          step: parseInt(step),
          totalSteps: totalSteps ? parseInt(totalSteps) : 12,
          message: message.trim()
        };
      }

      // Look for progress percentage
      const progressMatch = output.match(/PROGRESS:\s*(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]);
        return {
          data: { progress },
          message: `${progress}% complete`
        };
      }

      return null;
    } catch (error) {
      console.error('Error parsing progress from output:', error);
      return null;
    }
  }

  // Clean up old progress data
  public cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [taskId, progress] of Array.from(this.taskProgress.entries())) {
      if (progress.timestamp < oneHourAgo) {
        this.taskProgress.delete(taskId);
      }
    }
  }
}

// Global instance
let progressTracker: ProgressTracker | null = null;

export function initializeProgressTracker(server: Server): ProgressTracker {
  if (!progressTracker) {
    progressTracker = new ProgressTracker(server);
    
    // Set up cleanup interval
    setInterval(() => {
      progressTracker?.cleanup();
    }, 10 * 60 * 1000); // Clean up every 10 minutes
  }
  
  return progressTracker;
}

export function getProgressTracker(): ProgressTracker | null {
  return progressTracker;
}