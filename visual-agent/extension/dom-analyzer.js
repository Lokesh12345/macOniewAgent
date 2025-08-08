// DOM analyzer with reanalysis logic from Chrome extension
// Handles DOM visualization and change detection

window.domAnalyzer = {
  highlightIndex: 0,
  HIGHLIGHT_CONTAINER_ID: 'visual-agent-highlight-container',
  currentElementMap: {},
  cachedPathHashes: null,
  
  // Initialize the DOM analyzer
  init() {
    this.cleanup(); // Clean any existing highlights
    this.highlightIndex = 0;
    this.currentElementMap = {};
    this.cachedPathHashes = null;
  },
  
  // Create visual highlights for interactive elements (fresh state)
  visualize() {
    this.init();
    
    const interactiveElements = this.findInteractiveElements();
    const elementMap = {};
    
    interactiveElements.forEach((element, index) => {
      const highlightInfo = this.highlightElement(element, index);
      if (highlightInfo) {
        // Store actual element reference for actions
        this.currentElementMap[index] = element;
        
        elementMap[index] = {
          tagName: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className,
          textContent: element.textContent?.trim().substring(0, 100),
          boundingRect: element.getBoundingClientRect()
        };
      }
    });
    
    // Cache DOM hashes after visualization
    this.cachedPathHashes = this.calcBranchPathHashSet();
    console.log('🔍 DOM state cached with', this.cachedPathHashes.size, 'element hashes');
    
    return {
      totalElements: interactiveElements.length,
      elementMap: elementMap
    };
  },

  // Get cached element map (for actions)
  getCachedElementMap() {
    return this.currentElementMap;
  },

  // Get element by index (for actions)
  getElementByIndex(index) {
    return this.currentElementMap[index] || null;
  },

  // Fresh DOM analysis (like Chrome extension's getState)
  getFreshState() {
    console.log('🔄 Getting fresh DOM state for reanalysis');
    return this.visualize();
  },
  
  // Find interactive elements on the page
  findInteractiveElements() {
    const interactiveSelectors = [
      'button',
      'a[href]',
      'input',
      'select', 
      'textarea',
      '[onclick]',
      '[role="button"]',
      '[tabindex]',
      '[contenteditable="true"]'
    ];
    
    const elements = [];
    interactiveSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (this.isElementVisible(el) && !elements.includes(el)) {
          elements.push(el);
        }
      });
    });
    
    return elements;
  },
  
  // Check if element is visible
  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 && 
      rect.height > 0 && 
      style.visibility !== 'hidden' && 
      style.display !== 'none' &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  },
  
  // Create highlight overlay for an element
  highlightElement(element, index) {
    if (!element) return null;
    
    const container = this.getOrCreateContainer();
    const rect = element.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) return null;
    
    // Generate colors
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080', '#008080'];
    const colorIndex = index % colors.length;
    const baseColor = colors[colorIndex];
    const backgroundColor = baseColor + '1A'; // 10% opacity
    
    // Create highlight overlay
    const overlay = document.createElement('div');
    overlay.className = 'visual-agent-highlight';
    overlay.style.cssText = `
      position: fixed;
      border: 2px solid ${baseColor};
      background-color: ${backgroundColor};
      pointer-events: none;
      box-sizing: border-box;
      z-index: 2147483647;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
    
    // Create number label
    const label = document.createElement('div');
    label.className = 'visual-agent-label';
    label.style.cssText = `
      position: fixed;
      background: ${baseColor};
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      font-family: monospace;
      z-index: 2147483648;
      top: ${Math.max(0, rect.top - 20)}px;
      left: ${rect.left}px;
    `;
    label.textContent = index.toString();
    
    container.appendChild(overlay);
    container.appendChild(label);
    
    return {
      overlay,
      label,
      rect
    };
  },
  
  // Get or create highlight container
  getOrCreateContainer() {
    let container = document.getElementById(this.HIGHLIGHT_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = this.HIGHLIGHT_CONTAINER_ID;
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483640;
      `;
      document.body.appendChild(container);
    }
    return container;
  },
  
  // Clean up all highlights
  cleanup() {
    const container = document.getElementById(this.HIGHLIGHT_CONTAINER_ID);
    if (container) {
      container.remove();
    }
  },

  // Calculate DOM branch path hash set (from Chrome extension)
  calcBranchPathHashSet() {
    const hashes = new Set();
    
    // Get all currently interactive elements
    const elements = this.findInteractiveElements();
    
    elements.forEach(element => {
      try {
        const hash = this.hashDomElement(element);
        hashes.add(hash);
      } catch (error) {
        console.warn('Failed to hash element:', error);
      }
    });
    
    return hashes;
  },

  // Hash a DOM element for identification (simplified from Chrome extension)
  hashDomElement(element) {
    const parentBranchPath = this.getParentBranchPath(element);
    const attributes = this.getElementAttributes(element);
    const xpath = this.getElementXPath(element);
    
    // Simple string concatenation hash (Chrome extension uses SHA-256)
    return `${parentBranchPath.join('/')}-${JSON.stringify(attributes)}-${xpath}`;
  },

  // Get parent branch path
  getParentBranchPath(element) {
    const parents = [];
    let currentElement = element;
    
    while (currentElement && currentElement !== document.body) {
      parents.unshift(currentElement.tagName.toLowerCase());
      currentElement = currentElement.parentElement;
    }
    
    return parents;
  },

  // Get element attributes
  getElementAttributes(element) {
    const attributes = {};
    
    // Only include key attributes for hashing
    const keyAttributes = ['id', 'class', 'type', 'role', 'href', 'name'];
    
    keyAttributes.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    });
    
    return attributes;
  },

  // Get element XPath (simplified)
  getElementXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    const parts = [];
    let current = element;
    
    while (current && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      
      parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = current.parentElement;
    }
    
    return `/${parts.join('/')}`;
  },

  // Check if DOM has changed (key function from Chrome extension)
  hasObstructionOccurred() {
    if (!this.cachedPathHashes) {
      console.log('🚧 OBSTRUCTION: No cached hashes, considering changed');
      return true;
    }
    
    const newPathHashes = this.calcBranchPathHashSet();
    
    // Check if new hashes are a subset of cached hashes
    for (const hash of newPathHashes) {
      if (!this.cachedPathHashes.has(hash)) {
        console.log('🚧 OBSTRUCTION: DETECTED - New elements appeared');
        console.log('🔍 New hash found:', hash);
        return true;
      }
    }
    
    console.log('🚧 OBSTRUCTION: NONE - DOM unchanged');
    return false;
  },

  // Detect autocomplete appearance (simplified)
  hasAutocompleteAppeared() {
    // Look for common autocomplete elements
    const autocompleteSelectors = [
      '[role="listbox"]',
      '.autocomplete',
      '.suggestions',
      '.dropdown-menu',
      '.ui-autocomplete'
    ];
    
    for (const selector of autocompleteSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (this.isElementVisible(element)) {
          console.log('🎯 AUTOCOMPLETE: Detected', selector);
          return true;
        }
      }
    }
    
    return false;
  }
};