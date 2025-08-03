import { createLogger } from '@src/background/log';
import { DOMElementNode, type DOMState } from './views';
import { getClickableElements as _getClickableElements } from './service';

const logger = createLogger('DOMCache');

interface CachedDOMState {
  domState: DOMState;
  timestamp: number;
  tabId: number;
  url: string;
}

class DOMCache {
  private cache: Map<number, CachedDOMState> = new Map();
  private mutationObservers: Map<number, MutationObserver> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds cache TTL

  /**
   * Get cached DOM or build new one
   */
  async getClickableElements(
    tabId: number,
    url: string,
    showHighlightElements = true,
    focusElement = -1,
    viewportExpansion = 0,
    debugMode = false,
  ): Promise<DOMState | null> {
    const cached = this.cache.get(tabId);
    
    // Check if cache is valid
    if (cached && 
        cached.url === url && 
        Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info(`✅ Using cached DOM for tab ${tabId}`);
      return cached.domState;
    }

    // Build new DOM tree
    logger.info(`⏳ Building new DOM tree for tab ${tabId}`);
    try {
      const domState = await _getClickableElements(
        tabId,
        url,
        showHighlightElements,
        focusElement,
        viewportExpansion,
        debugMode
      );

      if (domState) {
        // Cache the result
        this.cache.set(tabId, {
          domState,
          timestamp: Date.now(),
          tabId,
          url
        });

        // Set up mutation observer for this tab
        this.setupMutationObserver(tabId);
      }

      return domState;
    } catch (error) {
      logger.error(`Failed to build DOM tree for tab ${tabId}:`, error);
      return null;
    }
  }

  /**
   * Set up mutation observer to invalidate cache on significant DOM changes
   */
  private async setupMutationObserver(tabId: number): Promise<void> {
    // Clean up existing observer
    this.cleanupMutationObserver(tabId);

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Check if observer already exists
          if ((window as any).__domCacheMutationObserver) {
            (window as any).__domCacheMutationObserver.disconnect();
          }

          let invalidationTimeout: number | null = null;

          const observer = new MutationObserver((mutations) => {
            const shouldInvalidate = mutations.some(mutation => {
              // Invalidate on structural changes
              if (mutation.type === 'childList' && mutation.addedNodes.length + mutation.removedNodes.length > 0) {
                return true;
              }
              
              // Invalidate on significant attribute changes
              if (mutation.type === 'attributes' && 
                  ['class', 'style', 'id', 'href', 'disabled', 'hidden'].includes(mutation.attributeName || '')) {
                return true;
              }
              
              return false;
            });

            if (shouldInvalidate) {
              // Debounce invalidation to avoid too frequent updates
              if (invalidationTimeout) {
                clearTimeout(invalidationTimeout);
              }
              
              invalidationTimeout = window.setTimeout(() => {
                // DOM mutated significantly, sending invalidation message
                chrome.runtime.sendMessage({ 
                  type: 'DOM_CACHE_INVALIDATE',
                  tabId: chrome.devtools?.inspectedWindow?.tabId || 0
                }).catch(() => {
                  // Ignore errors if extension context is invalid
                });
              }, 500);
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'id', 'href', 'disabled', 'hidden']
          });

          (window as any).__domCacheMutationObserver = observer;
        }
      });
    } catch (error) {
      logger.warn(`Failed to set up mutation observer for tab ${tabId}:`, error);
    }
  }

  /**
   * Clean up mutation observer for a tab
   */
  private cleanupMutationObserver(tabId: number): void {
    const observer = this.mutationObservers.get(tabId);
    if (observer) {
      observer.disconnect();
      this.mutationObservers.delete(tabId);
    }
  }

  /**
   * Invalidate cache for a specific tab
   */
  invalidate(tabId: number): void {
    logger.info(`🗑️ Invalidating DOM cache for tab ${tabId}`);
    this.cache.delete(tabId);
    this.cleanupMutationObserver(tabId);
  }

  /**
   * Clear all cached DOM states
   */
  clear(): void {
    logger.info('🗑️ Clearing all DOM caches');
    this.cache.clear();
    this.mutationObservers.forEach(observer => observer.disconnect());
    this.mutationObservers.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; tabIds: number[] } {
    return {
      size: this.cache.size,
      tabIds: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const domCache = new DOMCache();

// Listen for invalidation messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'DOM_CACHE_INVALIDATE' && sender.tab?.id) {
    domCache.invalidate(sender.tab.id);
  }
});