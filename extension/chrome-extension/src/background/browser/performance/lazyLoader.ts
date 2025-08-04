import { createLogger } from '../../log';

const logger = createLogger('LazyLoader');

export interface LazyResource<T> {
  loader: () => Promise<T>;
  cache?: T;
  loading?: Promise<T>;
  loadedAt?: number;
  ttl?: number;
  priority: number;
}

export interface LazyStats {
  totalResources: number;
  loadedResources: number;
  cacheHits: number;
  cacheMisses: number;
  loadingTime: number;
  memoryUsage: number;
}

/**
 * Lazy Loading System
 * Only loads resources when needed, with intelligent caching
 */
export class LazyLoader {
  private resources = new Map<string, LazyResource<any>>();
  private loadQueue: string[] = [];
  private stats: LazyStats = {
    totalResources: 0,
    loadedResources: 0,
    cacheHits: 0,
    cacheMisses: 0,
    loadingTime: 0,
    memoryUsage: 0
  };

  private readonly maxConcurrentLoads: number;
  private readonly defaultTTL: number;
  private readonly memoryThreshold: number;
  private activeLoads = 0;

  constructor(options: {
    maxConcurrentLoads?: number;
    defaultTTL?: number;
    memoryThreshold?: number;
  } = {}) {
    this.maxConcurrentLoads = options.maxConcurrentLoads ?? 3;
    this.defaultTTL = options.defaultTTL ?? 300000; // 5 minutes
    this.memoryThreshold = options.memoryThreshold ?? 100 * 1024 * 1024; // 100MB
  }

  /**
   * Register a lazy resource
   */
  register<T>(
    key: string,
    loader: () => Promise<T>,
    options: {
      priority?: number;
      ttl?: number;
      preload?: boolean;
    } = {}
  ): void {
    const resource: LazyResource<T> = {
      loader,
      priority: options.priority ?? 0,
      ttl: options.ttl ?? this.defaultTTL
    };

    this.resources.set(key, resource);
    this.stats.totalResources = this.resources.size;

    logger.debug(`Registered lazy resource: ${key} (priority: ${resource.priority})`);

    // Preload if requested
    if (options.preload) {
      this.scheduleLoad(key);
    }
  }

  /**
   * Get resource, loading if necessary
   */
  async get<T>(key: string): Promise<T> {
    const resource = this.resources.get(key) as LazyResource<T> | undefined;
    
    if (!resource) {
      throw new Error(`Lazy resource not found: ${key}`);
    }

    // Check cache first
    if (resource.cache) {
      // Check TTL
      if (resource.loadedAt && resource.ttl) {
        const age = Date.now() - resource.loadedAt;
        if (age > resource.ttl) {
          logger.debug(`Resource ${key} expired, reloading`);
          delete resource.cache;
          delete resource.loadedAt;
        } else {
          this.stats.cacheHits++;
          logger.debug(`Cache hit for resource: ${key}`);
          return resource.cache;
        }
      } else {
        this.stats.cacheHits++;
        return resource.cache;
      }
    }

    // Check if already loading
    if (resource.loading) {
      logger.debug(`Resource ${key} already loading, waiting`);
      return await resource.loading;
    }

    this.stats.cacheMisses++;
    return await this.load(key);
  }

  /**
   * Load resource immediately
   */
  private async load<T>(key: string): Promise<T> {
    const resource = this.resources.get(key) as LazyResource<T>;
    if (!resource) {
      throw new Error(`Resource not found: ${key}`);
    }

    // Wait for available load slot
    while (this.activeLoads >= this.maxConcurrentLoads) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.activeLoads++;
    const startTime = Date.now();

    try {
      logger.debug(`Loading resource: ${key}`);
      
      // Create loading promise
      resource.loading = resource.loader();
      const result = await resource.loading;
      
      // Cache result
      resource.cache = result;
      resource.loadedAt = Date.now();
      delete resource.loading;

      const loadTime = Date.now() - startTime;
      this.stats.loadingTime += loadTime;
      this.stats.loadedResources++;

      // Update memory usage estimate
      this.updateMemoryUsage();

      // Check memory threshold
      if (this.stats.memoryUsage > this.memoryThreshold) {
        this.performMemoryCleanup();
      }

      logger.debug(`Loaded resource: ${key} in ${loadTime}ms`);
      return result;

    } catch (error) {
      delete resource.loading;
      logger.error(`Failed to load resource ${key}:`, error);
      throw error;
    } finally {
      this.activeLoads--;
    }
  }

  /**
   * Schedule resource for background loading
   */
  scheduleLoad(key: string): void {
    if (!this.resources.has(key)) {
      logger.warning(`Cannot schedule unknown resource: ${key}`);
      return;
    }

    if (!this.loadQueue.includes(key)) {
      this.loadQueue.push(key);
      this.processLoadQueue();
    }
  }

  /**
   * Process load queue in background
   */
  private async processLoadQueue(): Promise<void> {
    while (this.loadQueue.length > 0 && this.activeLoads < this.maxConcurrentLoads) {
      // Sort by priority
      this.loadQueue.sort((a, b) => {
        const resA = this.resources.get(a);
        const resB = this.resources.get(b);
        return (resB?.priority ?? 0) - (resA?.priority ?? 0);
      });

      const key = this.loadQueue.shift()!;
      const resource = this.resources.get(key);

      if (resource && !resource.cache && !resource.loading) {
        try {
          await this.load(key);
        } catch (error) {
          logger.warning(`Background load failed for ${key}:`, error);
        }
      }
    }
  }

  /**
   * Preload multiple resources
   */
  async preload(keys: string[]): Promise<void> {
    logger.debug(`Preloading ${keys.length} resources`);
    
    const loadPromises = keys
      .filter(key => this.resources.has(key))
      .map(key => this.get(key).catch(error => {
        logger.warning(`Preload failed for ${key}:`, error);
        return null;
      }));

    await Promise.allSettled(loadPromises);
    logger.debug('Preload completed');
  }

  /**
   * Check if resource is loaded
   */
  isLoaded(key: string): boolean {
    const resource = this.resources.get(key);
    return !!(resource?.cache);
  }

  /**
   * Check if resource is loading
   */
  isLoading(key: string): boolean {
    const resource = this.resources.get(key);
    return !!(resource?.loading);
  }

  /**
   * Get resource from cache only (no loading)
   */
  getFromCache<T>(key: string): T | null {
    const resource = this.resources.get(key) as LazyResource<T> | undefined;
    if (!resource?.cache) {
      return null;
    }

    // Check TTL
    if (resource.loadedAt && resource.ttl) {
      const age = Date.now() - resource.loadedAt;
      if (age > resource.ttl) {
        return null;
      }
    }

    this.stats.cacheHits++;
    return resource.cache;
  }

  /**
   * Invalidate resource cache
   */
  invalidate(key: string): void {
    const resource = this.resources.get(key);
    if (resource) {
      delete resource.cache;
      delete resource.loadedAt;
      logger.debug(`Invalidated resource: ${key}`);
    }
  }

  /**
   * Unregister resource
   */
  unregister(key: string): void {
    const resource = this.resources.get(key);
    if (resource) {
      this.resources.delete(key);
      
      // Remove from load queue
      const queueIndex = this.loadQueue.indexOf(key);
      if (queueIndex > -1) {
        this.loadQueue.splice(queueIndex, 1);
      }

      this.stats.totalResources = this.resources.size;
      logger.debug(`Unregistered resource: ${key}`);
    }
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    let totalMemory = 0;
    
    for (const resource of this.resources.values()) {
      if (resource.cache) {
        // Rough estimate based on JSON serialization
        try {
          const serialized = JSON.stringify(resource.cache);
          totalMemory += serialized.length * 2; // UTF-16 encoding
        } catch {
          totalMemory += 1000; // Fallback estimate
        }
      }
    }

    this.stats.memoryUsage = totalMemory;
  }

  /**
   * Perform memory cleanup
   */
  private performMemoryCleanup(): void {
    logger.debug('Performing memory cleanup');
    
    const now = Date.now();
    const resources = Array.from(this.resources.entries())
      .filter(([, resource]) => resource.cache)
      .sort(([, a], [, b]) => {
        // Sort by priority and age (lower priority + older = higher cleanup priority)
        const scoreA = (a.priority || 0) - (now - (a.loadedAt || 0)) / 1000;
        const scoreB = (b.priority || 0) - (now - (b.loadedAt || 0)) / 1000;
        return scoreA - scoreB;
      });

    // Remove lowest priority/oldest resources until under threshold
    const targetMemory = this.memoryThreshold * 0.7; // Clean to 70% of threshold
    let freedMemory = 0;
    let cleanedCount = 0;

    for (const [key, resource] of resources) {
      if (this.stats.memoryUsage - freedMemory <= targetMemory) break;

      if (resource.cache) {
        try {
          const size = JSON.stringify(resource.cache).length * 2;
          delete resource.cache;
          delete resource.loadedAt;
          freedMemory += size;
          cleanedCount++;
        } catch {
          delete resource.cache;
          delete resource.loadedAt;
          cleanedCount++;
        }
      }
    }

    this.updateMemoryUsage();
    logger.debug(`Memory cleanup: freed ~${freedMemory} bytes, cleaned ${cleanedCount} resources`);
  }

  /**
   * Get statistics
   */
  getStats(): LazyStats {
    this.updateMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Get resource info
   */
  getResourceInfo(): Array<{
    key: string;
    loaded: boolean;
    loading: boolean;
    priority: number;
    age?: number;
    size?: number;
  }> {
    const now = Date.now();
    const info: Array<{
      key: string;
      loaded: boolean;
      loading: boolean;
      priority: number;
      age?: number;
      size?: number;
    }> = [];

    for (const [key, resource] of this.resources) {
      const item = {
        key,
        loaded: !!resource.cache,
        loading: !!resource.loading,
        priority: resource.priority,
        age: resource.loadedAt ? now - resource.loadedAt : undefined,
        size: undefined as number | undefined
      };

      if (resource.cache) {
        try {
          item.size = JSON.stringify(resource.cache).length * 2;
        } catch {
          item.size = undefined;
        }
      }

      info.push(item);
    }

    return info;
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
    this.loadQueue.length = 0;
    this.stats = {
      totalResources: 0,
      loadedResources: 0,
      cacheHits: 0,
      cacheMisses: 0,
      loadingTime: 0,
      memoryUsage: 0
    };
    logger.debug('Cleared all lazy resources');
  }

  /**
   * Refresh expired resources
   */
  async refreshExpired(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, resource] of this.resources) {
      if (resource.cache && resource.loadedAt && resource.ttl) {
        const age = now - resource.loadedAt;
        if (age > resource.ttl) {
          expiredKeys.push(key);
        }
      }
    }

    if (expiredKeys.length > 0) {
      logger.debug(`Refreshing ${expiredKeys.length} expired resources`);
      
      // Invalidate and reload
      for (const key of expiredKeys) {
        this.invalidate(key);
        this.scheduleLoad(key);
      }
    }
  }

  /**
   * Set resource priority
   */
  setPriority(key: string, priority: number): void {
    const resource = this.resources.get(key);
    if (resource) {
      resource.priority = priority;
      logger.debug(`Updated priority for ${key}: ${priority}`);
    }
  }

  /**
   * Destroy lazy loader
   */
  destroy(): void {
    this.clear();
    logger.debug('Lazy loader destroyed');
  }
}

// Global lazy loader instance
export const lazyLoader = new LazyLoader({
  maxConcurrentLoads: 3,
  defaultTTL: 300000, // 5 minutes
  memoryThreshold: 100 * 1024 * 1024 // 100MB
});