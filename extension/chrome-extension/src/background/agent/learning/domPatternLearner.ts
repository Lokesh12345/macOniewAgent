import { createLogger } from '@src/background/log';
import type { BrowserState } from '@src/background/browser/views';
import { DOMChangeType } from '../types/executionContext';

const logger = createLogger('DOMPatternLearner');

export interface DOMPattern {
  id: string;
  domain: string;
  url: string;
  trigger: {
    actionType: string;
    elementSelector?: string;
    elementText?: string;
    elementAttributes?: Record<string, string>;
  };
  change: {
    type: DOMChangeType;
    description: string;
    selectors: string[];
    characteristics: string[];
  };
  solution: {
    type: 'wait' | 'click' | 'select' | 'escape' | 'custom';
    selector?: string;
    waitTime?: number;
    customScript?: string;
    success: boolean;
  };
  confidence: number;
  usageCount: number;
  successRate: number;
  lastUsed: number;
  learned: number;
}

export interface LearningContext {
  domain: string;
  url: string;
  actionTaken: Record<string, unknown>;
  domBefore: BrowserState;
  domAfter: BrowserState;
  elementInteracted?: {
    selector: string;
    text?: string;
    attributes?: Record<string, string>;
  };
}

export class DOMPatternLearner {
  private patterns: Map<string, DOMPattern> = new Map();
  private learningHistory: Array<{
    context: LearningContext;
    outcome: 'success' | 'failure';
    solution?: DOMPattern['solution'];
    timestamp: number;
  }> = [];

  constructor() {
    this.loadPatterns();
  }

  /**
   * Learn from a DOM change event
   */
  async learnFromDOMChange(
    context: LearningContext,
    changeType: DOMChangeType,
    changeDescription: string,
    solution?: DOMPattern['solution']
  ): Promise<void> {
    logger.info('Learning from DOM change:', { domain: context.domain, type: changeType });

    const characteristics = this.extractDOMCharacteristics(context.domAfter, context.domBefore);
    const selectors = this.extractNewSelectors(context.domAfter, context.domBefore);

    const pattern: DOMPattern = {
      id: this.generatePatternId(context, changeType),
      domain: context.domain,
      url: context.url,
      trigger: {
        actionType: Object.keys(context.actionTaken)[0],
        elementSelector: context.elementInteracted?.selector,
        elementText: context.elementInteracted?.text,
        elementAttributes: context.elementInteracted?.attributes
      },
      change: {
        type: changeType,
        description: changeDescription,
        selectors,
        characteristics
      },
      solution: solution || { type: 'wait', success: false },
      confidence: 0.5, // Start with medium confidence
      usageCount: 1,
      successRate: solution?.success ? 1 : 0,
      lastUsed: Date.now(),
      learned: Date.now()
    };

    this.patterns.set(pattern.id, pattern);
    this.savePatterns();

    logger.info(`Learned new pattern: ${pattern.id}`);
  }

  /**
   * Find matching patterns for current situation
   */
  async findMatchingPatterns(context: LearningContext): Promise<DOMPattern[]> {
    const matches: Array<{ pattern: DOMPattern; score: number }> = [];

    for (const pattern of this.patterns.values()) {
      const score = this.calculatePatternMatch(pattern, context);
      if (score > 0.3) { // Minimum confidence threshold
        matches.push({ pattern, score });
      }
    }

    // Sort by score and confidence
    matches.sort((a, b) => {
      const scoreA = a.score * a.pattern.confidence * (a.pattern.successRate || 0.1);
      const scoreB = b.score * b.pattern.confidence * (b.pattern.successRate || 0.1);
      return scoreB - scoreA;
    });

    return matches.map(m => m.pattern);
  }

  /**
   * Apply learned solution to current situation
   */
  async applySolution(pattern: DOMPattern, browserContext: any): Promise<boolean> {
    logger.info(`Applying learned solution: ${pattern.solution.type} for pattern ${pattern.id}`);

    try {
      let success = false;

      switch (pattern.solution.type) {
        case 'wait':
          await new Promise(resolve => setTimeout(resolve, pattern.solution.waitTime || 1000));
          success = true;
          break;

        case 'click':
          if (pattern.solution.selector) {
            const script = `
              const element = document.querySelector('${pattern.solution.selector}');
              if (element) {
                element.click();
                return true;
              }
              return false;
            `;
            const page = await browserContext.getCurrentPage();
            success = await page.evaluateInPage(script);
          }
          break;

        case 'escape':
          const page = await browserContext.getCurrentPage();
          await page.sendKeys('Escape');
          success = true;
          break;

        case 'select':
          if (pattern.solution.selector) {
            const script = `
              const dropdown = document.querySelector('${pattern.solution.selector}');
              if (dropdown && dropdown.children.length > 0) {
                dropdown.children[0].click();
                return true;
              }
              return false;
            `;
            const page = await browserContext.getCurrentPage();
            success = await page.evaluateInPage(script);
          }
          break;

        case 'custom':
          if (pattern.solution.customScript) {
            const page = await browserContext.getCurrentPage();
            success = await page.evaluateInPage(pattern.solution.customScript);
          }
          break;
      }

      // Update pattern statistics
      pattern.usageCount++;
      pattern.lastUsed = Date.now();
      
      if (success) {
        pattern.successRate = ((pattern.successRate * (pattern.usageCount - 1)) + 1) / pattern.usageCount;
        pattern.confidence = Math.min(pattern.confidence + 0.1, 1.0);
      } else {
        pattern.successRate = (pattern.successRate * (pattern.usageCount - 1)) / pattern.usageCount;
        pattern.confidence = Math.max(pattern.confidence - 0.05, 0.1);
      }

      this.savePatterns();
      logger.info(`Solution ${success ? 'succeeded' : 'failed'}. Updated pattern confidence: ${pattern.confidence}`);

      return success;
    } catch (error) {
      logger.error('Error applying solution:', error);
      return false;
    }
  }

  /**
   * Record learning outcome for future improvement
   */
  recordOutcome(
    context: LearningContext,
    outcome: 'success' | 'failure',
    solution?: DOMPattern['solution']
  ): void {
    this.learningHistory.push({
      context,
      outcome,
      solution,
      timestamp: Date.now()
    });

    // Keep only recent history
    if (this.learningHistory.length > 1000) {
      this.learningHistory = this.learningHistory.slice(-500);
    }
  }

  /**
   * Get insights about learned patterns
   */
  getInsights(): {
    totalPatterns: number;
    domainBreakdown: Record<string, number>;
    successRates: Record<string, number>;
    mostUsedPatterns: Array<{ id: string; usageCount: number; successRate: number }>;
  } {
    const domainBreakdown: Record<string, number> = {};
    const successRates: Record<string, number> = {};
    const patternUsage: Array<{ id: string; usageCount: number; successRate: number }> = [];

    for (const pattern of this.patterns.values()) {
      domainBreakdown[pattern.domain] = (domainBreakdown[pattern.domain] || 0) + 1;
      successRates[pattern.change.type] = 
        ((successRates[pattern.change.type] || 0) + pattern.successRate) / 
        (Object.keys(successRates).includes(pattern.change.type) ? 2 : 1);
      
      patternUsage.push({
        id: pattern.id,
        usageCount: pattern.usageCount,
        successRate: pattern.successRate
      });
    }

    patternUsage.sort((a, b) => b.usageCount - a.usageCount);

    return {
      totalPatterns: this.patterns.size,
      domainBreakdown,
      successRates,
      mostUsedPatterns: patternUsage.slice(0, 10)
    };
  }

  /**
   * Extract DOM characteristics that might indicate dynamic behavior
   */
  private extractDOMCharacteristics(domAfter: BrowserState, domBefore: BrowserState): string[] {
    const characteristics: string[] = [];

    // Analyze what types of elements appeared
    // This would require comparing the DOM trees
    // For now, we'll use simple heuristics

    const afterElements = domAfter.selectorMap?.size || 0;
    const beforeElements = domBefore.selectorMap?.size || 0;

    if (afterElements > beforeElements) {
      characteristics.push('elements_added');
      
      const diff = afterElements - beforeElements;
      if (diff > 10) characteristics.push('many_elements_added');
      if (diff === 1) characteristics.push('single_element_added');
    }

    // Check for common patterns in URLs
    if (domAfter.url?.includes('modal')) characteristics.push('modal_in_url');
    if (domAfter.url?.includes('popup')) characteristics.push('popup_in_url');

    return characteristics;
  }

  /**
   * Extract new selectors that appeared after DOM change
   */
  private extractNewSelectors(domAfter: BrowserState, domBefore: BrowserState): string[] {
    const selectors: string[] = [];

    // This is a simplified version - in reality, we'd need to compare DOM trees
    // and extract selectors for new elements
    
    // For now, return common dynamic element patterns
    const commonPatterns = [
      '[role="dialog"]',
      '[role="listbox"]',
      '.dropdown',
      '.modal',
      '.autocomplete'
    ];

    return selectors.length > 0 ? selectors : commonPatterns;
  }

  /**
   * Calculate how well a pattern matches current context
   */
  private calculatePatternMatch(pattern: DOMPattern, context: LearningContext): number {
    let score = 0;

    // Domain match (high weight)
    if (pattern.domain === context.domain) score += 0.4;

    // Action type match (medium weight)
    const currentActionType = Object.keys(context.actionTaken)[0];
    if (pattern.trigger.actionType === currentActionType) score += 0.3;

    // Element similarity (medium weight)
    if (pattern.trigger.elementText && context.elementInteracted?.text) {
      const similarity = this.calculateTextSimilarity(
        pattern.trigger.elementText,
        context.elementInteracted.text
      );
      score += 0.2 * similarity;
    }

    // URL similarity (low weight)
    if (pattern.url && context.url) {
      const urlSimilarity = this.calculateURLSimilarity(pattern.url, context.url);
      score += 0.1 * urlSimilarity;
    }

    return score;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const common = words1.filter(word => words2.includes(word));
    return common.length / Math.max(words1.length, words2.length);
  }

  private calculateURLSimilarity(url1: string, url2: string): number {
    // Compare URL paths
    try {
      const path1 = new URL(url1).pathname;
      const path2 = new URL(url2).pathname;
      return path1 === path2 ? 1 : 0.5;
    } catch {
      return url1 === url2 ? 1 : 0;
    }
  }

  private generatePatternId(context: LearningContext, changeType: DOMChangeType): string {
    const actionType = Object.keys(context.actionTaken)[0];
    const domain = context.domain.replace(/\./g, '_');
    const timestamp = Date.now().toString(36);
    return `${domain}_${actionType}_${changeType}_${timestamp}`;
  }

  private loadPatterns(): void {
    try {
      // In a real implementation, this would load from persistent storage
      const stored = localStorage.getItem('domPatterns');
      if (stored) {
        const patterns = JSON.parse(stored);
        this.patterns = new Map(Object.entries(patterns));
        logger.info(`Loaded ${this.patterns.size} DOM patterns from storage`);
      }
    } catch (error) {
      logger.error('Error loading patterns:', error);
    }
  }

  private savePatterns(): void {
    try {
      // Convert Map to object for storage
      const patternsObj = Object.fromEntries(this.patterns);
      localStorage.setItem('domPatterns', JSON.stringify(patternsObj));
    } catch (error) {
      logger.error('Error saving patterns:', error);
    }
  }
}