// Test script to verify screenshot functionality with Visual Agent extension
const WebSocket = require('ws');

console.log('🧪 Testing Visual Agent Screenshot API...');

let screenshotId = null;
let ws = null;

function connectAndTest() {
    try {
        ws = new WebSocket('ws://localhost:41899');
        
        ws.on('open', () => {
            console.log('✅ Connected to Visual Agent WebSocket server');
            testScreenshotCapture();
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 Received message type:', message.type);
                
                switch (message.type) {
                    case 'screenshot_ready':
                        console.log('📸 Screenshot ready with ID:', message.data.screenshotId);
                        screenshotId = message.data.screenshotId;
                        
                        // Now request the screenshot data
                        setTimeout(() => {
                            requestScreenshotData();
                        }, 1000);
                        break;
                        
                    case 'screenshot_image':
                        console.log('🖼️  Screenshot image received');
                        console.log('📏 Image data length:', message.data.length);
                        console.log('🎯 Image format:', message.data.substring(0, 30) + '...');
                        
                        // Verify it's a valid data URL
                        if (message.data.startsWith('data:image/png;base64,')) {
                            console.log('✅ Valid PNG data URL format');
                        } else {
                            console.log('❌ Invalid image format');
                        }
                        
                        console.log('🎉 Screenshot test completed successfully!');
                        ws.close();
                        break;
                        
                    case 'screenshot_error':
                        console.log('❌ Screenshot error:', message.data.error);
                        ws.close();
                        break;
                        
                    case 'connection_status':
                        console.log('🔗 Extension connection status:', message.data.connected);
                        break;
                        
                    case 'pong':
                        console.log('🏓 Received pong response');
                        break;
                        
                    default:
                        console.log('📋 Other message:', message.type, message.data);
                }
            } catch (error) {
                console.error('❌ Failed to parse message:', error);
            }
        });
        
        ws.on('close', (code, reason) => {
            console.log('🔌 WebSocket connection closed:', code, reason.toString());
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });
        
    } catch (error) {
        console.error('❌ Failed to connect:', error);
    }
}

function testScreenshotCapture() {
    console.log('📸 Sending take_screenshot command...');
    
    const screenshotMessage = {
        type: 'take_screenshot',
        data: {
            taskId: `test-${Date.now()}`,
            timestamp: Date.now()
        }
    };
    
    try {
        ws.send(JSON.stringify(screenshotMessage));
        console.log('📤 Screenshot command sent successfully');
    } catch (error) {
        console.error('❌ Failed to send screenshot command:', error);
    }
}

function requestScreenshotData() {
    if (!screenshotId) {
        console.log('❌ No screenshot ID available');
        return;
    }
    
    console.log('📥 Requesting screenshot data for ID:', screenshotId);
    
    const requestMessage = {
        type: 'get_screenshot',
        data: {
            screenshotId: screenshotId
        }
    };
    
    try {
        ws.send(JSON.stringify(requestMessage));
        console.log('📤 Screenshot data request sent');
    } catch (error) {
        console.error('❌ Failed to request screenshot data:', error);
    }
}

// Test sequence
console.log('🚀 Starting screenshot test sequence...');
console.log('💡 Make sure:');
console.log('   1. Mac app is running');
console.log('   2. Visual Agent extension is loaded in Chrome');
console.log('   3. Chrome has an active tab open');
console.log('');

connectAndTest();

// Timeout after 30 seconds
setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⏰ Test timeout - closing connection');
        ws.close();
    }
    process.exit(0);
}, 30000);