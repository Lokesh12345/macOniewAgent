// Simple connection test for Visual Agent WebSocket
const WebSocket = require('ws');

console.log('🔍 Testing WebSocket connection to localhost:41899...');

try {
    const ws = new WebSocket('ws://localhost:41899');
    
    ws.on('open', () => {
        console.log('✅ WebSocket connection successful!');
        
        // Send a ping to test communication
        const pingMessage = {
            type: 'ping',
            data: { timestamp: Date.now(), source: 'test-script' }
        };
        
        ws.send(JSON.stringify(pingMessage));
        console.log('📤 Sent ping message');
    });
    
    ws.on('message', (data) => {
        console.log('📨 Received response:', data.toString());
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Mac app may not be running or WebSocket server not started');
        }
    });
    
    ws.on('close', (code, reason) => {
        console.log('🔌 Connection closed:', code, reason.toString());
        process.exit(0);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
        console.log('⏰ Connection timeout');
        ws.close();
        process.exit(1);
    }, 5000);
    
} catch (error) {
    console.error('❌ Failed to create WebSocket:', error.message);
    process.exit(1);
}