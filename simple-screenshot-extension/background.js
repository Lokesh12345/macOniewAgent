// Simple screenshot extension - just take screenshot and save to disk
console.log('📸 Simple Screenshot Extension starting...');

let ws = null;

// Connect to Mac app
function connect() {
  try {
    ws = new WebSocket('ws://localhost:41899');
    
    ws.onopen = () => {
      console.log('✅ Connected to Mac app');
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Received:', message.type);
        
        if (message.type === 'take_screenshot') {
          await takeScreenshotAndSave();
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('🔌 Disconnected, retrying...');
      setTimeout(connect, 2000);
    };
    
  } catch (error) {
    console.error('Connection failed:', error);
    setTimeout(connect, 2000);
  }
}

// Take screenshot and save to disk
async function takeScreenshotAndSave() {
  try {
    console.log('📸 Taking screenshot...');
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }
    
    // Check if tab URL is capturable
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages');
    }
    
    console.log('📸 Capturing tab:', tab.url);
    
    // Capture screenshot with high quality
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });
    
    console.log('✅ Screenshot captured, size:', dataUrl.length, 'characters');
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `screenshot-${timestamp}.png`;
    
    // Save to Downloads folder
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
    
    console.log('💾 Screenshot saved:', filename, 'Download ID:', downloadId);
    
    // Tell Mac app it's done
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'screenshot_saved',
        data: {
          filename: filename,
          downloadId: downloadId,
          url: tab.url,
          title: tab.title,
          timestamp: now.toISOString(),
          size: dataUrl.length
        }
      }));
    }
    
  } catch (error) {
    console.error('❌ Screenshot failed:', error);
    
    // Tell Mac app about error
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'screenshot_error',
        data: { 
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }
}

// Also allow manual screenshot via extension icon
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Manual screenshot triggered');
  await takeScreenshotAndSave();
});

// Start connection
connect();