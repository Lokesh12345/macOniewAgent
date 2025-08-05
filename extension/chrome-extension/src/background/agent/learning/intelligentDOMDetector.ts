import { createLogger } from '@src/background/log';
import { DOMChangeType } from '../types/executionContext';
import type { BrowserState } from '@src/background/browser/views';
import { DOMPatternLearner, LearningContext } from './domPatternLearner';

const logger = createLogger('IntelligentDOMDetector');

export interface IntelligentDOMAnalysis {
  type: DOMChangeType;
  description: string;
  confidence: number;
  learnedFrom?: string; // Pattern ID if learned
  suggestions: Array<{
    type: 'wait' | 'click' | 'select' | 'escape' | 'custom';
    description: string;
    confidence: number;
    selector?: string;
  }>;
}

export class IntelligentDOMDetector {
  private patternLearner: DOMPatternLearner;
  private fallbackDetectionEnabled = true;

  constructor() {
    this.patternLearner = new DOMPatternLearner();
  }

  /**
   * Analyze DOM changes using learned patterns first, fallback to heuristics
   */
  async analyzeDOMChanges(
    oldState: BrowserState,
    newState: BrowserState,
    lastAction?: Record<string, unknown>,
    elementInteracted?: any
  ): Promise<IntelligentDOMAnalysis> {
    const context: LearningContext = {
      domain: this.extractDomain(newState.url || ''),
      url: newState.url || '',
      actionTaken: lastAction || {},
      domBefore: oldState,
      domAfter: newState,
      elementInteracted: elementInteracted ? {
        selector: this.generateSelector(elementInteracted),
        text: elementInteracted.text,
        attributes: elementInteracted.attributes
      } : undefined
    };

    // First, try to find learned patterns
    const matchingPatterns = await this.patternLearner.findMatchingPatterns(context);
    
    if (matchingPatterns.length > 0) {
      const bestPattern = matchingPatterns[0];
      logger.info(`Using learned pattern: ${bestPattern.id} (confidence: ${bestPattern.confidence})`);
      
      return {
        type: bestPattern.change.type,
        description: `${bestPattern.change.description} (learned pattern)`,
        confidence: bestPattern.confidence,
        learnedFrom: bestPattern.id,
        suggestions: [{
          type: bestPattern.solution.type,
          description: `Learned solution: ${bestPattern.solution.type}`,
          confidence: bestPattern.successRate,
          selector: bestPattern.solution.selector
        }]
      };
    }

    // Fallback to heuristic analysis
    if (this.fallbackDetectionEnabled) {
      const heuristicAnalysis = await this.performHeuristicAnalysis(oldState, newState, lastAction);
      
      // Learn from this new situation
      await this.learnFromNewSituation(context, heuristicAnalysis);
      
      return heuristicAnalysis;
    }

    // No patterns found and fallback disabled
    return {
      type: DOMChangeType.NONE,
      description: 'No learned patterns matched and heuristic analysis disabled',
      confidence: 0,
      suggestions: []
    };
  }

  /**
   * Learn from the outcome of handling a DOM change
   */
  async recordOutcome(
    context: LearningContext,
    changeType: DOMChangeType,
    solutionTried: any,
    success: boolean
  ): Promise<void> {
    await this.patternLearner.learnFromDOMChange(
      context,
      changeType,
      `DOM change handled ${success ? 'successfully' : 'unsuccessfully'}`,
      {
        type: solutionTried.type,
        selector: solutionTried.selector,
        waitTime: solutionTried.waitTime,
        customScript: solutionTried.customScript,
        success
      }
    );

    this.patternLearner.recordOutcome(context, success ? 'success' : 'failure', solutionTried);
  }

  /**
   * Apply learned solution to handle DOM change
   */
  async applySolution(
    analysis: IntelligentDOMAnalysis,
    browserContext: any
  ): Promise<{ success: boolean; description: string }> {
    if (analysis.suggestions.length === 0) {
      return { success: false, description: 'No solutions available' };
    }

    // Try suggestions in order of confidence
    for (const suggestion of analysis.suggestions) {
      logger.info(`Trying solution: ${suggestion.type} (confidence: ${suggestion.confidence})`);
      
      let success = false;
      let description = '';

      try {
        switch (suggestion.type) {
          case 'wait':
            await new Promise(resolve => setTimeout(resolve, 1000));
            success = await this.verifyDOMStabilized(browserContext);
            description = success ? 'DOM stabilized after waiting' : 'DOM still changing after wait';
            break;

          case 'click':
            if (suggestion.selector) {
              success = await this.safeClick(browserContext, suggestion.selector);
              description = success ? `Clicked ${suggestion.selector}` : `Failed to click ${suggestion.selector}`;
            }
            break;

          case 'escape':
            const page = await browserContext.getCurrentPage();
            await page.sendKeys('Escape');
            success = await this.verifyElementsGone(browserContext, ['[role="dialog"]', '.modal', '.dropdown']);
            description = success ? 'Elements dismissed with Escape' : 'Escape did not dismiss elements';
            break;

          case 'select':
            if (suggestion.selector) {
              success = await this.selectFromDropdown(browserContext, suggestion.selector);
              description = success ? `Selected from ${suggestion.selector}` : `Failed to select from ${suggestion.selector}`;
            }
            break;

          case 'custom':
            // Custom solutions would be stored as scripts in learned patterns
            success = false;
            description = 'Custom solutions not implemented yet';
            break;
        }

        if (success) {
          logger.info(`Solution successful: ${description}`);
          return { success: true, description };
        }
      } catch (error) {
        logger.warning(`Solution failed with error: ${error}`);
      }
    }

    return { success: false, description: 'All solutions failed' };
  }

  /**
   * Heuristic analysis as fallback when no patterns are learned
   */
  private async performHeuristicAnalysis(
    oldState: BrowserState,
    newState: BrowserState,
    lastAction?: Record<string, unknown>
  ): Promise<IntelligentDOMAnalysis> {
    // Basic change detection
    const oldElementCount = oldState.selectorMap?.size || 0;
    const newElementCount = newState.selectorMap?.size || 0;
    
    if (newElementCount <= oldElementCount) {
      return {
        type: DOMChangeType.NONE,
        description: 'No new elements detected',
        confidence: 0.9,
        suggestions: []
      };
    }

    // Analyze what kind of action triggered this
    const actionType = lastAction ? Object.keys(lastAction)[0] : '';
    
    // Intelligent guessing based on action and element count increase
    if (actionType === 'input_text') {
      return {
        type: DOMChangeType.INTERACTIVE,
        description: 'Text input likely triggered autocomplete or suggestions',
        confidence: 0.7,
        suggestions: [
          { type: 'wait', description: 'Wait for user to select from dropdown', confidence: 0.8 },
          { type: 'escape', description: 'Dismiss dropdown to continue', confidence: 0.6 }
        ]
      };
    }

    if (actionType === 'click_element') {
      const elementIncrease = newElementCount - oldElementCount;
      if (elementIncrease > 10) {
        return {
          type: DOMChangeType.BLOCKING,
          description: 'Click likely opened modal or overlay (many elements added)',
          confidence: 0.8,
          suggestions: [
            { type: 'click', description: 'Look for close button', confidence: 0.7, selector: '[aria-label="Close"], .close, [data-dismiss]' },
            { type: 'escape', description: 'Try escape key', confidence: 0.5 }
          ]
        };
      } else {
        return {
          type: DOMChangeType.INTERACTIVE,
          description: 'Click triggered minor UI changes',
          confidence: 0.6,
          suggestions: [
            { type: 'wait', description: 'Wait for changes to settle', confidence: 0.8 }
          ]
        };
      }
    }

    // Default case
    return {
      type: DOMChangeType.MINOR,
      description: `${newElementCount - oldElementCount} new elements appeared`,
      confidence: 0.5,
      suggestions: [
        { type: 'wait', description: 'Wait for DOM to stabilize', confidence: 0.7 }
      ]
    };
  }

  /**
   * Learn from new situations not covered by existing patterns
   */
  private async learnFromNewSituation(
    context: LearningContext,
    analysis: IntelligentDOMAnalysis
  ): Promise<void> {
    // This situation wasn't learned before, so we learn it now
    await this.patternLearner.learnFromDOMChange(
      context,
      analysis.type,
      analysis.description,
      analysis.suggestions[0] ? {
        type: analysis.suggestions[0].type,
        selector: analysis.suggestions[0].selector,
        success: false // We don't know yet
      } : undefined
    );
  }

  // Helper methods
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || 'unknown';
    }
  }

  private generateSelector(element: any): string {
    // Generate a CSS selector for the element
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    if (element.tagName) return element.tagName.toLowerCase();
    return '[data-unknown]';
  }

  private async verifyDOMStabilized(browserContext: any): Promise<boolean> {
    // Check if DOM stopped changing
    const page = await browserContext.getCurrentPage();
    const before = await page.evaluateInPage(() => document.body.children.length);
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = await page.evaluateInPage(() => document.body.children.length);
    return before === after;
  }

  private async safeClick(browserContext: any, selector: string): Promise<boolean> {
    try {
      const page = await browserContext.getCurrentPage();
      const result = await page.evaluateInPage((sel) => {
        const element = document.querySelector(sel);
        if (element && element.offsetParent !== null) {
          element.click();
          return true;
        }
        return false;
      }, selector);
      return result;
    } catch {
      return false;
    }
  }

  private async verifyElementsGone(browserContext: any, selectors: string[]): Promise<boolean> {
    try {
      const page = await browserContext.getCurrentPage();
      const result = await page.evaluateInPage((sels) => {
        return sels.every(sel => {
          const elements = document.querySelectorAll(sel);
          return elements.length === 0 || Array.from(elements).every(el => el.offsetParent === null);
        });
      }, selectors);
      return result;
    } catch {
      return false;
    }
  }

  private async selectFromDropdown(browserContext: any, selector: string): Promise<boolean> {
    try {
      const page = await browserContext.getCurrentPage();
      const result = await page.evaluateInPage((sel) => {
        const dropdown = document.querySelector(sel);
        if (dropdown && dropdown.children.length > 0) {
          const firstOption = dropdown.children[0] as HTMLElement;
          firstOption.click();
          return true;
        }
        return false;
      }, selector);
      return result;
    } catch {
      return false;
    }
  }

  /**
   * Get learning insights for debugging/monitoring
   */
  getInsights() {
    return this.patternLearner.getInsights();
  }
}