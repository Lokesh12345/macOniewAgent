// Debug WebSocket connection with detailed logging
const WebSocket = require('ws');

console.log('🔍 Debugging WebSocket connection...');
console.log('📍 Target: ws://localhost:41899');
console.log('⏱️  Starting connection attempt...');

const ws = new WebSocket('ws://localhost:41899', {
    handshakeTimeout: 10000,
    perMessageDeflate: false
});

let connectionEstablished = false;

ws.on('open', () => {
    console.log('✅ WebSocket connection opened successfully!');
    connectionEstablished = true;
    
    // Send a simple test message
    const testMessage = {
        type: 'connection_test',
        data: {
            message: 'Hello from Node.js test script',
            timestamp: Date.now()
        }
    };
    
    console.log('📤 Sending test message:', JSON.stringify(testMessage));
    ws.send(JSON.stringify(testMessage));
});

ws.on('message', (data) => {
    console.log('📨 Received raw data:', data.toString());
    try {
        const parsed = JSON.parse(data.toString());
        console.log('✅ Parsed message:', JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.log('⚠️  Could not parse as JSON');
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error occurred:');
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
});

ws.on('close', (code, reason) => {
    console.log('🔌 WebSocket connection closed');
    console.log('   Code:', code);
    console.log('   Reason:', reason.toString());
    console.log('   Was established:', connectionEstablished);
});

// Try to connect with timeout
setTimeout(() => {
    if (!connectionEstablished) {
        console.log('⏰ Connection attempt timed out after 10 seconds');
        console.log('🔧 Possible issues:');
        console.log('   1. Mac app WebSocket server not running');
        console.log('   2. Server bound to different interface');
        console.log('   3. Firewall blocking connection');
        console.log('   4. Port already in use by another service');
        
        ws.terminate();
        process.exit(1);
    }
}, 10000);

// Keep process alive
process.on('SIGINT', () => {
    console.log('\n👋 Received SIGINT, closing connection...');
    ws.close();
    process.exit(0);
});