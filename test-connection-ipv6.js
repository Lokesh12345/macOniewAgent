// Test WebSocket connection using IPv6 address
const WebSocket = require('ws');

console.log('🔍 Testing WebSocket connection to [::1]:41899 (IPv6)...');

try {
    // Try IPv6 localhost
    const ws = new WebSocket('ws://[::1]:41899');
    
    ws.on('open', () => {
        console.log('✅ IPv6 WebSocket connection successful!');
        
        // Send a ping to test communication
        const pingMessage = {
            type: 'ping',
            data: { timestamp: Date.now(), source: 'test-script-ipv6' }
        };
        
        ws.send(JSON.stringify(pingMessage));
        console.log('📤 Sent ping message via IPv6');
        
        // After 2 seconds, try taking a screenshot
        setTimeout(() => {
            console.log('📸 Sending take_screenshot command...');
            const screenshotMessage = {
                type: 'take_screenshot',
                data: {
                    taskId: `screenshot-test-${Date.now()}`,
                    timestamp: Date.now()
                }
            };
            ws.send(JSON.stringify(screenshotMessage));
            console.log('📤 Screenshot command sent');
        }, 2000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 Received message type:', message.type);
            console.log('📋 Message data:', JSON.stringify(message.data, null, 2));
            
            if (message.type === 'screenshot_ready') {
                console.log('🎯 Screenshot captured successfully!');
                console.log('📸 Screenshot ID:', message.data.screenshotId);
                
                // Request the screenshot data
                setTimeout(() => {
                    console.log('📥 Requesting screenshot data...');
                    const requestMessage = {
                        type: 'get_screenshot',
                        data: {
                            screenshotId: message.data.screenshotId
                        }
                    };
                    ws.send(JSON.stringify(requestMessage));
                }, 1000);
            } else if (message.type === 'screenshot_image') {
                console.log('🖼️  Screenshot image received!');
                console.log('📏 Image data length:', message.data.length);
                console.log('✅ Screenshot test completed successfully!');
                ws.close();
            } else if (message.type === 'screenshot_error') {
                console.log('❌ Screenshot error:', message.data.error);
            }
        } catch (error) {
            console.log('📨 Raw response:', data.toString());
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log('🔌 Connection closed:', code, reason.toString());
        process.exit(0);
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
        console.log('⏰ Test timeout');
        ws.close();
        process.exit(1);
    }, 15000);
    
} catch (error) {
    console.error('❌ Failed to create WebSocket:', error.message);
    process.exit(1);
}