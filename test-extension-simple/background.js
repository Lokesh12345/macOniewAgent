// Ultra-simple test extension to verify WebSocket connectivity
console.log('🚀 TEST EXTENSION STARTING...');

let ws = null;
let connected = false;

function connectToMacApp() {
  console.log('🔗 Attempting WebSocket connection...');
  
  try {
    ws = new WebSocket('ws://localhost:41899');
    
    ws.onopen = () => {
      console.log('✅ TEST EXTENSION CONNECTED!');
      connected = true;
      
      // Send immediate test message
      const testMessage = {
        type: 'test_extension_connected',
        data: { 
          message: 'Hello from simple test extension!',
          timestamp: Date.now(),
          extensionName: 'Test Extension Connection'
        }
      };
      
      ws.send(JSON.stringify(testMessage));
      console.log('📤 Test message sent');
      
      // Set up ping every 5 seconds
      setInterval(() => {
        if (connected) {
          ws.send(JSON.stringify({
            type: 'ping',
            data: { source: 'test-extension', timestamp: Date.now() }
          }));
          console.log('📤 Ping sent from test extension');
        }
      }, 5000);
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Test extension received:', message.type);
        
        if (message.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong', 
            data: { source: 'test-extension', timestamp: Date.now() }
          }));
          console.log('📤 Pong sent from test extension');
        } else if (message.type === 'take_screenshot') {
          console.log('📸 Screenshot requested - TEST EXTENSION RESPONDING!');
          ws.send(JSON.stringify({
            type: 'screenshot_error',
            data: { 
              error: 'Test extension - no screenshot capability',
              source: 'test-extension'
            }
          }));
        }
        
      } catch (error) {
        console.log('📨 Raw message:', event.data);
      }
    };
    
    ws.onclose = (event) => {
      console.log('🔌 Test extension disconnected, code:', event.code);
      connected = false;
      // Reconnect after 3 seconds
      setTimeout(connectToMacApp, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('❌ Test extension WebSocket error:', error);
      connected = false;
    };
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
    setTimeout(connectToMacApp, 3000);
  }
}

// Start connection
connectToMacApp();

console.log('🧪 Test extension background script loaded');