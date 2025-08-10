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
    console.log('🕐 Visualize called at:', new Date().toISOString());
    console.log('🌐 Current URL:', window.location.href);
    
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
    
    // Cache DOM hashes after visualization for automatic reanalysis (Chrome extension logic)
    this.cachedPathHashes = this.calcBranchPathHashSet();
    console.log('🔍 DOM state cached with', this.cachedPathHashes.size, 'element hashes');
    
    // Start scroll detection to catch lazy loading and infinite scroll
    this.startScrollDetection();
    
    // Start intelligent SPA monitoring to detect delayed content loading
    this.startSPAMonitoring();
    
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
    console.log(`🔍 Looking for element at index ${index}`);
    console.log(`📊 Current element map has ${Object.keys(this.currentElementMap).length} elements`);
    console.log(`📊 Available indices: ${Object.keys(this.currentElementMap).join(', ')}`);
    
    const element = this.currentElementMap[index] || null;
    if (!element) {
      console.log(`❌ Element at index ${index} not found!`);
      console.log(`📊 Element map keys:`, Object.keys(this.currentElementMap));
    } else {
      console.log(`✅ Found element at index ${index}:`, element.tagName, element.className);
    }
    return element;
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
  
  // Navigation handling - clear state when page changes
  handleNavigation(url) {
    console.log('🔄 DOM Analyzer: Handling navigation to', url);
    this.stopScrollDetection(); // Stop scroll detection on navigation
    this.cleanup();
    this.init();
    this.cachedPathHashes = null;
    this.domChangedAfterInput = false;
  },
  
  // Scroll detection state
  scrollState: {
    lastScrollY: window.scrollY || 0,
    lastScrollHeight: document.documentElement.scrollHeight || 0,
    lastElementCount: 0,
    scrollTimeout: null,
    isDetectionActive: false
  },
  
  // Start scroll detection (called after visualization)
  startScrollDetection() {
    if (this.scrollState.isDetectionActive) return;
    
    console.log('📜 Starting scroll detection');
    this.scrollState.isDetectionActive = true;
    this.scrollState.lastScrollY = window.scrollY || 0;
    this.scrollState.lastScrollHeight = document.documentElement.scrollHeight || 0;
    this.scrollState.lastElementCount = Object.keys(this.currentElementMap).length;
    
    // Add scroll event listener with throttling
    window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
  },
  
  // Stop scroll detection
  stopScrollDetection() {
    console.log('📜 Stopping scroll detection');
    this.scrollState.isDetectionActive = false;
    window.removeEventListener('scroll', this.handleScroll.bind(this));
    
    if (this.scrollState.scrollTimeout) {
      clearTimeout(this.scrollState.scrollTimeout);
      this.scrollState.scrollTimeout = null;
    }
  },
  
  // Handle scroll events (throttled)
  handleScroll() {
    if (!this.scrollState.isDetectionActive) return;
    
    // Clear previous timeout
    if (this.scrollState.scrollTimeout) {
      clearTimeout(this.scrollState.scrollTimeout);
    }
    
    // Debounce scroll events - check for DOM changes 1 second after scrolling stops
    this.scrollState.scrollTimeout = setTimeout(() => {
      this.checkScrollBasedDOMChanges();
    }, 1000);
  },
  
  // Check if scroll caused DOM changes (lazy loading, infinite scroll, etc.)
  checkScrollBasedDOMChanges() {
    const currentScrollY = window.scrollY || 0;
    const currentScrollHeight = document.documentElement.scrollHeight || 0;
    const scrollDelta = Math.abs(currentScrollY - this.scrollState.lastScrollY);
    const heightDelta = currentScrollHeight - this.scrollState.lastScrollHeight;
    
    console.log('📜 Checking scroll-based DOM changes');
    console.log(`📊 Scroll delta: ${scrollDelta}px, Height delta: ${heightDelta}px`);
    
    // Significant scroll (>200px) or page height changed (new content loaded)
    if (scrollDelta > 200 || heightDelta > 100) {
      console.log('📜 Significant scroll detected, checking for new content');
      
      // Re-analyze to see if new interactive elements appeared
      const currentState = this.visualize();
      const newElementCount = currentState.totalElements;
      const elementDelta = newElementCount - this.scrollState.lastElementCount;
      
      console.log(`📊 Element count changed: ${this.scrollState.lastElementCount} → ${newElementCount} (Δ${elementDelta})`);
      
      // If new elements appeared, notify that reanalysis may be needed
      if (elementDelta > 0) {
        console.log('🚨 New elements appeared after scroll!');
        console.log(`🔄 ${elementDelta} new interactive elements detected`);
        
        // Send scroll-based DOM change event to background script
        chrome.runtime.sendMessage({
          type: 'scroll_dom_changed',
          data: {
            scrollDelta: scrollDelta,
            heightDelta: heightDelta,
            elementDelta: elementDelta,
            newElementCount: newElementCount,
            url: window.location.href,
            timestamp: Date.now()
          }
        }).catch(() => {
          // Background script might not be ready
          console.log('Failed to send scroll DOM change message');
        });
        
        // Update our tracking state
        this.scrollState.lastElementCount = newElementCount;
        this.cachedPathHashes = this.calcBranchPathHashSet(); // Update cached state
      }
      
      // Update scroll tracking state
      this.scrollState.lastScrollY = currentScrollY;
      this.scrollState.lastScrollHeight = currentScrollHeight;
    }
  },
  
  // SPA Stability Detection Engine - intelligent detection of when SPA content has finished loading
  stabilityEngine: {
    isActive: false,
    startTime: null,
    
    // Multi-signal monitoring
    signals: {
      domMutationRate: 0,
      networkActivity: 0,
      browserIdle: false,
      significantContentAdded: false
    },
    
    // Observers
    mutationObserver: null,
    performanceObserver: null,
    idleCallbackId: null,
    
    // Configuration
    config: {
      stabilityThreshold: 500, // ms of quiet time required
      maxWaitTime: 5000, // max ms to wait for stability
      mutationRateThreshold: 5, // mutations per second threshold
      significantElementThreshold: 3, // new elements to be considered significant
      checkInterval: 250 // how often to check stability
    },
    
    // Statistics tracking
    stats: {
      totalMutations: 0,
      totalNetworkRequests: 0,
      lastMutationTime: 0,
      lastNetworkTime: 0,
      initialElementCount: 0
    }
  },
  
  // Start intelligent SPA monitoring after visualization/navigation
  startSPAMonitoring() {
    if (this.stabilityEngine.isActive) {
      this.stopSPAMonitoring();
    }
    
    console.log('🧠 Starting intelligent SPA stability monitoring');
    
    const engine = this.stabilityEngine;
    engine.isActive = true;
    engine.startTime = performance.now();
    engine.stats.initialElementCount = Object.keys(this.currentElementMap).length;
    
    // Reset signals
    Object.keys(engine.signals).forEach(key => {
      engine.signals[key] = key === 'browserIdle' ? false : 0;
    });
    
    // Start DOM mutation monitoring
    this.startDOMMutationMonitoring();
    
    // Start network activity monitoring  
    this.startNetworkMonitoring();
    
    // Start browser idle detection
    this.startIdleDetection();
    
    // Start periodic stability checks
    this.startStabilityChecking();
  },
  
  // Stop all SPA monitoring
  stopSPAMonitoring() {
    console.log('🧠 Stopping SPA stability monitoring');
    
    const engine = this.stabilityEngine;
    engine.isActive = false;
    
    // Clean up observers
    if (engine.mutationObserver) {
      engine.mutationObserver.disconnect();
      engine.mutationObserver = null;
    }
    
    if (engine.performanceObserver) {
      engine.performanceObserver.disconnect();
      engine.performanceObserver = null;
    }
    
    if (engine.idleCallbackId) {
      cancelIdleCallback(engine.idleCallbackId);
      engine.idleCallbackId = null;
    }
    
    if (engine.checkIntervalId) {
      clearInterval(engine.checkIntervalId);
      engine.checkIntervalId = null;
    }
  },
  
  // Monitor DOM mutations with rate calculation
  startDOMMutationMonitoring() {
    const engine = this.stabilityEngine;
    
    engine.mutationObserver = new MutationObserver((mutations) => {
      const now = performance.now();
      engine.stats.totalMutations += mutations.length;
      engine.stats.lastMutationTime = now;
      
      // Check for significant content additions
      let significantAdditions = 0;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a significant container (has children or specific patterns)
              const isSignificant = node.children?.length > 2 || 
                                   node.classList?.length > 0 ||
                                   node.tagName?.toLowerCase() === 'section' ||
                                   node.tagName?.toLowerCase() === 'article' ||
                                   node.tagName?.toLowerCase() === 'aside';
              
              if (isSignificant) {
                significantAdditions++;
              }
            }
          });
        }
      });
      
      if (significantAdditions >= engine.config.significantElementThreshold) {
        engine.signals.significantContentAdded = true;
        console.log('🧠 Significant content added:', significantAdditions, 'new containers');
      }
    });
    
    // Observe entire document but with optimizations
    engine.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false, // Skip attribute changes for performance
      characterData: false // Skip text changes for performance
    });
  },
  
  // Monitor network activity via Performance API
  startNetworkMonitoring() {
    const engine = this.stabilityEngine;
    
    // Monitor resource loading
    if (window.PerformanceObserver) {
      engine.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.entryType === 'resource') {
            engine.stats.totalNetworkRequests++;
            engine.stats.lastNetworkTime = performance.now();
            engine.signals.networkActivity++;
            
            console.log('🧠 Network activity:', entry.name.split('/').pop(), 'loaded');
          }
        });
      });
      
      engine.performanceObserver.observe({
        entryTypes: ['resource', 'navigation']
      });
    }
  },
  
  // Detect browser idle state
  startIdleDetection() {
    const engine = this.stabilityEngine;
    
    const scheduleIdleCheck = () => {
      if (!engine.isActive) return;
      
      engine.idleCallbackId = requestIdleCallback((idleDeadline) => {
        if (idleDeadline.timeRemaining() > 10) {
          engine.signals.browserIdle = true;
        } else {
          engine.signals.browserIdle = false;
        }
        
        // Schedule next check
        setTimeout(scheduleIdleCheck, 100);
      }, { timeout: 100 });
    };
    
    scheduleIdleCheck();
  },
  
  // Periodic stability assessment
  startStabilityChecking() {
    const engine = this.stabilityEngine;
    
    engine.checkIntervalId = setInterval(() => {
      this.checkStability();
    }, engine.config.checkInterval);
  },
  
  // Assess if the page has reached stability
  checkStability() {
    const engine = this.stabilityEngine;
    
    if (!engine.isActive) return;
    
    const now = performance.now();
    const elapsed = now - engine.startTime;
    
    // Calculate mutation rate (mutations per second)
    const timeSinceLastMutation = now - engine.stats.lastMutationTime;
    const timeSinceLastNetwork = now - engine.stats.lastNetworkTime;
    
    const isDOMQuiet = timeSinceLastMutation > engine.config.stabilityThreshold;
    const isNetworkQuiet = timeSinceLastNetwork > engine.config.stabilityThreshold;
    const hasSignificantContent = engine.signals.significantContentAdded;
    const isOverMaxTime = elapsed > engine.config.maxWaitTime;
    
    console.log('🧠 Stability check:', {
      elapsed: Math.round(elapsed),
      domQuiet: isDOMQuiet,
      networkQuiet: isNetworkQuiet, 
      browserIdle: engine.signals.browserIdle,
      significantContent: hasSignificantContent,
      mutations: engine.stats.totalMutations,
      networkRequests: engine.stats.totalNetworkRequests
    });
    
    // Determine if stable
    const isStable = (isDOMQuiet && isNetworkQuiet && engine.signals.browserIdle) || isOverMaxTime;
    
    if (isStable) {
      console.log('🧠 Page stability achieved after', Math.round(elapsed), 'ms');
      
      // Check if new content was actually added
      if (hasSignificantContent || isOverMaxTime) {
        this.handleStabilityAchieved();
      } else {
        console.log('🧠 Stable but no significant content added');
        this.stopSPAMonitoring();
      }
    }
  },
  
  // Handle when stability is achieved with new content
  handleStabilityAchieved() {
    console.log('🧠 Stability achieved - checking for new elements');
    
    // Re-analyze to see if new interactive elements appeared
    const currentState = this.visualize();
    const newElementCount = currentState.totalElements;
    const initialCount = this.stabilityEngine.stats.initialElementCount;
    const elementDelta = newElementCount - initialCount;
    
    console.log(`🧠 Element analysis: ${initialCount} → ${newElementCount} (Δ${elementDelta})`);
    
    if (elementDelta > 0) {
      console.log('🚨 New elements found after SPA stability!');
      console.log(`🔄 ${elementDelta} new interactive elements detected`);
      
      // Send SPA content change event to background script
      chrome.runtime.sendMessage({
        type: 'spa_content_loaded',
        data: {
          elementDelta: elementDelta,
          newElementCount: newElementCount,
          stabilityTime: performance.now() - this.stabilityEngine.startTime,
          mutationCount: this.stabilityEngine.stats.totalMutations,
          networkRequests: this.stabilityEngine.stats.totalNetworkRequests,
          url: window.location.href,
          timestamp: Date.now()
        }
      }).catch(() => {
        console.log('Failed to send SPA content loaded message');
      });
      
      // Update cached state
      this.cachedPathHashes = this.calcBranchPathHashSet();
    }
    
    this.stopSPAMonitoring();
  },
  
  // Automatic reanalysis logic - exact copy from Chrome extension
  calcBranchPathHashSet() {
    if (!this.currentElementMap || Object.keys(this.currentElementMap).length === 0) {
      console.log('📊 No current elements for hash calculation');
      return new Set();
    }
    
    const hashes = new Set();
    
    // Hash all currently interactive elements (like Chrome extension)
    Object.values(this.currentElementMap).forEach(element => {
      try {
        if (element && element.isConnected) {
          // Simple hash based on element path and attributes (like Chrome extension)
          const tagName = element.tagName.toLowerCase();
          const id = element.id || '';
          const className = element.className || '';
          const xpath = this.getElementXPath(element);
          const hash = `${tagName}-${id}-${className}-${xpath}`;
          hashes.add(hash);
        }
      } catch (error) {
        console.warn('Failed to hash element:', error);
      }
    });
    
    console.log(`📊 Calculated ${hashes.size} element hashes`);
    return hashes;
  },
  
  // Check for DOM obstruction (EXACT Chrome extension logic with Set subset check)
  hasObstructionOccurred() {
    if (!this.cachedPathHashes) {
      console.log('🚧 OBSTRUCTION: No cached hashes, considering changed');
      return true;
    }
    
    const newPathHashes = this.calcBranchPathHashSet();
    
    // EXACT Chrome extension logic: !newPathHashes.isSubsetOf(cachedPathHashes)
    // Implement isSubsetOf: check if all new hashes exist in cached hashes
    const isSubsetOf = (newSet, cachedSet) => {
      for (const hash of newSet) {
        if (!cachedSet.has(hash)) {
          return false; // Found a new hash that wasn't cached
        }
      }
      return true; // All new hashes were in cached set
    };
    
    // Chrome extension condition: if new hashes are NOT a subset of cached hashes
    if (!isSubsetOf(newPathHashes, this.cachedPathHashes)) {
      console.log('🚧 OBSTRUCTION: DETECTED - Something new appeared (Chrome extension logic)');
      console.log('📊 Cached hashes:', this.cachedPathHashes.size);
      console.log('📊 New hashes:', newPathHashes.size);
      
      // Log what's new (for debugging)
      const newHashes = [];
      for (const hash of newPathHashes) {
        if (!this.cachedPathHashes.has(hash)) {
          newHashes.push(hash.substring(0, 50) + '...');
        }
      }
      console.log('🔍 New elements detected:', newHashes.slice(0, 3));
      
      return true;
    }
    
    console.log('🚧 OBSTRUCTION: NONE - DOM unchanged (subset check passed)');
    return false;
  },
  
  // Dynamic autocomplete detection - NO HARDCODED SELECTORS (Chrome extension approach)
  hasAutocompleteAppeared() {
    // Chrome extension approach: Don't hardcode autocomplete detection
    // Instead, rely on the dynamic DOM hash comparison in hasObstructionOccurred()
    // Autocomplete elements will be detected as "new elements" automatically
    return false; // Let hasObstructionOccurred() handle all dynamic changes
  },
  
  // Helper method for XPath (reused from old implementation)
  getElementXPath(element) {
    if (!element) return '';
    
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
  }
};

// Browser action functions - all embedded in content script for persistence
// Make it globally accessible for chrome.scripting.executeScript
window.performBrowserAction = async function performBrowserAction(action, params) {
  console.log(`⚡ Performing browser action: ${action}`, params);
  
  // Check if this is an indexed action (requires reanalysis) - exact Chrome extension logic
  const indexedActions = ['clickElement', 'inputText', 'getDropdownOptions', 'selectDropdownOption'];
  const isIndexedAction = indexedActions.includes(action) && params.index !== undefined;
  
  // DOM reanalysis logic - EXACT COPY from Chrome extension (dynamic approach)
  if (isIndexedAction) {
    console.log('🔄 Indexed action detected, checking DOM state...');
    
    // Only check if DOM analyzer is available and has been run
    if (window.domAnalyzer && window.domAnalyzer.cachedPathHashes) {
      // Check if DOM changed after previous input action
      if (window.domAnalyzer.domChangedAfterInput) {
        console.log('🚨 DOM changed after previous input - need reanalysis!');
        window.domAnalyzer.domChangedAfterInput = false; // Reset flag
        return {
          success: false,
          error: 'DOM changed after input (autocomplete/suggestions appeared)',
          reanalysisNeeded: true,
          action: action,
          message: 'Autocomplete appeared'
        };
      }
      
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
  
  // Action implementations - inputText is now async
  try {
    switch (action) {
      case 'clickElement':
        return clickElementByIndex(params.index);
      case 'inputText':
        // Wait for the async inputText to complete
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
};

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
  
  // Store initial DOM state before waiting - count interactive elements
  const initialElementCount = window.domAnalyzer ? Object.keys(window.domAnalyzer.currentElementMap).length : 0;
  console.log(`📊 Initial interactive element count: ${initialElementCount}`);
  
  // Return a promise that resolves after checking for DOM changes
  // This ensures we wait for DOM changes before proceeding
  return new Promise((resolve) => {
    // Wait for DOM to update (autocomplete, etc.) then check for changes
    setTimeout(() => {
      console.log('⏱️ Checking for DOM changes after input...');
      
      let domChanged = false;
      
      if (window.domAnalyzer) {
        // Re-analyze the DOM to get current state
        const currentState = window.domAnalyzer.visualize();
        const newElementCount = currentState.totalElements;
        
        console.log(`📊 New interactive element count: ${newElementCount}`);
        console.log(`📊 Element count difference: ${newElementCount - initialElementCount}`);
        
        // If more interactive elements appeared, DOM changed (autocomplete)
        if (newElementCount > initialElementCount) {
          console.log('🚨 DOM CHANGED after input! New interactive elements appeared');
          console.log(`🔄 ${newElementCount - initialElementCount} new elements detected (likely autocomplete)`);
          domChanged = true;
          
          // Mark that DOM has changed so next action will know to reanalyze
          window.domAnalyzer.domChangedAfterInput = true;
        } else {
          console.log('✅ DOM stable after input - no new interactive elements');
          window.domAnalyzer.domChangedAfterInput = false;
        }
      }
      
      // Resolve with the result including DOM change status
      resolve({
        success: true,
        message: `Input "${text}" into element at index ${index} (${element.tagName})`,
        element: {
          tagName: element.tagName,
          type: element.type || 'contenteditable',
          id: element.id || '',
          className: element.className || ''
        },
        // Include DOM change status in the response
        domChangedAfterInput: domChanged,
        checkForDomChanges: true
      });
    }, 700); // Wait 700ms for autocomplete to appear (slightly longer for safety)
  });
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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Content script received message:', message.type);
  
  switch (message.type) {
    case 'clear_dom_cache':
      console.log('🧹 Clearing DOM cache due to:', message.reason);
      console.log('🕐 Cache clear at:', new Date().toISOString());
      console.log('🌐 Current URL:', window.location.href);
      
      if (window.domAnalyzer) {
        console.log('📊 Elements before clear:', Object.keys(window.domAnalyzer.currentElementMap).length);
        
        if (message.reason === 'navigation') {
          window.domAnalyzer.handleNavigation(window.location.href);
        } else {
          window.domAnalyzer.cleanup();
          window.domAnalyzer.init();
          window.domAnalyzer.cachedPathHashes = null;
          window.domAnalyzer.domChangedAfterInput = false;
        }
        
        console.log('📊 Elements after clear:', Object.keys(window.domAnalyzer.currentElementMap).length);
      }
      sendResponse({ success: true });
      break;
      
    case 'check_ready':
      sendResponse({ 
        ready: true, 
        hasAnalyzer: !!window.domAnalyzer 
      });
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
  
  return true; // Keep message channel open for async response
});

console.log('✅ Visual Agent content script fully loaded with DOM analyzer and actions');