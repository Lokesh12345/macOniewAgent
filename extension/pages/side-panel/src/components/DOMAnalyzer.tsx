import { useState, useEffect, useCallback } from 'react';
import { MdSearch, MdRefresh, MdVisibility, MdVisibilityOff, MdClear, MdPlayArrow } from 'react-icons/md';

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
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [actionParams, setActionParams] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);

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

  // Render action parameter inputs based on selected action
  const renderActionParams = useCallback(() => {
    switch (selectedAction) {
      case 'input_text':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Text to input"
              value={actionParams.text || ''}
              onChange={(e) => setActionParams({ ...actionParams, text: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
            <input
              type="text"
              placeholder="Intent (optional)"
              value={actionParams.intent || ''}
              onChange={(e) => setActionParams({ ...actionParams, intent: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'select_dropdown_option':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Option text to select"
              value={actionParams.text || ''}
              onChange={(e) => setActionParams({ ...actionParams, text: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'scroll_to_percent':
        return (
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Y Percent (0-100)"
              min="0"
              max="100"
              value={actionParams.yPercent || ''}
              onChange={(e) => setActionParams({ ...actionParams, yPercent: parseInt(e.target.value) })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'scroll_to_text':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Text to scroll to"
              value={actionParams.text || ''}
              onChange={(e) => setActionParams({ ...actionParams, text: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
            <input
              type="number"
              placeholder="Nth occurrence (default: 1)"
              min="1"
              value={actionParams.nth || ''}
              onChange={(e) => setActionParams({ ...actionParams, nth: parseInt(e.target.value) })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'go_to_url':
      case 'open_tab':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="URL"
              value={actionParams.url || ''}
              onChange={(e) => setActionParams({ ...actionParams, url: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'search_google':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search query"
              value={actionParams.query || ''}
              onChange={(e) => setActionParams({ ...actionParams, query: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'switch_tab':
      case 'close_tab':
        return (
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Tab ID"
              value={actionParams.tab_id || ''}
              onChange={(e) => setActionParams({ ...actionParams, tab_id: parseInt(e.target.value) })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'send_keys':
        return (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Keys to send (e.g., Tab, Enter, Escape)"
              value={actionParams.keys || ''}
              onChange={(e) => setActionParams({ ...actionParams, keys: e.target.value })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'wait':
        return (
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Seconds to wait"
              min="1"
              value={actionParams.seconds || ''}
              onChange={(e) => setActionParams({ ...actionParams, seconds: parseInt(e.target.value) })}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'cache_content':
        return (
          <div className="space-y-2">
            <textarea
              placeholder="Content to cache"
              value={actionParams.content || ''}
              onChange={(e) => setActionParams({ ...actionParams, content: e.target.value })}
              rows={3}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          </div>
        );
      
      case 'done':
        return (
          <div className="space-y-2">
            <textarea
              placeholder="Completion message"
              value={actionParams.text || ''}
              onChange={(e) => setActionParams({ ...actionParams, text: e.target.value })}
              rows={2}
              className={`w-full px-3 py-1 rounded-md border text-sm ${
                isDarkMode
                  ? 'bg-slate-800 border-sky-700 text-sky-200 placeholder-sky-400'
                  : 'bg-white border-sky-300 text-gray-800 placeholder-gray-500'
              } focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
            <label className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-sky-300' : 'text-gray-600'}`}>
              <input
                type="checkbox"
                checked={actionParams.success !== false}
                onChange={(e) => setActionParams({ ...actionParams, success: e.target.checked })}
                className="rounded"
              />
              Success
            </label>
          </div>
        );
      
      // Actions that only need index (already set)
      case 'click_element':
      case 'get_dropdown_options':
      case 'go_back':
      case 'go_forward':
      case 'refresh':
      case 'scroll_to_top':
      case 'scroll_to_bottom':
      case 'previous_page':
      case 'next_page':
      case 'mouse_click':
      case 'mouse_event':
      case 'mouse_sequence':
      case 'focus_click':
      case 'pointer_event':
        return (
          <div className={`text-sm ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>
            No additional parameters needed
          </div>
        );
      
      default:
        return null;
    }
  }, [selectedAction, actionParams, isDarkMode]);

  // Execute the selected action
  const executeAction = useCallback(async () => {
    if (!selectedAction) return;
    
    setIsExecuting(true);
    setError(null);
    
    try {
      // Send message to background script to execute action
      const port = chrome.runtime.connect({ name: 'dom-analyzer' });
      
      port.postMessage({
        type: 'execute_action',
        action: selectedAction,
        params: actionParams
      });
      
      // Listen for response
      port.onMessage.addListener((response) => {
        if (response.type === 'action_result') {
          if (response.success) {
            // Refresh DOM after action
            analyzeDom();
          } else {
            setError(response.error || 'Action failed');
          }
          setIsExecuting(false);
          port.disconnect();
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        setIsExecuting(false);
        setError('Action timed out');
        port.disconnect();
      }, 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute action');
      setIsExecuting(false);
    }
  }, [selectedAction, actionParams, analyzeDom]);

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

      {/* Error or Executing Status */}
      {error && (
        <div className={`p-4 border-l-4 ${
          isDarkMode 
            ? 'bg-red-900/20 border-red-500 text-red-300' 
            : 'bg-red-50 border-red-400 text-red-700'
        }`}>
          <p>{error}</p>
        </div>
      )}
      
      {isExecuting && (
        <div className={`p-4 border-l-4 ${
          isDarkMode 
            ? 'bg-blue-900/20 border-blue-500 text-blue-300' 
            : 'bg-blue-50 border-blue-400 text-blue-700'
        }`}>
          <p className="flex items-center gap-2">
            <span className="animate-spin">⏳</span>
            Executing {selectedAction}...
          </p>
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
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}>
              Element Details
            </h3>
            
            {/* Action Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  // Set default params based on action
                  if (e.target.value && selectedElement.highlightIndex !== null) {
                    setActionParams({ index: selectedElement.highlightIndex });
                  }
                }}
                className={`px-3 py-1 rounded-md border text-sm ${
                  isDarkMode
                    ? 'bg-slate-700 border-sky-700 text-sky-200'
                    : 'bg-white border-sky-300 text-gray-700'
                } focus:outline-none focus:ring-1 focus:ring-sky-500`}
              >
                <option value="">Select Action</option>
                <optgroup label="Element Actions">
                  <option value="click_element">Click Element</option>
                  <option value="input_text">Input Text</option>
                  <option value="get_dropdown_options">Get Dropdown Options</option>
                  <option value="select_dropdown_option">Select Dropdown Option</option>
                </optgroup>
                <optgroup label="Mouse Events (Testing)">
                  <option value="mouse_click">Mouse Click (Synthetic)</option>
                  <option value="mouse_event">Mouse Event (Dispatched)</option>
                  <option value="mouse_sequence">Mouse Down+Up+Click</option>
                  <option value="focus_click">Focus + Click</option>
                  <option value="pointer_event">Pointer Event</option>
                </optgroup>
                <optgroup label="Scroll Actions">
                  <option value="scroll_to_percent">Scroll to Percent</option>
                  <option value="scroll_to_top">Scroll to Top</option>
                  <option value="scroll_to_bottom">Scroll to Bottom</option>
                  <option value="previous_page">Previous Page</option>
                  <option value="next_page">Next Page</option>
                  <option value="scroll_to_text">Scroll to Text</option>
                </optgroup>
                <optgroup label="Navigation">
                  <option value="go_to_url">Go to URL</option>
                  <option value="go_back">Go Back</option>
                  <option value="go_forward">Go Forward</option>
                  <option value="refresh">Refresh Page</option>
                  <option value="search_google">Search Google</option>
                </optgroup>
                <optgroup label="Tab Actions">
                  <option value="open_tab">Open Tab</option>
                  <option value="switch_tab">Switch Tab</option>
                  <option value="close_tab">Close Tab</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="send_keys">Send Keys</option>
                  <option value="wait">Wait</option>
                  <option value="cache_content">Cache Content</option>
                  <option value="done">Done</option>
                </optgroup>
              </select>
              
              <button
                onClick={() => executeAction()}
                disabled={!selectedAction || isExecuting}
                className={`p-2 rounded-md transition-colors flex items-center gap-1 ${
                  selectedAction && !isExecuting
                    ? isDarkMode
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                    : isDarkMode
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                title="Execute action"
              >
                <MdPlayArrow size={16} />
                <span className="text-xs">Execute</span>
              </button>
            </div>
          </div>
          
          {/* Action Parameters */}
          {selectedAction && (
            <div className={`mb-3 p-3 rounded-md border ${isDarkMode ? 'bg-slate-700 border-sky-700' : 'bg-gray-50 border-sky-200'}`}>
              <h4 className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                Action Parameters
              </h4>
              {renderActionParams()}
            </div>
          )}
          
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
      
      {!selectedElement && (
        <div />
      )}
    </div>
  );
};

export default DOMAnalyzer;