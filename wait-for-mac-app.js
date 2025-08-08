// Wait for Mac app to start and test extension connectivity
const WebSocket = require('ws');

console.log('⏳ Waiting for Mac app WebSocket server to start...');
console.log('🚀 Please start the Mac app (Oniew Agent.app)');
console.log('');

let attemptCount = 0;
const maxAttempts = 60; // Try for 5 minutes

function attemptConnection() {
    attemptCount++;
    
    if (attemptCount > maxAttempts) {
        console.log('❌ Max attempts reached. Mac app may not be starting.');
        process.exit(1);
    }
    
    console.log(`🔄 Attempt ${attemptCount}: Checking for Mac app...`);
    
    try {
        const ws = new WebSocket('ws://localhost:41899', {
            handshakeTimeout: 2000
        });
        
        ws.on('open', () => {
            console.log('✅ Mac app WebSocket server detected!');
            console.log('🧪 Testing extension connectivity...');
            
            // Test extension response
            setTimeout(() => {
                console.log('📤 Sending ping to test extension...');
                ws.send(JSON.stringify({
                    type: 'ping',
                    data: { source: 'connectivity-test', timestamp: Date.now() }
                }));
            }, 500);
            
            // Test screenshot command
            setTimeout(() => {
                console.log('📸 Testing screenshot command...');
                ws.send(JSON.stringify({
                    type: 'take_screenshot',
                    data: { 
                        taskId: `connectivity-test-${Date.now()}`,
                        timestamp: Date.now()
                    }
                }));
            }, 2000);
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 Extension response:', message.type);
                
                if (message.type === 'pong') {
                    console.log('✅ Extension is responding to ping!');
                } else if (message.type === 'screenshot_ready') {
                    console.log('🎉 SCREENSHOT WORKING! Extension captured screenshot.');
                    console.log('📸 Screenshot ID:', message.data.screenshotId);
                    
                    // Request the screenshot data
                    setTimeout(() => {
                        console.log('📥 Requesting screenshot data...');
                        ws.send(JSON.stringify({
                            type: 'get_screenshot',
                            data: { screenshotId: message.data.screenshotId }
                        }));
                    }, 1000);
                } else if (message.type === 'screenshot_image') {
                    console.log('🖼️  Screenshot data received!');
                    console.log('📏 Size:', message.data.length, 'characters');
                    console.log('✅ COMPLETE SUCCESS: Screenshot workflow is working!');
                    ws.close();
                    process.exit(0);
                } else if (message.type === 'screenshot_error') {
                    console.log('❌ Screenshot error:', message.data.error);
                } else {
                    console.log('📋 Other response:', message.type);
                }
            } catch (e) {
                console.log('📨 Non-JSON response:', data.toString());
            }
        });
        
        ws.on('error', (error) => {
            // Connection failed, try again
            setTimeout(attemptConnection, 5000);
        });
        
        ws.on('close', (code) => {
            if (code !== 1000) { // Not normal close
                setTimeout(attemptConnection, 5000);
            }
        });
        
    } catch (error) {
        // Try again after delay
        setTimeout(attemptConnection, 5000);
    }
}

// Start connection attempts
attemptConnection();

// Timeout after 5 minutes
setTimeout(() => {
    console.log('⏰ Timeout waiting for Mac app to start');
    process.exit(1);
}, 300000);