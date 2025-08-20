// Simple WebSocket test to verify progress updates are being sent
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:5000/ws');

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // Subscribe to progress updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    userId: '43662419' // Use the actual user ID
  }));
});

ws.on('message', function message(data) {
  const parsed = JSON.parse(data.toString());
  console.log('Received message:', JSON.stringify(parsed, null, 2));
  
  if (parsed.type === 'rpa_progress') {
    console.log(`📈 RPA Progress: ${parsed.progress}% - ${parsed.currentStep}`);
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed');
});

// Keep the script running
console.log('WebSocket test client running...');
console.log('Start an RPA import to see progress updates');