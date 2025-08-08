// Simple Visual Agent Background Script
let websocket: WebSocket | null = null;
let isConnected = false;

// Connect to Mac app WebSocket server
function connectToMacApp() {
  try {
    websocket = new WebSocket('ws://localhost:41899');
    
    websocket.onopen = () => {
      console.log('Connected to Mac app');
      isConnected = true;
      sendMessage({ type: 'connection_status', data: { connected: true } });
    };
    
    websocket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    websocket.onclose = () => {
      console.log('Disconnected from Mac app');
      isConnected = false;
      // Retry connection after 3 seconds
      setTimeout(connectToMacApp, 3000);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect:', error);
    setTimeout(connectToMacApp, 3000);
  }
}

// Handle messages from Mac app
async function handleMessage(message: any) {
  console.log('Received message:', message);
  
  switch (message.type) {
    case 'take_screenshot':
      await takeScreenshot();
      break;
    case 'execute_action':
      await executeAction(message.data);
      break;
    case 'ping':
      sendMessage({ type: 'pong', data: {} });
      break;
  }
}

// Take screenshot and send to Mac app
async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      console.error('No active tab found');
      return;
    }
    
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId);
    
    sendMessage({
      type: 'screenshot',
      data: {
        screenshot: dataUrl,
        url: tab.url,
        title: tab.title,
        tabId: tab.id
      }
    });
    
    console.log('Screenshot sent to Mac app');
  } catch (error) {
    console.error('Screenshot failed:', error);
    sendMessage({
      type: 'screenshot_error',
      data: { error: error.message }
    });
  }
}

// Execute action on webpage
async function executeAction(action: any) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      console.error('No active tab found');
      return;
    }
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: performAction,
      args: [action]
    });
    
    sendMessage({
      type: 'action_result',
      data: {
        success: true,
        action: action,
        result: result[0]?.result
      }
    });
    
  } catch (error) {
    console.error('Action failed:', error);
    sendMessage({
      type: 'action_result',
      data: {
        success: false,
        action: action,
        error: error.message
      }
    });
  }
}

// This function runs in the content script context
function performAction(action: any) {
  try {
    console.log('Performing action:', action);
    
    switch (action.type) {
      case 'click':
        return performClick(action);
      case 'type':
        return performType(action);
      case 'scroll':
        return performScroll(action);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  } catch (error) {
    console.error('Action execution error:', error);
    return { success: false, error: error.message };
  }
}

function performClick(action: any) {
  let element: Element | null = null;
  
  if (action.coordinates) {
    // Click by coordinates
    const { x, y } = action.coordinates;
    element = document.elementFromPoint(x, y);
    
    if (element) {
      // Create and dispatch click event
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      });
      element.dispatchEvent(clickEvent);
      
      // Also try direct click
      if (element instanceof HTMLElement) {
        element.click();
      }
      
      return { success: true, message: `Clicked element at (${x}, ${y})` };
    } else {
      throw new Error(`No element found at coordinates (${x}, ${y})`);
    }
  } else if (action.selector) {
    // Click by selector
    element = document.querySelector(action.selector);
    if (element instanceof HTMLElement) {
      element.click();
      return { success: true, message: `Clicked element: ${action.selector}` };
    } else {
      throw new Error(`Element not found: ${action.selector}`);
    }
  } else {
    throw new Error('No coordinates or selector provided for click action');
  }
}

function performType(action: any) {
  let element: HTMLInputElement | HTMLTextAreaElement | null = null;
  
  if (action.selector) {
    element = document.querySelector(action.selector) as HTMLInputElement | HTMLTextAreaElement;
  } else if (action.coordinates) {
    const { x, y } = action.coordinates;
    const foundElement = document.elementFromPoint(x, y);
    if (foundElement instanceof HTMLInputElement || foundElement instanceof HTMLTextAreaElement) {
      element = foundElement;
    }
  }
  
  if (element && action.text) {
    element.focus();
    element.value = action.text;
    
    // Trigger input events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return { success: true, message: `Typed "${action.text}" into input field` };
  } else {
    throw new Error('No valid input element found or no text provided');
  }
}

function performScroll(action: any) {
  const direction = action.direction || 'down';
  const amount = action.amount || 300;
  
  const scrollAmount = direction === 'up' ? -amount : amount;
  window.scrollBy(0, scrollAmount);
  
  return { success: true, message: `Scrolled ${direction} by ${Math.abs(scrollAmount)}px` };
}

// Send message to Mac app
function sendMessage(message: any) {
  if (websocket && isConnected) {
    websocket.send(JSON.stringify(message));
  } else {
    console.warn('Not connected to Mac app, message not sent:', message);
  }
}

// Check connection status (for popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'get_status') {
    sendResponse({ connected: isConnected });
  }
});

// Start connection when extension loads
console.log('Visual Agent background script starting...');
connectToMacApp();