import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import url from 'url';
import { ProgressTracker } from './services/progressTracker';

// Extend WebSocket interface to include custom properties
interface ExtendedWebSocket extends WebSocket {
  sessionId?: string;
  userId?: string;
  isAlive?: boolean;
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws'
  });

  // Use Maps to store connection metadata
  const userConnections = new Map<ExtendedWebSocket, string>();
  const sessionConnections = new Map<ExtendedWebSocket, string>();

  wss.on('connection', (ws: ExtendedWebSocket, request: IncomingMessage) => {
    console.log('📡 WebSocket client connected');
    ws.isAlive = true;

    // Send welcome message with connection info
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to progress tracking WebSocket',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('📨 WebSocket message received:', data);

        // Handle different message types
        switch (data.type) {
          case 'subscribe':
            if (data.userId) {
              ws.userId = data.userId;
              userConnections.set(ws, data.userId);
              console.log(`👤 User ${data.userId} subscribed to WebSocket updates`);

              ws.send(JSON.stringify({
                type: 'subscribed',
                userId: data.userId,
                message: 'Successfully subscribed to user updates'
              }));
            }
            break;

          case 'subscribe_progress':
            if (data.sessionId) {
              ws.sessionId = data.sessionId;
              sessionConnections.set(ws, data.sessionId);
              ProgressTracker.addWebSocket(data.sessionId, ws);
              console.log(`📈 Client subscribed to progress for session: ${data.sessionId}`);

              ws.send(JSON.stringify({
                type: 'progress_subscribed',
                sessionId: data.sessionId,
                message: 'Successfully subscribed to progress updates'
              }));

              // Send current progress if available
              const currentProgress = ProgressTracker.getProgress(data.sessionId);
              if (currentProgress) {
                ws.send(JSON.stringify({
                  type: 'progress_update',
                  sessionId: data.sessionId,
                  progress: currentProgress
                }));
              }
            }
            break;

          case 'unsubscribe_progress':
            if (data.sessionId) {
              ProgressTracker.removeWebSocket(data.sessionId, ws);
              sessionConnections.delete(ws);
              delete ws.sessionId;
              console.log(`📉 Client unsubscribed from progress session: ${data.sessionId}`);

              ws.send(JSON.stringify({
                type: 'progress_unsubscribed',
                sessionId: data.sessionId,
                message: 'Successfully unsubscribed from progress updates'
              }));
            }
            break;

          case 'ping':
            ws.isAlive = true;
            ws.send(JSON.stringify({ 
              type: 'pong',
              timestamp: new Date().toISOString()
            }));
            break;

          case 'get_progress':
            if (data.sessionId) {
              const progress = ProgressTracker.getProgress(data.sessionId);
              ws.send(JSON.stringify({
                type: 'progress_response',
                sessionId: data.sessionId,
                progress: progress || null
              }));
            }
            break;

          default:
            console.log('❓ Unknown WebSocket message type:', data.type);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${data.type}`
            }));
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format - expected JSON',
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        } catch (sendError) {
          console.error('Failed to send error response:', sendError);
        }
      }
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', (code, reason) => {
      console.log(`📡 WebSocket client disconnected (${code}): ${reason}`);

      // Clean up all connections for this WebSocket
      if (ws.userId) {
        userConnections.delete(ws);
        console.log(`👤 Cleaned up user connection for: ${ws.userId}`);
      }

      if (ws.sessionId) {
        ProgressTracker.removeWebSocket(ws.sessionId, ws);
        sessionConnections.delete(ws);
        console.log(`📈 Cleaned up progress session: ${ws.sessionId}`);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);

      // Clean up connections on error
      if (ws.userId) {
        userConnections.delete(ws);
      }
      if (ws.sessionId) {
        ProgressTracker.removeWebSocket(ws.sessionId, ws);
        sessionConnections.delete(ws);
      }
    });
  });

  // Heartbeat to detect broken connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        console.log('💔 Terminating dead WebSocket connection');
        // Clean up before terminating
        if (ws.userId) {
          userConnections.delete(ws);
        }
        if (ws.sessionId) {
          ProgressTracker.removeWebSocket(ws.sessionId, ws);
          sessionConnections.delete(ws);
        }
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Cleanup old progress sessions every hour
  const progressCleanup = setInterval(() => {
    try {
      ProgressTracker.cleanup();
      console.log('🧹 Progress tracker cleanup completed');
    } catch (error) {
      console.error('Error during progress cleanup:', error);
    }
  }, 60 * 60 * 1000);

  // Clean up intervals when server closes
  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(progressCleanup);
    console.log('📡 WebSocket server closed, intervals cleared');
  });

  console.log('✅ WebSocket server setup complete on /ws');
  return wss;
}

// Utility function to broadcast to all connected clients
export function broadcastToAll(wss: WebSocketServer, message: any) {
  const messageString = JSON.stringify(message);
  wss.clients.forEach((ws: ExtendedWebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageString);
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    }
  });
}

// Utility function to broadcast to specific user
export function broadcastToUser(wss: WebSocketServer, userId: string, message: any) {
  const messageString = JSON.stringify(message);
  wss.clients.forEach((ws: ExtendedWebSocket) => {
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      try {
        ws.send(messageString);
      } catch (error) {
        console.error('Error sending message to user:', error);
      }
    }
  });
}