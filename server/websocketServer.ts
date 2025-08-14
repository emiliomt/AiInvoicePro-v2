import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
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
        console.log('WebSocket message received:', data);

        if (data.type === 'subscribe' && data.userId) {
          // Store user ID for this connection
          userConnections.set(ws, data.userId);
          console.log(`User ${data.userId} subscribed to WebSocket updates`);
        } else if (data.type === 'subscribe_progress' && data.sessionId) {
          // Subscribe to specific progress session
          console.log(`Subscribed to progress session: ${data.sessionId}`);
          // Add this connection to the progress tracker
          const ProgressTracker = require('./services/progressTracker').ProgressTracker;
          ProgressTracker.addWebSocket(data.sessionId, ws);
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
      console.log('WebSocket client disconnected');
      // Remove this WebSocket from all progress sessions
      const allSessions = ProgressTracker.getUserSessions(''); // This gets all sessions
      allSessions.forEach(session => {
        ProgressTracker.removeWebSocket(session.sessionId, ws);
      });
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