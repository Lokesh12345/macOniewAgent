// Test the final visual-agent extension with auto-save screenshot
const WebSocket = require('ws');

console.log('🧪 Testing Visual Agent Extension (Final Version)');
console.log('📸 This version auto-saves screenshots to Downloads folder');

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', () => {
    console.log('✅ Connected to Mac app');
    
    setTimeout(() => {
        console.log('📤 Sending screenshot command to visual-agent...');
        ws.send(JSON.stringify({
            type: 'take_screenshot',
            data: { 
                taskId: `visual-agent-final-${Date.now()}`,
                timestamp: Date.now() 
            }
        }));
    }, 1000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received:', message.type);
        
        if (message.type === 'screenshot_saved') {
            console.log('🎉 SUCCESS! Visual Agent took screenshot and auto-saved!');
            console.log('📁 Filename:', message.data.filename);
            console.log('📍 Location: ~/Downloads/' + message.data.filename);
            console.log('🌐 URL:', message.data.url);
            console.log('📄 Title:', message.data.title);
            console.log('📊 Size:', Math.round(message.data.size / 1024), 'KB');
            console.log('🕒 Time:', message.data.timestamp);
            console.log('✅ Download ID:', message.data.downloadId);
            ws.close();
        } else if (message.type === 'screenshot_error') {
            console.log('❌ Screenshot Error:', message.data.error);
            console.log('🕒 Time:', message.data.timestamp);
            ws.close();
        } else if (message.type === 'connection_status') {
            console.log('🔗 Extension connected:', message.data.connected);
        } else if (message.type === 'pong') {
            console.log('🏓 Extension is responding');
        } else {
            console.log('📋 Other message:', message.type);
        }
    } catch (error) {
        console.log('📨 Raw message:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
    console.log('💡 Make sure Mac app is running');
});

ws.on('close', (code) => {
    console.log(`🔌 Connection closed (${code})`);
    process.exit(0);
});

setTimeout(() => {
    console.log('⏰ Test timeout');
    ws.close();
}, 15000);