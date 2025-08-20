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

  // Set global WebSocket server for broadcasting
  setGlobalWebSocketServer(wss);

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
              console.log(`🏢 Client subscribed to WebSocket updates for: ${data.userId}`);

              ws.send(JSON.stringify({
                type: 'subscribed',
                userId: data.userId,
                message: 'Successfully subscribed to company updates'
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
              const currentProgress = ProgressTracker.getSession(data.sessionId);
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
              const progress = ProgressTracker.getSession(data.sessionId);
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
  setGlobalWebSocketServer(wss);
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
  let userFound = false;
  console.log(`🔍 Looking for company/user: ${userId} among ${wss.clients.size} connected clients`);
  
  wss.clients.forEach((ws: ExtendedWebSocket) => {
    console.log(`📊 Client subscribed to: ${ws.userId}, readyState: ${ws.readyState}`);
    
    if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
      console.log(`✅ Sending message to company/user ${userId}`);
      try {
        ws.send(messageString);
        userFound = true;
      } catch (error) {
        console.error('Error sending message to user:', error);
      }
    }
  });
  
  if (!userFound) {
    console.log(`🚫 Company/user ${userId} not found in connected clients, broadcasting to all instead`);
    broadcastToAll(wss, message);
  }
}

// Store WebSocket server instance globally for classification broadcasts
let globalWss: WebSocketServer | null = null;

export function setGlobalWebSocketServer(wss: WebSocketServer) {
  globalWss = wss;
}

// Classification progress broadcasting functions
export function broadcastClassificationProgress(progress: any, userId?: string) {
  if (!globalWss) return;
  
  const message = {
    type: 'classification_progress',
    ...progress
  };

  console.log('📡 Broadcasting classification progress:', message);

  if (userId) {
    broadcastToUser(globalWss, userId, message);
  } else {
    broadcastToAll(globalWss, message);
  }
}

// RPA progress broadcasting functions
export function broadcastRpaProgress(progress: any, userId?: string) {
  if (!globalWss) {
    console.log('❌ No WebSocket server available for broadcasting');
    return;
  }
  
  const message = {
    type: 'rpa_progress',
    ...progress
  };

  console.log('📡 Broadcasting RPA progress to user:', userId, 'Message:', message);
  console.log('📡 WebSocket server connections:', globalWss.clients.size);

  if (userId) {
    broadcastToUser(globalWss, userId, message);
  } else {
    broadcastToAll(globalWss, message);
  }
}

export function broadcastClassificationComplete(invoiceId: number, userId?: string) {
  if (!globalWss) return;
  
  const message = {
    type: 'classification_complete',
    invoiceId
  };

  console.log('📡 Broadcasting classification complete:', message);

  if (userId) {
    broadcastToUser(globalWss, userId, message);
  } else {
    broadcastToAll(globalWss, message);
  }
}

export function broadcastLineItemClassified(update: any, userId?: string) {
  if (!globalWss) return;
  
  const message = {
    type: 'line_item_classified',
    ...update
  };

  console.log('📡 Broadcasting line item classified:', message);

  if (userId) {
    broadcastToUser(globalWss, userId, message);
  } else {
    broadcastToAll(globalWss, message);
  }
}

export function broadcastClassificationError(error: string, invoiceId?: number, userId?: string) {
  if (!globalWss) return;
  
  const message = {
    type: 'classification_error',
    error,
    invoiceId
  };

  console.log('📡 Broadcasting classification error:', message);

  if (userId) {
    broadcastToUser(globalWss, userId, message);
  } else {
    broadcastToAll(globalWss, message);
  }
}