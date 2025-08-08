// Test the main extension's visual agent background script
const WebSocket = require('ws');

console.log('🔍 Testing Main Extension Visual Agent Background Script...');
console.log('📋 This tests the index-visual.ts background script');

let screenshotReceived = false;

try {
    // Connect using IPv6 since that worked before
    const ws = new WebSocket('ws://[::1]:41899');
    
    ws.on('open', () => {
        console.log('✅ Connected to Mac app via IPv6');
        
        // Test 1: Send ping
        setTimeout(() => {
            console.log('\n🏓 Test 1: Sending ping to extension...');
            const pingMessage = {
                type: 'ping',
                data: { source: 'main-extension-test', timestamp: Date.now() }
            };
            
            ws.send(JSON.stringify(pingMessage));
            console.log('📤 Ping sent');
        }, 500);
        
        // Test 2: Send screenshot command after ping
        setTimeout(() => {
            console.log('\n📸 Test 2: Sending take_screenshot command...');
            const screenshotMessage = {
                type: 'take_screenshot',
                data: {
                    taskId: `main-extension-screenshot-${Date.now()}`,
                    timestamp: Date.now()
                }
            };
            
            ws.send(JSON.stringify(screenshotMessage));
            console.log('📤 Screenshot command sent to main extension');
        }, 2000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`\n📨 Received: ${message.type}`);
            
            switch (message.type) {
                case 'pong':
                    console.log('✅ Extension responded to ping!');
                    console.log('📋 Extension is connected and responding');
                    break;
                    
                case 'connection_status':
                    console.log('🔗 Connection status:', message.data.connected);
                    break;
                    
                case 'screenshot':
                    console.log('🎉 SCREENSHOT SUCCESS!');
                    console.log('📸 Screenshot data received from main extension');
                    console.log('📏 Screenshot size:', message.data.screenshot.length, 'characters');
                    console.log('🌐 URL:', message.data.url);
                    console.log('📄 Title:', message.data.title);
                    console.log('🆔 Tab ID:', message.data.tabId);
                    
                    // Validate screenshot format
                    if (message.data.screenshot.startsWith('data:image/png;base64,')) {
                        console.log('✅ Valid PNG base64 format');
                        screenshotReceived = true;
                    } else {
                        console.log('⚠️  Unexpected image format');
                    }
                    
                    ws.close();
                    break;
                    
                case 'screenshot_error':
                    console.log('❌ Screenshot error:', message.data.error);
                    ws.close();
                    break;
                    
                case 'action_result':
                    console.log('⚡ Action result:', message.data.success);
                    break;
                    
                default:
                    console.log('📋 Other message type:', message.type);
                    if (message.data) {
                        console.log('📄 Data:', JSON.stringify(message.data, null, 2));
                    }
            }
        } catch (error) {
            console.log('📨 Raw message (non-JSON):', data.toString().substring(0, 100));
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log('\n📊 TEST RESULTS:');
        console.log('=' * 30);
        
        if (screenshotReceived) {
            console.log('🎉 SUCCESS: Screenshot functionality is working!');
            console.log('✅ Main extension visual agent is properly connected');
            console.log('✅ chrome.tabs.captureVisibleTab() working correctly');
            console.log('✅ Screenshot data transmitted successfully');
        } else {
            console.log('❌ FAILED: No screenshot received');
            console.log('💡 Possible issues:');
            console.log('   - Wrong extension is loaded (should be main Nanobrowser extension)');
            console.log('   - Extension permissions not granted');
            console.log('   - No active Chrome tab');
            console.log('   - Extension background script not running');
        }
        
        console.log(`\n🔌 Connection closed (code: ${code})`);
        process.exit(screenshotReceived ? 0 : 1);
    });
    
    // Safety timeout
    setTimeout(() => {
        console.log('\n⏰ Test timeout after 15 seconds');
        if (!screenshotReceived) {
            console.log('❌ No screenshot captured within timeout period');
        }
        ws.close();
    }, 15000);
    
} catch (error) {
    console.error('❌ Failed to start test:', error.message);
    process.exit(1);
}