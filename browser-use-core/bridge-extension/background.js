// WebSocket connection
let ws = null;
let isConnected = false;
let reconnectTimer = null;
let debuggerAttached = false;
let currentTabId = null;
let networkIdleResolve = null;

// CDP execution handler
async function executeCDPCommand(command) {
  try {
    switch (command.method) {
      case 'navigate':
        // If we already have an active tab, navigate it instead of creating new one
        if (currentTabId) {
          try {
            // Update existing tab
            await chrome.tabs.update(currentTabId, { url: command.params.url, active: true });
            // Wait for navigation to complete
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Navigation timeout')), 10000);
              
              const listener = (tabId, changeInfo) => {
                if (tabId === currentTabId && changeInfo.status === 'complete') {
                  clearTimeout(timeout);
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              };
              
              chrome.tabs.onUpdated.addListener(listener);
            });
            
            return { success: true, tabId: currentTabId };
          } catch (error) {
            console.log('Failed to navigate existing tab, creating new one:', error);
          }
        }
        
        // Create new tab if no current tab or navigation failed
        const tab = await chrome.tabs.create({ url: command.params.url, active: true });
        currentTabId = tab.id;
        await attachDebugger(tab.id);
        
        // Wait for tab to load completely
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Tab load timeout')), 10000);
          
          const listener = (tabId, changeInfo) => {
            if (tabId === currentTabId && changeInfo.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          
          chrome.tabs.onUpdated.addListener(listener);
        });
        
        return { success: true, tabId: tab.id };
        
      case 'click':
        if (!currentTabId) throw new Error('No active tab');
        if (command.params.index !== undefined) {
          // First, get element coordinates using the same DOM analysis as get_dom
          const elementInfo = await chrome.debugger.sendCommand(
            { tabId: currentTabId },
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  // Use the same DOM analysis logic from get_dom to find element
                  let highlightIndex = 0;
                  const DOM_HASH_MAP = {};
                  const ID = { current: 0 };
                  
                  // Same helper functions as get_dom
                  function isElementVisible(element) {
                    if (!element || !element.offsetParent) return false;
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                      return false;
                    }
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                  }
                  
                  function isInteractiveElement(element) {
                    if (!element) return false;
                    const tagName = element.tagName.toLowerCase();
                    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
                    
                    if (interactiveTags.includes(tagName)) return true;
                    if (element.hasAttribute('onclick')) return true;
                    if (element.getAttribute('role') === 'button') return true;
                    if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') return true;
                    if (element.contentEditable === 'true') return true;
                    
                    const style = window.getComputedStyle(element);
                    if (style.cursor === 'pointer') return true;
                    
                    return false;
                  }
                  
                  function isTopElement(element) {
                    if (!element) return false;
                    const rect = element.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return false;
                    
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    
                    try {
                      const topEl = document.elementFromPoint(centerX, centerY);
                      return topEl === element || element.contains(topEl);
                    } catch (e) {
                      return true;
                    }
                  }
                  
                  function isInExpandedViewport(element, viewportExpansion = 0) {
                    if (!element) return false;
                    const rect = element.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    
                    return !(
                      rect.bottom < -viewportExpansion ||
                      rect.top > viewportHeight + viewportExpansion ||
                      rect.right < -viewportExpansion ||
                      rect.left > viewportWidth + viewportExpansion
                    );
                  }
                  
                  // Build interactive elements list same as get_dom
                  function buildInteractiveElements() {
                    const walker = document.createTreeWalker(
                      document.body,
                      NodeFilter.SHOW_ELEMENT,
                      null,
                      false
                    );
                    
                    const elements = [];
                    let node;
                    
                    while (node = walker.nextNode()) {
                      if (isElementVisible(node) && isTopElement(node) && isInteractiveElement(node) && isInExpandedViewport(node)) {
                        elements.push({
                          element: node,
                          index: highlightIndex++
                        });
                      }
                    }
                    
                    return elements;
                  }
                  
                  // Find the element with matching index
                  const interactiveElements = buildInteractiveElements();
                  const targetElement = interactiveElements.find(el => el.index === ${command.params.index});
                  
                  if (targetElement && targetElement.element) {
                    const element = targetElement.element;
                    const rect = element.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    
                    return {
                      success: true,
                      element: {
                        tagName: element.tagName.toLowerCase(),
                        type: element.type || '',
                        name: element.getAttribute('name') || '',
                        className: element.className || '',
                        text: element.textContent?.trim() || '',
                        jsaction: element.getAttribute('jsaction') || '',
                        role: element.getAttribute('role') || ''
                      },
                      coordinates: {
                        x: Math.round(centerX),
                        y: Math.round(centerY)
                      },
                      index: ${command.params.index}
                    };
                  } else {
                    return {
                      success: false,
                      error: 'Element with index ${command.params.index} not found or not interactive',
                      availableElements: interactiveElements.length
                    };
                  }
                })()
              `,
              returnByValue: true
            }
          );
          
          const elementResult = elementInfo.result.value;
          if (!elementResult.success) {
            return elementResult;
          }
          
          // Now perform a proper CDP mouse click using Input.dispatchMouseEvent
          const { x, y } = elementResult.coordinates;
          
          
          try {
            // Scroll element into view first via JavaScript
            await chrome.debugger.sendCommand(
              { tabId: currentTabId },
              'Runtime.evaluate',
              {
                expression: `
                  (function() {
                    const element = document.elementFromPoint(${x}, ${y});
                    if (element) {
                      element.scrollIntoView({ behavior: 'instant', block: 'center' });
                      return true;
                    }
                    return false;
                  })()
                `,
                returnByValue: true
              }
            );
            
            // Small delay for scroll to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Direct JavaScript click - more reliable for form submissions
            await chrome.debugger.sendCommand(
              { tabId: currentTabId },
              'Runtime.evaluate',
              {
                expression: `
                  (function() {
                    const element = document.elementFromPoint(${x}, ${y});
                    if (element) {
                      element.focus();
                      element.click();
                      
                      // Force form submission for search buttons
                      if (element.name === 'btnK' || element.type === 'submit') {
                        setTimeout(() => {
                          const form = element.closest('form');
                          if (form) {
                            form.submit();
                          } else {
                            // Fallback: press Enter on search input
                            const searchInput = document.querySelector('input[name="q"], textarea[name="q"]');
                            if (searchInput) {
                              const event = new KeyboardEvent('keydown', {
                                key: 'Enter', keyCode: 13, which: 13, bubbles: true
                              });
                              searchInput.dispatchEvent(event);
                            }
                          }
                        }, 100);
                      }
                      
                      return { clicked: true, method: 'direct_click' };
                    }
                    return { error: 'Element not found at coordinates' };
                  })()
                `,
                returnByValue: true
              }
            );
            
            // Wait for navigation/page changes after click
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Clear any cached DOM state - force fresh analysis next time
            await chrome.debugger.sendCommand(
              { tabId: currentTabId },
              'Runtime.evaluate',
              {
                expression: `
                  // Clear any cached highlights and DOM state
                  if (window._highlightCleanupFunctions) {
                    window._highlightCleanupFunctions.forEach(fn => {
                      try { fn(); } catch(e) {}
                    });
                    window._highlightCleanupFunctions = [];
                  }
                  const container = document.getElementById('playwright-highlight-container');
                  if (container) container.remove();
                  
                  // Force DOM re-analysis flag
                  window._domStateStale = true;
                  
                  return 'cleared';
                `,
                returnByValue: true
              }
            );
            
            return {
              success: true,
              clicked: true,
              method: 'direct_click_with_form_submit',
              element: elementResult.element,
              coordinates: elementResult.coordinates,
              index: command.params.index
            };
            
          } catch (cdpError) {
            console.error('❌ CDP click failed:', cdpError);
            
            // Fallback to JavaScript click if CDP fails
            const jsClickResult = await chrome.debugger.sendCommand(
              { tabId: currentTabId },
              'Runtime.evaluate',
              {
                expression: `
                  (function() {
                    try {
                      const element = document.elementFromPoint(${x}, ${y});
                      if (element) {
                        element.focus();
                        element.click();
                        
                        // If this is a search button, also try form submission
                        if (element.getAttribute('name') === 'btnK' || 
                            element.type === 'submit' ||
                            element.textContent.toLowerCase().includes('search')) {
                          
                          setTimeout(() => {
                            const forms = document.querySelectorAll('form');
                            for (const form of forms) {
                              const searchInput = form.querySelector('input[name="q"]') || form.querySelector('textarea[name="q"]');
                              if (searchInput && searchInput.value.trim()) {
                                form.submit();
                                break;
                              }
                            }
                          }, 100);
                        }
                        
                        return { clicked: true, method: 'JavaScript_fallback' };
                      }
                      return { error: 'Element not found at coordinates' };
                    } catch (e) {
                      return { error: e.message };
                    }
                  })()
                `,
                returnByValue: true
              }
            );
            
            return {
              success: true,
              fallback: true,
              cdpError: cdpError.message,
              result: jsClickResult.result.value,
              coordinates: { x, y },
              index: command.params.index
            };
          }
        } else {
          // Click by coordinates (existing implementation)
          const coordClickResult = await chrome.debugger.sendCommand(
            { tabId: currentTabId },
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  try {
                    const element = document.elementFromPoint(${command.params.x}, ${command.params.y});
                    if (element) {
                      element.click();
                      return { success: true, clicked: true, element: element.tagName };
                    }
                    return { success: false, error: 'No element found at coordinates' };
                  } catch (e) {
                    return { success: false, error: e.message };
                  }
                })()
              `,
              returnByValue: true
            }
          );
          
          return coordClickResult.result.value;
        }
        
      case 'type':
        if (!currentTabId) throw new Error('No active tab');
        const typeResult = await chrome.debugger.sendCommand(
          { tabId: currentTabId },
          'Runtime.evaluate',
          {
            expression: `
              (function() {
                try {
                  // Get currently focused element or find first input field
                  let targetElement = document.activeElement;
                  
                  // If no active element or not an input field, find first visible input
                  if (!targetElement || !['INPUT', 'TEXTAREA'].includes(targetElement.tagName)) {
                    const inputs = Array.from(document.querySelectorAll('input, textarea'))
                      .filter(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               el.offsetParent !== null &&
                               !el.disabled &&
                               !el.readOnly;
                      });
                    
                    if (inputs.length > 0) {
                      targetElement = inputs[0];
                      targetElement.focus();
                    }
                  }
                  
                  if (targetElement && ['INPUT', 'TEXTAREA'].includes(targetElement.tagName)) {
                    // Clear existing value first
                    targetElement.select();
                    targetElement.value = '';
                    
                    // Set new value
                    targetElement.value = '${command.params.text.replace(/'/g, "\\'")}';
                    
                    // Dispatch comprehensive events for compatibility
                    targetElement.dispatchEvent(new Event('focus', { bubbles: true }));
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                    targetElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                    targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                    
                    return {
                      success: true,
                      typed: true,
                      element: targetElement.tagName,
                      text: '${command.params.text.replace(/'/g, "\\'")}',
                      currentValue: targetElement.value
                    };
                  } else {
                    return {
                      success: false,
                      error: 'No suitable input element found or focused',
                      activeElement: targetElement ? targetElement.tagName : 'none'
                    };
                  }
                } catch (typeError) {
                  return {
                    success: false,
                    error: 'Type execution failed: ' + typeError.message
                  };
                }
              })()
            `,
            returnByValue: true
          }
        );
        
        // Smart wait after type + DOM mutation detection
        try {
          await chrome.debugger.sendCommand({ tabId: currentTabId }, 'Network.enable');
          
          // Track both network requests AND DOM mutations
          let pendingRequests = new Set();
          let networkIdleTimer = null;
          let domMutationTimer = null;
          let lastDomChange = Date.now();
          
          const networkListener = (method, params) => {
            if (method === 'Network.requestWillBeSent') {
              pendingRequests.add(params.requestId);
              resetIdleTimer();
            } else if (method === 'Network.responseReceived' || 
                       method === 'Network.loadingFinished' || 
                       method === 'Network.loadingFailed') {
              pendingRequests.delete(params.requestId);
              checkForIdle();
            }
          };
          
          function resetIdleTimer() {
            if (networkIdleTimer) clearTimeout(networkIdleTimer);
            if (domMutationTimer) clearTimeout(domMutationTimer);
            lastDomChange = Date.now();
          }
          
          function checkForIdle() {
            if (pendingRequests.size === 0 && Date.now() - lastDomChange > 300) {
              if (networkIdleTimer) clearTimeout(networkIdleTimer);
              networkIdleTimer = setTimeout(() => {
                chrome.debugger.onEvent.removeListener(networkListener);
                networkIdleResolve();
              }, 200);
            }
          }
          
          // Monitor DOM mutations via JavaScript
          await chrome.debugger.sendCommand(
            { tabId: currentTabId },
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  if (window._typeWaitObserver) {
                    window._typeWaitObserver.disconnect();
                  }
                  window._typeWaitObserver = new MutationObserver(() => {
                    window._lastDomMutation = Date.now();
                  });
                  window._typeWaitObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true
                  });
                  window._lastDomMutation = Date.now();
                  return true;
                })()
              `,
              returnByValue: true
            }
          );
          
          const networkIdlePromise = new Promise((resolve) => {
            networkIdleResolve = resolve;
            chrome.debugger.onEvent.addListener(networkListener);
            
            // Periodic check for DOM stability
            const checkStability = setInterval(async () => {
              try {
                const mutationCheck = await chrome.debugger.sendCommand(
                  { tabId: currentTabId },
                  'Runtime.evaluate',
                  { 
                    expression: 'window._lastDomMutation || 0',
                    returnByValue: true 
                  }
                );
                
                const lastMutation = mutationCheck.result.value;
                if (Date.now() - lastMutation > 300 && pendingRequests.size === 0) {
                  clearInterval(checkStability);
                  chrome.debugger.onEvent.removeListener(networkListener);
                  resolve();
                }
              } catch (e) {
                clearInterval(checkStability);
                resolve();
              }
            }, 100);
            
            // Cleanup after timeout
            setTimeout(() => {
              clearInterval(checkStability);
              chrome.debugger.onEvent.removeListener(networkListener);
              resolve();
            }, 1500);
          });
          
          await networkIdlePromise;
          
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        return typeResult.result.value;
        
      case 'evaluate':
        if (!currentTabId) throw new Error('No active tab');
        const result = await chrome.debugger.sendCommand(
          { tabId: currentTabId },
          'Runtime.evaluate',
          {
            expression: command.params.expression,
            returnByValue: true
          }
        );
        return { success: true, result: result.result.value };
        
      case 'screenshot':
        if (!currentTabId) throw new Error('No active tab');
        const screenshot = await chrome.debugger.sendCommand(
          { tabId: currentTabId },
          'Page.captureScreenshot',
          { format: 'png' }
        );
        return { success: true, data: screenshot.data };
        
      case 'get_dom':
        if (!currentTabId) throw new Error('No active tab');
        
        // Smart network idle detection like Playwright
        try {
          // Enable network tracking
          await chrome.debugger.sendCommand({ tabId: currentTabId }, 'Network.enable');
          
          let pendingRequests = new Set();
          let networkIdleTimer = null;
          const NETWORK_IDLE_TIME = 500; // Same as Playwright default
          
          // Track network requests
          const networkListener = (method, params) => {
            if (method === 'Network.requestWillBeSent') {
              pendingRequests.add(params.requestId);
              if (networkIdleTimer) clearTimeout(networkIdleTimer);
            } else if (method === 'Network.responseReceived' || 
                       method === 'Network.loadingFinished' || 
                       method === 'Network.loadingFailed') {
              pendingRequests.delete(params.requestId);
              
              // Start idle timer if no pending requests
              if (pendingRequests.size === 0) {
                if (networkIdleTimer) clearTimeout(networkIdleTimer);
                networkIdleTimer = setTimeout(() => {
                  chrome.debugger.onEvent.removeListener(networkListener);
                  networkIdleResolve();
                }, NETWORK_IDLE_TIME);
              }
            }
          };
          
          // Wait for network idle
          const networkIdlePromise = new Promise((resolve) => {
            networkIdleResolve = resolve;
            chrome.debugger.onEvent.addListener(networkListener);
            
            // If already idle, resolve immediately
            if (pendingRequests.size === 0) {
              networkIdleTimer = setTimeout(() => {
                chrome.debugger.onEvent.removeListener(networkListener);
                resolve();
              }, NETWORK_IDLE_TIME);
            }
          });
          
          // Wait with timeout
          await Promise.race([
            networkIdlePromise,
            new Promise(resolve => setTimeout(resolve, 3000)) // 3s max wait
          ]);
          
        } catch (e) {
          // Fallback to simple wait
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const dom = await chrome.debugger.sendCommand(
          { tabId: currentTabId },
          'Runtime.evaluate',
          {
            expression: `
              (function() {
                // Port essential functions from original extension buildDomTree.js
                let highlightIndex = 0;
                const DOM_HASH_MAP = {};
                const ID = { current: 0 };
                
                // Visual highlighting system constants
                const HIGHLIGHT_CONTAINER_ID = 'playwright-highlight-container';
                const showHighlightElements = true; // Always show highlights for debugging
                
                // Clean up any existing highlights first
                function cleanupExistingHighlights() {
                  const existingContainer = document.getElementById(HIGHLIGHT_CONTAINER_ID);
                  if (existingContainer) {
                    existingContainer.remove();
                  }
                  if (window._highlightCleanupFunctions) {
                    window._highlightCleanupFunctions.forEach(fn => {
                      try { fn(); } catch(e) { console.warn('Cleanup error:', e); }
                    });
                    window._highlightCleanupFunctions = [];
                  }
                }
                
                // Visual element highlighting function (from working extension)
                function highlightElement(element, index, parentIframe = null) {
                  if (!element) return index;
                  
                  const overlays = [];
                  let label = null;
                  let labelWidth = 20;
                  let labelHeight = 16;
                  let cleanupFn = null;
                  
                  try {
                    // Create or get highlight container
                    let container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
                    if (!container) {
                      container = document.createElement('div');
                      container.id = HIGHLIGHT_CONTAINER_ID;
                      container.style.position = 'fixed';
                      container.style.pointerEvents = 'none';
                      container.style.top = '0';
                      container.style.left = '0';
                      container.style.width = '100%';
                      container.style.height = '100%';
                      container.style.zIndex = '2147483640';
                      container.style.backgroundColor = 'transparent';
                      container.style.display = showHighlightElements ? 'block' : 'none';
                      document.body.appendChild(container);
                    }
                    
                    // Get element client rects
                    const rects = element.getClientRects();
                    if (!rects || rects.length === 0) return index;
                    
                    // Generate color based on index
                    const colors = [
                      '#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080', '#008080',
                      '#FF69B4', '#4B0082', '#FF4500', '#2E8B57', '#DC143C', '#4682B4'
                    ];
                    const colorIndex = index % colors.length;
                    const baseColor = colors[colorIndex];
                    const backgroundColor = baseColor + '1A'; // 10% opacity
                    
                    // Get iframe offset if necessary
                    let iframeOffset = { x: 0, y: 0 };
                    if (parentIframe) {
                      const iframeRect = parentIframe.getBoundingClientRect();
                      iframeOffset.x = iframeRect.left;
                      iframeOffset.y = iframeRect.top;
                    }
                    
                    const fragment = document.createDocumentFragment();
                    
                    // Create highlight overlays for each client rect
                    for (const rect of rects) {
                      if (rect.width === 0 || rect.height === 0) continue;
                      
                      const overlay = document.createElement('div');
                      overlay.style.position = 'fixed';
                      overlay.style.border = \`2px solid \${baseColor}\`;
                      overlay.style.backgroundColor = backgroundColor;
                      overlay.style.pointerEvents = 'none';
                      overlay.style.boxSizing = 'border-box';
                      
                      const top = rect.top + iframeOffset.y;
                      const left = rect.left + iframeOffset.x;
                      
                      overlay.style.top = \`\${top}px\`;
                      overlay.style.left = \`\${left}px\`;
                      overlay.style.width = \`\${rect.width}px\`;
                      overlay.style.height = \`\${rect.height}px\`;
                      
                      fragment.appendChild(overlay);
                      overlays.push({ element: overlay, initialRect: rect });
                    }
                    
                    // Create and position label with index number
                    const firstRect = rects[0];
                    label = document.createElement('div');
                    label.className = 'playwright-highlight-label';
                    label.style.position = 'fixed';
                    label.style.background = baseColor;
                    label.style.color = 'white';
                    label.style.padding = '1px 4px';
                    label.style.borderRadius = '4px';
                    label.style.fontSize = \`\${Math.min(12, Math.max(8, firstRect.height / 2))}px\`;
                    label.style.fontWeight = 'bold';
                    label.style.lineHeight = '1';
                    label.style.minWidth = '16px';
                    label.style.textAlign = 'center';
                    label.textContent = index;
                    
                    const firstRectTop = firstRect.top + iframeOffset.y;
                    const firstRectLeft = firstRect.left + iframeOffset.x;
                    
                    let labelTop = firstRectTop + 2;
                    let labelLeft = firstRectLeft + firstRect.width - 20;
                    
                    // Adjust label position if rect is too small
                    if (firstRect.width < 24 || firstRect.height < 20) {
                      labelTop = firstRectTop - 18;
                      labelLeft = firstRectLeft + firstRect.width - 20;
                      if (labelLeft < iframeOffset.x) labelLeft = firstRectLeft;
                    }
                    
                    // Keep label within viewport
                    labelTop = Math.max(0, Math.min(labelTop, window.innerHeight - 20));
                    labelLeft = Math.max(0, Math.min(labelLeft, window.innerWidth - 20));
                    
                    label.style.top = \`\${labelTop}px\`;
                    label.style.left = \`\${labelLeft}px\`;
                    
                    fragment.appendChild(label);
                    
                    // Add cleanup function for scroll/resize events
                    cleanupFn = () => {
                      overlays.forEach(overlay => overlay.element.remove());
                      if (label) label.remove();
                    };
                    
                    container.appendChild(fragment);
                    
                  } catch (error) {
                    console.warn('Highlighting error:', error);
                  } finally {
                    if (cleanupFn) {
                      window._highlightCleanupFunctions = window._highlightCleanupFunctions || [];
                      window._highlightCleanupFunctions.push(cleanupFn);
                    }
                  }
                  
                  return index + 1;
                }
                
                // XPath generation (from original extension)
                const xpathCache = new WeakMap();
                function getXPathTree(element, withHashId = false) {
                  if (xpathCache.has(element)) return xpathCache.get(element);
                  
                  if (element.nodeType !== Node.ELEMENT_NODE) return '';
                  if (element === document.documentElement) return '/html';
                  
                  const segments = [];
                  let currentElement = element;
                  
                  while (currentElement && currentElement !== document.documentElement) {
                    if (currentElement.nodeType !== Node.ELEMENT_NODE) break;
                    
                    const tagName = currentElement.tagName.toLowerCase();
                    const siblings = Array.from(currentElement.parentNode?.children || [])
                      .filter(sibling => sibling.tagName.toLowerCase() === tagName);
                    
                    let position = 0;
                    if (siblings.length > 1) {
                      position = siblings.indexOf(currentElement) + 1;
                    }
                    
                    const xpathIndex = position > 0 ? \`[\${position}]\` : '';
                    segments.unshift(\`\${tagName}\${xpathIndex}\`);
                    currentElement = currentElement.parentNode;
                  }
                  
                  const result = segments.length > 0 ? '/' + segments.join('/') : '';
                  xpathCache.set(element, result);
                  return result;
                }
                
                // Element visibility check (from original extension)
                function isElementVisible(element) {
                  if (!element || !element.offsetParent) return false;
                  
                  const style = window.getComputedStyle(element);
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false;
                  }
                  
                  const rect = element.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                }
                
                // Interactive element check (from original extension)
                function isInteractiveElement(element) {
                  if (!element) return false;
                  
                  const tagName = element.tagName.toLowerCase();
                  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
                  
                  if (interactiveTags.includes(tagName)) return true;
                  if (element.hasAttribute('onclick')) return true;
                  if (element.getAttribute('role') === 'button') return true;
                  if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') return true;
                  if (element.contentEditable === 'true') return true;
                  
                  // Check cursor style
                  const style = window.getComputedStyle(element);
                  if (style.cursor === 'pointer') return true;
                  
                  return false;
                }
                
                // Top element check (from original extension)
                function isTopElement(element) {
                  if (!element) return false;
                  
                  const rect = element.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) return false;
                  
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  
                  try {
                    const topEl = document.elementFromPoint(centerX, centerY);
                    return topEl === element || element.contains(topEl);
                  } catch (e) {
                    return true; // Fallback to true if elementFromPoint fails
                  }
                }
                
                // Viewport check (from original extension)
                function isInExpandedViewport(element, viewportExpansion = 0) {
                  if (!element) return false;
                  
                  const rect = element.getBoundingClientRect();
                  const viewportWidth = window.innerWidth;
                  const viewportHeight = window.innerHeight;
                  
                  return !(
                    rect.bottom < -viewportExpansion ||
                    rect.top > viewportHeight + viewportExpansion ||
                    rect.right < -viewportExpansion ||
                    rect.left > viewportWidth + viewportExpansion
                  );
                }
                
                // Shadow root check
                function hasShadowRoot(element) {
                  return element && element.shadowRoot !== null;
                }
                
                // Text node visibility check (from original extension)
                function isTextNodeVisible(textNode) {
                  try {
                    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;
                    
                    const parentElement = textNode.parentElement;
                    if (!parentElement) return false;
                    
                    // Check if parent is visible
                    if (!isElementVisible(parentElement)) return false;
                    
                    // Check text content
                    const text = textNode.textContent?.trim() || '';
                    if (!text || text.length < 3) return false;
                    
                    return true;
                  } catch (e) {
                    return false;
                  }
                }
                
                // Effective scroll calculation (from original extension)
                function getEffectiveScroll(element) {
                  let currentEl = element;
                  let scrollX = 0;
                  let scrollY = 0;
                  
                  while (currentEl && currentEl !== document.documentElement) {
                    if (currentEl.scrollLeft || currentEl.scrollTop) {
                      scrollX += currentEl.scrollLeft;
                      scrollY += currentEl.scrollTop;
                    }
                    currentEl = currentEl.parentElement;
                  }
                  
                  return { scrollX, scrollY };
                }
                
                // Interactive candidate pre-check (from original extension)
                function isInteractiveCandidate(element) {
                  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
                  
                  const tagName = element.tagName.toLowerCase();
                  const fastInteractiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
                  
                  // Fast path for common interactive elements
                  if (fastInteractiveTags.includes(tagName)) return true;
                  
                  // Check for interactive attributes
                  if (element.hasAttribute('onclick') ||
                      element.hasAttribute('role') ||
                      element.hasAttribute('tabindex') ||
                      element.contentEditable === 'true') return true;
                  
                  return false;
                }
                
                // Get coordinate sets (browser-use schema format)
                function getCoordinateSet(element) {
                  if (!element) return null;
                  
                  const rect = element.getBoundingClientRect();
                  
                  return {
                    top_left: { x: Math.round(rect.left), y: Math.round(rect.top) },
                    top_right: { x: Math.round(rect.right), y: Math.round(rect.top) },
                    bottom_left: { x: Math.round(rect.left), y: Math.round(rect.bottom) },
                    bottom_right: { x: Math.round(rect.right), y: Math.round(rect.bottom) },
                    center: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                  };
                }
                
                function getPageCoordinateSet(element) {
                  if (!element) return null;
                  
                  const rect = element.getBoundingClientRect();
                  const scrollX = window.scrollX || window.pageXOffset || 0;
                  const scrollY = window.scrollY || window.pageYOffset || 0;
                  
                  return {
                    top_left: { x: Math.round(rect.left + scrollX), y: Math.round(rect.top + scrollY) },
                    top_right: { x: Math.round(rect.right + scrollX), y: Math.round(rect.top + scrollY) },
                    bottom_left: { x: Math.round(rect.left + scrollX), y: Math.round(rect.bottom + scrollY) },
                    bottom_right: { x: Math.round(rect.right + scrollX), y: Math.round(rect.bottom + scrollY) },
                    center: { x: Math.round(rect.left + rect.width / 2 + scrollX), y: Math.round(rect.top + rect.height / 2 + scrollY) },
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                  };
                }
                
                // Build DOM tree (enhanced version from original extension)
                function buildDomTree(node, parentIframe = null, hasHighlightedParent = false) {
                  if (!node) return null;
                  
                  // Handle text nodes with proper visibility check
                  if (node.nodeType === Node.TEXT_NODE) {
                    if (!isTextNodeVisible(node)) return null;
                    
                    const text = node.textContent?.trim() || '';
                    
                    return {
                      type: 'TEXT_NODE',
                      text: text,
                      isVisible: true
                    };
                  }
                  
                  // Handle element nodes
                  if (node.nodeType !== Node.ELEMENT_NODE) return null;
                  
                  const tagName = node.tagName.toLowerCase();
                  
                  // Skip certain elements
                  if (['script', 'style', 'meta', 'link', 'noscript'].includes(tagName)) {
                    return null;
                  }
                  
                  const nodeData = {
                    tagName: tagName,
                    attributes: {},
                    xpath: getXPathTree(node, true),
                    children: []
                  };
                  
                  // Get attributes
                  const attributeNames = node.getAttributeNames?.() || [];
                  for (const name of attributeNames) {
                    nodeData.attributes[name] = node.getAttribute(name);
                  }
                  
                  // Pre-filter using interactive candidate check for performance
                  const isCandidate = isInteractiveCandidate(node);
                  
                  // Calculate element properties
                  nodeData.isVisible = isElementVisible(node);
                  
                  if (nodeData.isVisible) {
                    nodeData.isTopElement = isTopElement(node);
                    
                    if (nodeData.isTopElement) {
                      // Only check interactivity for candidates (performance optimization)
                      nodeData.isInteractive = isCandidate ? isInteractiveElement(node) : false;
                      nodeData.isInViewport = isInExpandedViewport(node, 0);
                      nodeData.shadowRoot = hasShadowRoot(node);
                      
                      // Add coordinates with effective scroll calculation
                      const effectiveScroll = getEffectiveScroll(node);
                      nodeData.viewportCoordinates = getCoordinateSet(node);
                      nodeData.pageCoordinates = getPageCoordinateSet(node);
                      
                      // Include scroll info in coordinates
                      if (nodeData.pageCoordinates && effectiveScroll) {
                        nodeData.pageCoordinates.effectiveScrollX = effectiveScroll.scrollX;
                        nodeData.pageCoordinates.effectiveScrollY = effectiveScroll.scrollY;
                      }
                      
                      // Assign highlight index to interactive elements and create visual highlights
                      if (nodeData.isInteractive && nodeData.isInViewport) {
                        nodeData.highlightIndex = highlightIndex;
                        // Create visual highlight for this element
                        highlightElement(node, highlightIndex, parentIframe);
                        highlightIndex++;
                      }
                    }
                  }
                  
                  // Process children
                  for (const child of node.childNodes) {
                    const childElement = buildDomTree(child, parentIframe, hasHighlightedParent);
                    if (childElement) {
                      nodeData.children.push(childElement);
                    }
                  }
                  
                  const id = \`\${ID.current++}\`;
                  DOM_HASH_MAP[id] = nodeData;
                  
                  return id;
                }
                
                // Clean up existing highlights before building new ones
                cleanupExistingHighlights();
                
                // Reset highlighting counter for fresh indexing
                highlightIndex = 0;
                
                // Build the complete DOM tree
                const rootId = buildDomTree(document.body);
                
                // Extract interactive elements for simple access (matching original extension format)
                const elements = [];
                for (const [id, nodeData] of Object.entries(DOM_HASH_MAP)) {
                  if (nodeData.isInteractive && nodeData.highlightIndex !== undefined) {
                    // Extract text content from various sources (matching original extension)
                    let elementText = '';
                    if (nodeData.attributes.value) elementText = nodeData.attributes.value;
                    else if (nodeData.attributes.placeholder) elementText = nodeData.attributes.placeholder;
                    else if (nodeData.attributes['aria-label']) elementText = nodeData.attributes['aria-label'];
                    else if (nodeData.attributes.title) elementText = nodeData.attributes.title;
                    else if (nodeData.attributes.alt) elementText = nodeData.attributes.alt;
                    
                    // Include text content from child text nodes
                    if (!elementText && nodeData.children) {
                      for (const child of nodeData.children) {
                        if (child.type === 'TEXT_NODE' && child.text) {
                          elementText = child.text;
                          break;
                        }
                      }
                    }
                    
                    elements.push({
                      index: nodeData.highlightIndex,
                      tagName: nodeData.tagName,
                      xpath: nodeData.xpath,
                      attributes: nodeData.attributes,
                      text: elementText.trim(),
                      isVisible: nodeData.isVisible,
                      isInteractive: nodeData.isInteractive,
                      isTopElement: nodeData.isTopElement,
                      isInViewport: nodeData.isInViewport,
                      shadowRoot: nodeData.shadowRoot,
                      viewportCoordinates: nodeData.viewportCoordinates,
                      pageCoordinates: nodeData.pageCoordinates
                    });
                  }
                }
                
                // Collect viewport and scroll data (matching original extension)
                const viewportWidth = window.visualViewport?.width || window.innerWidth;
                const viewportHeight = window.visualViewport?.height || window.innerHeight;
                const pageWidth = Math.max(
                  document.documentElement.scrollWidth,
                  document.documentElement.offsetWidth,
                  document.documentElement.clientWidth,
                  document.body?.scrollWidth || 0,
                  document.body?.offsetWidth || 0,
                  document.body?.clientWidth || 0
                );
                const pageHeight = Math.max(
                  document.documentElement.scrollHeight,
                  document.documentElement.offsetHeight,
                  document.documentElement.clientHeight,
                  document.body?.scrollHeight || 0,
                  document.body?.offsetHeight || 0,
                  document.body?.clientHeight || 0
                );
                const scrollX = window.scrollX || window.pageXOffset || 0;
                const scrollY = window.scrollY || window.pageYOffset || 0;
                
                // Calculate pixels outside viewport
                const pixelsAbove = scrollY;
                const pixelsBelow = Math.max(0, pageHeight - (scrollY + viewportHeight));
                const pixelsLeft = scrollX;
                const pixelsRight = Math.max(0, pageWidth - (scrollX + viewportWidth));
                
                return {
                  url: window.location.href,
                  title: document.title,
                  html: document.documentElement.outerHTML,
                  elements: elements,
                  domTree: { rootId, map: DOM_HASH_MAP }, // Complete DOM tree like original
                  // Viewport and scroll data for PageInfo schema
                  viewport: {
                    width: viewportWidth,
                    height: viewportHeight,
                    scrollX: scrollX,
                    scrollY: scrollY
                  },
                  page: {
                    width: pageWidth,
                    height: pageHeight
                  },
                  pixels: {
                    above: pixelsAbove,
                    below: pixelsBelow,
                    left: pixelsLeft,
                    right: pixelsRight
                  }
                };
              })()
            `,
            returnByValue: true
          }
        );
        // Get all open tabs information
        const tabs = await chrome.tabs.query({});
        const tabInfos = tabs.map(tab => ({
          id: tab.id,
          url: tab.url || '',
          title: tab.title || ''
        }));
        
        // Add tabs to the DOM result
        const domResult = dom.result.value;
        domResult.tabs = tabInfos;
        domResult.currentTabId = currentTabId;
        
        return { success: true, result: domResult };
        
      case 'close_tab':
        if (!command.params.tabId) throw new Error('No tab ID provided');
        await chrome.tabs.remove(command.params.tabId);
        return { success: true };
        
      case 'navigate_tab':
        if (!command.params.tabId || !command.params.url) throw new Error('Missing tab ID or URL');
        await chrome.tabs.update(command.params.tabId, { 
          url: command.params.url, 
          active: true 
        });
        return { success: true };
        
      default:
        throw new Error(`Unknown command: ${command.method}`);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Attach debugger to tab
async function attachDebugger(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    debuggerAttached = true;
    currentTabId = tabId;
  } catch (error) {
    console.error('Failed to attach debugger:', error);
    debuggerAttached = false;
  }
}

// WebSocket connection management
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }
  
  try {
    ws = new WebSocket('ws://localhost:9898');
    
    ws.onopen = () => {
      console.log('Connected to browser-use');
      isConnected = true;
      updateStatus(true);
      
      // Send ready message
      ws.send(JSON.stringify({
        type: 'ready',
        message: 'Bridge extension connected'
      }));
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'command') {
          const result = await executeCDPCommand(message.command);
          ws.send(JSON.stringify({
            type: 'response',
            id: message.id,
            result: result
          }));
        }
      } catch (error) {
        console.error('❌ Message handling error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          id: message.id,
          error: error.message
        }));
      }
    };
    
    ws.onclose = () => {
      console.log('Disconnected from browser-use');
      isConnected = false;
      updateStatus(false);
      
      // Auto-reconnect after 5 seconds
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnected = false;
      updateStatus(false);
    };
    
  } catch (error) {
    console.error('Failed to connect:', error);
    isConnected = false;
    updateStatus(false);
  }
}

// Update popup status
function updateStatus(connected) {
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    connected: connected
  }).catch(() => {
    // Popup might be closed
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse({ connected: isConnected });
  } else if (request.action === 'connect') {
    connect();
    sendResponse({ success: true });
  }
  return true;
});

// Clean up debugger on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    debuggerAttached = false;
    currentTabId = null;
  }
});

// Auto-connect on startup
connect();