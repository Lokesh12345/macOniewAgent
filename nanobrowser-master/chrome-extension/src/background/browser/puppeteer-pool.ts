import { 
  connect,
  ExtensionTransport,
  type ProtocolType
} from 'puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js';
import type { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser.js';
import type { Page as PuppeteerPage } from 'puppeteer-core/lib/esm/puppeteer/api/Page.js';
import { createLogger } from '@src/background/log';

const logger = createLogger('PuppeteerPool');

interface TabConnection {
  browser: Browser;
  page: PuppeteerPage;
  lastAccessed: number;
}

/**
 * PuppeteerPool manages persistent connections to Chrome tabs
 * to avoid the ~2-3s cold connection delay on each attach.
 */
export class PuppeteerPool {
  private static instance: PuppeteerPool;
  private connections: Map<number, TabConnection> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  private constructor() {
    this.startCleanupTimer();
  }

  static getInstance(): PuppeteerPool {
    if (!PuppeteerPool.instance) {
      PuppeteerPool.instance = new PuppeteerPool();
    }
    return PuppeteerPool.instance;
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idsToRemove: number[] = [];

    for (const [tabId, connection] of this.connections.entries()) {
      if (now - connection.lastAccessed > this.MAX_IDLE_TIME) {
        idsToRemove.push(tabId);
      }
    }

    for (const tabId of idsToRemove) {
      logger.info(`Cleaning up idle connection for tab ${tabId}`);
      this.disconnect(tabId);
    }
  }

  /**
   * Get or create a Puppeteer connection for a tab.
   * Reuses existing connections when possible.
   */
  async getConnection(tabId: number): Promise<{ browser: Browser; page: PuppeteerPage } | null> {
    try {
      // Check if we have an existing connection
      const existing = this.connections.get(tabId);
      if (existing) {
        // Verify the connection is still valid
        try {
          await existing.page.evaluate(() => true);
          existing.lastAccessed = Date.now();
          logger.info(`Reusing existing connection for tab ${tabId}`);
          return { browser: existing.browser, page: existing.page };
        } catch (error) {
          // Connection is stale, remove it
          logger.warn(`Stale connection for tab ${tabId}, reconnecting`);
          await this.disconnect(tabId);
        }
      }

      // Create new connection
      logger.info(`Creating new Puppeteer connection for tab ${tabId}`);
      const browser = await connect({
        transport: await ExtensionTransport.connectTab(tabId),
        defaultViewport: null,
        protocol: 'cdp' as ProtocolType,
      });

      const [page] = await browser.pages();
      
      const connection: TabConnection = {
        browser,
        page,
        lastAccessed: Date.now(),
      };

      this.connections.set(tabId, connection);
      return { browser, page };
    } catch (error) {
      logger.error(`Failed to connect to tab ${tabId}:`, error);
      return null;
    }
  }

  /**
   * Disconnect and remove a connection from the pool.
   */
  async disconnect(tabId: number): Promise<void> {
    const connection = this.connections.get(tabId);
    if (connection) {
      try {
        await connection.browser.disconnect();
      } catch (error) {
        logger.error(`Error disconnecting tab ${tabId}:`, error);
      }
      this.connections.delete(tabId);
      logger.info(`Disconnected tab ${tabId}`);
    }
  }

  /**
   * Disconnect all connections and clean up.
   */
  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const disconnectPromises: Promise<void>[] = [];
    for (const tabId of this.connections.keys()) {
      disconnectPromises.push(this.disconnect(tabId));
    }

    await Promise.all(disconnectPromises);
    this.connections.clear();
    logger.info('PuppeteerPool cleaned up');
  }

  /**
   * Get the number of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
}

// Export singleton instance
export const puppeteerPool = PuppeteerPool.getInstance();