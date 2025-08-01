// Simple WebSocket test script
// Run with: node test-websocket.js

const WebSocket = require('ws');

console.log('Testing WebSocket connection to Mac app...');

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', function open() {
  console.log('✅ Connected to Mac app WebSocket server');
  
  // Send a test ping
  const testMessage = {
    type: 'ping',
    data: { source: 'test-script' }
  };
  
  console.log('📤 Sending test message:', testMessage);
  ws.send(JSON.stringify(testMessage));
});

ws.on('message', function message(data) {
  console.log('📨 Received from Mac app:', data.toString());
});

ws.on('close', function close() {
  console.log('🔌 Connection closed');
});

ws.on('error', function error(err) {
  console.log('❌ WebSocket error:', err.message);
});

// Close after 5 seconds
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
}, 5000);