// Enhanced content script for executing actions with better feedback
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
    
    // Wait a moment for scroll to complete
    setTimeout(() => {}, 100);
    
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