import { createLogger } from '../../log';
import { domCache, type CacheStats as DOMCacheStats } from './domCache';
import { connectionPool, type PoolStats } from './connectionPool';
import { batchOperations, type BatchStats } from './batchOperations';
import { lazyLoader, type LazyStats } from './lazyLoader';
import type { PageState } from '../views';
import type { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser.js';
import type { Page as PuppeteerPage } from 'puppeteer-core/lib/esm/puppeteer/api/Page.js';

const logger = createLogger('PerformanceManager');

export interface PerformanceStats {
  dom: DOMCacheStats;
  connections: PoolStats;
  batch: BatchStats;
  lazy: LazyStats;
  overall: {
    memoryUsage: number;
    cacheHitRate: number;
    averageResponseTime: number;
    systemLoad: number;
  };
}

export interface PerformanceConfig {
  enableDOMCaching: boolean;
  enableConnectionPooling: boolean;
  enableBatchOperations: boolean;
  enableLazyLoading: boolean;
  memoryThreshold: number;
  cleanupInterval: number;
}

/**
 * Performance Manager
 * Central coordinator for all performance optimizations
 */
export class PerformanceManager {
  private config: PerformanceConfig;
  private cleanupInterval: NodeJS.Timeout;
  private metricsStartTime = Date.now();
  private responseTimeTracker: number[] = [];

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enableDOMCaching: true,
      enableConnectionPooling: true,
      enableBatchOperations: true,
      enableLazyLoading: true,
      memoryThreshold: 200 * 1024 * 1024, // 200MB
      cleanupInterval: 300000, // 5 minutes
      ...config
    };

    logger.info('Performance Manager initialized', this.config);

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Get cached DOM state with performance optimization
   */
  async getCachedState(
    tabId: number,
    url: string,
    forceRefresh = false,
    useVision = false
  ): Promise<PageState | null> {
    if (!this.config.enableDOMCaching || forceRefresh) {
      return null;
    }

    const startTime = Date.now();
    try {
      const cached = domCache.get(tabId, url);
      if (cached) {
        this.trackResponseTime(Date.now() - startTime);
        logger.debug(`DOM cache hit for tab ${tabId}`);
        return cached;
      }
      return null;
    } catch (error) {
      logger.warning('DOM cache error:', error);
      return null;
    }
  }

  /**
   * Cache DOM state with performance optimization
   */
  cacheState(
    tabId: number,
    url: string,
    state: PageState,
    options: { ttl?: number; domSignature?: string } = {}
  ): void {
    if (!this.config.enableDOMCaching) return;

    try {
      domCache.set(tabId, url, state, options);
      logger.debug(`Cached DOM state for tab ${tabId}`);
    } catch (error) {
      logger.warning('DOM cache set error:', error);
    }
  }

  /**
   * Get pooled connection with performance optimization
   */
  async getPooledConnection(
    tabId: number,
    createFn: () => Promise<{ browser: Browser; page: PuppeteerPage }>
  ): Promise<{ browser: Browser; page: PuppeteerPage } | null> {
    if (!this.config.enableConnectionPooling) {
      return null;
    }

    const startTime = Date.now();
    try {
      const connection = await connectionPool.getConnection(tabId, createFn);
      this.trackResponseTime(Date.now() - startTime);
      
      return {
        browser: connection.browser,
        page: connection.page
      };
    } catch (error) {
      logger.warning('Connection pool error:', error);
      return null;
    }
  }

  /**
   * Release pooled connection
   */
  releaseConnection(tabId: number): void {
    if (!this.config.enableConnectionPooling) return;
    
    connectionPool.releaseConnection(tabId);
  }

  /**
   * Add operation to batch with performance optimization
   */
  async addToBatch<T>(
    batchKey: string,
    operation: {
      id: string;
      operation: 'click' | 'input' | 'scroll' | 'navigate' | 'wait' | 'custom';
      data: T;
      priority?: number;
      timeout?: number;
    }
  ): Promise<any> {
    if (!this.config.enableBatchOperations) {
      return null;
    }

    const startTime = Date.now();
    try {
      const result = await batchOperations.addToBatch(batchKey, {
        ...operation,
        priority: operation.priority ?? 0
      });
      
      this.trackResponseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      logger.warning('Batch operation error:', error);
      throw error;
    }
  }

  /**
   * Register lazy resource with performance optimization
   */
  registerLazyResource<T>(
    key: string,
    loader: () => Promise<T>,
    options: { priority?: number; ttl?: number; preload?: boolean } = {}
  ): void {
    if (!this.config.enableLazyLoading) return;

    lazyLoader.register(key, loader, options);
  }

  /**
   * Get lazy resource with performance optimization
   */
  async getLazyResource<T>(key: string): Promise<T | null> {
    if (!this.config.enableLazyLoading) {
      return null;
    }

    const startTime = Date.now();
    try {
      const resource = await lazyLoader.get<T>(key);
      this.trackResponseTime(Date.now() - startTime);
      return resource;
    } catch (error) {
      logger.warning(`Lazy resource error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Preload resources for better performance
   */
  async preloadResources(keys: string[]): Promise<void> {
    if (!this.config.enableLazyLoading) return;

    await lazyLoader.preload(keys);
  }

  /**
   * Invalidate all caches for a tab
   */
  invalidateTab(tabId: number): void {
    // Invalidate DOM cache
    domCache.invalidate(tabId);
    
    // Release connection
    connectionPool.releaseConnection(tabId);
    
    logger.debug(`Invalidated all caches for tab ${tabId}`);
  }

  /**
   * Warm up performance systems for a tab
   */
  async warmUp(tabId: number, url: string): Promise<void> {
    logger.debug(`Warming up performance systems for tab ${tabId}`);

    const promises: Promise<any>[] = [];

    // Note: Connection pool warming disabled until properly implemented
    // Connection pooling works for reuse but warmup is not critical

    // Preload common resources
    if (this.config.enableLazyLoading) {
      const commonResources = [
        `dom-processor-${tabId}`,
        `element-finder-${tabId}`,
        `action-executor-${tabId}`
      ];
      
      promises.push(
        this.preloadResources(commonResources).catch(error => {
          logger.debug('Resource preload failed:', error);
        })
      );
    }

    await Promise.allSettled(promises);
    logger.debug(`Warmup completed for tab ${tabId}`);
  }

  /**
   * Get comprehensive performance statistics
   */
  getStats(): PerformanceStats {
    const domStats = domCache.getStats();
    const connectionStats = connectionPool.getStats();
    const batchStats = batchOperations.getStats();
    const lazyStats = lazyLoader.getStats();

    // Calculate overall metrics
    const totalCacheHits = domStats.hits + connectionStats.cacheHits + lazyStats.cacheHits;
    const totalCacheMisses = domStats.misses + connectionStats.cacheMisses + lazyStats.cacheMisses;
    const cacheHitRate = totalCacheMisses > 0 ? totalCacheHits / (totalCacheHits + totalCacheMisses) : 0;

    const averageResponseTime = this.responseTimeTracker.length > 0
      ? this.responseTimeTracker.reduce((a, b) => a + b, 0) / this.responseTimeTracker.length
      : 0;

    const memoryUsage = domStats.memoryUsage + lazyStats.memoryUsage;
    const systemLoad = memoryUsage / this.config.memoryThreshold;

    return {
      dom: domStats,
      connections: connectionStats,
      batch: batchStats,
      lazy: lazyStats,
      overall: {
        memoryUsage,
        cacheHitRate,
        averageResponseTime,
        systemLoad
      }
    };
  }

  /**
   * Get performance health status
   */
  getHealth(): {
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const stats = this.getStats();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check memory usage
    if (stats.overall.systemLoad > 0.9) {
      issues.push('High memory usage (>90%)');
      recommendations.push('Consider reducing cache sizes or increasing memory threshold');
    }

    // Check cache hit rate
    if (stats.overall.cacheHitRate < 0.3) {
      issues.push('Low cache hit rate (<30%)');
      recommendations.push('Review caching strategies and TTL settings');
    }

    // Check response time
    if (stats.overall.averageResponseTime > 1000) {
      issues.push('High average response time (>1s)');
      recommendations.push('Review performance bottlenecks and optimize slow operations');
    }

    // Check connection pool health
    const connectionHealth = connectionPool.getHealth();
    if (!connectionHealth.healthy) {
      issues.push('Connection pool issues detected');
      recommendations.push('Review connection pool configuration and usage patterns');
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Track response time for metrics
   */
  private trackResponseTime(time: number): void {
    this.responseTimeTracker.push(time);
    
    // Keep only last 100 measurements
    if (this.responseTimeTracker.length > 100) {
      this.responseTimeTracker.shift();
    }
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    logger.debug('Performing periodic performance cleanup');

    // Cleanup DOM cache
    domCache.cleanup();

    // Refresh expired lazy resources
    lazyLoader.refreshExpired();

    // Flush ready batches
    batchOperations.flushReadyBatches();

    // Check memory usage
    const stats = this.getStats();
    if (stats.overall.systemLoad > 0.8) {
      logger.warning('High memory usage detected, performing aggressive cleanup');
      
      // More aggressive cleanup
      domCache.clear();
      lazyLoader.clear();
    }

    logger.debug('Periodic cleanup completed');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Performance Manager configuration updated', this.config);
  }

  /**
   * Force cleanup of all systems
   */
  async forceCleanup(): Promise<void> {
    logger.info('Forcing performance cleanup');

    // Cleanup all systems
    domCache.clear();
    await connectionPool.clear();
    await batchOperations.flushAll();
    lazyLoader.clear();

    // Reset metrics
    this.responseTimeTracker.length = 0;
    this.metricsStartTime = Date.now();

    logger.info('Force cleanup completed');
  }

  /**
   * Destroy performance manager
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cleanup all systems
    domCache.clear();
    await connectionPool.destroy();
    batchOperations.destroy();
    lazyLoader.destroy();

    logger.info('Performance Manager destroyed');
  }
}

// Global performance manager instance
export const performanceManager = new PerformanceManager();

// Export individual components for direct access if needed
export {
  domCache,
  connectionPool,
  batchOperations,
  lazyLoader
};