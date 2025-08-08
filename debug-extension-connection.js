// Debug which extension (if any) is actually connected
const WebSocket = require('ws');

console.log('🔍 DEBUGGING EXTENSION CONNECTION ISSUES');
console.log('=' * 50);

let connectionCount = 0;
let responses = [];

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', () => {
    console.log('✅ Connected to Mac app WebSocket server');
    connectionCount++;
    
    // Send multiple different message types to see what responds
    const tests = [
        { type: 'ping', data: { source: 'debug-test', test: 1 } },
        { type: 'take_screenshot', data: { taskId: 'debug-screenshot', debug: true } },
        { type: 'connection_status', data: { debug: true } },
        { type: 'get_status', data: { debug: true } },
        { type: 'execute_action', data: { type: 'debug', debug: true } },
        { type: 'task_start', data: { taskId: 'debug-task', debug: true } }
    ];
    
    tests.forEach((test, index) => {
        setTimeout(() => {
            console.log(`📤 [${index + 1}/6] Sending: ${test.type}`);
            ws.send(JSON.stringify(test));
        }, (index + 1) * 1000);
    });
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        responses.push({ type: message.type, timestamp: Date.now() });
        
        console.log(`\n📨 RESPONSE ${responses.length}: ${message.type}`);
        
        if (message.data && Object.keys(message.data).length > 0) {
            console.log('📄 Data:', JSON.stringify(message.data, null, 2));
        }
        
        // Special handling for specific responses
        switch (message.type) {
            case 'pong':
                console.log('✅ EXTENSION IS RESPONDING! (received pong)');
                break;
            case 'screenshot':
                console.log('🎉 SCREENSHOT WORKING! Extension sent screenshot data');
                console.log('📏 Image size:', message.data?.screenshot?.length || 0);
                break;
            case 'screenshot_error':
                console.log('❌ Screenshot failed:', message.data?.error);
                break;
            case 'connection_status':
                console.log('🔗 Connection status:', message.data?.connected);
                break;
        }
        
    } catch (error) {
        responses.push({ type: 'non-json', timestamp: Date.now() });
        console.log('\n📨 NON-JSON Response:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    console.log('\n📊 DEBUG RESULTS SUMMARY:');
    console.log('=' * 40);
    console.log('🔌 Connections made:', connectionCount);
    console.log('📨 Total responses received:', responses.length);
    
    if (responses.length === 0) {
        console.log('\n❌ CRITICAL: NO RESPONSES AT ALL');
        console.log('💡 This means:');
        console.log('   • Mac app WebSocket server is working (we connected)');
        console.log('   • BUT no extension is connected to relay our messages');
        console.log('   • Extension is either not loaded, not running, or not connecting');
        
        console.log('\n🔧 ACTION NEEDED:');
        console.log('1. Go to chrome://extensions/');
        console.log('2. Make sure Visual Agent extension is loaded AND enabled');
        console.log('3. Click "Errors" to check for JavaScript errors');
        console.log('4. Click "inspect views: service worker" to check console');
        console.log('5. Look for WebSocket connection errors in extension console');
        
    } else if (responses.length > 0) {
        console.log('\n✅ EXTENSION IS CONNECTED!');
        console.log('📋 Response types received:');
        responses.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.type}`);
        });
        
        const hasScreenshot = responses.some(r => r.type === 'screenshot');
        const hasScreenshotError = responses.some(r => r.type === 'screenshot_error');
        const hasPong = responses.some(r => r.type === 'pong');
        
        if (hasScreenshot) {
            console.log('🎉 Screenshot functionality is WORKING!');
        } else if (hasScreenshotError) {
            console.log('⚠️  Screenshot functionality has errors but is responding');
        } else if (hasPong) {
            console.log('✅ Basic communication works, but screenshot not responding');
            console.log('💡 Check if you have a regular webpage open in Chrome');
        }
    }
    
    console.log(`\n🔌 Connection closed (code: ${code}, reason: ${reason.toString()})`);
    process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('\n⏰ Debug timeout - closing connection');
    ws.close();
}, 10000);