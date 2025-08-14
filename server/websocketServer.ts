import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { ProgressTracker } from './services/progressTracker';

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  wss.on('connection', (ws: WebSocket, request) => {
    console.log('WebSocket client connected');

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'subscribe_progress':
            if (data.sessionId) {
              ProgressTracker.addWebSocket(data.sessionId, ws);
              console.log(`Client subscribed to progress for session: ${data.sessionId}`);
            }
            break;
            
          case 'unsubscribe_progress':
            if (data.sessionId) {
              ProgressTracker.removeWebSocket(data.sessionId, ws);
              console.log(`Client unsubscribed from progress for session: ${data.sessionId}`);
            }
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
            
          default:
            console.log('Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      // Remove this WebSocket from all progress sessions
      const allSessions = ProgressTracker.getUserSessions(''); // This gets all sessions
      allSessions.forEach(session => {
        ProgressTracker.removeWebSocket(session.sessionId, ws);
      });
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