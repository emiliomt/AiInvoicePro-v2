
import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

export interface ProgressData {
  taskId: string;
  configId?: number;
  jobId?: string;
  userId: string;
  type: 'invoice_import' | 'rpa_automation' | 'comprehensive_workflow';
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  stats?: {
    processed: number;
    successful: number;
    failed: number;
    errors: number;
  };
  currentStep?: {
    id: number;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime?: number;
    endTime?: number;
    duration?: number;
  };
  steps?: Array<{
    id: number;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime?: number;
    endTime?: number;
    duration?: number;
    details?: string;
  }>;
  logs?: Array<{
    timestamp: number;
    level: 'info' | 'warning' | 'error' | 'success' | 'debug';
    message: string;
    details?: any;
  }>;
  startTime?: number;
  endTime?: number;
  totalDuration?: number;
  error?: string;
  result?: any;
}

export interface ProgressMessage {
  type: 'progress' | 'log' | 'step_update' | 'stats' | 'task_complete' | 'task_cancelled' | 'task_timeout' | 'connection_status';
  taskId: string;
  data: any;
  timestamp: number;
}

interface UserConnection {
  userId: string;
  connectionId: string;
  socket: WebSocket;
  subscribedTasks: Set<string>;
  lastActivity: number;
}

class ProgressTracker {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, UserConnection>();
  private userConnections = new Map<string, Set<string>>();
  private taskProgress = new Map<string, ProgressData>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    console.log('Initializing Progress Tracker WebSocket server...');
    
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.wss.on('connection', (socket: WebSocket, request) => {
      this.handleConnection(socket, request);
    });

    // Cleanup stale connections every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    console.log('Progress tracker WebSocket server initialized');
  }

  private handleConnection(socket: WebSocket, request: any): void {
    const connectionId = uuidv4();
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      console.warn('WebSocket connection rejected: missing userId');
      socket.close(1008, 'User ID required');
      return;
    }

    const connection: UserConnection = {
      userId,
      connectionId,
      socket,
      subscribedTasks: new Set(),
      lastActivity: Date.now()
    };

    this.connections.set(connectionId, connection);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    console.log(`WebSocket connected: user=${userId}, connection=${connectionId}`);

    // Send connection confirmation
    this.sendToConnection(connectionId, {
      type: 'connection_status',
      taskId: 'system',
      data: { status: 'connected', connectionId, userId },
      timestamp: Date.now()
    });

    socket.on('message', (data) => {
      this.handleMessage(connectionId, data);
    });

    socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for connection ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });

    socket.on('pong', () => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.lastActivity = Date.now();
      }
    });
  }

  private handleMessage(connectionId: string, data: any): void {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      connection.lastActivity = Date.now();

      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          if (message.taskId) {
            connection.subscribedTasks.add(message.taskId);
            console.log(`User ${connection.userId} subscribed to task ${message.taskId}`);
            
            // Send current progress if available
            const currentProgress = this.taskProgress.get(message.taskId);
            if (currentProgress) {
              this.sendToConnection(connectionId, {
                type: 'progress',
                taskId: message.taskId,
                data: currentProgress,
                timestamp: Date.now()
              });
            }
          }
          break;

        case 'unsubscribe':
          if (message.taskId) {
            connection.subscribedTasks.delete(message.taskId);
            console.log(`User ${connection.userId} unsubscribed from task ${message.taskId}`);
          }
          break;

        case 'ping':
          this.sendToConnection(connectionId, {
            type: 'connection_status',
            taskId: 'system',
            data: { status: 'pong' },
            timestamp: Date.now()
          });
          break;
      }
    } catch (error) {
      console.error(`Error handling WebSocket message from ${connectionId}:`, error);
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    console.log(`WebSocket disconnected: user=${connection.userId}, connection=${connectionId}`);

    // Remove from user connections
    const userConnections = this.userConnections.get(connection.userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Remove connection
    this.connections.delete(connectionId);
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleTimeout = 60000; // 1 minute

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastActivity > staleTimeout) {
        console.log(`Cleaning up stale connection: ${connectionId}`);
        connection.socket.terminate();
        this.handleDisconnection(connectionId);
      } else {
        // Send ping to check if connection is alive
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.ping();
        }
      }
    }
  }

  private sendToConnection(connectionId: string, message: ProgressMessage): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      try {
        connection.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to connection ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
      }
    }
  }

  private sendToUserConnections(userId: string, message: ProgressMessage): void {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) return;

    for (const connectionId of userConnections) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.subscribedTasks.has(message.taskId)) {
        this.sendToConnection(connectionId, message);
      }
    }
  }

  // Public API methods
  startTask(taskData: Partial<ProgressData>): string {
    const taskId = taskData.taskId || uuidv4();
    const now = Date.now();

    const progress: ProgressData = {
      taskId,
      userId: taskData.userId || 'unknown',
      type: taskData.type || 'invoice_import',
      status: 'starting',
      progress: { current: 0, total: 100, percentage: 0 },
      stats: { processed: 0, successful: 0, failed: 0, errors: 0 },
      steps: taskData.steps || [],
      logs: [],
      startTime: now,
      ...taskData
    };

    this.taskProgress.set(taskId, progress);

    this.sendToUserConnections(progress.userId, {
      type: 'progress',
      taskId,
      data: progress,
      timestamp: now
    });

    console.log(`Task started: ${taskId} for user ${progress.userId}`);
    return taskId;
  }

  updateProgress(taskId: string, updates: Partial<ProgressData>): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) {
      console.warn(`Task ${taskId} not found for progress update`);
      return;
    }

    const updatedProgress: ProgressData = {
      ...currentProgress,
      ...updates,
      taskId // Ensure taskId is preserved
    };

    // Calculate percentage if current/total provided
    if (updates.progress) {
      updatedProgress.progress = {
        ...currentProgress.progress,
        ...updates.progress
      };
      updatedProgress.progress.percentage = updatedProgress.progress.total > 0 
        ? Math.round((updatedProgress.progress.current / updatedProgress.progress.total) * 100)
        : 0;
    }

    // Merge logs
    if (updates.logs) {
      updatedProgress.logs = [...(currentProgress.logs || []), ...updates.logs];
    }

    // Merge steps
    if (updates.steps) {
      updatedProgress.steps = updates.steps;
    }

    this.taskProgress.set(taskId, updatedProgress);

    this.sendToUserConnections(updatedProgress.userId, {
      type: 'progress',
      taskId,
      data: updatedProgress,
      timestamp: Date.now()
    });
  }

  addLog(taskId: string, level: 'info' | 'warning' | 'error' | 'success' | 'debug', message: string, details?: any): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) return;

    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      details
    };

    const updatedLogs = [...(currentProgress.logs || []), logEntry];
    
    this.updateProgress(taskId, { logs: updatedLogs });

    // Send separate log message for real-time log streaming
    this.sendToUserConnections(currentProgress.userId, {
      type: 'log',
      taskId,
      data: logEntry,
      timestamp: Date.now()
    });
  }

  updateStep(taskId: string, stepId: number, updates: Partial<ProgressData['currentStep']>): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) return;

    let updatedSteps = [...(currentProgress.steps || [])];
    const stepIndex = updatedSteps.findIndex(s => s.id === stepId);
    
    if (stepIndex >= 0) {
      updatedSteps[stepIndex] = {
        ...updatedSteps[stepIndex],
        ...updates
      };

      if (updates.status === 'completed' && !updatedSteps[stepIndex].endTime) {
        updatedSteps[stepIndex].endTime = Date.now();
        if (updatedSteps[stepIndex].startTime) {
          updatedSteps[stepIndex].duration = updatedSteps[stepIndex].endTime! - updatedSteps[stepIndex].startTime!;
        }
      }
    }

    const currentStep = updatedSteps.find(s => s.id === stepId);

    this.updateProgress(taskId, { 
      steps: updatedSteps,
      currentStep: currentStep ? { ...currentStep } : undefined
    });

    // Send separate step update message
    this.sendToUserConnections(currentProgress.userId, {
      type: 'step_update',
      taskId,
      data: currentStep,
      timestamp: Date.now()
    });
  }

  updateStats(taskId: string, stats: Partial<ProgressData['stats']>): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) return;

    const updatedStats = {
      ...currentProgress.stats,
      ...stats
    };

    this.updateProgress(taskId, { stats: updatedStats });

    // Send separate stats message
    this.sendToUserConnections(currentProgress.userId, {
      type: 'stats',
      taskId,
      data: updatedStats,
      timestamp: Date.now()
    });
  }

  completeTask(taskId: string, result?: any, error?: string): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) return;

    const now = Date.now();
    const finalProgress: ProgressData = {
      ...currentProgress,
      status: error ? 'failed' : 'completed',
      endTime: now,
      totalDuration: currentProgress.startTime ? now - currentProgress.startTime : undefined,
      result,
      error,
      progress: {
        ...currentProgress.progress,
        current: currentProgress.progress.total,
        percentage: 100
      }
    };

    this.taskProgress.set(taskId, finalProgress);

    this.sendToUserConnections(finalProgress.userId, {
      type: 'task_complete',
      taskId,
      data: finalProgress,
      timestamp: now
    });

    // Log completion
    this.addLog(taskId, error ? 'error' : 'success', 
      error ? `Task failed: ${error}` : 'Task completed successfully', 
      result
    );

    console.log(`Task ${error ? 'failed' : 'completed'}: ${taskId}`);
  }

  cancelTask(taskId: string, reason?: string): void {
    const currentProgress = this.taskProgress.get(taskId);
    if (!currentProgress) return;

    const now = Date.now();
    const cancelledProgress: ProgressData = {
      ...currentProgress,
      status: 'cancelled',
      endTime: now,
      totalDuration: currentProgress.startTime ? now - currentProgress.startTime : undefined,
      error: reason || 'Task cancelled'
    };

    this.taskProgress.set(taskId, cancelledProgress);

    this.sendToUserConnections(cancelledProgress.userId, {
      type: 'task_cancelled',
      taskId,
      data: cancelledProgress,
      timestamp: now
    });

    this.addLog(taskId, 'warning', `Task cancelled: ${reason || 'User request'}`);
    console.log(`Task cancelled: ${taskId} - ${reason || 'No reason provided'}`);
  }

  getTaskProgress(taskId: string): ProgressData | null {
    return this.taskProgress.get(taskId) || null;
  }

  getUserTasks(userId: string): ProgressData[] {
    const tasks: ProgressData[] = [];
    for (const [taskId, progress] of this.taskProgress.entries()) {
      if (progress.userId === userId) {
        tasks.push(progress);
      }
    }
    return tasks.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  getActiveConnections(): number {
    return this.connections.size;
  }

  sendProgress(taskId: string, data: any): void {
    const progress = this.taskProgress.get(taskId);
    if (!progress) return;

    this.sendToUserConnections(progress.userId, {
      type: 'progress',
      taskId,
      data,
      timestamp: Date.now()
    });
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    for (const [connectionId] of this.connections.entries()) {
      this.handleDisconnection(connectionId);
    }
    
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('Progress tracker cleanup completed');
  }
}

// Singleton instance
let progressTrackerInstance: ProgressTracker | null = null;

export function initializeProgressTracker(server: Server): ProgressTracker {
  if (!progressTrackerInstance) {
    progressTrackerInstance = new ProgressTracker();
    progressTrackerInstance.initialize(server);
  }
  return progressTrackerInstance;
}

export function getProgressTracker(): ProgressTracker | null {
  return progressTrackerInstance;
}

export default ProgressTracker;
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
        console.log(`📡 WebSocket connection closed for user ${userId}`);
        this.connections.delete(connectionId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connections.delete(connectionId);
      });

      // Send connection confirmation
      this.sendToConnection(connectionId, {
        type: 'connection_established',
        userId,
        timestamp: new Date().toISOString()
      });
    });

    // Setup cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    console.log('✅ Progress tracker WebSocket server initialized');
  }

  private handleClientMessage(connectionId: string, message: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'subscribe':
        if (message.taskId) {
          connection.taskIds.add(message.taskId);
          // Send current progress if available
          const progress = this.taskProgress.get(message.taskId);
          if (progress) {
            this.sendToConnection(connectionId, {
              type: 'progress',
              taskId: message.taskId,
              data: progress,
              timestamp: new Date().toISOString()
            });
          }
        }
        break;

      case 'unsubscribe':
        if (message.taskId) {
          connection.taskIds.delete(message.taskId);
        }
        break;

      case 'ping':
        connection.lastPing = Date.now();
        this.sendToConnection(connectionId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;
    }
  }

  private sendToConnection(connectionId: string, data: any) {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        this.connections.delete(connectionId);
      }
    }
  }

  private cleanupStaleConnections() {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastPing > staleThreshold) {
        console.log(`🧹 Cleaning up stale connection: ${connectionId}`);
        connection.ws.close();
        this.connections.delete(connectionId);
      }
    }
  }

  sendProgress(taskId: string, update: Partial<ProgressUpdate>) {
    const progressUpdate: ProgressUpdate = {
      type: 'progress',
      taskId,
      data: update.data || {},
      timestamp: new Date().toISOString(),
      ...update
    };

    // Store progress
    this.taskProgress.set(taskId, {
      ...this.taskProgress.get(taskId),
      ...progressUpdate.data,
      lastUpdate: progressUpdate.timestamp
    });

    // Send to relevant connections
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.taskIds.has(taskId) || update.userId === connection.userId) {
        this.sendToConnection(connectionId, progressUpdate);
      }
    }

    console.log(`📊 Progress update sent for task ${taskId}:`, update.type);
  }

  getTaskProgress(taskId: string) {
    return this.taskProgress.get(taskId) || null;
  }

  completeTask(taskId: string, result: any) {
    this.sendProgress(taskId, {
      type: 'task_complete',
      data: { completed: true, result }
    });

    // Clean up after delay
    setTimeout(() => {
      this.taskProgress.delete(taskId);
    }, 300000); // 5 minutes
  }

  cancelTask(taskId: string, reason?: string) {
    this.sendProgress(taskId, {
      type: 'task_cancelled',
      data: { cancelled: true, reason }
    });

    this.taskProgress.delete(taskId);
  }

  sendLog(taskId: string, message: string, level: 'info' | 'error' | 'warn' = 'info') {
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

let progressTracker: ProgressTracker | null = null;

export function initializeProgressTracker(server: HTTPServer): ProgressTracker {
  if (progressTracker) {
    progressTracker.destroy();
  }

  progressTracker = new ProgressTracker();
  progressTracker.initialize(server);
  return progressTracker;
}

export function getProgressTracker(): ProgressTracker | null {
  return progressTracker;
}
