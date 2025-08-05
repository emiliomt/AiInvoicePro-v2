import { v4 as uuidv4 } from 'uuid';
import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from '../storage';

interface ProgressUpdate {
  type: 'progress' | 'task_complete' | 'task_cancelled' | 'task_timeout' | 'log' | 'step_update' | 'stats';
  taskId: string;
  userId?: string;
  data: any;
  timestamp: string;
}

interface UserConnection {
  ws: WebSocket;
  userId: string;
  taskIds: Set<string>;
  lastPing: number;
}

class ProgressTracker {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, UserConnection>();
  private taskProgress = new Map<string, any>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  initialize(server: HTTPServer) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      if (!userId) {
        ws.close(1008, 'User ID required');
        return;
      }

      const connectionId = `${userId}_${Date.now()}`;
      console.log(`📡 WebSocket connection established for user ${userId}`);

      this.connections.set(connectionId, {
        ws,
        userId,
        taskIds: new Set(),
        lastPing: Date.now()
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(connectionId, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`📡 WebSocket disconnected for user ${userId}`);
        this.connections.delete(connectionId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connections.delete(connectionId);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connection_established',
        connectionId,
        timestamp: new Date().toISOString()
      }));
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    console.log('📡 ProgressTracker WebSocket server initialized');
  }

  private handleClientMessage(connectionId: string, message: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'ping':
        connection.lastPing = Date.now();
        connection.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;

      case 'subscribe':
        if (message.taskId) {
          connection.taskIds.add(message.taskId);
          // Send current progress if available
          const currentProgress = this.taskProgress.get(message.taskId);
          if (currentProgress) {
            connection.ws.send(JSON.stringify({
              type: 'progress',
              taskId: message.taskId,
              data: currentProgress,
              timestamp: new Date().toISOString()
            }));
          }
        }
        break;

      case 'unsubscribe':
        if (message.taskId) {
          connection.taskIds.delete(message.taskId);
        }
        break;

      case 'cancel_task':
        if (message.taskId) {
          this.cancelTask(message.taskId, connection.userId);
        }
        break;
    }
  }

  private cleanupStaleConnections() {
    const now = Date.now();
    const staleTimeout = 60000; // 1 minute

    for (const [connectionId, connection] of this.connections) {
      if (now - connection.lastPing > staleTimeout) {
        console.log(`Cleaning up stale connection: ${connectionId}`);
        connection.ws.close();
        this.connections.delete(connectionId);
      }
    }
  }

  private sendProgress(taskId: string, update: Omit<ProgressUpdate, 'taskId' | 'timestamp'>) {
    const message: ProgressUpdate = {
      ...update,
      taskId,
      timestamp: new Date().toISOString()
    };

    // Store current progress
    if (update.type === 'progress') {
      this.taskProgress.set(taskId, update.data);
    }

    // Send to all interested connections
    for (const [connectionId, connection] of this.connections) {
      if (connection.taskIds.has(taskId) || (update.userId && connection.userId === update.userId)) {
        try {
          connection.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Failed to send message to ${connectionId}:`, error);
          this.connections.delete(connectionId);
        }
      }
    }
  }

  // Public API methods
  startTask(taskId: string, taskName: string, userId?: string) {
    const taskData = {
      taskId,
      taskName,
      status: 'running',
      progress: 0,
      startTime: Date.now(),
      steps: [],
      logs: [],
      stats: { processed: 0, successful: 0, failed: 0, errors: 0 }
    };

    this.taskProgress.set(taskId, taskData);
    
    this.sendProgress(taskId, {
      type: 'progress',
      userId,
      data: taskData
    });

    return taskData;
  }

  updateProgress(taskId: string, progress: number, currentStep?: string, stats?: any) {
    const taskData = this.taskProgress.get(taskId);
    if (!taskData) return;

    taskData.progress = Math.min(100, Math.max(0, progress));
    if (currentStep) taskData.currentStep = currentStep;
    if (stats) taskData.stats = { ...taskData.stats, ...stats };
    taskData.lastUpdate = Date.now();

    this.sendProgress(taskId, {
      type: 'progress',
      data: taskData
    });
  }

  addStep(taskId: string, stepName: string, status: 'pending' | 'running' | 'completed' | 'failed') {
    const taskData = this.taskProgress.get(taskId);
    if (!taskData) return;

    const step = {
      id: taskData.steps.length + 1,
      name: stepName,
      status,
      startTime: Date.now()
    };

    if (status === 'completed' || status === 'failed') {
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
    }

    taskData.steps.push(step);
    taskData.lastUpdate = Date.now();

    this.sendProgress(taskId, {
      type: 'step_update',
      data: { step, allSteps: taskData.steps }
    });
  }

  completeTask(taskId: string, result?: any, error?: string) {
    const taskData = this.taskProgress.get(taskId);
    if (!taskData) return;

    taskData.status = error ? 'failed' : 'completed';
    taskData.endTime = Date.now();
    taskData.duration = taskData.endTime - taskData.startTime;
    taskData.progress = error ? taskData.progress : 100;
    
    if (result) taskData.result = result;
    if (error) taskData.error = error;

    this.sendProgress(taskId, {
      type: 'task_complete',
      data: taskData
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      this.taskProgress.delete(taskId);
    }, 300000);
  }

  cancelTask(taskId: string, userId?: string) {
    const taskData = this.taskProgress.get(taskId);
    if (!taskData) return;

    taskData.status = 'cancelled';
    taskData.endTime = Date.now();
    taskData.duration = taskData.endTime - taskData.startTime;
    taskData.error = 'Task was cancelled by user';

    this.sendProgress(taskId, {
      type: 'task_cancelled',
      userId,
      data: taskData
    });

    // Clean up immediately for cancelled tasks
    setTimeout(() => {
      this.taskProgress.delete(taskId);
    }, 5000);
  }

  addLog(taskId: string, message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') {
    const taskData = this.taskProgress.get(taskId);
    if (!taskData) return;

    const logEntry = {
      timestamp: Date.now(),
      level,
      message
    };

    taskData.logs.push(logEntry);
    taskData.lastUpdate = Date.now();

    this.sendProgress(taskId, {
      type: 'log',
      data: { message, level, timestamp: new Date().toISOString() }
    });
  }

  sendStats(taskId: string, stats: any) {
    this.sendProgress(taskId, {
      type: 'stats',
      data: stats
    });
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.wss) {
      this.wss.close();
    }

    this.connections.clear();
    this.taskProgress.clear();
  }
}

let progressTrackerInstance: ProgressTracker | null = null;

export function initializeProgressTracker(server: HTTPServer): ProgressTracker {
  if (progressTrackerInstance) {
    progressTrackerInstance.destroy();
  }
  
  progressTrackerInstance = new ProgressTracker();
  progressTrackerInstance.initialize(server);
  return progressTrackerInstance;
}

export function getProgressTracker(): ProgressTracker | null {
  return progressTrackerInstance;
}

export default ProgressTracker;