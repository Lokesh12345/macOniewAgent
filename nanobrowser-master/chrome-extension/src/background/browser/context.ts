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

const logger = createLogger('BrowserContext');
export default class BrowserContext {
  private _config: BrowserContextConfig;
  private _currentTabId: number | null = null;
  private _attachedPages: Map<number, Page> = new Map();

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
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`URL: ${url} is not allowed`);
    }

    const page = await this.getCurrentPage();
    if (!page) {
      await this.openTab(url);
      return;
    }
    // if page is attached, use puppeteer to navigate to the url
    if (page.attached) {
      await page.navigateTo(url);
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
  }

  public async openTab(url: string): Promise<Page> {
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`Open tab failed. URL: ${url} is not allowed`);
    }

    // Create the new tab
    const tab = await chrome.tabs.create({ url, active: true });
    if (!tab.id) {
      throw new Error('No tab ID available');
    }
    // Wait for tab events
    await this.waitForTabEvents(tab.id);

    // Get updated tab information
    const updatedTab = await chrome.tabs.get(tab.id);
    // Create and attach the page after tab is fully loaded and activated
    const page = await this._getOrCreatePage(updatedTab);
    await this.attachPage(page);
    this._currentTabId = tab.id;

    return page;
  }

  public async closeTab(tabId: number): Promise<void> {
    await this.detachPage(tabId);
    await chrome.tabs.remove(tabId);
    // update current tab id if needed
    if (this._currentTabId === tabId) {
      this._currentTabId = null;
    }
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

  /**
   * Dynamic heuristic to detect if a tab appears to be logged in
   */
  private async isTabLoggedIn(tab: chrome.tabs.Tab): Promise<boolean> {
    if (!tab.url || !tab.title) return false;
    
    const urlLower = tab.url.toLowerCase();
    const titleLower = tab.title.toLowerCase();
    
    // Universal login page indicators
    const loginUrlPatterns = [
      '/login', '/signin', '/sign-in', '/auth', '/authenticate',
      '/account/login', '/user/login', '/session/new'
    ];
    
    const loginTitlePatterns = [
      'sign in', 'log in', 'login', 'authentication',
      'welcome back', 'enter password', 'create account'
    ];
    
    // Check if URL contains any login pattern
    const hasLoginUrl = loginUrlPatterns.some(pattern => urlLower.includes(pattern));
    
    // Check if title contains any login pattern
    const hasLoginTitle = loginTitlePatterns.some(pattern => titleLower.includes(pattern));
    
    // If either URL or title indicates login page, user is NOT logged in
    return !hasLoginUrl && !hasLoginTitle;
  }

  /**
   * Find existing tab that matches the task requirements using pattern matching
   * @param taskDescription - Description of what we want to do
   * @param preferredUrl - URL we want to visit (optional)
   */
  public async findReusableTab(taskDescription: string, preferredUrl?: string): Promise<number | null> {
    const tabs = await chrome.tabs.query({});
    const taskLower = taskDescription.toLowerCase();
    
    // Direct URL match has highest priority
    if (preferredUrl) {
      for (const tab of tabs) {
        if (tab.url && tab.url.includes(preferredUrl) && tab.id) {
          logger.info(`Found exact URL match for ${preferredUrl}: tab ${tab.id}`);
          return tab.id;
        }
      }
    }
    
    // Extract key concepts from task description
    const taskPatterns = {
      email: /\b(email|mail|compose|inbox|send|reply)\b/i,
      search: /\b(search|find|look\s+for|look\s+up|query|google)\b/i,
      shopping: /\b(buy|shop|purchase|order|cart|product|price)\b/i,
      development: /\b(code|repository|repo|commit|pull|branch|develop|program)\b/i,
      social: /\b(social|profile|network|connect|follow|share|post)\b/i,
      video: /\b(video|watch|play|stream|youtube|vimeo)\b/i,
      news: /\b(news|article|read|blog|story|headline)\b/i,
      document: /\b(doc|document|write|edit|sheet|slide)\b/i
    };
    
    // Identify task type
    let taskType: string | null = null;
    for (const [type, pattern] of Object.entries(taskPatterns)) {
      if (pattern.test(taskLower)) {
        taskType = type;
        break;
      }
    }
    
    // Smart matching based on task type and page characteristics
    for (const tab of tabs) {
      if (!tab.id || !tab.url || !tab.title) continue;
      
      const urlLower = tab.url.toLowerCase();
      const titleLower = tab.title.toLowerCase();
      const pageCombined = urlLower + ' ' + titleLower;
      
      // Match based on task type
      switch (taskType) {
        case 'email':
          if (/mail|email|inbox|compose/i.test(pageCombined)) {
            const isLoggedIn = await this.isTabLoggedIn(tab);
            if (isLoggedIn) {
              logger.info(`Found email service tab for email task: tab ${tab.id}`);
              return tab.id;
            }
          }
          break;
          
        case 'search':
          if (/search|query|\?q=|&q=/i.test(urlLower)) {
            logger.info(`Found search page for search task: tab ${tab.id}`);
            return tab.id;
          }
          break;
          
        case 'shopping':
          if (/shop|store|product|cart|ecommerce/i.test(pageCombined)) {
            const isLoggedIn = await this.isTabLoggedIn(tab);
            if (isLoggedIn) {
              logger.info(`Found shopping site for shopping task: tab ${tab.id}`);
              return tab.id;
            }
          }
          break;
          
        case 'development':
          if (/github|gitlab|bitbucket|code|repository/i.test(pageCombined)) {
            logger.info(`Found development platform for coding task: tab ${tab.id}`);
            return tab.id;
          }
          break;
          
        case 'social':
          if (/social|profile|network|feed/i.test(pageCombined)) {
            logger.info(`Found social platform for social task: tab ${tab.id}`);
            return tab.id;
          }
          break;
          
        case 'video':
          if (/video|watch|youtube|vimeo|stream/i.test(pageCombined)) {
            logger.info(`Found video platform for video task: tab ${tab.id}`);
            return tab.id;
          }
          break;
          
        case 'document':
          if (/docs|sheets|slides|document|editor/i.test(pageCombined)) {
            logger.info(`Found document editor for document task: tab ${tab.id}`);
            return tab.id;
          }
          break;
      }
      
      // Generic domain matching if task mentions specific domain
      const domainMatch = taskLower.match(/\b(\w+\.(?:com|org|net|io|co|edu))\b/);
      if (domainMatch && urlLower.includes(domainMatch[1])) {
        logger.info(`Found tab matching domain ${domainMatch[1]}: tab ${tab.id}`);
        return tab.id;
      }
    }
    
    logger.info('No reusable tab found for task');
    return null;
  }

  /**
   * Navigate to URL in existing tab (helper method for tab reuse)
   */
  private async navigateToUrl(tabId: number, url: string): Promise<Page> {
    await chrome.tabs.update(tabId, { url, active: true });
    await this.waitForTabEvents(tabId);
    
    // Get updated tab and create/attach page
    const updatedTab = await chrome.tabs.get(tabId);
    const page = await this._getOrCreatePage(updatedTab, true);
    await this.attachPage(page);
    this._currentTabId = tabId;
    
    return page;
  }

  /**
   * Intelligent tab opening that reuses existing tabs when beneficial
   */
  public async smartOpenTab(url: string, taskDescription?: string): Promise<Page> {
    // Check if we can reuse an existing tab
    const reusableTabId = await this.findReusableTab(taskDescription || '', url);
    
    if (reusableTabId) {
      logger.info(`Reusing existing tab ${reusableTabId} instead of creating new one`);
      return await this.navigateToUrl(reusableTabId, url);
    }
    
    // No suitable tab found, create new one
    logger.info(`Creating new tab for ${url}`);
    return await this.openTab(url);
  }

  public async getCachedState(useVision = false, cacheClickableElementsHashes = false): Promise<BrowserState> {
    const currentPage = await this.getCurrentPage();

    let pageState = !currentPage ? build_initial_state() : currentPage.getCachedState();
    if (!pageState) {
      pageState = await currentPage.getState(useVision, cacheClickableElementsHashes);
    }

    const tabInfos = await this.getTabInfos();
    const browserState: BrowserState = {
      ...pageState,
      tabs: tabInfos,
    };
    return browserState;
  }

  public async getState(useVision = false, cacheClickableElementsHashes = false): Promise<BrowserState> {
    const currentPage = await this.getCurrentPage();

    const pageState = !currentPage
      ? build_initial_state()
      : await currentPage.getState(useVision, cacheClickableElementsHashes);
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
