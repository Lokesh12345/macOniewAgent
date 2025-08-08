// Test script to verify Visual Agent extension connectivity
// Run this in Chrome console (F12) on any webpage

console.log('🧪 Testing Visual Agent Extension...');

// Test 1: Check if WebSocket connection exists
function testWebSocketConnection() {
    console.log('\n📡 Test 1: WebSocket Connection');
    
    try {
        const ws = new WebSocket('ws://localhost:41899');
        
        ws.onopen = () => {
            console.log('✅ WebSocket connection successful');
            ws.send(JSON.stringify({
                type: 'test_ping',
                data: { message: 'Test from browser console' }
            }));
        };
        
        ws.onmessage = (event) => {
            console.log('📨 Received message:', event.data);
        };
        
        ws.onerror = (error) => {
            console.log('❌ WebSocket error:', error);
        };
        
        ws.onclose = () => {
            console.log('🔌 WebSocket connection closed');
        };
        
        // Close after 5 seconds
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }, 5000);
        
    } catch (error) {
        console.log('❌ Failed to create WebSocket:', error);
    }
}

// Test 2: Check extension messaging
function testExtensionMessaging() {
    console.log('\n📬 Test 2: Extension Messaging');
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
            if (chrome.runtime.lastError) {
                console.log('❌ Extension not found or not responding');
            } else {
                console.log('✅ Extension response:', response);
            }
        });
    } else {
        console.log('❌ Chrome extension APIs not available');
    }
}

// Test 3: Check if extension is loaded
function testExtensionPresence() {
    console.log('\n🔍 Test 3: Extension Presence');
    
    // Check if extension scripts are loaded
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        console.log('✅ Extension runtime available, ID:', chrome.runtime.id);
    } else {
        console.log('❌ Extension runtime not available');
    }
}

// Test 4: Simulate screenshot test
function testScreenshotCapture() {
    console.log('\n📸 Test 4: Screenshot Capability');
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        console.log('✅ Chrome tabs API available');
        
        // This would normally be called from background script
        console.log('📝 Note: Screenshot capture requires extension context');
    } else {
        console.log('❌ Chrome tabs API not available in this context');
    }
}

// Run all tests
function runAllTests() {
    console.log('🚀 Starting Visual Agent Extension Tests...');
    console.log('=' * 50);
    
    testWebSocketConnection();
    testExtensionMessaging();
    testExtensionPresence();
    testScreenshotCapture();
    
    console.log('\n✨ Tests completed. Check results above.');
    console.log('💡 If tests fail, make sure:');
    console.log('   1. Mac app is running');
    console.log('   2. Visual Agent extension is loaded');
    console.log('   3. Extension has proper permissions');
}

// Auto-run tests
runAllTests();