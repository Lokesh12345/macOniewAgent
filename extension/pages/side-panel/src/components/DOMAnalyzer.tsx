import { useState, useEffect, useCallback } from 'react';
import { MdSearch, MdRefresh, MdVisibility, MdVisibilityOff, MdClear } from 'react-icons/md';

interface DOMElement {
  highlightIndex: number | null;
  tagName: string;
  xpath: string | null;
  attributes: Record<string, string>;
  text: string;
  isVisible: boolean;
  isInteractive: boolean;
  isTopElement: boolean;
  isInViewport: boolean;
}

interface DOMAnalyzerProps {
  isDarkMode: boolean;
}

const DOMAnalyzer: React.FC<DOMAnalyzerProps> = ({ isDarkMode }) => {
  const [elements, setElements] = useState<DOMElement[]>([]);
  const [filteredElements, setFilteredElements] = useState<DOMElement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showHighlights, setShowHighlights] = useState(true);
  const [selectedElement, setSelectedElement] = useState<DOMElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze DOM elements using existing system
  const analyzeDom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      // Use the existing DOM analysis by calling buildDomTree directly
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (showHighlights: boolean) => {
          // Call the existing buildDomTree function
          if (typeof window.buildDomTree !== 'function') {
            throw new Error('buildDomTree not available');
          }
          
          const result = window.buildDomTree({
            showHighlightElements: showHighlights,
            focusHighlightIndex: -1,
            viewportExpansion: 0,
            debugMode: false,
          });
          
          if (!result || !result.map) {
            throw new Error('Failed to build DOM tree');
          }
          
          // Convert the DOM map to our format
          const elements: any[] = [];
          Object.entries(result.map).forEach(([id, nodeData]: [string, any]) => {
            if (nodeData.highlightIndex !== undefined && nodeData.highlightIndex !== null) {
              elements.push({
                highlightIndex: nodeData.highlightIndex,
                tagName: nodeData.tagName || 'unknown',
                xpath: nodeData.xpath || '',
                attributes: nodeData.attributes || {},
                text: nodeData.children ? 
                  extractTextFromChildren(nodeData, result.map) : '',
                isVisible: nodeData.isVisible || false,
                isInteractive: nodeData.isInteractive || false,
                isTopElement: nodeData.isTopElement || false,
                isInViewport: nodeData.isInViewport || false,
              });
            }
          });
          
          // Helper function to extract text from children
          function extractTextFromChildren(node: any, map: any): string {
            let text = '';
            if (node.children && Array.isArray(node.children)) {
              for (const childId of node.children) {
                const child = map[childId];
                if (child) {
                  if (child.type === 'TEXT_NODE' && child.text) {
                    text += child.text + ' ';
                  } else if (child.children) {
                    text += extractTextFromChildren(child, map);
                  }
                }
              }
            }
            return text.trim();
          }
          
          return elements.sort((a, b) => a.highlightIndex - b.highlightIndex);
        },
        args: [showHighlights],
      });

      const domElements = results[0]?.result || [];
      setElements(domElements);
      setFilteredElements(domElements);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to analyze DOM: ${errorMessage}`);
      setIsLoading(false);
    }
  }, [showHighlights]);

  // Filter elements based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredElements(elements);
      return;
    }

    const filtered = elements.filter(element => 
      element.tagName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      element.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.values(element.attributes).some(value => 
        value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    setFilteredElements(filtered);
  }, [elements, searchTerm]);

  // Highlight specific element using existing system
  const highlightElement = useCallback(async (highlightIndex: number) => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      // Use existing buildDomTree with focus on specific element
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (focusIndex: number) => {
          if (typeof window.buildDomTree === 'function') {
            window.buildDomTree({
              showHighlightElements: true,
              focusHighlightIndex: focusIndex,
              viewportExpansion: 0,
              debugMode: false,
            });
          }
        },
        args: [highlightIndex],
      });
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  }, []);

  // Clear all highlights using existing system
  const clearHighlights = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      // Remove highlights by calling cleanup function
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Remove the highlight container
          const container = document.getElementById('playwright-highlight-container');
          if (container) {
            container.remove();
          }
          
          // Call cleanup functions if available
          if (window._highlightCleanupFunctions) {
            window._highlightCleanupFunctions.forEach((fn: Function) => fn());
            window._highlightCleanupFunctions = [];
          }
        },
      });
    } catch (error) {
      console.error('Failed to clear highlights:', error);
    }
  }, []);

  // Copy element details to clipboard
  const copyElementDetails = useCallback((element: DOMElement) => {
    const details = {
      index: element.highlightIndex,
      tagName: element.tagName,
      xpath: element.xpath,
      attributes: element.attributes,
      text: element.text.substring(0, 100) + (element.text.length > 100 ? '...' : ''),
      properties: {
        isVisible: element.isVisible,
        isInteractive: element.isInteractive,
        isTopElement: element.isTopElement,
        isInViewport: element.isInViewport,
      }
    };
    
    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
  }, []);

  // Auto-analyze on component mount
  useEffect(() => {
    analyzeDom();
  }, [analyzeDom]);

  const getStatusIcon = (element: DOMElement) => {
    if (!element.isVisible) return '👻'; // Hidden
    if (!element.isInteractive) return '📄'; // Static
    if (!element.isTopElement) return '🔒'; // Behind other elements
    if (!element.isInViewport) return '👁️'; // Out of view
    return '✅'; // Fully accessible
  };

  const getStatusText = (element: DOMElement) => {
    if (!element.isVisible) return 'Hidden';
    if (!element.isInteractive) return 'Static';
    if (!element.isTopElement) return 'Behind';
    if (!element.isInViewport) return 'Out of view';
    return 'Accessible';
  };

  return (
    <div className={`h-full flex flex-col ${isDarkMode ? 'bg-slate-900 text-sky-200' : 'bg-white text-gray-800'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-sky-800' : 'border-sky-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}>
            DOM Analyzer
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHighlights(!showHighlights)}
              className={`p-2 rounded-md transition-colors ${
                isDarkMode 
                  ? 'bg-sky-700 hover:bg-sky-600 text-sky-200' 
                  : 'bg-sky-100 hover:bg-sky-200 text-sky-700'
              }`}
              title={showHighlights ? 'Hide highlights' : 'Show highlights'}
            >
              {showHighlights ? <MdVisibility size={16} /> : <MdVisibilityOff size={16} />}
            </button>
            <button
              onClick={clearHighlights}
              className={`p-2 rounded-md transition-colors ${
                isDarkMode 
                  ? 'bg-sky-700 hover:bg-sky-600 text-sky-200' 
                  : 'bg-sky-100 hover:bg-sky-200 text-sky-700'
              }`}
              title="Clear all highlights"
            >
              <MdClear size={16} />
            </button>
            <button
              onClick={analyzeDom}
              disabled={isLoading}
              className={`p-2 rounded-md transition-colors ${
                isDarkMode 
                  ? 'bg-sky-600 hover:bg-sky-500 text-white disabled:bg-sky-800' 
                  : 'bg-sky-500 hover:bg-sky-600 text-white disabled:bg-sky-300'
              }`}
              title="Refresh analysis"
            >
              <MdRefresh size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <MdSearch className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
            isDarkMode ? 'text-sky-400' : 'text-sky-500'
          }`} size={16} />
          <input
            type="text"
            placeholder="Search elements..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-md border transition-colors ${
              isDarkMode 
                ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400 focus:border-sky-500' 
                : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500 focus:border-sky-500'
            } focus:outline-none focus:ring-1 focus:ring-sky-500`}
          />
        </div>

        {/* Stats */}
        <div className={`mt-3 text-sm ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
          {elements.length > 0 && (
            <span>
              Showing {filteredElements.length} of {elements.length} elements
            </span>
          )}
          {isLoading && <span>Analyzing...</span>}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={`p-4 border-l-4 ${
          isDarkMode 
            ? 'bg-red-900/20 border-red-500 text-red-300' 
            : 'bg-red-50 border-red-400 text-red-700'
        }`}>
          <p>{error}</p>
        </div>
      )}

      {/* Elements List */}
      <div className="flex-1 overflow-y-auto">
        {filteredElements.length === 0 && !isLoading && !error ? (
          <div className={`p-8 text-center ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
            <p>No elements found. Click refresh to analyze the current page.</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredElements.map((element) => (
              <div
                key={element.highlightIndex}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedElement?.highlightIndex === element.highlightIndex
                    ? isDarkMode
                      ? 'bg-sky-900/50 border-sky-600'
                      : 'bg-sky-50 border-sky-400'
                    : isDarkMode
                      ? 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => {
                  setSelectedElement(element);
                  if (element.highlightIndex !== null) {
                    highlightElement(element.highlightIndex);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-1 rounded font-mono ${
                        isDarkMode ? 'bg-sky-800 text-sky-200' : 'bg-sky-100 text-sky-700'
                      }`}>
                        [{element.highlightIndex}]
                      </span>
                      <span className={`font-mono text-sm ${
                        isDarkMode ? 'text-sky-300' : 'text-sky-600'
                      }`}>
                        &lt;{element.tagName}&gt;
                      </span>
                      <span className="text-sm" title={getStatusText(element)}>
                        {getStatusIcon(element)}
                      </span>
                    </div>
                    
                    {element.text && (
                      <p className={`text-sm mb-2 line-clamp-2 ${
                        isDarkMode ? 'text-sky-200' : 'text-gray-700'
                      }`}>
                        {element.text.substring(0, 100)}{element.text.length > 100 ? '...' : ''}
                      </p>
                    )}

                    {Object.keys(element.attributes).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(element.attributes).slice(0, 3).map(([key, value]) => (
                          <span
                            key={key}
                            className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                              isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {key}="{value.substring(0, 20)}{value.length > 20 ? '...' : ''}"
                          </span>
                        ))}
                        {Object.keys(element.attributes).length > 3 && (
                          <span className={`text-xs ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                            +{Object.keys(element.attributes).length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyElementDetails(element);
                    }}
                    className={`ml-2 p-1 rounded text-xs transition-colors ${
                      isDarkMode 
                        ? 'hover:bg-sky-700 text-sky-400' 
                        : 'hover:bg-sky-200 text-sky-600'
                    }`}
                    title="Copy details"
                  >
                    📋
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Element Details */}
      {selectedElement && (
        <div className={`border-t p-4 ${isDarkMode ? 'border-sky-800 bg-slate-800' : 'border-sky-200 bg-gray-50'}`}>
          <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}>
            Element Details
          </h3>
          <div className={`text-xs space-y-1 ${isDarkMode ? 'text-sky-300' : 'text-gray-600'}`}>
            <div><strong>Index:</strong> {selectedElement.highlightIndex}</div>
            <div><strong>Tag:</strong> {selectedElement.tagName}</div>
            <div><strong>XPath:</strong> <code className="font-mono">{selectedElement.xpath}</code></div>
            <div><strong>Status:</strong> {getStatusText(selectedElement)}</div>
            {selectedElement.text && (
              <div><strong>Text:</strong> {selectedElement.text.substring(0, 200)}{selectedElement.text.length > 200 ? '...' : ''}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DOMAnalyzer;