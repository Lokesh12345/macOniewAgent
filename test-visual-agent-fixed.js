// Test the fixed visual-agent extension
const WebSocket = require('ws');

console.log('🧪 Testing FIXED Visual Agent Extension...');
console.log('🎯 This tests the simplified screenshot functionality');

let screenshotReceived = false;

try {
    // Try both IPv4 and IPv6 addresses
    let ws = new WebSocket('ws://localhost:41899');
    
    ws.on('open', () => {
        console.log('✅ Connected to Mac app WebSocket server');
        
        // Send ping first to test basic connectivity
        setTimeout(() => {
            console.log('\n🏓 Test 1: Sending ping...');
            ws.send(JSON.stringify({
                type: 'ping',
                data: { source: 'fixed-extension-test', timestamp: Date.now() }
            }));
        }, 500);
        
        // Send screenshot command
        setTimeout(() => {
            console.log('\n📸 Test 2: Sending take_screenshot command...');
            ws.send(JSON.stringify({
                type: 'take_screenshot',
                data: {
                    taskId: `fixed-screenshot-${Date.now()}`,
                    timestamp: Date.now()
                }
            }));
            console.log('📤 Screenshot command sent to fixed extension');
        }, 2000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`\n📨 Received: ${message.type}`);
            
            switch (message.type) {
                case 'pong':
                    console.log('✅ Extension responded to ping - connection working!');
                    break;
                    
                case 'connection_status':
                    console.log('🔗 Extension connection status:', message.data.connected);
                    break;
                    
                case 'screenshot':
                    console.log('🎉 SCREENSHOT SUCCESS - FIXED VERSION WORKING!');
                    console.log('📸 Screenshot data received from fixed extension');
                    console.log('📏 Screenshot size:', message.data.screenshot.length, 'characters');
                    console.log('🌐 URL:', message.data.url);
                    console.log('📄 Title:', message.data.title);
                    console.log('🆔 Tab ID:', message.data.tabId);
                    console.log('🕒 Timestamp:', new Date(message.data.timestamp).toISOString());
                    
                    if (message.data.screenshot.startsWith('data:image/png;base64,')) {
                        console.log('✅ Valid PNG base64 format');
                        screenshotReceived = true;
                        
                        // Calculate file size
                        const base64Data = message.data.screenshot.split(',')[1];
                        const sizeKB = Math.round((base64Data.length * 3) / 4 / 1024);
                        console.log('📊 Estimated image size:', sizeKB, 'KB');
                    } else {
                        console.log('⚠️  Unexpected image format');
                    }
                    
                    ws.close();
                    break;
                    
                case 'screenshot_error':
                    console.log('❌ Screenshot error:', message.data.error);
                    console.log('💡 Make sure you have a regular webpage open (not chrome:// pages)');
                    ws.close();
                    break;
                    
                default:
                    console.log('📋 Other message type:', message.type);
            }
        } catch (error) {
            console.log('📨 Raw message:', data.toString().substring(0, 100));
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        
        // Try IPv6 as fallback
        if (!screenshotReceived) {
            console.log('🔄 Trying IPv6 connection...');
            try {
                ws = new WebSocket('ws://[::1]:41899');
                // Repeat the same handlers for IPv6 connection
            } catch (ipv6Error) {
                console.error('❌ IPv6 also failed:', ipv6Error.message);
            }
        }
    });
    
    ws.on('close', (code, reason) => {
        console.log('\n📊 FINAL TEST RESULTS:');
        console.log('=' * 40);
        
        if (screenshotReceived) {
            console.log('🎉 SUCCESS: Fixed visual-agent extension is working!');
            console.log('✅ Key improvements:');
            console.log('   • Simplified direct screenshot sending');
            console.log('   • Removed complex storage workflow');
            console.log('   • Improved error handling');
            console.log('   • Better connection logging');
            console.log('   • Proper tab validation');
        } else {
            console.log('❌ STILL NOT WORKING');
            console.log('🔧 Check:');
            console.log('   1. Extension is loaded and enabled');
            console.log('   2. Chrome has a regular webpage open (not chrome:// pages)');
            console.log('   3. Extension background script is running');
            console.log('   4. Mac app WebSocket server is running');
        }
        
        console.log(`\n🔌 Connection closed (code: ${code})`);
        process.exit(screenshotReceived ? 0 : 1);
    });
    
    // Safety timeout
    setTimeout(() => {
        console.log('\n⏰ Test timeout after 20 seconds');
        if (!screenshotReceived) {
            console.log('❌ Screenshot test failed within timeout');
        }
        ws.close();
    }, 20000);
    
} catch (error) {
    console.error('❌ Failed to start test:', error.message);
    process.exit(1);
}