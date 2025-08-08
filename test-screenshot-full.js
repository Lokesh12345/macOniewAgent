// Complete screenshot functionality test
const WebSocket = require('ws');

console.log('📸 Testing Visual Agent Screenshot Functionality...');
console.log('🎯 Make sure Chrome has an active tab open for screenshot capture');

const ws = new WebSocket('ws://localhost:41899');
let screenshotId = null;
let testStartTime = Date.now();

ws.on('open', () => {
    console.log('✅ Connected to Visual Agent WebSocket server');
    
    // Wait a moment then trigger screenshot
    setTimeout(() => {
        console.log('\n📸 Step 1: Sending take_screenshot command...');
        const screenshotMessage = {
            type: 'take_screenshot',
            data: {
                taskId: `test-screenshot-${Date.now()}`,
                timestamp: Date.now()
            }
        };
        
        ws.send(JSON.stringify(screenshotMessage));
        console.log('📤 Screenshot command sent to extension');
    }, 1000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        const elapsed = Date.now() - testStartTime;
        
        console.log(`\n📨 [${elapsed}ms] Received: ${message.type}`);
        
        switch (message.type) {
            case 'screenshot_ready':
                console.log('✅ Step 2: Screenshot captured successfully!');
                console.log('🆔 Screenshot ID:', message.data.screenshotId);
                console.log('⏱️  Capture time:', message.data.timestamp);
                
                screenshotId = message.data.screenshotId;
                
                // Request the screenshot data
                setTimeout(() => {
                    console.log('\n📥 Step 3: Requesting screenshot data...');
                    const requestMessage = {
                        type: 'get_screenshot',
                        data: {
                            screenshotId: screenshotId
                        }
                    };
                    ws.send(JSON.stringify(requestMessage));
                    console.log('📤 Screenshot data request sent');
                }, 1000);
                break;
                
            case 'screenshot_image':
                console.log('✅ Step 4: Screenshot image data received!');
                console.log('📏 Image data size:', message.data.length, 'characters');
                console.log('🖼️  Format check:', message.data.substring(0, 50) + '...');
                
                // Validate the image data
                if (message.data.startsWith('data:image/png;base64,')) {
                    console.log('✅ Valid PNG base64 data URL format');
                    
                    // Calculate approximate file size
                    const base64Data = message.data.split(',')[1];
                    const sizeBytes = (base64Data.length * 3) / 4;
                    console.log('📊 Estimated image size:', Math.round(sizeBytes / 1024), 'KB');
                    
                    console.log('\n🎉 SCREENSHOT TEST COMPLETED SUCCESSFULLY!');
                    console.log('✅ All steps completed:');
                    console.log('   1. ✓ Screenshot command sent');
                    console.log('   2. ✓ Screenshot captured by extension');
                    console.log('   3. ✓ Screenshot stored in extension storage');
                    console.log('   4. ✓ Screenshot data retrieved successfully');
                    console.log('   5. ✓ Valid PNG image data received');
                    
                } else {
                    console.log('❌ Invalid image data format');
                    console.log('🔍 Data preview:', message.data.substring(0, 100));
                }
                
                ws.close();
                break;
                
            case 'screenshot_error':
                console.log('❌ Screenshot error occurred:', message.data.error);
                if (message.data.taskId) {
                    console.log('🆔 Task ID:', message.data.taskId);
                }
                ws.close();
                break;
                
            case 'connection_status':
                console.log('🔗 Extension status:', message.data.connected ? 'Connected' : 'Disconnected');
                break;
                
            case 'pong':
                console.log('🏓 Heartbeat pong received');
                break;
                
            default:
                console.log('📋 Other message type:', message.type);
                if (message.data) {
                    console.log('📄 Data:', JSON.stringify(message.data, null, 2));
                }
        }
    } catch (error) {
        console.log('📨 Raw message (non-JSON):', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    const totalTime = Date.now() - testStartTime;
    console.log(`\n🔌 Connection closed after ${totalTime}ms`);
    console.log('📋 Close code:', code, 'reason:', reason.toString());
    process.exit(0);
});

// Safety timeout
setTimeout(() => {
    console.log('\n⏰ Test timeout after 20 seconds');
    if (screenshotId) {
        console.log('⚠️  Screenshot was captured but data retrieval timed out');
    } else {
        console.log('⚠️  No screenshot was captured');
        console.log('💡 Possible issues:');
        console.log('   - Visual Agent extension not loaded in Chrome');
        console.log('   - No active Chrome tab');
        console.log('   - Extension permissions not granted');
        console.log('   - Extension not connected to WebSocket server');
    }
    ws.close();
}, 20000);