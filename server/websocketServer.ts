import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import url from 'url';
import { ProgressTracker } from './services/progressTracker';

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws'
  });

  // Use a Map to store which user is connected to which WebSocket
  const userConnections = new Map<WebSocket, string>();

  wss.on('connection', (ws: WebSocket, request) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('📨 WebSocket message received:', data);

        // Handle different message types
        switch (data.type) {
          case 'subscribe_progress':
            if (data.sessionId) {
              // Subscribe to progress updates for a specific session
              ws.sessionId = data.sessionId;
              ProgressTracker.addWebSocket(data.sessionId, ws);
              console.log(`📡 Client subscribed to progress for session: ${data.sessionId}`);
            }
            break;

          case 'unsubscribe_progress':
            if (ws.sessionId) {
              ProgressTracker.removeWebSocket(ws.sessionId, ws);
              delete ws.sessionId;
              console.log('📡 Client unsubscribed from progress updates');
            }
            break;

          default:
            console.log('Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        // Send error response back to client
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        } catch (e) {
          // Ignore if can't send error response
        }
      }
    });

    ws.on('close', () => {
      console.log('📡 WebSocket client disconnected');
      if (ws.sessionId) {
        ProgressTracker.removeWebSocket(ws.sessionId, ws);
        console.log(`📡 Cleaning up session: ${ws.sessionId}`);
      }
      // Remove the connection from our userConnections map
      userConnections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to progress tracking WebSocket'
    }));
  });

  // Cleanup old sessions every hour
  setInterval(() => {
    ProgressTracker.cleanup();
  }, 60 * 60 * 1000);

  console.log('WebSocket server setup complete on /ws');
  return wss;
}