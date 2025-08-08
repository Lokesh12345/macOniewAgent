// Simple DOM analyzer that creates visual highlights with numbered overlays
// Extracts the core highlighting functionality from buildDomTree.js

window.domAnalyzer = {
  highlightIndex: 0,
  HIGHLIGHT_CONTAINER_ID: 'visual-agent-highlight-container',
  
  // Initialize the DOM analyzer
  init() {
    this.cleanup(); // Clean any existing highlights
    this.highlightIndex = 0;
  },
  
  // Create visual highlights for interactive elements
  visualize() {
    this.init();
    
    const interactiveElements = this.findInteractiveElements();
    const elementMap = {};
    
    interactiveElements.forEach((element, index) => {
      const highlightInfo = this.highlightElement(element, index);
      if (highlightInfo) {
        elementMap[index] = {
          element: element,
          tagName: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className,
          textContent: element.textContent?.trim().substring(0, 100),
          boundingRect: element.getBoundingClientRect()
        };
      }
    });
    
    return {
      totalElements: interactiveElements.length,
      elementMap: elementMap
    };
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
  }
};