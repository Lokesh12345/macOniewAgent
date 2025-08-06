// Debug script to test WebSocket connection
console.log('🔧 Bridge Extension Debug Script Starting...');

function testConnection() {
  console.log('🔍 Testing WebSocket connection to ws://localhost:9898');
  
  try {
    const ws = new WebSocket('ws://localhost:9898');
    
    ws.onopen = () => {
      console.log('✅ WebSocket connection established successfully');
      
      // Send ready message
      const readyMsg = {
        type: 'ready',
        message: 'Debug bridge extension connected',
        timestamp: Date.now()
      };
      
      ws.send(JSON.stringify(readyMsg));
      console.log('📤 Sent ready message:', readyMsg);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📥 Received message:', data);
        
        if (data.type === 'welcome') {
          console.log('✅ Welcome message received:', data.message);
        }
      } catch (e) {
        console.error('❌ Failed to parse message:', e, event.data);
      }
    };
    
    ws.onclose = (event) => {
      console.log(`🔌 WebSocket closed: Code ${event.code}, Reason: ${event.reason}`);
      
      if (event.code === 1006) {
        console.error('❌ Connection failed - server may be down or blocked');
      } else if (event.code === 1000) {
        console.log('✅ Clean close - normal disconnection');
      }
      
      // Auto-reconnect after 5 seconds
      console.log('🔄 Attempting reconnection in 5 seconds...');
      setTimeout(testConnection, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      console.error('❌ This may indicate:');
      console.error('   - Bridge server not running on localhost:9898');
      console.error('   - Network/firewall blocking the connection');
      console.error('   - Extension permissions issue');
    };
    
    // Test connection after 2 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('⏳ Still connecting...');
      } else if (ws.readyState === WebSocket.OPEN) {
        console.log('✅ Connection is open and ready');
      } else {
        console.log(`❌ Connection state: ${ws.readyState}`);
      }
    }, 2000);
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
  }
}

// Start testing
testConnection();

// Also test if we can access debugger API
console.log('🔍 Testing Chrome extension permissions...');
console.log('- chrome.debugger available:', typeof chrome.debugger);
console.log('- chrome.tabs available:', typeof chrome.tabs);
console.log('- chrome.scripting available:', typeof chrome.scripting);

// Test if we can attach debugger
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  if (tabs.length > 0) {
    const tabId = tabs[0].id;
    console.log(`🎯 Found active tab: ${tabId} - ${tabs[0].url}`);
    
    chrome.debugger.attach({tabId}, '1.3', () => {
      if (chrome.runtime.lastError) {
        console.error('❌ Failed to attach debugger:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ Successfully attached debugger to active tab');
        
        // Detach immediately
        chrome.debugger.detach({tabId}, () => {
          console.log('🔌 Detached debugger');
        });
      }
    });
  }
});