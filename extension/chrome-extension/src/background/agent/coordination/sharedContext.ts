import { createLogger } from '../../log';
import type { BrowserState } from '../../browser/views';
import type { ActionResult, AgentContext } from '../types';
import type {
  SharedContext,
  CompressedBrowserState,
  CompressedActionHistory,
  KeyElement,
  ActionSummary,
  ActionPattern,
  FailedActionSummary,
  FormFieldSummary,
  ContextMetadata,
  AgentCoordinationConfig,
} from './types';

const logger = createLogger('SharedContext');

/**
 * Manages shared context between agents to reduce token usage
 */
export class SharedContextManager {
  private contexts = new Map<string, SharedContext>();
  private compressionThreshold: number;
  private maxContextLength: number;
  private cacheTimeout: number;

  constructor(private config: AgentCoordinationConfig) {
    this.compressionThreshold = config.compressionThreshold;
    this.maxContextLength = config.maxContextLength;
    this.cacheTimeout = config.cacheTimeout;

    // Periodic cleanup of stale contexts
    setInterval(() => this.cleanupStaleContexts(), this.cacheTimeout);
  }

  /**
   * Create or update shared context for a task
   */
  async createOrUpdateContext(
    agentContext: AgentContext,
    browserState?: BrowserState
  ): Promise<SharedContext> {
    const taskId = agentContext.taskId;
    let context = this.contexts.get(taskId);

    if (!context) {
      context = await this.createNewContext(agentContext, browserState);
    } else {
      context = await this.updateContext(context, agentContext, browserState);
    }

    // Check if compression is needed
    if (this.shouldCompress(context)) {
      context = await this.compressContext(context);
    }

    context.lastAccessed = Date.now();
    this.contexts.set(taskId, context);

    return context;
  }

  /**
   * Get shared context for a task
   */
  getContext(taskId: string): SharedContext | null {
    const context = this.contexts.get(taskId);
    if (context) {
      context.lastAccessed = Date.now();
      context.metadata.accessCount++;
    }
    return context || null;
  }

  /**
   * Create new shared context
   */
  private async createNewContext(
    agentContext: AgentContext,
    browserState?: BrowserState
  ): Promise<SharedContext> {
    const compressedBrowserState = browserState
      ? await this.compressBrowserState(browserState)
      : this.getEmptyBrowserState();

    const actionHistory = this.compressActionHistory(agentContext.actionResults);

    const metadata: ContextMetadata = {
      created: Date.now(),
      updated: Date.now(),
      accessCount: 0,
      tokenCount: 0,
    };

    return {
      id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskId: agentContext.taskId,
      browserState: compressedBrowserState,
      actionHistory,
      metadata,
      compressed: false,
      lastAccessed: Date.now(),
    };
  }

  /**
   * Update existing context
   */
  private async updateContext(
    context: SharedContext,
    agentContext: AgentContext,
    browserState?: BrowserState
  ): Promise<SharedContext> {
    if (browserState) {
      context.browserState = await this.compressBrowserState(browserState);
    }

    context.actionHistory = this.compressActionHistory(agentContext.actionResults);
    context.metadata.updated = Date.now();

    return context;
  }

  /**
   * Compress browser state to reduce tokens
   */
  private async compressBrowserState(state: BrowserState): Promise<CompressedBrowserState> {
    // Extract only key elements that are likely to be interacted with
    const keyElements: KeyElement[] = [];
    const formFields: FormFieldSummary = {
      totalFields: 0,
      filledFields: 0,
      fieldTypes: {},
      requiredFields: [],
    };
    const navigationLinks: string[] = [];

    // Process selector map to find important elements
    state.selectorMap.forEach((element, index) => {
      const importance = this.calculateElementImportance(element);
      
      if (importance > 0.3) { // Only keep important elements
        keyElements.push({
          index,
          type: element.tagName,
          text: element.text?.substring(0, 100), // Truncate long text
          attributes: this.extractKeyAttributes(element.attributes),
          importance,
        });
      }

      // Track form fields
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
        formFields.totalFields++;
        const fieldType = element.attributes?.type || element.tagName.toLowerCase();
        formFields.fieldTypes[fieldType] = (formFields.fieldTypes[fieldType] || 0) + 1;
        
        if (element.attributes?.value) {
          formFields.filledFields++;
        }
        
        if (element.attributes?.required === 'true') {
          formFields.requiredFields.push(element.attributes.name || `field_${index}`);
        }
      }

      // Track navigation links
      if (element.tagName === 'A' && element.attributes?.href) {
        const linkText = element.text || element.attributes['aria-label'] || '';
        if (linkText && !navigationLinks.includes(linkText)) {
          navigationLinks.push(linkText.substring(0, 50));
        }
      }
    });

    return {
      url: state.url,
      title: state.title || '',
      keyElements: keyElements.slice(0, 50), // Keep top 50 elements
      formFields: formFields.totalFields > 0 ? formFields : undefined,
      navigationLinks: navigationLinks.slice(0, 20), // Keep top 20 links
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate importance score for an element
   */
  private calculateElementImportance(element: any): number {
    let score = 0;

    // Interactive elements get higher scores
    if (['BUTTON', 'A', 'INPUT', 'SELECT'].includes(element.tagName)) {
      score += 0.5;
    }

    // Elements with certain attributes are more important
    if (element.attributes) {
      if (element.attributes['aria-label'] || element.attributes.title) score += 0.2;
      if (element.attributes.role) score += 0.1;
      if (element.attributes.id || element.attributes.name) score += 0.1;
    }

    // Visible text makes elements more important
    if (element.text && element.text.length > 0) {
      score += Math.min(0.2, element.text.length / 100);
    }

    // Elements with click handlers are important
    if (element.attributes?.onclick || element.attributes?.['data-action']) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  /**
   * Extract only key attributes to reduce token usage
   */
  private extractKeyAttributes(attributes?: Record<string, string>): Record<string, string> | undefined {
    if (!attributes) return undefined;

    const keyAttrs = [
      'id', 'name', 'type', 'role', 'aria-label', 'placeholder',
      'value', 'href', 'title', 'data-testid', 'data-action'
    ];

    const filtered: Record<string, string> = {};
    for (const key of keyAttrs) {
      if (attributes[key]) {
        filtered[key] = attributes[key].substring(0, 100); // Truncate long values
      }
    }

    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  /**
   * Compress action history
   */
  private compressActionHistory(actionResults: ActionResult[]): CompressedActionHistory {
    const recentActions: ActionSummary[] = [];
    const patterns = new Map<string, { count: number; success: number }>();
    const failedActions: FailedActionSummary[] = [];

    // Process action results
    actionResults.forEach((result, index) => {
      // Keep recent actions
      if (index >= actionResults.length - 10) {
        recentActions.push({
          type: this.inferActionType(result),
          target: result.extractedContent?.substring(0, 50),
          result: result.success ? 'success' : 'failure',
          timestamp: Date.now() - (actionResults.length - index) * 1000, // Approximate
        });
      }

      // Track patterns
      const actionType = this.inferActionType(result);
      const pattern = patterns.get(actionType) || { count: 0, success: 0 };
      pattern.count++;
      if (result.success) pattern.success++;
      patterns.set(actionType, pattern);

      // Track failures
      if (result.error) {
        failedActions.push({
          action: actionType,
          error: result.error.substring(0, 100),
          retryCount: 1, // Would need more context for accurate count
        });
      }
    });

    // Convert patterns to array
    const successfulPatterns: ActionPattern[] = Array.from(patterns.entries())
      .map(([pattern, stats]) => ({
        pattern,
        frequency: stats.count,
        successRate: stats.count > 0 ? stats.success / stats.count : 0,
      }))
      .filter(p => p.successRate > 0.5) // Only keep successful patterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5); // Top 5 patterns

    return {
      recentActions,
      successfulPatterns,
      failedActions: failedActions.slice(-5), // Keep last 5 failures
      totalActions: actionResults.length,
    };
  }

  /**
   * Infer action type from result
   */
  private inferActionType(result: ActionResult): string {
    if (result.extractedContent) {
      if (result.extractedContent.includes('click')) return 'click';
      if (result.extractedContent.includes('input') || result.extractedContent.includes('type')) return 'input';
      if (result.extractedContent.includes('navigate')) return 'navigate';
      if (result.extractedContent.includes('scroll')) return 'scroll';
      if (result.extractedContent.includes('wait')) return 'wait';
    }
    return 'unknown';
  }

  /**
   * Check if context should be compressed
   */
  private shouldCompress(context: SharedContext): boolean {
    return !context.compressed && 
           context.actionHistory.totalActions > this.compressionThreshold;
  }

  /**
   * Compress context further for long sessions
   */
  private async compressContext(context: SharedContext): Promise<SharedContext> {
    logger.info(`Compressing context for task ${context.taskId}`);

    // Further compress browser state
    if (context.browserState.keyElements.length > 20) {
      // Keep only top 20 most important elements
      context.browserState.keyElements = context.browserState.keyElements
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 20);
    }

    // Compress action history
    if (context.actionHistory.recentActions.length > 5) {
      context.actionHistory.recentActions = context.actionHistory.recentActions.slice(-5);
    }

    context.compressed = true;
    context.metadata.compressionRatio = 0.5; // Approximate

    return context;
  }

  /**
   * Get empty browser state
   */
  private getEmptyBrowserState(): CompressedBrowserState {
    return {
      url: '',
      title: '',
      keyElements: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Clean up stale contexts
   */
  private cleanupStaleContexts(): void {
    const now = Date.now();
    const staleContexts: string[] = [];

    this.contexts.forEach((context, taskId) => {
      if (now - context.lastAccessed > this.cacheTimeout) {
        staleContexts.push(taskId);
      }
    });

    staleContexts.forEach(taskId => {
      logger.debug(`Removing stale context for task ${taskId}`);
      this.contexts.delete(taskId);
    });
  }

  /**
   * Get context statistics
   */
  getStats(): {
    totalContexts: number;
    compressedContexts: number;
    averageCompressionRatio: number;
    totalMemoryUsage: number;
  } {
    let compressedCount = 0;
    let totalRatio = 0;
    let ratioCount = 0;

    this.contexts.forEach(context => {
      if (context.compressed) compressedCount++;
      if (context.metadata.compressionRatio) {
        totalRatio += context.metadata.compressionRatio;
        ratioCount++;
      }
    });

    return {
      totalContexts: this.contexts.size,
      compressedContexts: compressedCount,
      averageCompressionRatio: ratioCount > 0 ? totalRatio / ratioCount : 0,
      totalMemoryUsage: this.contexts.size * 1000, // Rough estimate
    };
  }

  /**
   * Clear all contexts
   */
  clear(): void {
    this.contexts.clear();
  }
}