import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ProgressUpdate {
  taskId: number;
  step: number;
  totalSteps: number;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  data?: any;
}

interface UserConnection {
  userId: string;
  ws: WebSocket;
}

class ProgressTracker {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, UserConnection[]> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('WebSocket connection established');

      ws.on('message', (message: Buffer) => {
        try {
          const messageStr = message.toString();

          // Validate that the message is not empty
          if (!messageStr || messageStr.trim() === '') {
            console.warn('Received empty WebSocket message');
            return;
          }

          const data = JSON.parse(messageStr);

          if (data.type === 'subscribe' && data.userId) {
            this.addConnection(data.userId, ws);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          // Send error response back to client
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            }));
          }
        }
      });

      ws.on('close', () => {
        this.removeConnection(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeConnection(ws);
      });

      // Send initial connection confirmation
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'connected',
          message: 'WebSocket connection established'
        }));
      }
    });
  }

  private addConnection(userId: string, ws: WebSocket) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, []);
    }

    this.connections.get(userId)!.push({ userId, ws });
    console.log(`User ${userId} subscribed to progress updates`);

    // Send subscription confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscribed',
        userId: userId,
        message: 'Successfully subscribed to progress updates'
      }));
    }
  }

  private removeConnection(ws: WebSocket) {
    for (const [userId, connections] of this.connections) {
      const index = connections.findIndex((conn: UserConnection) => conn.ws === ws);
      if (index !== -1) {
        connections.splice(index, 1);
        if (connections.length === 0) {
          this.connections.delete(userId);
        }
        console.log(`User ${userId} unsubscribed from progress updates`);
        break;
      }
    }
  }

  sendProgress(userId: string, progress: ProgressUpdate) {
    const connections = this.connections.get(userId);
    if (!connections || connections.length === 0) {
      // Don't spam logs - only log this occasionally
      if (Math.random() < 0.1) {
        console.log(`No WebSocket connections found for user ${userId} - progress will be available via polling`);
      }
      return;
    }

    try {
      // Ensure timestamp is serializable
      const progressData = {
        ...progress,
        timestamp: progress.timestamp.toISOString(),
        type: 'progress'
      };

      const message = JSON.stringify(progressData);

      connections.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
          } catch (error) {
            console.error('Error sending message to WebSocket:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error serializing progress data:', error);
    }
  }

  private sendMessage(userId: string, message: any) {
    const connections = this.connections.get(userId);
    if (!connections || connections.length === 0) {
      // Don't spam logs - only log this occasionally
      if (Math.random() < 0.1) {
        console.log(`No WebSocket connections found for user ${userId} - progress will be available via polling`);
      }
      return;
    }

    const messageString = JSON.stringify(message);

    connections.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageString);
        } catch (error) {
          console.error('Error sending message to WebSocket:', error);
        }
      }
    });
  }

  sendTaskComplete(userId: string, taskId: number, success: boolean, message: string, result?: any) {
    this.sendMessage(userId, {
      type: 'task_complete',
      taskId,
      success,
      message,
      result,
      timestamp: new Date().toISOString()
    });
  }

  sendTaskCancelled(userId: string, taskId: number, reason: string) {
    this.sendMessage(userId, {
      type: 'task_cancelled',
      taskId,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  sendTaskTimeout(userId: string, taskId: number, duration: number) {
    this.sendMessage(userId, {
      type: 'task_timeout',
      taskId,
      duration,
      timestamp: new Date().toISOString()
    });
  }
}

export const progressTracker = new ProgressTracker();