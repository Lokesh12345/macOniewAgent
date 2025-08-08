// Content script - persistent DOM analyzer and action executor using Chrome extension's buildDomTree.js
// This runs on all pages and maintains element mapping between actions

console.log('✅ Visual Agent content script loaded');

// Copy the exact buildDomTree.js implementation from Chrome extension
// This is the proven working implementation
window.buildDomTree = (
  args = {
    showHighlightElements: true,
    focusHighlightIndex: -1,
    viewportExpansion: 0,
    debugMode: false,
  },
) => {
  const { showHighlightElements, focusHighlightIndex, viewportExpansion, debugMode } = args;
  // Make sure to do highlight elements always, but we can hide the highlights if needed
  const doHighlightElements = true;

  let highlightIndex = 0; // Reset highlight index

  // Add timing stack to handle recursion
  const TIMING_STACK = {
    nodeProcessing: [],
    treeTraversal: [],
    highlighting: [],
    current: null,
  };

  function pushTiming(type) {
    TIMING_STACK[type] = TIMING_STACK[type] || [];
    TIMING_STACK[type].push(performance.now());
  }

  function popTiming(type) {
    const start = TIMING_STACK[type].pop();
    const duration = performance.now() - start;
    return duration;
  }

  // Simple timing helper that only runs in debug mode
  function measureTime(fn) {
    if (!debugMode) return fn;
    return function (...args) {
      const start = performance.now();
      const result = fn.apply(this, args);
      const duration = performance.now() - start;
      return result;
    };
  }

  // Helper to measure DOM operations
  function measureDomOperation(operation, name) {
    if (!debugMode) return operation();

    const start = performance.now();
    const result = operation();
    const duration = performance.now() - start;

    return result;
  }

  // Add caching mechanisms at the top level
  const DOM_CACHE = {
    boundingRects: new WeakMap(),
    clientRects: new WeakMap(),
    computedStyles: new WeakMap(),
    clearCache: () => {
      DOM_CACHE.boundingRects = new WeakMap();
      DOM_CACHE.clientRects = new WeakMap();
      DOM_CACHE.computedStyles = new WeakMap();
    },
  };

  // Cache helper functions
  function getCachedBoundingRect(element) {
    if (!element) return null;

    if (DOM_CACHE.boundingRects.has(element)) {
      return DOM_CACHE.boundingRects.get(element);
    }

    const rect = element.getBoundingClientRect();

    if (rect) {
      DOM_CACHE.boundingRects.set(element, rect);
    }
    return rect;
  }

  function getCachedComputedStyle(element) {
    if (!element) return null;

    if (DOM_CACHE.computedStyles.has(element)) {
      return DOM_CACHE.computedStyles.get(element);
    }

    const style = window.getComputedStyle(element);

    if (style) {
      DOM_CACHE.computedStyles.set(element, style);
    }
    return style;
  }

  // Add a new function to get cached client rects
  function getCachedClientRects(element) {
    if (!element) return null;

    if (DOM_CACHE.clientRects.has(element)) {
      return DOM_CACHE.clientRects.get(element);
    }

    const rects = element.getClientRects();

    if (rects) {
      DOM_CACHE.clientRects.set(element, rects);
    }
    return rects;
  }

  /**
   * Hash map of DOM nodes indexed by their highlight index.
   *
   * @type {Object<string, any>}
   */
  const DOM_HASH_MAP = {};

  const ID = { current: 0 };

  const HIGHLIGHT_CONTAINER_ID = 'playwright-highlight-container';

  // Add a WeakMap cache for XPath strings
  const xpathCache = new WeakMap();

  /**
   * Highlights an element in the DOM and returns the index of the next element.
   */
  function highlightElement(element, index, parentIframe = null) {
    pushTiming('highlighting');

    if (!element) return index;

    // Store overlays and the single label for updating
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
        // Show or hide the container based on the showHighlightElements flag
        container.style.display = showHighlightElements ? 'block' : 'none';
        document.body.appendChild(container);
      }

      // Get element client rects
      const rects = element.getClientRects(); // Use getClientRects()

      if (!rects || rects.length === 0) return index; // Exit if no rects

      // Generate a color based on the index
      const colors = [
        '#FF0000',
        '#00FF00',
        '#0000FF',
        '#FFA500',
        '#800080',
        '#008080',
        '#FF69B4',
        '#4B0082',
        '#FF4500',
        '#2E8B57',
        '#DC143C',
        '#4682B4',
      ];
      const colorIndex = index % colors.length;
      const baseColor = colors[colorIndex];
      const backgroundColor = baseColor + '1A'; // 10% opacity version of the color

      // Get iframe offset if necessary
      let iframeOffset = { x: 0, y: 0 };
      if (parentIframe) {
        const iframeRect = parentIframe.getBoundingClientRect(); // Keep getBoundingClientRect for iframe offset
        iframeOffset.x = iframeRect.left;
        iframeOffset.y = iframeRect.top;
      }

      // Create fragment to hold overlay elements
      const fragment = document.createDocumentFragment();

      // Create highlight overlays for each client rect
      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) continue; // Skip empty rects

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.border = `2px solid ${baseColor}`;
        overlay.style.backgroundColor = backgroundColor;
        overlay.style.pointerEvents = 'none';
        overlay.style.boxSizing = 'border-box';

        const top = rect.top + iframeOffset.y;
        const left = rect.left + iframeOffset.x;

        overlay.style.top = `${top}px`;
        overlay.style.left = `${left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        fragment.appendChild(overlay);
        overlays.push({ element: overlay, initialRect: rect }); // Store overlay and its rect
      }

      // Create and position a single label relative to the first rect
      const firstRect = rects[0];
      label = document.createElement('div');
      label.className = 'playwright-highlight-label';
      label.style.position = 'fixed';
      label.style.background = baseColor;
      label.style.color = 'white';
      label.style.padding = '1px 4px';
      label.style.borderRadius = '4px';
      label.style.fontSize = `${Math.min(12, Math.max(8, firstRect.height / 2))}px`;
      label.textContent = index;

      labelWidth = label.offsetWidth > 0 ? label.offsetWidth : labelWidth; // Update actual width if possible
      labelHeight = label.offsetHeight > 0 ? label.offsetHeight : labelHeight; // Update actual height if possible

      const firstRectTop = firstRect.top + iframeOffset.y;
      const firstRectLeft = firstRect.left + iframeOffset.x;

      let labelTop = firstRectTop + 2;
      let labelLeft = firstRectLeft + firstRect.width - labelWidth - 2;

      // Adjust label position if first rect is too small
      if (firstRect.width < labelWidth + 4 || firstRect.height < labelHeight + 4) {
        labelTop = firstRectTop - labelHeight - 2;
        labelLeft = firstRectLeft + firstRect.width - labelWidth; // Align with right edge
        if (labelLeft < iframeOffset.x) labelLeft = firstRectLeft; // Prevent going off-left
      }

      // Ensure label stays within viewport bounds slightly better
      labelTop = Math.max(0, Math.min(labelTop, window.innerHeight - labelHeight));
      labelLeft = Math.max(0, Math.min(labelLeft, window.innerWidth - labelWidth));

      label.style.top = `${labelTop}px`;
      label.style.left = `${labelLeft}px`;

      fragment.appendChild(label);

      // Then add fragment to container in one operation
      container.appendChild(fragment);

      return index + 1;
    } finally {
      popTiming('highlighting');
    }
  }

  // Add this function to perform cleanup when needed
  function cleanupHighlights() {
    // Remove the container
    const container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (container) container.remove();
  }

  function getElementPosition(currentElement) {
    if (!currentElement.parentElement) {
      return 0; // No parent means no siblings
    }

    const tagName = currentElement.nodeName.toLowerCase();

    const siblings = Array.from(currentElement.parentElement.children).filter(
      sib => sib.nodeName.toLowerCase() === tagName,
    );

    if (siblings.length === 1) {
      return 0; // Only element of its type
    }

    const index = siblings.indexOf(currentElement) + 1; // 1-based index
    return index;
  }

  /**
   * Returns an XPath tree string for an element.
   */
  function getXPathTree(element, stopAtBoundary = true) {
    if (xpathCache.has(element)) return xpathCache.get(element);

    const segments = [];
    let currentElement = element;

    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
      // Stop if we hit a shadow root or iframe
      if (
        stopAtBoundary &&
        (currentElement.parentNode instanceof ShadowRoot || currentElement.parentNode instanceof HTMLIFrameElement)
      ) {
        break;
      }

      const position = getElementPosition(currentElement);
      const tagName = currentElement.nodeName.toLowerCase();
      const xpathIndex = position > 0 ? `[${position}]` : '';
      segments.unshift(`${tagName}${xpathIndex}`);

      currentElement = currentElement.parentNode;
    }

    const result = segments.join('/');
    xpathCache.set(element, result);
    return result;
  }

  // Helper function to check if element is accepted
  function isElementAccepted(element) {
    if (!element || !element.tagName) return false;

    // Always accept body and common container elements
    const alwaysAccept = new Set(['body', 'div', 'main', 'article', 'section', 'nav', 'header', 'footer']);
    const tagName = element.tagName.toLowerCase();

    if (alwaysAccept.has(tagName)) return true;

    const leafElementDenyList = new Set(['svg', 'script', 'style', 'link', 'meta', 'noscript', 'template']);

    return !leafElementDenyList.has(tagName);
  }

  /**
   * Checks if an element is visible.
   */
  function isElementVisible(element) {
    const style = getCachedComputedStyle(element);
    return (
      element.offsetWidth > 0 && element.offsetHeight > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    );
  }

  /**
   * Checks if an element is interactive.
   * This is the exact logic from Chrome extension buildDomTree.js
   */
  function isInteractiveElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    // Cache the tagName and style lookups
    const tagName = element.tagName.toLowerCase();
    const style = getCachedComputedStyle(element);

    // Define interactive cursors - exact from Chrome extension
    const interactiveCursors = new Set([
      'pointer', // Link/clickable elements
      'move', // Movable elements
      'text', // Text selection
      'grab', // Grabbable elements
      'grabbing', // Currently grabbing
      'cell', // Table cell selection
      'copy', // Copy operation
      'alias', // Alias creation
      'all-scroll', // Scrollable content
      'col-resize', // Column resize
      'context-menu', // Context menu available
      'crosshair', // Precise selection
      'e-resize', // East resize
      'ew-resize', // East-west resize
      'help', // Help available
      'n-resize', // North resize
      'ne-resize', // Northeast resize
      'nesw-resize', // Northeast-southwest resize
      'ns-resize', // North-south resize
      'nw-resize', // Northwest resize
      'nwse-resize', // Northwest-southeast resize
      'row-resize', // Row resize
      's-resize', // South resize
      'se-resize', // Southeast resize
      'sw-resize', // Southwest resize
      'vertical-text', // Vertical text selection
      'w-resize', // West resize
      'zoom-in', // Zoom in
      'zoom-out', // Zoom out
    ]);

    // Define non-interactive cursors
    const nonInteractiveCursors = new Set([
      'not-allowed', // Action not allowed
      'no-drop', // Drop not allowed
      'wait', // Processing
      'progress', // In progress
      'initial', // Initial value
      'inherit', // Inherited value
    ]);

    function doesElementHaveInteractivePointer(element) {
      if (element.tagName.toLowerCase() === 'html') return false;

      if (interactiveCursors.has(style.cursor)) return true;

      return false;
    }

    let isInteractiveCursor = doesElementHaveInteractivePointer(element);

    // Genius fix for almost all interactive elements
    if (isInteractiveCursor) {
      return true;
    }

    const interactiveElements = new Set([
      'a', // Links
      'button', // Buttons
      'input', // All input types (text, checkbox, radio, etc.)
      'select', // Dropdown menus
      'textarea', // Text areas
      'details', // Expandable details
      'summary', // Summary element (clickable part of details)
      'label', // Form labels (often clickable)
      'option', // Select options
      'optgroup', // Option groups
      'fieldset', // Form fieldsets (can be interactive with legend)
      'legend', // Fieldset legends
    ]);

    // Define explicit disable attributes and properties
    const explicitDisableTags = new Set([
      'disabled', // Standard disabled attribute
      'readonly', // Read-only state
    ]);

    // handle inputs, select, checkbox, radio, textarea, button and make sure they are not cursor style disabled/not-allowed
    if (interactiveElements.has(tagName)) {
      // Check for non-interactive cursor
      if (nonInteractiveCursors.has(style.cursor)) {
        return false;
      }

      // Check for explicit disable attributes
      for (const disableTag of explicitDisableTags) {
        if (
          element.hasAttribute(disableTag) ||
          element.getAttribute(disableTag) === 'true' ||
          element.getAttribute(disableTag) === ''
        ) {
          return false;
        }
      }

      // Check for disabled property on form elements
      if (element.disabled) {
        return false;
      }

      // Check for readonly property on form elements
      if (element.readOnly) {
        return false;
      }

      // Check for inert property
      if (element.inert) {
        return false;
      }

      return true;
    }

    const role = element.getAttribute('role');
    const ariaRole = element.getAttribute('aria-role');

    // Check for contenteditable attribute
    if (element.getAttribute('contenteditable') === 'true' || element.isContentEditable) {
      return true;
    }

    // Added enhancement to capture dropdown interactive elements
    if (
      element.classList &&
      (element.classList.contains('button') ||
        element.classList.contains('dropdown-toggle') ||
        element.getAttribute('data-index') ||
        element.getAttribute('data-toggle') === 'dropdown' ||
        element.getAttribute('aria-haspopup') === 'true')
    ) {
      return true;
    }

    const interactiveRoles = new Set([
      'button', // Directly clickable element
      'menuitemradio', // Radio-style menu item (selectable)
      'menuitemcheckbox', // Checkbox-style menu item (toggleable)
      'radio', // Radio button (selectable)
      'checkbox', // Checkbox (toggleable)
      'tab', // Tab (clickable to switch content)
      'switch', // Toggle switch (clickable to change state)
      'slider', // Slider control (draggable)
      'spinbutton', // Number input with up/down controls
      'combobox', // Dropdown with text input
      'searchbox', // Search input field
      'textbox', // Text input field
      'option', // Selectable option in a list
      'scrollbar', // Scrollable control
    ]);

    // Basic role/attribute checks
    const hasInteractiveRole =
      interactiveElements.has(tagName) || interactiveRoles.has(role) || interactiveRoles.has(ariaRole);

    if (hasInteractiveRole) return true;

    // Check for event listeners - exact Chrome extension logic
    try {
      // Fallback: Check common event attributes
      const commonMouseAttrs = ['onclick', 'onmousedown', 'onmouseup', 'ondblclick'];
      for (const attr of commonMouseAttrs) {
        if (element.hasAttribute(attr) || typeof element[attr] === 'function') {
          return true;
        }
      }
    } catch (e) {
      // If checking listeners fails, rely on other checks
    }

    return false;
  }

  /**
   * Checks if an element is the topmost element at its position.
   */
  function isTopElement(element) {
    // Special case: when viewportExpansion is -1, consider all elements as "top" elements
    if (viewportExpansion === -1) {
      return true;
    }

    const rects = getCachedClientRects(element); // Replace element.getClientRects()

    if (!rects || rects.length === 0) {
      return false; // No geometry, cannot be top
    }

    let isAnyRectInViewport = false;
    for (const rect of rects) {
      // Use the same logic as isInExpandedViewport check
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        !(
          // Only check non-empty rects
          (
            rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion
          )
        )
      ) {
        isAnyRectInViewport = true;
        break;
      }
    }

    if (!isAnyRectInViewport) {
      return false; // All rects are outside the viewport area
    }

    // Find the correct document context and root element
    let doc = element.ownerDocument;

    // If we're in an iframe, elements are considered top by default
    if (doc !== window.document) {
      return true;
    }

    // For shadow DOM, we need to check within its own root context
    const shadowRoot = element.getRootNode();
    if (shadowRoot instanceof ShadowRoot) {
      const centerX = rects[Math.floor(rects.length / 2)].left + rects[Math.floor(rects.length / 2)].width / 2;
      const centerY = rects[Math.floor(rects.length / 2)].top + rects[Math.floor(rects.length / 2)].height / 2;

      try {
        const topEl = shadowRoot.elementFromPoint(centerX, centerY);
        if (!topEl) return false;

        let current = topEl;
        while (current && current !== shadowRoot) {
          if (current === element) return true;
          current = current.parentElement;
        }
        return false;
      } catch (e) {
        return true;
      }
    }

    // For elements in viewport, check if they're topmost
    const centerX = rects[Math.floor(rects.length / 2)].left + rects[Math.floor(rects.length / 2)].width / 2;
    const centerY = rects[Math.floor(rects.length / 2)].top + rects[Math.floor(rects.length / 2)].height / 2;

    try {
      const topEl = document.elementFromPoint(centerX, centerY);
      if (!topEl) return false;

      let current = topEl;
      while (current && current !== document.documentElement) {
        if (current === element) return true;
        current = current.parentElement;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  /**
   * Checks if an element is within the expanded viewport.
   */
  function isInExpandedViewport(element, viewportExpansion) {
    if (viewportExpansion === -1) {
      return true;
    }

    const rects = element.getClientRects(); // Use getClientRects

    if (!rects || rects.length === 0) {
      // Fallback to getBoundingClientRect if getClientRects is empty,
      // useful for elements like <svg> that might not have client rects but have a bounding box.
      const boundingRect = getCachedBoundingRect(element);
      if (!boundingRect || boundingRect.width === 0 || boundingRect.height === 0) {
        return false;
      }
      return !(
        boundingRect.bottom < -viewportExpansion ||
        boundingRect.top > window.innerHeight + viewportExpansion ||
        boundingRect.right < -viewportExpansion ||
        boundingRect.left > window.innerWidth + viewportExpansion
      );
    }

    // Check if *any* client rect is within the viewport
    for (const rect of rects) {
      if (rect.width === 0 || rect.height === 0) continue; // Skip empty rects

      if (
        !(
          rect.bottom < -viewportExpansion ||
          rect.top > window.innerHeight + viewportExpansion ||
          rect.right < -viewportExpansion ||
          rect.left > window.innerWidth + viewportExpansion
        )
      ) {
        return true; // Found at least one rect in the viewport
      }
    }

    return false; // No rects were found in the viewport
  }

  // Add these helper functions at the top level
  function isInteractiveCandidate(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const tagName = element.tagName.toLowerCase();

    // Fast-path for common interactive elements
    const interactiveElements = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary', 'label']);

    if (interactiveElements.has(tagName)) return true;

    // Quick attribute checks without getting full lists
    const hasQuickInteractiveAttr =
      element.hasAttribute('onclick') ||
      element.hasAttribute('role') ||
      element.hasAttribute('tabindex') ||
      element.hasAttribute('aria-') ||
      element.hasAttribute('data-action') ||
      element.getAttribute('contenteditable') === 'true';

    return hasQuickInteractiveAttr;
  }

  // --- Define constants for distinct interaction check ---
  const DISTINCT_INTERACTIVE_TAGS = new Set([
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    'details',
    'label',
    'option',
  ]);
  const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'menuitem',
    'menuitemradio',
    'menuitemcheckbox',
    'radio',
    'checkbox',
    'tab',
    'switch',
    'slider',
    'spinbutton',
    'combobox',
    'searchbox',
    'textbox',
    'listbox',
    'option',
    'scrollbar',
  ]);

  /**
   * Checks if an element likely represents a distinct interaction
   * separate from its parent (if the parent is also interactive).
   */
  function isElementDistinctInteraction(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');

    // Check if it's an iframe - always distinct boundary
    if (tagName === 'iframe') {
      return true;
    }

    // Check tag name
    if (DISTINCT_INTERACTIVE_TAGS.has(tagName)) {
      return true;
    }
    // Check interactive roles
    if (role && INTERACTIVE_ROLES.has(role)) {
      return true;
    }
    // Check contenteditable
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      return true;
    }
    // Check for common testing/automation attributes
    if (element.hasAttribute('data-testid') || element.hasAttribute('data-cy') || element.hasAttribute('data-test')) {
      return true;
    }
    // Check for explicit onclick handler (attribute or property)
    if (element.hasAttribute('onclick') || typeof element.onclick === 'function') {
      return true;
    }

    // Check for other common interaction event listeners
    try {
      // Fallback: Check common event attributes
      const commonEventAttrs = [
        'onmousedown',
        'onmouseup',
        'onkeydown',
        'onkeyup',
        'onsubmit',
        'onchange',
        'oninput',
        'onfocus',
        'onblur',
      ];
      if (commonEventAttrs.some(attr => element.hasAttribute(attr))) {
        return true;
      }
    } catch (e) {
      // If checking listeners fails, rely on other checks
    }

    // Default to false: if it's interactive but doesn't match above,
    // assume it triggers the same action as the parent.
    return false;
  }
  // --- End distinct interaction check ---

  /**
   * Handles the logic for deciding whether to highlight an element and performing the highlight.
   */
  function handleHighlighting(nodeData, node, parentIframe, isParentHighlighted) {
    if (!nodeData.isInteractive) return false; // Not interactive, definitely don't highlight

    let shouldHighlight = false;
    if (!isParentHighlighted) {
      // Parent wasn't highlighted, this interactive node can be highlighted.
      shouldHighlight = true;
    } else {
      // Parent *was* highlighted. Only highlight this node if it represents a distinct interaction.
      if (isElementDistinctInteraction(node)) {
        shouldHighlight = true;
      } else {
        shouldHighlight = false;
      }
    }

    if (shouldHighlight) {
      // Check viewport status before assigning index and highlighting
      nodeData.isInViewport = isInExpandedViewport(node, viewportExpansion);

      // When viewportExpansion is -1, all interactive elements should get a highlight index
      // regardless of viewport status
      if (nodeData.isInViewport || viewportExpansion === -1) {
        nodeData.highlightIndex = highlightIndex++;

        if (doHighlightElements) {
          if (focusHighlightIndex >= 0) {
            if (focusHighlightIndex === nodeData.highlightIndex) {
              highlightElement(node, nodeData.highlightIndex, parentIframe);
            }
          } else {
            highlightElement(node, nodeData.highlightIndex, parentIframe);
          }
          return true; // Successfully highlighted
        }
      }
    }

    return false; // Did not highlight
  }

  /**
   * Creates a node data object for a given node and its descendants.
   */
  function buildDomTree(node, parentIframe = null, isParentHighlighted = false) {
    // Fast rejection checks first
    if (
      !node ||
      node.id === HIGHLIGHT_CONTAINER_ID ||
      (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE)
    ) {
      return null;
    }

    if (!node || node.id === HIGHLIGHT_CONTAINER_ID) {
      return null;
    }

    // Special handling for root node (body)
    if (node === document.body) {
      const nodeData = {
        tagName: 'body',
        attributes: {},
        xpath: '/body',
        children: [],
      };

      // Process children of body
      for (const child of node.childNodes) {
        const domElement = buildDomTree(child, parentIframe, false); // Body's children have no highlighted parent initially
        if (domElement) nodeData.children.push(domElement);
      }

      const id = `${ID.current++}`;
      DOM_HASH_MAP[id] = nodeData;
      return id;
    }

    // Early bailout for non-element nodes except text
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    // Process text nodes (skip for now - focus on interactive elements)
    if (node.nodeType === Node.TEXT_NODE) {
      return null;
    }

    // Quick checks for element nodes
    if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
      return null;
    }

    // Early viewport check - only filter out elements clearly outside viewport
    if (viewportExpansion !== -1) {
      const rect = getCachedBoundingRect(node);
      const style = getCachedComputedStyle(node);

      // Skip viewport check for fixed/sticky elements as they may appear anywhere
      const isFixedOrSticky = style && (style.position === 'fixed' || style.position === 'sticky');

      // Check if element has actual dimensions using offsetWidth/Height (quick check)
      const hasSize = node.offsetWidth > 0 || node.offsetHeight > 0;

      // Use getBoundingClientRect for the quick OUTSIDE check.
      if (
        !rect ||
        (!isFixedOrSticky &&
          !hasSize &&
          (rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion))
      ) {
        return null;
      }
    }

    // Process element node
    const nodeData = {
      tagName: node.tagName.toLowerCase(),
      attributes: {},
      xpath: getXPathTree(node, true),
      children: [],
    };

    // Get attributes for interactive elements or potential text containers
    if (
      isInteractiveCandidate(node) ||
      node.tagName.toLowerCase() === 'iframe' ||
      node.tagName.toLowerCase() === 'body'
    ) {
      const attributeNames = node.getAttributeNames?.() || [];
      for (const name of attributeNames) {
        nodeData.attributes[name] = node.getAttribute(name);
      }
    }

    let nodeWasHighlighted = false;
    // Perform visibility, interactivity, and highlighting checks
    if (node.nodeType === Node.ELEMENT_NODE) {
      nodeData.isVisible = isElementVisible(node);
      if (nodeData.isVisible) {
        nodeData.isTopElement = isTopElement(node);
        if (nodeData.isTopElement) {
          nodeData.isInteractive = isInteractiveElement(node);
          // Call the dedicated highlighting function
          nodeWasHighlighted = handleHighlighting(nodeData, node, parentIframe, isParentHighlighted);
        }
      }
    }

    // Process children, with special handling for iframes
    if (node.tagName) {
      const tagName = node.tagName.toLowerCase();

      // Handle iframes
      if (tagName === 'iframe') {
        try {
          const iframeDoc = node.contentDocument || node.contentWindow?.document;
          if (iframeDoc) {
            for (const child of iframeDoc.childNodes) {
              const domElement = buildDomTree(child, node, false);
              if (domElement) nodeData.children.push(domElement);
            }
          }
        } catch (e) {
          console.warn('Unable to access iframe:', e);
        }
      }
      // Handle rich text editors and contenteditable elements
      else if (
        node.isContentEditable ||
        node.getAttribute('contenteditable') === 'true' ||
        node.id === 'tinymce' ||
        node.classList.contains('mce-content-body') ||
        (tagName === 'body' && node.getAttribute('data-id')?.startsWith('mce_'))
      ) {
        // Process all child nodes to capture formatted text
        for (const child of node.childNodes) {
          const domElement = buildDomTree(child, parentIframe, nodeWasHighlighted);
          if (domElement) nodeData.children.push(domElement);
        }
      } else {
        // Handle shadow DOM
        if (node.shadowRoot) {
          nodeData.shadowRoot = true;
          for (const child of node.shadowRoot.childNodes) {
            const domElement = buildDomTree(child, parentIframe, nodeWasHighlighted);
            if (domElement) nodeData.children.push(domElement);
          }
        }
        // Handle regular elements
        for (const child of node.childNodes) {
          // Pass the highlighted status of the *current* node to its children
          const passHighlightStatusToChild = nodeWasHighlighted || isParentHighlighted;
          const domElement = buildDomTree(child, parentIframe, passHighlightStatusToChild);
          if (domElement) nodeData.children.push(domElement);
        }
      }
    }

    // Skip empty anchor tags
    if (nodeData.tagName === 'a' && nodeData.children.length === 0 && !nodeData.attributes.href) {
      return null;
    }

    const id = `${ID.current++}`;
    DOM_HASH_MAP[id] = nodeData;
    return id;
  }

  const rootId = buildDomTree(document.body);

  // Clear the cache before starting
  DOM_CACHE.clearCache();

  return { rootId, map: DOM_HASH_MAP };
};

// Visual Agent wrapper around buildDomTree for compatibility
window.domAnalyzer = {
  highlightIndex: 0,
  currentElementMap: {},
  cachedPathHashes: null,
  
  // Initialize the DOM analyzer
  init() {
    this.cleanup();
    this.highlightIndex = 0;
    this.currentElementMap = {};
    this.cachedPathHashes = null;
  },
  
  // Create visual highlights using Chrome extension's buildDomTree
  visualize() {
    this.init();
    
    console.log('🔍 Using Chrome extension buildDomTree implementation');
    
    // Use Chrome extension's buildDomTree with highlighting enabled
    const result = window.buildDomTree({
      showHighlightElements: true,
      focusHighlightIndex: -1,
      viewportExpansion: 0,
      debugMode: false,
    });
    
    if (!result || !result.map) {
      console.warn('buildDomTree returned no results');
      return { totalElements: 0, elementMap: {} };
    }
    
    // Convert buildDomTree result to our format and build element map
    const elementMap = {};
    let elementCount = 0;
    
    const processNode = (nodeId, nodeData) => {
      if (nodeData && typeof nodeData.highlightIndex === 'number') {
        // Find the actual DOM element
        const element = this.findElementByXPath(nodeData.xpath);
        if (element) {
          const index = nodeData.highlightIndex;
          this.currentElementMap[index] = element;
          
          elementMap[index] = {
            tagName: nodeData.tagName,
            id: nodeData.attributes?.id || '',
            className: nodeData.attributes?.class || '',
            textContent: element.textContent?.trim().substring(0, 100) || '',
            boundingRect: element.getBoundingClientRect()
          };
          elementCount++;
        }
      }
      
      // Process children recursively
      if (nodeData.children) {
        nodeData.children.forEach(childId => {
          const childData = result.map[childId];
          if (childData) {
            processNode(childId, childData);
          }
        });
      }
    };
    
    // Process the DOM tree starting from root
    if (result.rootId) {
      processNode(result.rootId, result.map[result.rootId]);
    }
    
    console.log(`🔍 Found ${elementCount} interactive elements with buildDomTree`);
    
    return {
      totalElements: elementCount,
      elementMap: elementMap
    };
  },
  
  // Helper to find element by XPath
  findElementByXPath(xpath) {
    if (!xpath) return null;
    
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch (error) {
      console.warn('XPath evaluation failed:', xpath, error);
      return null;
    }
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
  
  // Clean up all highlights
  cleanup() {
    const container = document.getElementById('playwright-highlight-container');
    if (container) {
      container.remove();
    }
  },
  
  // Stub methods for compatibility (using buildDomTree now)
  calcBranchPathHashSet() {
    return new Set();
  },
  
  hasObstructionOccurred() {
    return false;
  },
  
  hasAutocompleteAppeared() {
    return false;
  }
};

// Browser action functions - all embedded in content script for persistence
function performBrowserAction(action, params) {
  console.log(`⚡ Performing browser action: ${action}`, params);
  
  // Check if this is an indexed action (requires reanalysis)
  const indexedActions = ['clickElement', 'inputText', 'getDropdownOptions', 'selectDropdownOption'];
  const isIndexedAction = indexedActions.includes(action) && params.index !== undefined;
  
  // DOM reanalysis logic (copied from Chrome extension)
  if (isIndexedAction) {
    console.log('🔄 Indexed action detected, checking DOM state...');
    
    // Only check if DOM analyzer is available and has been run
    if (window.domAnalyzer && window.domAnalyzer.cachedPathHashes) {
      // Check for autocomplete first
      if (window.domAnalyzer.hasAutocompleteAppeared()) {
        console.log('🎯 SEQUENCE BREAK: Autocomplete detected, stopping action');
        return {
          success: false,
          error: 'Autocomplete appeared, DOM changed - re-analyze needed',
          reanalysisNeeded: true,
          action: action
        };
      }
      
      // Check for DOM obstruction
      if (window.domAnalyzer.hasObstructionOccurred()) {
        console.log('🚧 OBSTRUCTION: DETECTED - DOM changed, need reanalysis');
        return {
          success: false,
          error: 'DOM changed, re-analyze needed',
          reanalysisNeeded: true,
          action: action
        };
      }
      
      console.log('🚧 OBSTRUCTION: NONE - Continuing with action');
    } else {
      console.log('🔄 DOM analyzer not available or not initialized, skipping checks');
    }
  }
  
  // Action implementations
  try {
    switch (action) {
      case 'clickElement':
        return clickElementByIndex(params.index);
      case 'inputText':
        return inputTextToElement(params.index, params.text);
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

// Input text to element
function inputTextToElement(index, text) {
  console.log(`⌨️ Attempting to input text "${text}" into element with index: ${index}`);
  
  if (!text) {
    throw new Error('No text provided for input');
  }
  
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
  
  const isValidInput = element instanceof HTMLInputElement || 
                      element instanceof HTMLTextAreaElement ||
                      element.isContentEditable ||
                      element.getAttribute('contenteditable') === 'true';
  
  if (!isValidInput) {
    throw new Error(`Element at index ${index} (${element.tagName}) is not a valid input field`);
  }
  
  console.log(`📝 Inputting text into ${element.tagName} element`);
  
  element.focus();
  
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.select();
    element.value = text;
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    element.innerHTML = text;
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  
  console.log(`✅ Successfully input text: "${text}"`);
  
  return {
    success: true,
    message: `Input "${text}" into element at index ${index} (${element.tagName})`,
    element: {
      tagName: element.tagName,
      type: element.type || 'contenteditable',
      id: element.id || '',
      className: element.className || ''
    }
  };
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

console.log('✅ Visual Agent content script fully loaded with DOM analyzer and actions');