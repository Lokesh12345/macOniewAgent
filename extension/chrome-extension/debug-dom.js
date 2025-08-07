// DEBUG DOM ANALYZER - Add this as a content script for Gmail debugging
console.log('🔧 DOM Debug UI Loaded');

// Create debug button
const debugButton = document.createElement('div');
debugButton.id = 'dom-debug-button';
debugButton.innerHTML = `
  <div style="
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 9999;
    background: #4285f4;
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-family: Arial;
    font-size: 12px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    user-select: none;
  ">
    🔍 ANALYZE DOM
  </div>
`;

// Add to page
document.body.appendChild(debugButton);

// Click handler
debugButton.addEventListener('click', () => {
  console.log('🔧 Starting DOM analysis...');
  
  // Trigger the buildDomTree function
  if (typeof window.buildDomTree === 'function') {
    try {
      const result = window.buildDomTree();
      console.log('🔧 DOM Analysis Result:', result);
      
      if (result && result.map) {
        const elements = Array.from(result.map.values());
        console.log(`🔧 Found ${elements.length} elements in DOM tree`);
        
        // Look for CC/BCC elements specifically
        const ccBccElements = elements.filter(el => {
          const text = (el.textContent || '').toLowerCase();
          const ariaLabel = (el.attributes?.['aria-label'] || '').toLowerCase();
          const role = el.attributes?.role || '';
          
          return text.includes('cc') || text.includes('bcc') || 
                 ariaLabel.includes('cc') || ariaLabel.includes('bcc') ||
                 ariaLabel.includes('recipients') || role === 'link';
        });
        
        console.log(`🔧 CC/BCC Related Elements Found: ${ccBccElements.length}`);
        ccBccElements.forEach((el, i) => {
          console.log(`  CC-${i+1}:`, {
            tagName: el.tagName,
            textContent: el.textContent?.substring(0, 50),
            ariaLabel: el.attributes?.['aria-label'],
            role: el.attributes?.role,
            className: el.attributes?.class,
            id: el.attributes?.id
          });
        });
        
      }
    } catch (error) {
      console.error('🔧 DOM Analysis Error:', error);
    }
  } else {
    console.error('🔧 buildDomTree function not found. Make sure the buildDomTree.js script is loaded.');
  }
  
  // Also check if extension data is available
  if (window.DEBUG_DOM_DATA) {
    console.log('🔧 Extension DOM Data:', window.DEBUG_DOM_DATA);
  } else {
    console.log('🔧 No extension DOM data available yet');
  }
});

console.log('🔧 Debug button added to page. Click "🔍 ANALYZE DOM" to analyze current page.');