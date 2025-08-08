// Test script to debug extension screenshot functionality
// Paste this into Chrome DevTools console (F12) when on any webpage

console.log('🧪 Testing Extension Screenshot Functionality...\n');

// Test 1: Check if extension is loaded
function testExtensionLoaded() {
    console.log('📦 Test 1: Extension Loaded');
    
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        console.log('✅ Extension runtime available');
        console.log('   Extension ID:', chrome.runtime.id);
        return true;
    } else {
        console.log('❌ Extension not loaded or not accessible');
        return false;
    }
}

// Test 2: Check extension status
function testExtensionStatus() {
    console.log('\n📊 Test 2: Extension Status');
    
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({type: 'get_status'}, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('❌ Extension not responding:', chrome.runtime.lastError.message);
                    resolve(false);
                } else {
                    console.log('✅ Extension status:', response);
                    resolve(true);
                }
            });
        } else {
            console.log('❌ Chrome runtime not available');
            resolve(false);
        }
    });
}

// Test 3: Check tabs permission
function testTabsPermission() {
    console.log('\n🔐 Test 3: Tabs Permission');
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (chrome.runtime.lastError) {
                console.log('❌ No tabs permission:', chrome.runtime.lastError.message);
            } else {
                console.log('✅ Tabs permission granted');
                console.log('   Active tab:', tabs[0]?.url || 'Unknown');
            }
        });
    } else {
        console.log('❌ Chrome tabs API not available');
    }
}

// Test 4: Test screenshot capture directly
function testScreenshotCapture() {
    console.log('\n📸 Test 4: Screenshot Capture');
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (chrome.runtime.lastError || !tabs[0]) {
                console.log('❌ Cannot get active tab');
                return;
            }
            
            const tab = tabs[0];
            console.log('📋 Active tab:', tab.url);
            
            chrome.tabs.captureVisibleTab(tab.windowId, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.log('❌ Screenshot failed:', chrome.runtime.lastError.message);
                    console.log('💡 Common causes:');
                    console.log('   - Extension needs "activeTab" permission');
                    console.log('   - Tab might be a chrome:// or extension page');
                    console.log('   - Browser security restrictions');
                } else {
                    console.log('✅ Screenshot captured successfully!');
                    console.log('   Data URL length:', dataUrl.length, 'chars');
                    console.log('   Preview:', dataUrl.substring(0, 100) + '...');
                    
                    // Show thumbnail
                    const img = document.createElement('img');
                    img.src = dataUrl;
                    img.style.maxWidth = '200px';
                    img.style.maxHeight = '200px';
                    img.style.border = '2px solid green';
                    img.title = 'Screenshot test result';
                    document.body.appendChild(img);
                    console.log('📸 Thumbnail added to page');
                }
            });
        });
    } else {
        console.log('❌ Chrome tabs API not available');
    }
}

// Test 5: Check WebSocket connection
function testWebSocketConnection() {
    console.log('\n🔗 Test 5: WebSocket Connection');
    
    try {
        const ws = new WebSocket('ws://localhost:41899');
        
        ws.onopen = () => {
            console.log('✅ WebSocket connected to Mac app');
            
            // Send test message
            ws.send(JSON.stringify({
                type: 'test_from_console',
                data: { message: 'Extension test successful' }
            }));
            
            setTimeout(() => ws.close(), 2000);
        };
        
        ws.onerror = (error) => {
            console.log('❌ WebSocket connection failed');
            console.log('💡 Make sure Mac app is running');
        };
        
        ws.onmessage = (event) => {
            console.log('📨 Received from Mac app:', event.data);
        };
        
    } catch (error) {
        console.log('❌ WebSocket test failed:', error.message);
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Extension Diagnostic Tests...\n');
    
    const extensionLoaded = testExtensionLoaded();
    if (!extensionLoaded) {
        console.log('\n❌ Extension not loaded - install Visual Agent extension first');
        return;
    }
    
    const statusOk = await testExtensionStatus();
    testTabsPermission();
    
    setTimeout(() => {
        testScreenshotCapture();
        testWebSocketConnection();
        
        console.log('\n📊 Diagnostic Summary:');
        console.log('If screenshot capture works here but not in Mac app:');
        console.log('1. Check extension background script logs');
        console.log('2. Verify WebSocket message handling');
        console.log('3. Check Mac app screenshot message processing');
        
    }, 1000);
}

// Auto-run tests
runAllTests();