/**
 * Test WebSocket progress messages
 * 
 * This script connects to the WebSocket and listens for progress messages
 * to verify the progress tracking is working correctly.
 */

const WebSocket = require('ws');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const wsUrl = BASE_URL.replace('http', 'ws') + '/ws';

console.log('🧪 Testing WebSocket Progress Messages');
console.log('=' .repeat(60));
console.log(`WebSocket URL: ${wsUrl}`);
console.log('=' .repeat(60));
console.log('');

let ws;

function connect() {
  console.log('🔌 Connecting to WebSocket...');
  
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('✅ WebSocket connected successfully');
    console.log('');
    console.log('📡 Listening for progress messages...');
    console.log('💡 To test progress, start a classification in the UI');
    console.log('');

    // Subscribe to a test session (optional)
    if (process.argv[2]) {
      const sessionId = process.argv[2];
      console.log(`📡 Subscribing to session: ${sessionId}`);
      ws.send(JSON.stringify({
        type: 'subscribe_progress',
        sessionId: sessionId
      }));
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket message received:');
      console.log(`   Type: ${message.type}`);
      console.log(`   Session ID: ${message.sessionId || 'N/A'}`);
      
      switch (message.type) {
        case 'welcome':
          console.log(`   Message: ${message.message}`);
          break;
          
        case 'progress_subscribed':
          console.log(`   Message: ${message.message}`);
          break;
          
        case 'classification_started':
          console.log('   🚀 Classification started!');
          if (message.data) {
            console.log(`   Total invoices: ${message.data.totalInvoices}`);
            console.log(`   Title: ${message.data.title}`);
          }
          break;
          
        case 'step_progress':
          console.log('   📋 Step progress update');
          if (message.data) {
            console.log(`   Current step: ${message.data.currentStep}/${message.data.totalSteps}`);
            console.log(`   Status: ${message.data.status}`);
            if (message.data.steps && message.data.steps[message.data.currentStep]) {
              const step = message.data.steps[message.data.currentStep];
              console.log(`   Current step: ${step.step} - ${step.description}`);
            }
          }
          break;
          
        case 'progress_update':
          console.log('   📊 Progress update');
          if (message.data) {
            console.log(`   Processed: ${message.data.processedInvoices || message.data.processedItems}/${message.data.totalInvoices || message.data.totalItems}`);
            console.log(`   Percentage: ${message.data.percentage || 0}%`);
            console.log(`   Message: ${message.data.message || message.data.title || 'Processing...'}`);
          }
          break;
          
        case 'classification_finished':
          console.log('   ✅ Classification finished!');
          if (message.data) {
            console.log(`   Duration: ${message.data.duration}ms`);
            if (message.data.results) {
              console.log(`   Results: ${JSON.stringify(message.data.results, null, 2)}`);
            }
          }
          break;
          
        case 'classification_error':
          console.log('   ❌ Classification error');
          if (message.data && message.data.error) {
            console.log(`   Error: ${message.data.error}`);
          }
          break;
          
        case 'pong':
          console.log('   🏓 Pong received');
          break;
          
        default:
          console.log('   📄 Raw data:');
          console.log(`   ${JSON.stringify(message, null, 2)}`);
      }
      
      console.log('');
      
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
      console.error('Raw data:', data.toString());
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
    console.log('🔄 Attempting to reconnect in 3 seconds...');
    setTimeout(connect, 3000);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Disconnecting WebSocket...');
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

// Start the connection
connect();

console.log('💡 Usage:');
console.log('   node test_websocket_progress.js [sessionId]');
console.log('   Example: node test_websocket_progress.js classification-user123-1234567890');
console.log('');
console.log('🔍 To get a session ID:');
console.log('   1. Start a classification in the UI');
console.log('   2. Check browser console for sessionId');
console.log('   3. Use that sessionId with this script');
console.log('');