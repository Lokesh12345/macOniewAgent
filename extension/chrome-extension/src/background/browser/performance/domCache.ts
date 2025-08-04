import { createLogger } from '../../log';
import { DOMElementNode, DOMTextNode } from '../dom/views';
import type { DOMState } from '../dom/views';
import type { PageState } from '../views';

const logger = createLogger('DOMCache');

export interface CacheEntry {
  /** Cached page state */
  state: PageState;
  /** Timestamp when cached */
  timestamp: number;
  /** URL hash for invalidation */
  urlHash: string;
  /** DOM tree hash for change detection */
  domHash: string;
  /** Expiry time in milliseconds */
  ttl: number;
  /** Access count for LRU */
  accessCount: number;
  /** Last access time for LRU */
  lastAccess: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalEntries: number;
  memoryUsage: number;
}

/**
 * Enhanced DOM Cache System
 * Provides intelligent caching with TTL, LRU eviction, and smart invalidation
 */
export class DOMCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalEntries: 0,
    memoryUsage: 0
  };

  private readonly maxEntries: number;
  private readonly defaultTTL: number;
  private readonly memoryThreshold: number;

  constructor(options: {
    maxEntries?: number;
    defaultTTL?: number;
    memoryThreshold?: number;
  } = {}) {
    this.maxEntries = options.maxEntries ?? 50;
    this.defaultTTL = options.defaultTTL ?? 30000; // 30 seconds
    this.memoryThreshold = options.memoryThreshold ?? 50 * 1024 * 1024; // 50MB
  }

  /**
   * Get cached state if valid
   */
  get(tabId: number, url: string, domSignature?: string): PageState | null {
    const key = this.generateKey(tabId, url);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL expiration
    if (Date.now() - entry.timestamp > entry.ttl) {
      logger.debug(`Cache entry expired for ${key}`);
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.totalEntries--;
      return null;
    }

    // Check URL hash for navigation changes
    const currentUrlHash = this.hashString(url);
    if (entry.urlHash !== currentUrlHash) {
      logger.debug(`URL changed for ${key}, invalidating cache`);
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.totalEntries--;
      return null;
    }

    // Check DOM signature if provided (for DOM change detection)
    if (domSignature && entry.domHash !== domSignature) {
      logger.debug(`DOM changed for ${key}, invalidating cache`);
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.totalEntries--;
      return null;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    entry.lastAccess = Date.now();

    this.stats.hits++;
    logger.debug(`Cache hit for ${key} (${this.stats.hits}/${this.stats.hits + this.stats.misses})`);
    
    return this.deepCloneState(entry.state);
  }

  /**
   * Store state in cache with optional TTL override
   */
  set(
    tabId: number, 
    url: string, 
    state: PageState, 
    options: {
      ttl?: number;
      domSignature?: string;
    } = {}
  ): void {
    const key = this.generateKey(tabId, url);
    const now = Date.now();
    
    // Calculate memory usage estimate
    const stateSize = this.estimateStateSize(state);
    
    // Check memory threshold
    if (this.stats.memoryUsage + stateSize > this.memoryThreshold) {
      logger.debug('Memory threshold exceeded, performing cleanup');
      this.performMemoryCleanup();
    }

    // Check max entries limit
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      state: this.deepCloneState(state),
      timestamp: now,
      urlHash: this.hashString(url),
      domHash: options.domSignature || this.generateDOMHash(state.elementTree),
      ttl: options.ttl ?? this.defaultTTL,
      accessCount: 1,
      lastAccess: now
    };

    // Remove existing entry if present
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.stats.memoryUsage -= this.estimateStateSize(oldEntry.state);
    }

    this.cache.set(key, entry);
    this.stats.memoryUsage += stateSize;
    this.stats.totalEntries = this.cache.size;

    logger.debug(`Cached state for ${key} (TTL: ${entry.ttl}ms, Size: ${stateSize} bytes)`);
  }

  /**
   * Invalidate cache for specific tab/url
   */
  invalidate(tabId: number, url?: string): void {
    if (url) {
      const key = this.generateKey(tabId, url);
      const entry = this.cache.get(key);
      if (entry) {
        this.stats.memoryUsage -= this.estimateStateSize(entry.state);
        this.cache.delete(key);
        this.stats.totalEntries--;
        logger.debug(`Invalidated cache for ${key}`);
      }
    } else {
      // Invalidate all entries for tab
      const keysToDelete: string[] = [];
      for (const [key] of this.cache) {
        if (key.startsWith(`${tabId}:`)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        const entry = this.cache.get(key)!;
        this.stats.memoryUsage -= this.estimateStateSize(entry.state);
        this.cache.delete(key);
      }
      
      this.stats.totalEntries = this.cache.size;
      logger.debug(`Invalidated ${keysToDelete.length} cache entries for tab ${tabId}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalEntries: 0,
      memoryUsage: 0
    };
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Check if cache entry exists and is valid
   */
  has(tabId: number, url: string): boolean {
    const key = this.generateKey(tabId, url);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.totalEntries--;
      return false;
    }
    
    return true;
  }

  /**
   * Update cache TTL for existing entry
   */
  refreshTTL(tabId: number, url: string, newTTL?: number): boolean {
    const key = this.generateKey(tabId, url);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    entry.ttl = newTTL ?? this.defaultTTL;
    entry.timestamp = Date.now(); // Reset timestamp
    logger.debug(`Refreshed TTL for ${key} to ${entry.ttl}ms`);
    
    return true;
  }

  /**
   * Perform cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.stats.memoryUsage -= this.estimateStateSize(entry.state);
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    this.stats.totalEntries = this.cache.size;
    
    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }
    
    return cleanedCount;
  }

  /**
   * Generate cache key
   */
  private generateKey(tabId: number, url: string): string {
    return `${tabId}:${this.hashString(url)}`;
  }

  /**
   * Generate DOM hash for change detection
   */
  private generateDOMHash(elementTree: DOMElementNode): string {
    // Create a lightweight hash based on structure
    const structure = this.extractDOMStructure(elementTree);
    return this.hashString(JSON.stringify(structure));
  }

  /**
   * Extract lightweight DOM structure for hashing
   */
  private extractDOMStructure(element: DOMElementNode): any {
    return {
      tag: element.tagName,
      clickable: element.highlightIndex !== null,
      childCount: element.children.length,
      children: element.children
        .filter(child => child instanceof DOMElementNode)
        .slice(0, 5) // Only hash first 5 children to avoid deep recursion
        .map(child => this.extractDOMStructure(child as DOMElementNode))
    };
  }

  /**
   * Hash string using simple hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Estimate memory usage of state object
   */
  private estimateStateSize(state: PageState): number {
    // Rough estimation based on JSON serialization size
    try {
      const serialized = JSON.stringify({
        url: state.url,
        title: state.title,
        elementCount: state.selectorMap.size,
        hasScreenshot: !!state.screenshot
      });
      // Multiply by 2 to account for DOM tree structure overhead
      return serialized.length * 2 + (state.screenshot ? 1024 * 100 : 0); // Screenshot ~100KB
    } catch {
      return 10000; // Fallback estimate
    }
  }

  /**
   * Deep clone state to prevent mutations
   */
  private deepCloneState(state: PageState): PageState {
    return {
      ...state,
      elementTree: this.cloneDOMElement(state.elementTree),
      selectorMap: new Map(state.selectorMap),
      screenshot: state.screenshot // Keep reference (immutable)
    };
  }

  /**
   * Clone DOM element recursively
   */
  private cloneDOMElement(element: DOMElementNode): DOMElementNode {
    const cloned = new DOMElementNode({
      tagName: element.tagName,
      isVisible: element.isVisible,
      parent: null, // Will be set by parent
      xpath: element.xpath,
      attributes: { ...element.attributes },
      children: [],
      isInteractive: element.isInteractive,
      isTopElement: element.isTopElement,
      isInViewport: element.isInViewport,
      shadowRoot: element.shadowRoot,
      highlightIndex: element.highlightIndex,
      viewportCoordinates: element.viewportCoordinates,
      pageCoordinates: element.pageCoordinates,
      viewportInfo: element.viewportInfo,
      isNew: element.isNew
    });
    
    // Clone children
    for (const child of element.children) {
      if (child instanceof DOMElementNode) {
        const clonedChild = this.cloneDOMElement(child);
        clonedChild.parent = cloned;
        cloned.children.push(clonedChild);
      } else if (child instanceof DOMTextNode) {
        const clonedText = new DOMTextNode(child.text, child.isVisible, cloned);
        cloned.children.push(clonedText);
      }
    }
    
    return cloned;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      const entry = this.cache.get(lruKey)!;
      this.stats.memoryUsage -= this.estimateStateSize(entry.state);
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.stats.totalEntries--;
      logger.debug(`Evicted LRU entry: ${lruKey}`);
    }
  }

  /**
   * Perform memory cleanup by removing least accessed entries
   */
  private performMemoryCleanup(): void {
    const targetSize = this.memoryThreshold * 0.7; // Clean to 70% of threshold
    
    // Sort entries by access count and age
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => {
        const scoreA = a.accessCount / (Date.now() - a.lastAccess + 1);
        const scoreB = b.accessCount / (Date.now() - b.lastAccess + 1);
        return scoreA - scoreB; // Lower score = more likely to evict
      });
    
    let freedMemory = 0;
    let cleanedCount = 0;
    
    for (const [key, entry] of entries) {
      if (this.stats.memoryUsage - freedMemory <= targetSize) break;
      
      const entrySize = this.estimateStateSize(entry.state);
      this.cache.delete(key);
      freedMemory += entrySize;
      cleanedCount++;
    }
    
    this.stats.memoryUsage -= freedMemory;
    this.stats.evictions += cleanedCount;
    this.stats.totalEntries = this.cache.size;
    
    logger.debug(`Memory cleanup: freed ${freedMemory} bytes, removed ${cleanedCount} entries`);
  }
}

// Global DOM cache instance
export const domCache = new DOMCache({
  maxEntries: 50,
  defaultTTL: 30000, // 30 seconds
  memoryThreshold: 50 * 1024 * 1024 // 50MB
});

// Cleanup expired entries every 60 seconds
setInterval(() => {
  domCache.cleanup();
}, 60000);