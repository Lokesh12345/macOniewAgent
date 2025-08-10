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
    case 'execute_browser_action':
      console.log('⚡ Extension: Processing browser action request');
      await executeBrowserAction(message.data);
      break;
    case 'spa_content_loaded':
      console.log('🎯 Extension: SPA content loaded event');
      // Just acknowledge - actual handling is done by content script
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
    
    console.log('👁️ Starting DOM visualization via content script...');
    
    // Execute visualization directly (content script has DOM analyzer)
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.domAnalyzer) {
          const results = window.domAnalyzer.visualize();
          console.log('👁️ DOM visualization results:', results);
          return results;
        } else {
          throw new Error('DOM analyzer not available - content script may not be loaded');
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

// Execute browser action using element index
async function executeBrowserAction(data) {
  console.log('⚡ Starting browser action execution...', data);
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    const { action, index, text, url, seconds, keys, yPercent } = data;
    
    console.log(`⚡ Executing action: ${action} with index: ${index}`);
    
    // Execute the action via the content script's performBrowserAction
    // This ensures it has access to window.domAnalyzer
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (action, params) => {
        // Call the content script's performBrowserAction directly
        // This has access to the persistent window.domAnalyzer
        if (typeof window.performBrowserAction === 'function') {
          return await window.performBrowserAction(action, params);
        } else {
          throw new Error('performBrowserAction not found in content script');
        }
      },
      args: [action, { index, text, url, seconds, keys, yPercent }]
    });
    
    const actionResult = result[0]?.result;
    console.log('⚡ Browser action completed:', actionResult);
    
    // Check if DOM changed after input action
    if (actionResult?.domChangedAfterInput) {
      console.log('🚨 DOM changed after input action, signaling reanalysis needed');
      console.log('🔄 Sending reanalysis signal to Mac app');
      
      // Send reanalysis needed message immediately
      sendMessage({
        type: 'browser_action_reanalysis_needed',
        data: {
          success: false,
          action: action,
          error: 'DOM changed after input (autocomplete/suggestions appeared)',
          reanalysisNeeded: true,
          domChangedAfterInput: true,
          timestamp: Date.now(),
          tabInfo: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id
          }
        }
      });
      return; // Exit early to prevent sending success message
    }
    
    // Check if reanalysis is needed (from Chrome extension pattern)
    if (actionResult?.reanalysisNeeded) {
      console.log('🔄 DOM reanalysis needed, sending reanalysis signal');
      sendMessage({
        type: 'browser_action_reanalysis_needed',
        data: {
          success: false,
          action: action,
          error: actionResult.error,
          reanalysisNeeded: true,
          timestamp: Date.now(),
          tabInfo: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id
          }
        }
      });
      return;
    }
    
    // Send success result back to Mac app
    sendMessage({
      type: 'browser_action_complete',
      data: {
        success: actionResult?.success !== false,
        action: action,
        result: actionResult,
        timestamp: Date.now(),
        tabInfo: {
          url: tab.url,
          title: tab.title,
          tabId: tab.id
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Browser action failed:', error);
    
    // Send failure result back to Mac app
    sendMessage({
      type: 'browser_action_error',
      data: {
        success: false,
        action: data.action,
        error: error.message,
        timestamp: Date.now()
      }
    });
  }
}

// This function will be injected into the page context to perform browser actions
async function performBrowserAction(action, params) {
  console.log(`⚡ Performing browser action: ${action}`, params);
  
  // Check if this is an indexed action (requires reanalysis)
  const indexedActions = ['clickElement', 'inputText', 'getDropdownOptions', 'selectDropdownOption'];
  const isIndexedAction = indexedActions.includes(action) && params.index !== undefined;
  
  // DOM reanalysis logic - EXACT COPY from Chrome extension (dynamic approach)
  if (isIndexedAction) {
    console.log('🔄 Indexed action detected, checking DOM state...');
    
    // Only check if DOM analyzer is available and has been run
    if (window.domAnalyzer && window.domAnalyzer.cachedPathHashes) {
      // Single dynamic check for DOM obstruction (Chrome extension approach)
      // This automatically catches autocomplete, new elements, etc.
      if (window.domAnalyzer.hasObstructionOccurred()) {
        console.log('🚧 OBSTRUCTION: DETECTED - Something new appeared on the page');
        return {
          success: false,
          error: 'Something new appeared, DOM changed - re-analyze needed',
          reanalysisNeeded: true,
          action: action,
          message: 'Something new appeared'
        };
      }
      
      console.log('🚧 OBSTRUCTION: NONE - DOM unchanged, continuing');
    } else {
      console.log('🔄 DOM analyzer not available or not initialized, skipping checks');
    }
  }
  
  // All action implementations must be embedded here since this runs in page context
  
  // Click element by index
  function clickElementByIndex(index) {
    console.log(`🎯 Attempting to click element with index: ${index}`);
    
    if (!window.domAnalyzer) {
      throw new Error('DOM analyzer not available. Run visualization first.');
    }
    
    const element = window.domAnalyzer.getElementByIndex(index);
    console.log(`🔍 Found element for index ${index}:`, element);
    
    if (!element) {
      throw new Error(`No element found with index ${index}. Available indices: ${Object.keys(window.domAnalyzer.getCachedElementMap()).join(', ')}`);
    }
    
    if (!document.contains(element)) {
      throw new Error(`Element at index ${index} is no longer in the DOM`);
    }
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    console.log(`📍 Clicking element at position (${centerX}, ${centerY})`);
    
    if (element.focus && typeof element.focus === 'function') {
      element.focus();
    }
    
    element.click();
    
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        button: 0
      });
      element.dispatchEvent(event);
    });
    
    console.log(`✅ Successfully clicked element: ${element.tagName}`);
    
    return {
      success: true,
      message: `Clicked element at index ${index} (${element.tagName})`,
      element: {
        tagName: element.tagName,
        className: element.className || '',
        id: element.id || '',
        text: element.textContent?.substring(0, 50) || ''
      }
    };
  }

  // Input text to element - this is a stub for the injected version
  // The actual implementation with DOM change detection is in content.js
  async function inputTextToElement(index, text) {
    console.log(`⌨️ Attempting to input text "${text}" into element with index: ${index}`);
    
    // This function is injected and doesn't have the full implementation
    // It's just here to match the signature. The real implementation is in content.js
    // which has access to window.domAnalyzer
    
    throw new Error('This function should not be called directly. Use content.js implementation.');
  }

  // Scroll functions
  function scrollToPercent(yPercent) {
    const percent = Math.max(0, Math.min(100, yPercent));
    const scrollHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const maxScroll = scrollHeight - viewportHeight;
    const targetScroll = (maxScroll * percent) / 100;
    
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    
    return {
      success: true,
      message: `Scrolled to ${percent}%`
    };
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return {
      success: true,
      message: 'Scrolled to top'
    };
  }

  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    return {
      success: true,
      message: 'Scrolled to bottom'
    };
  }

  function scrollToText(searchText) {
    if (!searchText) {
      throw new Error('No search text provided');
    }
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent && node.textContent.toLowerCase().includes(searchText.toLowerCase())) {
        const element = node.parentElement;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return {
            success: true,
            message: `Scrolled to text: "${searchText}"`
          };
        }
      }
    }
    
    return {
      success: false,
      message: `Text "${searchText}" not found`
    };
  }

  function sendKeys(keys) {
    if (!keys) {
      throw new Error('No keys provided');
    }
    
    const activeElement = document.activeElement || document.body;
    
    const keyEvent = new KeyboardEvent('keydown', {
      key: keys,
      bubbles: true,
      cancelable: true
    });
    
    activeElement.dispatchEvent(keyEvent);
    
    return {
      success: true,
      message: `Sent keys: ${keys}`
    };
  }

  function goBack() {
    window.history.back();
    return {
      success: true,
      message: 'Navigated back'
    };
  }

  function waitAction(seconds) {
    return {
      success: true,
      message: `Wait ${seconds || 3} seconds`
    };
  }

  function getDropdownOptions(index) {
    console.log(`📋 Getting dropdown options for element with index: ${index}`);
    
    if (!window.domAnalyzer) {
      throw new Error('DOM analyzer not available. Run visualization first.');
    }
    
    const element = window.domAnalyzer.getElementByIndex(index);
    console.log(`🔍 Found element for index ${index}:`, element);
    
    if (!element) {
      throw new Error(`No element found with index ${index}. Available indices: ${Object.keys(window.domAnalyzer.getCachedElementMap()).join(', ')}`);
    }
    
    if (element.tagName.toLowerCase() !== 'select') {
      throw new Error(`Element at index ${index} is a ${element.tagName}, not a dropdown/select`);
    }
    
    const selectElement = element;
    const options = Array.from(selectElement.options).map((option, idx) => ({
      index: idx,
      text: option.text,
      value: option.value
    }));
    
    console.log(`✅ Found ${options.length} dropdown options`);
    
    return {
      success: true,
      message: `Found ${options.length} dropdown options`,
      options: options
    };
  }

  function selectDropdownOption(index, optionText) {
    console.log(`🎯 Selecting option "${optionText}" from dropdown at index: ${index}`);
    
    if (!window.domAnalyzer) {
      throw new Error('DOM analyzer not available. Run visualization first.');
    }
    
    const element = window.domAnalyzer.getElementByIndex(index);
    console.log(`🔍 Found element for index ${index}:`, element);
    
    if (!element) {
      throw new Error(`No element found with index ${index}. Available indices: ${Object.keys(window.domAnalyzer.getCachedElementMap()).join(', ')}`);
    }
    
    if (element.tagName.toLowerCase() !== 'select') {
      throw new Error(`Element at index ${index} is a ${element.tagName}, not a dropdown/select`);
    }
    
    const selectElement = element;
    const option = Array.from(selectElement.options).find(opt => opt.text === optionText);
    
    if (!option) {
      const availableOptions = Array.from(selectElement.options).map(opt => opt.text).join(', ');
      throw new Error(`Option "${optionText}" not found in dropdown. Available options: ${availableOptions}`);
    }
    
    selectElement.focus();
    selectElement.value = option.value;
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    selectElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log(`✅ Selected option: "${optionText}"`);
    
    return {
      success: true,
      message: `Selected option "${optionText}" from dropdown at index ${index}`
    };
  }

  // Main action dispatcher
  try {
    switch (action) {
      case 'clickElement':
        return clickElementByIndex(params.index);
      case 'inputText':
        // Note: inputText is now async in content.js, but this is a duplicate
        // The actual implementation is in content.js
        return await inputTextToElement(params.index, params.text);
      case 'scrollToPercent':
        return scrollToPercent(params.yPercent);
      case 'scrollToTop':
        return scrollToTop();
      case 'scrollToBottom':
        return scrollToBottom();
      case 'scrollToText':
        return scrollToText(params.text);
      case 'sendKeys':
        return sendKeys(params.keys);
      case 'goBack':
        return goBack();
      case 'wait':
        return waitAction(params.seconds);
      case 'getDropdownOptions':
        return getDropdownOptions(params.index);
      case 'selectDropdownOption':
        return selectDropdownOption(params.index, params.text);
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  } catch (error) {
    console.error(`❌ Browser action execution error:`, error);
    return { 
      success: false, 
      error: error.message,
      action: action
    };
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

// Check connection status (for popup) and handle scroll events from content script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'get_status') {
    sendResponse({ 
      connected: isConnected,
      currentTaskId: currentTaskId,
      timestamp: Date.now()
    });
  } else if (request.type === 'scroll_dom_changed') {
    console.log('📜 Content script detected scroll-based DOM changes');
    console.log('📊 Scroll data:', request.data);
    
    // Send scroll DOM change event to Mac app
    sendMessage({
      type: 'scroll_dom_changed',
      data: {
        ...request.data,
        reanalysisNeeded: true,
        message: `${request.data.elementDelta} new elements appeared after scrolling`
      }
    });
    
    sendResponse({ success: true });
  } else if (request.type === 'spa_content_loaded') {
    console.log('🎯 Content script detected SPA content loaded');
    console.log('📊 SPA stability data:', request.data);
    
    // Send SPA content loaded event to Mac app
    sendMessage({
      type: 'spa_content_loaded',
      data: {
        ...request.data,
        reanalysisNeeded: true,
        message: 'SPA content has finished loading - new elements detected'
      }
    });
    
    sendResponse({ success: true });
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

// Listen for tab updates (navigation, redirects, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Skip if websocket is not connected yet
  if (!isConnected) {
    console.log('⏳ Tab event ignored - WebSocket not connected yet');
    return;
  }
  
  // Check if the URL has changed (navigation/redirect)
  if (changeInfo.url) {
    console.log('🔄 Tab navigation detected:', changeInfo.url);
    
    // Send navigation event to Mac app
    sendMessage({
      type: 'page_navigation',
      data: {
        tabId: tabId,
        url: changeInfo.url,
        title: tab.title || '',
        timestamp: Date.now(),
        message: 'Page navigated - DOM reanalysis needed'
      }
    });
    
    // Only clear cache for significant URL changes, not minor SPA navigation
    let isSignificantChange = false;
    try {
      if (changeInfo.url && tab.url) {
        const newUrl = new URL(changeInfo.url);
        const oldUrl = new URL(tab.url);
        isSignificantChange = (
          newUrl.hostname !== oldUrl.hostname ||
          newUrl.pathname !== oldUrl.pathname
        );
      } else if (changeInfo.url && !tab.url) {
        isSignificantChange = true; // First navigation
      }
    } catch (error) {
      console.log('URL parsing error:', error);
      isSignificantChange = false;
    }
    
    if (isSignificantChange) {
      console.log('🔄 Significant navigation - clearing DOM cache');
      // Clear any cached DOM state in content script
      chrome.tabs.sendMessage(tabId, { 
        type: 'clear_dom_cache',
        reason: 'navigation'
      }).catch(() => {
        // Content script might not be injected yet on new page
        console.log('Content script not ready on new page yet');
      });
    } else {
      console.log('🔄 Minor navigation - keeping DOM cache');
    }
  }
  
  // Check if page loading is complete
  if (changeInfo.status === 'complete') {
    console.log('✅ Page load complete:', tab.url);
    
    // Important: Don't re-inject content script on navigation as it's already persistent
    // Re-injection would lose the DOM analyzer state
    
    // Send page ready event
    sendMessage({
      type: 'page_ready',
      data: {
        tabId: tabId,
        url: tab.url,
        title: tab.title || '',
        timestamp: Date.now()
      }
    });
  }
});

// Listen for navigation completion using webNavigation API for better accuracy
chrome.webNavigation.onCompleted.addListener((details) => {
  // Skip if websocket is not connected yet
  if (!isConnected) {
    return;
  }
  
  if (details.frameId === 0) { // Main frame only
    console.log('🏁 Navigation completed:', details.url);
    
    // Send navigation complete event
    sendMessage({
      type: 'navigation_complete',
      data: {
        tabId: details.tabId,
        url: details.url,
        timestamp: Date.now(),
        reanalysisNeeded: true
      }
    });
  }
});

// Listen for history state updates (single-page apps) - but be less aggressive
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  // Skip if websocket is not connected yet
  if (!isConnected) {
    return;
  }
  
  if (details.frameId === 0) { // Main frame only
    console.log('📜 History state updated (SPA navigation):', details.url);
    
    // Only send SPA navigation events for significant changes
    // Google search query parameter changes shouldn't clear the DOM cache
    let isSearchParamChange = false;
    try {
      const urlObj = new URL(details.url);
      isSearchParamChange = urlObj.hostname.includes('google.') && 
                            urlObj.pathname === '/search';
    } catch (error) {
      console.log('URL parsing error in SPA navigation:', error);
      isSearchParamChange = false;
    }
    
    if (!isSearchParamChange) {
      // Send SPA navigation event for non-search parameter changes
      sendMessage({
        type: 'spa_navigation',
        data: {
          tabId: details.tabId,
          url: details.url,
          timestamp: Date.now(),
          reanalysisNeeded: true,
          message: 'Single-page app navigation detected'
        }
      });
    } else {
      console.log('📜 Ignoring Google search parameter change - not clearing cache');
    }
  }
});

// Start connection when extension loads
console.log('🚀 Visual Agent background script starting...');
checkDownloadSettings(); // Show setup instructions
connectToMacApp();