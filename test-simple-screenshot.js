// Test simple screenshot functionality
const WebSocket = require('ws');

console.log('📸 Testing Simple Screenshot Extension');

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', () => {
    console.log('✅ Connected to Mac app');
    
    setTimeout(() => {
        console.log('📤 Sending screenshot command...');
        ws.send(JSON.stringify({
            type: 'take_screenshot',
            data: { timestamp: Date.now() }
        }));
    }, 1000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received:', message.type);
        
        if (message.type === 'screenshot_saved') {
            console.log('🎉 SUCCESS! Screenshot saved!');
            console.log('📁 Filename:', message.data.filename);
            console.log('📍 Location: ~/Downloads/' + message.data.filename);
            console.log('🌐 URL:', message.data.url);
            console.log('📄 Title:', message.data.title);
            console.log('📊 Size:', Math.round(message.data.size / 1024), 'KB');
            console.log('🕒 Time:', message.data.timestamp);
            ws.close();
        } else if (message.type === 'screenshot_error') {
            console.log('❌ Error:', message.data.error);
            console.log('🕒 Time:', message.data.timestamp);
            ws.close();
        }
    } catch (error) {
        console.log('📨 Raw message:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
});

setTimeout(() => {
    console.log('⏰ Timeout - closing');
    ws.close();
}, 10000);