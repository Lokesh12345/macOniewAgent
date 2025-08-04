import { createLogger } from '../../log';
import type { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser.js';
import type { Page as PuppeteerPage } from 'puppeteer-core/lib/esm/puppeteer/api/Page.js';

const logger = createLogger('ConnectionPool');

export interface PooledConnection {
  browser: Browser;
  page: PuppeteerPage;
  tabId: number;
  lastUsed: number;
  inUse: boolean;
  createdAt: number;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  connectionsCreated: number;
  connectionsDestroyed: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Connection Pool for Browser/Page Management
 * Reduces setup overhead by reusing connections
 */
export class ConnectionPool {
  private connections = new Map<number, PooledConnection>();
  private stats: PoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    connectionsCreated: 0,
    connectionsDestroyed: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  private readonly maxPoolSize: number;
  private readonly idleTimeout: number;
  private readonly maxConnectionAge: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: {
    maxPoolSize?: number;
    idleTimeout?: number;
    maxConnectionAge?: number;
  } = {}) {
    this.maxPoolSize = options.maxPoolSize ?? 10;
    this.idleTimeout = options.idleTimeout ?? 300000; // 5 minutes
    this.maxConnectionAge = options.maxConnectionAge ?? 1800000; // 30 minutes

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Get or create a pooled connection for a tab
   */
  async getConnection(tabId: number, createFn: () => Promise<{ browser: Browser; page: PuppeteerPage }>): Promise<PooledConnection> {
    const existing = this.connections.get(tabId);
    
    if (existing && this.isConnectionValid(existing)) {
      // Update usage tracking
      existing.lastUsed = Date.now();
      existing.inUse = true;
      this.updateStats();
      this.stats.cacheHits++;
      
      logger.debug(`Reusing pooled connection for tab ${tabId}`);
      return existing;
    }

    // Remove invalid connection if exists
    if (existing) {
      await this.destroyConnection(tabId);
    }

    // Check pool size limit
    if (this.connections.size >= this.maxPoolSize) {
      await this.evictOldestConnection();
    }

    // Create new connection
    logger.debug(`Creating new pooled connection for tab ${tabId}`);
    this.stats.cacheMisses++;
    
    try {
      const { browser, page } = await createFn();
      const now = Date.now();
      
      const connection: PooledConnection = {
        browser,
        page,
        tabId,
        lastUsed: now,
        inUse: true,
        createdAt: now
      };

      this.connections.set(tabId, connection);
      this.stats.connectionsCreated++;
      this.updateStats();
      
      logger.debug(`Created pooled connection for tab ${tabId}`);
      return connection;
    } catch (error) {
      logger.error(`Failed to create connection for tab ${tabId}:`, error);
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(tabId: number): void {
    const connection = this.connections.get(tabId);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();
      this.updateStats();
      logger.debug(`Released connection for tab ${tabId}`);
    }
  }

  /**
   * Remove and destroy a connection
   */
  async destroyConnection(tabId: number): Promise<void> {
    const connection = this.connections.get(tabId);
    if (!connection) return;

    try {
      // Close the page if it's still open
      if (connection.page && !connection.page.isClosed()) {
        await connection.page.close();
      }
    } catch (error) {
      logger.warning(`Error closing page for tab ${tabId}:`, error);
    }

    try {
      // Close the browser if no other connections are using it
      const otherConnections = Array.from(this.connections.values())
        .filter(c => c.tabId !== tabId && c.browser === connection.browser);
      
      if (otherConnections.length === 0 && connection.browser.connected) {
        await connection.browser.close();
      }
    } catch (error) {
      logger.warning(`Error closing browser for tab ${tabId}:`, error);
    }

    this.connections.delete(tabId);
    this.stats.connectionsDestroyed++;
    this.updateStats();
    
    logger.debug(`Destroyed connection for tab ${tabId}`);
  }

  /**
   * Get connection without creating if it doesn't exist
   */
  getExistingConnection(tabId: number): PooledConnection | null {
    const connection = this.connections.get(tabId);
    if (connection && this.isConnectionValid(connection)) {
      connection.lastUsed = Date.now();
      this.stats.cacheHits++;
      return connection;
    }
    
    this.stats.cacheMisses++;
    return null;
  }

  /**
   * Check if a connection is still valid
   */
  private isConnectionValid(connection: PooledConnection): boolean {
    const now = Date.now();
    
    // Check age limit
    if (now - connection.createdAt > this.maxConnectionAge) {
      logger.debug(`Connection ${connection.tabId} exceeded max age`);
      return false;
    }

    // Check if browser/page is still connected
    if (!connection.browser.connected || connection.page.isClosed()) {
      logger.debug(`Connection ${connection.tabId} is disconnected`);
      return false;
    }

    return true;
  }

  /**
   * Update pool statistics
   */
  private updateStats(): void {
    this.stats.totalConnections = this.connections.size;
    this.stats.activeConnections = Array.from(this.connections.values())
      .filter(c => c.inUse).length;
    this.stats.idleConnections = this.stats.totalConnections - this.stats.activeConnections;
  }

  /**
   * Cleanup expired and invalid connections
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: number[] = [];

    for (const [tabId, connection] of this.connections) {
      // Remove if invalid
      if (!this.isConnectionValid(connection)) {
        connectionsToRemove.push(tabId);
        continue;
      }

      // Remove if idle too long
      if (!connection.inUse && now - connection.lastUsed > this.idleTimeout) {
        logger.debug(`Connection ${tabId} idle timeout`);
        connectionsToRemove.push(tabId);
        continue;
      }
    }

    // Remove invalid connections
    for (const tabId of connectionsToRemove) {
      await this.destroyConnection(tabId);
    }

    if (connectionsToRemove.length > 0) {
      logger.debug(`Cleaned up ${connectionsToRemove.length} stale connections`);
    }
  }

  /**
   * Evict the oldest idle connection to make room
   */
  private async evictOldestConnection(): Promise<void> {
    let oldestTabId: number | null = null;
    let oldestTime = Date.now();

    // Find oldest idle connection
    for (const [tabId, connection] of this.connections) {
      if (!connection.inUse && connection.lastUsed < oldestTime) {
        oldestTime = connection.lastUsed;
        oldestTabId = tabId;
      }
    }

    // If no idle connections, evict oldest connection regardless
    if (oldestTabId === null) {
      for (const [tabId, connection] of this.connections) {
        if (connection.createdAt < oldestTime) {
          oldestTime = connection.createdAt;
          oldestTabId = tabId;
        }
      }
    }

    if (oldestTabId !== null) {
      logger.debug(`Evicting oldest connection ${oldestTabId} to make room`);
      await this.destroyConnection(oldestTabId);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear all connections
   */
  async clear(): Promise<void> {
    const tabIds = Array.from(this.connections.keys());
    
    await Promise.all(
      tabIds.map(tabId => this.destroyConnection(tabId))
    );

    logger.debug(`Cleared all ${tabIds.length} pooled connections`);
  }

  /**
   * Destroy the pool and cleanup resources
   */
  async destroy(): Promise<void> {
    clearInterval(this.cleanupInterval);
    await this.clear();
    logger.debug('Connection pool destroyed');
  }

  /**
   * Warm up connections for frequently used tabs
   */
  async warmUp(tabIds: number[], createFn: (tabId: number) => Promise<{ browser: Browser; page: PuppeteerPage }>): Promise<void> {
    logger.debug(`Warming up connections for ${tabIds.length} tabs`);
    
    const warmupPromises = tabIds.map(async (tabId) => {
      try {
        const connection = await this.getConnection(tabId, () => createFn(tabId));
        this.releaseConnection(tabId); // Release immediately after creation
      } catch (error) {
        logger.warning(`Failed to warm up connection for tab ${tabId}:`, error);
      }
    });

    await Promise.allSettled(warmupPromises);
    logger.debug('Connection warmup completed');
  }

  /**
   * Get connection health status
   */
  getHealth(): {
    healthy: boolean;
    issues: string[];
    poolUtilization: number;
  } {
    this.updateStats();
    
    const issues: string[] = [];
    const utilization = this.stats.totalConnections / this.maxPoolSize;

    if (utilization > 0.9) {
      issues.push('Pool utilization high (>90%)');
    }

    if (this.stats.connectionsDestroyed > this.stats.connectionsCreated * 0.5) {
      issues.push('High connection churn rate');
    }

    const hitRate = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses);
    if (hitRate < 0.5) {
      issues.push('Low cache hit rate (<50%)');
    }

    return {
      healthy: issues.length === 0,
      issues,
      poolUtilization: utilization
    };
  }
}

// Global connection pool instance
export const connectionPool = new ConnectionPool({
  maxPoolSize: 10,
  idleTimeout: 300000, // 5 minutes
  maxConnectionAge: 1800000 // 30 minutes
});