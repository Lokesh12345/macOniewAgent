// Diagnostic script to identify why Visual Agent extension isn't responding
const WebSocket = require('ws');

console.log('🔍 DIAGNOSING VISUAL AGENT EXTENSION ISSUES');
console.log('=' * 60);

const ws = new WebSocket('ws://localhost:41899');
let messagesSent = 0;
let messagesReceived = 0;
let connectionEstablished = false;

ws.on('open', () => {
    console.log('✅ WebSocket connection to Mac app established');
    connectionEstablished = true;
    
    console.log('\n📋 DIAGNOSTIC TEST SEQUENCE:');
    
    // Test 1: Send ping to check basic communication
    setTimeout(() => {
        console.log('\n🏓 Test 1: Sending ping message...');
        sendMessage('ping', { source: 'diagnostic', test: 1 });
    }, 500);
    
    // Test 2: Check connection status
    setTimeout(() => {
        console.log('\n🔗 Test 2: Requesting connection status...');
        sendMessage('connection_status_request', { diagnostic: true });
    }, 2000);
    
    // Test 3: Send screenshot command
    setTimeout(() => {
        console.log('\n📸 Test 3: Sending screenshot command...');
        sendMessage('take_screenshot', { 
            taskId: 'diagnostic-screenshot-test',
            timestamp: Date.now(),
            diagnostic: true
        });
    }, 4000);
    
    // Test 4: Try alternative message types
    setTimeout(() => {
        console.log('\n🧪 Test 4: Trying alternative message types...');
        sendMessage('execute_action', { 
            type: 'diagnostic_test',
            diagnostic: true
        });
    }, 6000);
    
    // Test 5: Send task start message
    setTimeout(() => {
        console.log('\n🎯 Test 5: Sending task start message...');
        sendMessage('task_start', { 
            taskId: 'diagnostic-task',
            diagnostic: true
        });
    }, 8000);
});

function sendMessage(type, data) {
    const message = { type, data };
    try {
        ws.send(JSON.stringify(message));
        messagesSent++;
        console.log(`📤 Sent ${type} message (${messagesSent} total sent)`);
    } catch (error) {
        console.error(`❌ Failed to send ${type}:`, error.message);
    }
}

ws.on('message', (data) => {
    messagesReceived++;
    try {
        const message = JSON.parse(data.toString());
        console.log(`📨 [${messagesReceived}] Received: ${message.type}`);
        
        if (message.data && Object.keys(message.data).length > 0) {
            console.log(`    Data:`, JSON.stringify(message.data, null, 4));
        }
        
        // Check for extension-specific responses
        if (message.type === 'screenshot_ready' || 
            message.type === 'action_result' || 
            message.type === 'connection_status') {
            console.log('✅ Extension appears to be responding!');
        }
        
    } catch (error) {
        console.log(`📨 [${messagesReceived}] Raw message:`, data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    console.log('\n📊 DIAGNOSTIC RESULTS SUMMARY:');
    console.log('=' * 40);
    console.log('🔌 Connection established:', connectionEstablished ? 'YES' : 'NO');
    console.log('📤 Messages sent to server:', messagesSent);
    console.log('📨 Messages received from server:', messagesReceived);
    
    if (connectionEstablished && messagesSent > 0) {
        if (messagesReceived === 0) {
            console.log('\n❌ ISSUE IDENTIFIED: No responses received');
            console.log('💡 This suggests:');
            console.log('   - Mac app WebSocket server is working');
            console.log('   - But NO extension is connected to relay messages');
            console.log('   - Extension either not loaded or not connecting');
        } else if (messagesReceived > 0 && messagesReceived < messagesSent) {
            console.log('\n⚠️  PARTIAL CONNECTIVITY: Some responses missing');
            console.log('💡 Extension may be partially connected');
        } else {
            console.log('\n✅ COMMUNICATION OK: Extension appears connected');
        }
    }
    
    console.log('\n🔧 TROUBLESHOOTING STEPS:');
    console.log('1. Open Chrome and go to chrome://extensions/');
    console.log('2. Check if "Visual Agent" extension is loaded and enabled');
    console.log('3. If loaded, click "inspect views: service worker" to check console');
    console.log('4. Look for WebSocket connection errors in extension console');
    console.log('5. Verify extension has "activeTab" and "tabs" permissions');
    console.log('6. Make sure you have an active tab open in Chrome');
    
    process.exit(0);
});

// Timeout after 15 seconds
setTimeout(() => {
    console.log('\n⏰ Diagnostic timeout - closing connection');
    ws.close();
}, 15000);