// Simplified DOM analyzer adapted from buildDomTree.js
(function() {
  const HIGHLIGHT_CONTAINER_ID = 'visual-agent-highlight-container';
  let highlightIndex = 0;

  // Clean up any existing highlights first
  function cleanup() {
    const existingContainer = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (existingContainer) {
      existingContainer.remove();
    }
  }

  // Create or get highlight container
  function getOrCreateContainer() {
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
      document.body.appendChild(container);
    }
    return container;
  }

  // Check if element is visible
  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      element.offsetWidth > 0 && 
      element.offsetHeight > 0 && 
      style.visibility !== 'hidden' && 
      style.display !== 'none'
    );
  }

  // Check if element is interactive (from buildDomTree.js)
  function isInteractiveElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const style = window.getComputedStyle(element);

    // Interactive cursors
    const interactiveCursors = ['pointer', 'move', 'text', 'grab'];
    if (interactiveCursors.includes(style.cursor)) {
      return true;
    }

    // Interactive elements
    const interactiveElements = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'details', 
      'summary', 'label', 'option'
    ]);

    if (interactiveElements.has(tagName)) {
      // Check if not disabled
      if (element.disabled || element.readOnly) {
        return false;
      }
      return true;
    }

    // Check for contenteditable
    if (element.getAttribute('contenteditable') === 'true' || element.isContentEditable) {
      return true;
    }

    // Check for role
    const role = element.getAttribute('role');
    const interactiveRoles = new Set([
      'button', 'link', 'menuitem', 'radio', 'checkbox', 'tab', 
      'switch', 'slider', 'combobox', 'textbox', 'option'
    ]);
    if (role && interactiveRoles.has(role)) {
      return true;
    }

    // Check for click handlers
    if (element.hasAttribute('onclick') || typeof element.onclick === 'function') {
      return true;
    }

    return false;
  }

  // Highlight element (simplified from buildDomTree.js)
  function highlightElement(element, index) {
    if (!element) return null;

    const container = getOrCreateContainer();
    const rect = element.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return null;

    // Generate colors
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFA500', 
      '#800080', '#008080', '#FF69B4', '#4B0082'
    ];
    const colorIndex = index % colors.length;
    const baseColor = colors[colorIndex];
    const backgroundColor = baseColor + '1A'; // 10% opacity

    // Create highlight overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.border = `2px solid ${baseColor}`;
    overlay.style.backgroundColor = backgroundColor;
    overlay.style.pointerEvents = 'none';
    overlay.style.boxSizing = 'border-box';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.zIndex = '2147483641';

    // Create number label
    const label = document.createElement('div');
    label.className = 'playwright-highlight-label';
    label.style.position = 'fixed';
    label.style.background = baseColor;
    label.style.color = 'white';
    label.style.padding = '1px 4px';
    label.style.borderRadius = '4px';
    label.style.fontSize = '12px';
    label.style.fontWeight = 'bold';
    label.style.fontFamily = 'monospace';
    label.style.zIndex = '2147483642';
    label.textContent = index.toString();

    // Position label
    let labelTop = rect.top + 2;
    let labelLeft = rect.left + rect.width - 20;

    // Adjust if too small
    if (rect.width < 30 || rect.height < 20) {
      labelTop = rect.top - 18;
      labelLeft = rect.left;
    }

    label.style.top = `${Math.max(0, labelTop)}px`;
    label.style.left = `${Math.max(0, labelLeft)}px`;

    container.appendChild(overlay);
    container.appendChild(label);

    return { overlay, label, rect };
  }

  // Main visualization function
  function visualize() {
    cleanup();
    highlightIndex = 0;

    const allElements = document.querySelectorAll('*');
    const elementMap = {};
    let totalHighlighted = 0;

    allElements.forEach(element => {
      if (isElementVisible(element) && isInteractiveElement(element)) {
        const highlightInfo = highlightElement(element, highlightIndex);
        if (highlightInfo) {
          elementMap[highlightIndex] = {
            tagName: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className,
            text: element.textContent?.trim().substring(0, 50),
            rect: highlightInfo.rect
          };
          highlightIndex++;
          totalHighlighted++;
        }
      }
    });

    console.log(`👁️ Highlighted ${totalHighlighted} interactive elements`);
    
    return {
      totalElements: totalHighlighted,
      elementMap: elementMap
    };
  }

  // Export for use
  window.domAnalyzer = {
    visualize: visualize,
    cleanup: cleanup
  };

  console.log('✅ DOM Analyzer loaded');
})();