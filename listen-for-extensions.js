// Listen for any extension connections and messages
const WebSocket = require('ws');

console.log('👂 LISTENING FOR EXTENSION CONNECTIONS...');
console.log('🎯 This will show any messages from connected extensions');

let messageCount = 0;
let extensionConnected = false;

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', () => {
    console.log('✅ Connected to Mac app - now listening...');
    console.log('⏳ Waiting for extension messages...');
    
    // Send a ping every 5 seconds to keep connection alive
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'heartbeat',
                data: { source: 'listener', timestamp: Date.now() }
            }));
        }
    }, 5000);
});

ws.on('message', (data) => {
    messageCount++;
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    
    try {
        const message = JSON.parse(data.toString());
        
        console.log(`\n📨 [${timestamp}] Message #${messageCount}: ${message.type}`);
        
        // Check if this looks like an extension message
        const extensionTypes = ['connection_status', 'screenshot', 'screenshot_error', 'action_result', 'pong'];
        
        if (extensionTypes.includes(message.type)) {
            extensionConnected = true;
            console.log('🎉 EXTENSION MESSAGE DETECTED!');
            
            if (message.type === 'screenshot') {
                console.log('📸 Screenshot received from extension!');
                console.log('📏 Image size:', message.data?.screenshot?.length || 0);
                console.log('🌐 URL:', message.data?.url || 'N/A');
                console.log('📄 Title:', message.data?.title || 'N/A');
            } else if (message.type === 'connection_status') {
                console.log('🔗 Extension connection status:', message.data?.connected);
            }
        }
        
        if (message.data && Object.keys(message.data).length > 0) {
            console.log('📄 Data:', JSON.stringify(message.data, null, 2));
        }
        
    } catch (error) {
        console.log(`\n📨 [${timestamp}] Non-JSON Message #${messageCount}:`, data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    console.log('\n📊 LISTENING SESSION RESULTS:');
    console.log('=' * 40);
    console.log('📨 Total messages received:', messageCount);
    console.log('🔌 Extension detected:', extensionConnected ? 'YES' : 'NO');
    
    if (messageCount === 0) {
        console.log('\n❌ NO MESSAGES RECEIVED');
        console.log('💡 This means no extensions are connected to the Mac app');
    } else if (extensionConnected) {
        console.log('\n✅ EXTENSION(S) ARE WORKING!');
        console.log('🎯 At least one extension is connected and communicating');
    } else {
        console.log('\n⚠️  MESSAGES RECEIVED BUT NOT FROM EXTENSIONS');
        console.log('💡 Messages might be from Mac app itself');
    }
    
    console.log(`\n🔌 Connection closed (code: ${code})`);
    process.exit(0);
});

console.log('\n💡 Instructions:');
console.log('1. Leave this running');
console.log('2. Open Chrome with extensions loaded');  
console.log('3. Navigate to a regular webpage (not chrome:// pages)');
console.log('4. Wait to see if any extension messages appear');
console.log('5. Press Ctrl+C to stop listening');
console.log('\nListening...');

// Keep alive for 60 seconds
setTimeout(() => {
    console.log('\n⏰ Listening timeout after 60 seconds');
    ws.close();
}, 60000);