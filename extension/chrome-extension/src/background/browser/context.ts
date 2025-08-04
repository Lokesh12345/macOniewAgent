import 'webextension-polyfill';
import {
  type BrowserContextConfig,
  type BrowserState,
  DEFAULT_BROWSER_CONTEXT_CONFIG,
  type TabInfo,
  URLNotAllowedError,
} from './views';
import Page, { build_initial_state } from './page';
import { createLogger } from '@src/background/log';
import { isUrlAllowed } from './util';
import { performanceManager } from './performance';
import { performanceMonitoring } from './monitoring';
import { workflowSystem } from '../agent/workflow';
import { taskMemoryManager } from './navigation/taskMemory';

const logger = createLogger('BrowserContext');
export default class BrowserContext {
  private _config: BrowserContextConfig;
  private _currentTabId: number | null = null;
  private _attachedPages: Map<number, Page> = new Map();
  private _currentTaskId: string | null = null;

  constructor(config: Partial<BrowserContextConfig>) {
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };
  }

  public getConfig(): BrowserContextConfig {
    return this._config;
  }

  public updateConfig(config: Partial<BrowserContextConfig>): void {
    this._config = { ...this._config, ...config };
  }

  public updateCurrentTabId(tabId: number): void {
    // only update tab id, but don't attach it.
    this._currentTabId = tabId;
  }

  public setCurrentTaskId(taskId: string, userIntent?: string): void {
    this._currentTaskId = taskId;
    if (userIntent && taskId) {
      taskMemoryManager.getOrCreateMemory(taskId, userIntent);
    }
  }

  public getCurrentTaskId(): string | null {
    return this._currentTaskId;
  }

  private async _getOrCreatePage(tab: chrome.tabs.Tab, forceUpdate = false): Promise<Page> {
    if (!tab.id) {
      throw new Error('Tab ID is not available');
    }

    const existingPage = this._attachedPages.get(tab.id);
    if (existingPage) {
      logger.info('getOrCreatePage', tab.id, 'already attached');
      if (!forceUpdate) {
        return existingPage;
      }
      // detach the page and remove it from the attached pages if forceUpdate is true
      await existingPage.detachPuppeteer();
      this._attachedPages.delete(tab.id);
    }
    logger.info('getOrCreatePage', tab.id, 'creating new page');
    return new Page(tab.id, tab.url || '', tab.title || '', this._config);
  }

  public async cleanup(): Promise<void> {
    const currentPage = await this.getCurrentPage();
    currentPage?.removeHighlight();
    // detach all pages
    for (const page of this._attachedPages.values()) {
      await page.detachPuppeteer();
    }
    this._attachedPages.clear();
    this._currentTabId = null;
  }

  public async attachPage(page: Page): Promise<boolean> {
    // check if page is already attached
    if (this._attachedPages.has(page.tabId)) {
      logger.info('attachPage', page.tabId, 'already attached');
      return true;
    }

    if (await page.attachPuppeteer()) {
      logger.info('attachPage', page.tabId, 'attached');
      
      // Set task ID for context preservation
      if (this._currentTaskId) {
        page.setTaskId(this._currentTaskId);
      }
      
      // add page to managed pages
      this._attachedPages.set(page.tabId, page);
      return true;
    }
    return false;
  }

  public async detachPage(tabId: number): Promise<void> {
    // detach page
    const page = this._attachedPages.get(tabId);
    if (page) {
      await page.detachPuppeteer();
      // remove page from managed pages
      this._attachedPages.delete(tabId);
    }
  }

  public async getCurrentPage(): Promise<Page> {
    // 1. If _currentTabId not set, query the active tab and attach it
    if (!this._currentTabId) {
      let activeTab: chrome.tabs.Tab;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        // open a new tab with blank page
        const newTab = await chrome.tabs.create({ url: this._config.homePageUrl });
        if (!newTab.id) {
          // this should rarely happen
          throw new Error('No tab ID available');
        }
        activeTab = newTab;
      } else {
        activeTab = tab;
      }
      logger.info('active tab', activeTab.id, activeTab.url, activeTab.title);
      const page = await this._getOrCreatePage(activeTab);
      await this.attachPage(page);
      this._currentTabId = activeTab.id || null;
      return page;
    }

    // 2. If _currentTabId is set but not in attachedPages, attach the tab
    const existingPage = this._attachedPages.get(this._currentTabId);
    if (!existingPage) {
      const tab = await chrome.tabs.get(this._currentTabId);
      const page = await this._getOrCreatePage(tab);
      // set current tab id to null if the page is not attached successfully
      await this.attachPage(page);
      return page;
    }

    // 3. Return existing page from attachedPages
    return existingPage;
  }

  /**
   * Get all tab IDs from the browser and the current window.
   * @returns A set of tab IDs.
   */
  public async getAllTabIds(): Promise<Set<number>> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return new Set(tabs.map(tab => tab.id).filter(id => id !== undefined));
  }

  /**
   * Wait for tab events to occur after a tab is created or updated.
   * @param tabId - The ID of the tab to wait for events on.
   * @param options - An object containing options for the wait.
   * @returns A promise that resolves when the tab events occur.
   */
  private async waitForTabEvents(
    tabId: number,
    options: {
      waitForUpdate?: boolean;
      waitForActivation?: boolean;
      timeoutMs?: number;
    } = {},
  ): Promise<void> {
    const { waitForUpdate = true, waitForActivation = true, timeoutMs = 5000 } = options;

    const promises: Promise<void>[] = [];

    if (waitForUpdate) {
      const updatePromise = new Promise<void>(resolve => {
        let hasUrl = false;
        let hasTitle = false;
        let isComplete = false;

        const onUpdatedHandler = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId !== tabId) return;

          if (changeInfo.url) hasUrl = true;
          if (changeInfo.title) hasTitle = true;
          if (changeInfo.status === 'complete') isComplete = true;

          // Resolve when we have all the information we need
          if (hasUrl && hasTitle && isComplete) {
            chrome.tabs.onUpdated.removeListener(onUpdatedHandler);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdatedHandler);

        // Check current state
        chrome.tabs.get(tabId).then(tab => {
          if (tab.url) hasUrl = true;
          if (tab.title) hasTitle = true;
          if (tab.status === 'complete') isComplete = true;

          if (hasUrl && hasTitle && isComplete) {
            chrome.tabs.onUpdated.removeListener(onUpdatedHandler);
            resolve();
          }
        });
      });
      promises.push(updatePromise);
    }

    if (waitForActivation) {
      const activatedPromise = new Promise<void>(resolve => {
        const onActivatedHandler = (activeInfo: chrome.tabs.TabActiveInfo) => {
          if (activeInfo.tabId === tabId) {
            chrome.tabs.onActivated.removeListener(onActivatedHandler);
            resolve();
          }
        };
        chrome.tabs.onActivated.addListener(onActivatedHandler);

        // Check current state
        chrome.tabs.get(tabId).then(tab => {
          if (tab.active) {
            chrome.tabs.onActivated.removeListener(onActivatedHandler);
            resolve();
          }
        });
      });
      promises.push(activatedPromise);
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tab operation timed out after ${timeoutMs} ms`)), timeoutMs),
    );

    await Promise.race([Promise.all(promises), timeoutPromise]);
  }

  public async switchTab(tabId: number): Promise<Page> {
    logger.info('switchTab', tabId);

    await chrome.tabs.update(tabId, { active: true });
    await this.waitForTabEvents(tabId, { waitForUpdate: false });

    const page = await this._getOrCreatePage(await chrome.tabs.get(tabId));
    await this.attachPage(page);
    this._currentTabId = tabId;
    return page;
  }

  public async navigateTo(url: string): Promise<void> {
    return performanceMonitoring.timeFunction('browser.navigation', async () => {
      if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
        performanceMonitoring.recordMetric('browser.navigation.blocked', 1, 'counter', { url });
        throw new URLNotAllowedError(`URL: ${url} is not allowed`);
      }

      const page = await this.getCurrentPage();
      if (!page) {
        await this.openTab(url);
        return;
      }

      // Preserve context before navigation
      const currentUrl = page.state?.url;
      const taskId = this._currentTaskId || 'default';
      
      if (currentUrl && currentUrl !== url) {
        taskMemoryManager.preserveContextForNavigation(taskId, currentUrl, url);
      }

      // Smart cache invalidation based on navigation type
      const navigationType = taskMemoryManager.analyzeNavigation(currentUrl || '', url);
      if (navigationType !== 'same_page') {
        performanceManager.invalidateTab(page.tabId);
      }

      // if page is attached, use puppeteer to navigate to the url
      if (page.attached) {
        await page.navigateTo(url);
        
        // Warm up performance systems for the new URL
        await performanceManager.warmUp(page.tabId, url);
        
        performanceMonitoring.recordMetric('browser.navigation.success', 1, 'counter', { 
          type: 'attached', 
          url: new URL(url).hostname 
        });
        return;
      }
      //  Use chrome.tabs.update only if the page is not attached
      const tabId = page.tabId;
      // Update tab and wait for events
      await chrome.tabs.update(tabId, { url, active: true });
      await this.waitForTabEvents(tabId);

      // Reattach the page after navigation completes
      const updatedPage = await this._getOrCreatePage(await chrome.tabs.get(tabId), true);
      await this.attachPage(updatedPage);
      this._currentTabId = tabId;

      // Warm up performance systems for the new URL
      await performanceManager.warmUp(tabId, url);
      
      performanceMonitoring.recordMetric('browser.navigation.success', 1, 'counter', { 
        type: 'detached', 
        url: new URL(url).hostname 
      });
    }, { operation: 'navigate' });
  }

  public async openTab(url: string): Promise<Page> {
    return performanceMonitoring.timeFunction('browser.tab.open', async () => {
      if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
        performanceMonitoring.recordMetric('browser.tab.blocked', 1, 'counter', { url });
        throw new URLNotAllowedError(`Open tab failed. URL: ${url} is not allowed`);
      }

      // Create the new tab
      const tab = await chrome.tabs.create({ url, active: true });
      if (!tab.id) {
        throw new Error('No tab ID available');
      }
      
      performanceMonitoring.recordMetric('browser.tabs.opened', 1, 'counter');
      
      // Wait for tab events
      await this.waitForTabEvents(tab.id);

      // Get updated tab information
      const updatedTab = await chrome.tabs.get(tab.id);
      // Create and attach the page after tab is fully loaded and activated
      const page = await this._getOrCreatePage(updatedTab);
      await this.attachPage(page);
      this._currentTabId = tab.id;

      performanceMonitoring.recordMetric('browser.active.tabs', 1, 'gauge');
      return page;
    }, { operation: 'openTab' });
  }

  public async closeTab(tabId: number): Promise<void> {
    return performanceMonitoring.timeFunction('browser.tab.close', async () => {
      // Invalidate performance caches before closing
      performanceManager.invalidateTab(tabId);
      
      await this.detachPage(tabId);
      await chrome.tabs.remove(tabId);
      
      performanceMonitoring.recordMetric('browser.tabs.closed', 1, 'counter');
      
      // update current tab id if needed
      if (this._currentTabId === tabId) {
        this._currentTabId = null;
      }
    }, { operation: 'closeTab', tabId: tabId.toString() });
  }

  /**
   * Remove a tab from the attached pages map. This will not run detachPuppeteer.
   * @param tabId - The ID of the tab to remove.
   */
  public removeAttachedPage(tabId: number): void {
    this._attachedPages.delete(tabId);
    // update current tab id if needed
    if (this._currentTabId === tabId) {
      this._currentTabId = null;
    }
  }

  public async getTabInfos(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({});
    const tabInfos: TabInfo[] = [];

    for (const tab of tabs) {
      if (tab.id && tab.url && tab.title) {
        tabInfos.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
        });
      }
    }
    return tabInfos;
  }

  public async getCachedState(useVision = false, cacheClickableElementsHashes = false): Promise<BrowserState> {
    return performanceMonitoring.timeFunction('browser.state.cached', async () => {
      const currentPage = await this.getCurrentPage();

      if (!currentPage) {
        const tabInfos = await this.getTabInfos();
        return {
          ...build_initial_state(),
          tabs: tabInfos,
        };
      }

      // Try performance-optimized cache first
      let pageState = await performanceManager.getCachedState(
        currentPage.tabId,
        currentPage.url || '',
        false,
        useVision
      );

      let cacheHit = !!pageState;

      // Fallback to page's own cache
      if (!pageState) {
        pageState = currentPage.getCachedState();
        cacheHit = !!pageState;
      }

      // Generate state if no cache available
      if (!pageState) {
        pageState = await currentPage.getState(useVision, cacheClickableElementsHashes);
        
        // Cache the generated state for future use
        if (pageState && currentPage.url) {
          performanceManager.cacheState(currentPage.tabId, currentPage.url, pageState, {
            ttl: 30000 // 30 second TTL for cached states
          });
        }
        cacheHit = false;
      }

      // Record cache performance
      performanceMonitoring.recordMetric(
        cacheHit ? 'performance.dom.cache.hits' : 'performance.dom.cache.misses', 
        1, 
        'counter',
        { useVision: useVision.toString() }
      );

      const tabInfos = await this.getTabInfos();
      const browserState: BrowserState = {
        ...pageState,
        tabs: tabInfos,
      };
      return browserState;
    }, { operation: 'getCachedState', useVision: useVision.toString() });
  }

  public async getState(useVision = false, cacheClickableElementsHashes = false): Promise<BrowserState> {
    const currentPage = await this.getCurrentPage();

    if (!currentPage) {
      const tabInfos = await this.getTabInfos();
      return {
        ...build_initial_state(),
        tabs: tabInfos,
      };
    }

    // Generate fresh state
    const pageState = await currentPage.getState(useVision, cacheClickableElementsHashes);
    
    // Cache the fresh state for future getCachedState calls
    if (pageState && currentPage.url) {
      performanceManager.cacheState(currentPage.tabId, currentPage.url, pageState, {
        ttl: 30000 // 30 second TTL for fresh states
      });
    }

    const tabInfos = await this.getTabInfos();
    const browserState: BrowserState = {
      ...pageState,
      tabs: tabInfos,
      // browser_errors: [],
    };
    return browserState;
  }

  public async removeHighlight(): Promise<void> {
    const page = await this.getCurrentPage();
    if (page) {
      await page.removeHighlight();
    }
  }
}
