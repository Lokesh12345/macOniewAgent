// Visual Agent Background Script with Memory Support
let websocket = null;
let isConnected = false;
let currentTaskId = null;
let heartbeatInterval = null;

// Connect to Mac app WebSocket server
function connectToMacApp() {
  try {
    // Try IPv4 first (localhost), then IPv6 if it fails
    console.log('🔗 Attempting to connect to Mac app...');
    websocket = new WebSocket('ws://localhost:41899');
    
    websocket.onopen = () => {
      console.log('🔗 Visual Agent connected to Mac app');
      isConnected = true;
      
      // Send connection status after a brief delay
      setTimeout(() => {
        if (isConnected) {
          sendMessage({ 
            type: 'connection_status', 
            data: { connected: true, timestamp: Date.now() } 
          });
        }
      }, 100);
      
      // Start heartbeat to keep connection alive
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      heartbeatInterval = setInterval(() => {
        if (isConnected && websocket && websocket.readyState === WebSocket.OPEN) {
          console.log('💓 Sending heartbeat ping');
          sendMessage({ type: 'ping', data: { timestamp: Date.now() } });
        }
      }, 30000); // Every 30 seconds
    };
    
    websocket.onmessage = async (event) => {
      console.log('🔵 WebSocket onmessage triggered');
      console.log('📦 Raw message received:', event.data);
      
      try {
        const message = JSON.parse(event.data);
        console.log('✅ Parsed message:', message);
        console.log('📋 Message type:', message.type);
        
        await handleMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
        console.error('❌ Raw data that failed:', event.data);
      }
    };
    
    websocket.onclose = (event) => {
      console.log('🔌 Visual Agent disconnected from Mac app, code:', event.code, 'reason:', event.reason);
      isConnected = false;
      
      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      // Always retry connection (the app keeps reconnecting)
      console.log('🔄 Reconnecting in 2 seconds...');
      setTimeout(connectToMacApp, 2000);
    };
    
    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    setTimeout(connectToMacApp, 3000);
  }
}

// Handle messages from Mac app
async function handleMessage(message) {
  console.log('🎯 handleMessage() called!');
  console.log('📨 Extension received message:', message.type, message.data?.taskId || '');
  console.log('📨 Full message data:', JSON.stringify(message));
  
  // Log all available message types for debugging
  console.log('🔍 Checking message type:', message.type);
  console.log('🔍 Type matches "take_screenshot"?', message.type === 'take_screenshot');
  
  switch (message.type) {
    case 'take_screenshot':
      console.log('✅ MATCHED take_screenshot case!');
      console.log('📸 Extension: Processing take_screenshot request');
      currentTaskId = message.data?.taskId || null;
      console.log('📸 Calling takeScreenshot() function...');
      await takeScreenshot();
      console.log('📸 takeScreenshot() completed');
      break;
    case 'execute_action':
      await executeAction(message.data);
      break;
    case 'ping':
      console.log('🏓 Extension: Received ping, sending pong');
      sendMessage({ type: 'pong', data: { timestamp: Date.now() } });
      break;
    case 'pong':
      console.log('🏓 Extension: Received pong response');
      break;
    case 'task_start':
      currentTaskId = message.data?.taskId;
      console.log('🎯 Task started:', currentTaskId);
      break;
    case 'task_complete':
      console.log('✅ Task completed:', currentTaskId);
      currentTaskId = null;
      break;
    case 'get_screenshot':
      console.log('📸 Mac requesting screenshot data - not needed with direct send');
      break;
    case 'dom_visualize':
      console.log('👁️ Extension: Processing DOM visualization request');
      await startDOMVisualization(message.data);
      break;
  }
}

// Removed complex storage functions - using direct screenshot sending instead

// Take screenshot and auto-save to disk
async function takeScreenshot() {
  console.log('🔴 takeScreenshot() function STARTED');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    console.log('📸 Capturing screenshot of tab:', tab.id, tab.url);
    
    // Check if we have permission for this tab
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')) {
      throw new Error('Cannot capture screenshots of chrome:// or extension pages');
    }
    
    // Capture screenshot with high quality
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });
    
    console.log('📸 Screenshot captured successfully, size:', dataUrl.length, 'characters');
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `temp/visual-agent/screenshot-${timestamp}.png`;
    
    // Save screenshot using Chrome downloads API
    let downloadId = null;
    let fullPath = null;
    
    try {
      downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false, // This should prevent dialog (unless Chrome setting overrides)
        conflictAction: 'uniquify'
      });
      
      console.log('💾 Screenshot saved with downloads API, ID:', downloadId);
      
      // Get the full file path from the download
      const downloadItem = await new Promise((resolve) => {
        setTimeout(() => {
          chrome.downloads.search({ id: downloadId }, (items) => {
            resolve(items[0]);
          });
        }, 100); // Small delay to ensure download is processed
      });
      
      if (downloadItem && downloadItem.filename) {
        fullPath = downloadItem.filename;
        console.log('📁 Full file path:', fullPath);
      }
    } catch (error) {
      console.error('❌ Screenshot download failed:', error);
      
      // Check if it's the common "save dialog" issue
      if (error.message && error.message.includes('Download canceled by the user')) {
        console.log('💡 SOLUTION: To enable automatic screenshot saving:');
        console.log('   1. Go to Chrome Settings (chrome://settings/)');
        console.log('   2. Click "Advanced" → "Downloads"');
        console.log('   3. Turn OFF "Ask where to save each file before downloading"');
        console.log('   4. Try taking the screenshot again');
      }
      
      throw error;
    }
    
    // Send confirmation to Mac app with full file path
    sendMessage({
      type: 'screenshot_saved',
      data: {
        filename: filename,
        fullPath: fullPath,
        downloadId: downloadId,
        url: tab.url,
        title: tab.title,
        tabId: tab.id,
        taskId: currentTaskId,
        timestamp: now.toISOString(),
        size: dataUrl.length
      }
    });
    
    console.log('📸 Screenshot saved and Mac app notified');
  } catch (error) {
    console.error('❌ Screenshot failed:', error);
    sendMessage({
      type: 'screenshot_error',
      data: {
        error: error.message,
        taskId: currentTaskId,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Start DOM visualization
async function startDOMVisualization(data) {
  console.log('👁️ Starting DOM visualization...', data);
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    // Check if we have permission for this tab
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')) {
      throw new Error('Cannot visualize DOM on chrome:// or extension pages');
    }
    
    console.log('👁️ Injecting DOM analyzer into tab:', tab.id);
    
    // First inject the DOM analyzer script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/dom-analyzer.js']
    });
    
    console.log('👁️ DOM analyzer injected, starting visualization...');
    
    // Then execute the visualization
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.domAnalyzer) {
          const results = window.domAnalyzer.visualize();
          console.log('👁️ DOM visualization results:', results);
          return results;
        } else {
          throw new Error('DOM analyzer not available');
        }
      }
    });
    
    const visualizationResult = result[0]?.result;
    console.log('👁️ DOM visualization completed:', visualizationResult);
    
    // Send success result back to Mac app
    sendMessage({
      type: 'dom_visualization_complete',
      data: {
        success: true,
        result: visualizationResult,
        timestamp: Date.now(),
        tabInfo: {
          url: tab.url,
          title: tab.title,
          tabId: tab.id
        }
      }
    });
    
  } catch (error) {
    console.error('❌ DOM visualization failed:', error);
    
    // Send failure result back to Mac app
    sendMessage({
      type: 'dom_visualization_error',
      data: {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    });
  }
}

// Execute action on webpage
async function executeAction(action) {
  const startTime = Date.now();
  console.log('⚡ Executing action:', action.type, action);
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    // Execute the action and get result using the performAction function from content script
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: performAction,
      args: [action]
    });
    
    const executionTime = Date.now() - startTime;
    const actionResult = result[0]?.result || { success: true };
    
    // Send success result back to Mac app
    sendMessage({
      type: 'action_result',
      data: {
        success: actionResult.success !== false,
        action: action,
        result: actionResult,
        executionTime: executionTime,
        taskId: currentTaskId,
        timestamp: Date.now(),
        tabInfo: {
          url: tab.url,
          title: tab.title,
          tabId: tab.id
        }
      }
    });
    
    console.log(`✅ Action ${action.type} completed in ${executionTime}ms`);
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ Action failed:', error);
    
    // Send failure result back to Mac app
    sendMessage({
      type: 'action_result',
      data: {
        success: false,
        action: action,
        error: error.message,
        executionTime: executionTime,
        taskId: currentTaskId,
        timestamp: Date.now()
      }
    });
  }
}

// This function will be injected into the page context
function performAction(action) {
  try {
    console.log('⚡ Performing action:', action.type, action);
    
    switch (action.type) {
      case 'click':
        return clickElement(action.selector || action.coordinates);
      case 'type':
        return typeText(action.selector, action.text);
      case 'scroll':
        return scrollPage(action.direction, action.amount);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  } catch (error) {
    console.error('❌ Action execution error:', error);
    return { 
      success: false, 
      error: error.message,
      action: action.type
    };
  }
}

function clickElement(target) {
  let element = null;
  let method = 'unknown';
  
  try {
    if (typeof target === 'string') {
      // CSS selector
      element = document.querySelector(target);
      method = 'selector';
      
      if (!element) {
        throw new Error(`Element not found with selector: ${target}`);
      }
    } else if (target && target.x !== undefined && target.y !== undefined) {
      // Coordinates
      element = document.elementFromPoint(target.x, target.y);
      method = 'coordinates';
      
      if (!element) {
        throw new Error(`No element found at coordinates (${target.x}, ${target.y})`);
      }
    } else {
      throw new Error('No valid selector or coordinates provided');
    }
    
    // Try multiple click methods for better compatibility
    if (element instanceof HTMLElement) {
      // Method 1: Direct click
      element.click();
      
      // Method 2: Dispatch click event for more compatibility
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: target.x || 0,
        clientY: target.y || 0
      });
      element.dispatchEvent(clickEvent);
      
      return {
        success: true,
        message: `Clicked element via ${method}`,
        element: {
          tagName: element.tagName,
          className: element.className,
          id: element.id,
          text: element.textContent?.substring(0, 50) || ''
        }
      };
    } else {
      throw new Error('Found element is not clickable');
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      method: method,
      target: target
    };
  }
}

function typeText(selector, text) {
  try {
    if (!selector || !text) {
      throw new Error('Missing selector or text for typing');
    }
    
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Input element not found: ${selector}`);
    }
    
    if (!(element instanceof HTMLInputElement) && 
        !(element instanceof HTMLTextAreaElement) &&
        !element.isContentEditable) {
      throw new Error('Element is not a valid input field');
    }
    
    // Focus the element
    element.focus();
    
    // Clear existing content and set new value
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.select();
      element.value = text;
      
      // Trigger events for better compatibility
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    return {
      success: true,
      message: `Typed "${text.substring(0, 30)}..." into ${element.tagName}`,
      element: {
        tagName: element.tagName,
        type: element.type || 'contenteditable',
        placeholder: element.placeholder || ''
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      selector: selector,
      text: text?.substring(0, 30) + '...'
    };
  }
}

function scrollPage(direction, amount = 300) {
  try {
    const validDirections = ['up', 'down', 'top', 'bottom'];
    const dir = (direction || 'down').toLowerCase();
    
    if (!validDirections.includes(dir)) {
      throw new Error(`Invalid scroll direction: ${direction}. Use: ${validDirections.join(', ')}`);
    }
    
    let scrollAmount = 0;
    const currentScrollY = window.scrollY;
    
    switch (dir) {
      case 'up':
        scrollAmount = -Math.abs(amount);
        break;
      case 'down':
        scrollAmount = Math.abs(amount);
        break;
      case 'top':
        window.scrollTo(0, 0);
        return {
          success: true,
          message: 'Scrolled to top of page',
          scrollPosition: { from: currentScrollY, to: 0 }
        };
      case 'bottom':
        window.scrollTo(0, document.body.scrollHeight);
        return {
          success: true,
          message: 'Scrolled to bottom of page',
          scrollPosition: { from: currentScrollY, to: document.body.scrollHeight }
        };
    }
    
    window.scrollBy(0, scrollAmount);
    
    return {
      success: true,
      message: `Scrolled ${dir} by ${Math.abs(scrollAmount)}px`,
      scrollPosition: {
        from: currentScrollY,
        to: window.scrollY,
        delta: scrollAmount
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      direction: direction,
      amount: amount
    };
  }
}

// Send message to Mac app
function sendMessage(message) {
  console.log('📤 Extension: Attempting to send message:', message.type);
  
  if (websocket && websocket.readyState === WebSocket.OPEN && isConnected) {
    try {
      const jsonMessage = JSON.stringify(message);
      console.log('📤 Extension: Sending JSON message, size:', jsonMessage.length, 'characters');
      websocket.send(jsonMessage);
      console.log('📤 Extension: Message sent successfully');
    } catch (error) {
      console.error('❌ Extension: Failed to send message:', error);
      isConnected = false;
    }
  } else {
    console.warn('⚠️ Extension: Cannot send message:', message.type);
    console.warn('⚠️ Extension: WebSocket state - exists:', !!websocket, 'readyState:', websocket?.readyState, 'connected:', isConnected);
    
    // Try to reconnect if not connected
    if (!websocket || websocket.readyState === WebSocket.CLOSED) {
      console.log('🔄 Extension: Attempting to reconnect...');
      connectToMacApp();
    }
  }
}

// Check connection status (for popup)
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'get_status') {
    sendResponse({ 
      connected: isConnected,
      currentTaskId: currentTaskId,
      timestamp: Date.now()
    });
  }
});

// Helper function to check Chrome download settings
function checkDownloadSettings() {
  console.log('💡 CHROME SETUP REQUIRED for automatic screenshot saving:');
  console.log('   1. Open Chrome Settings: chrome://settings/');
  console.log('   2. Go to "Advanced" → "Downloads"');
  console.log('   3. Turn OFF "Ask where to save each file before downloading"');
  console.log('   4. Screenshots will then save automatically to Downloads/temp/visual-agent/');
  console.log('');
  console.log('⚠️  Without this setting, Chrome will show a save dialog for each screenshot');
}

// Start connection when extension loads
console.log('🚀 Visual Agent background script starting...');
checkDownloadSettings(); // Show setup instructions
connectToMacApp();