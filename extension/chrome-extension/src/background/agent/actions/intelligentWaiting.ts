import { createLogger } from '../../log';
import type BrowserContext from '../../browser/context';
import type Page from '../../browser/page';

const logger = createLogger('IntelligentWaiting');

export interface WaitCondition {
  /** Human-readable description of the condition */
  description: string;
  /** Function that returns true when condition is met */
  check: () => Promise<boolean>;
  /** Weight/importance of this condition (0-1) */
  weight?: number;
}

export interface WaitOptions {
  /** Maximum time to wait in milliseconds */
  maxWait?: number;
  /** Minimum time to wait in milliseconds (ensures some stability) */
  minWait?: number;
  /** How often to check conditions in milliseconds */
  checkInterval?: number;
  /** Conditions that must be met */
  conditions?: WaitCondition[];
  /** Built-in condition presets */
  preset?: 'pageLoad' | 'networkIdle' | 'elementVisible' | 'animationsComplete' | 'fast' | 'stable';
  /** Element selector to wait for (when using elementVisible preset) */
  elementSelector?: string;
  /** Custom timeout for specific operations */
  timeout?: number;
}

export interface WaitResult {
  /** Whether the wait completed successfully */
  success: boolean;
  /** Time spent waiting in milliseconds */
  duration: number;
  /** Conditions that were met */
  metConditions: string[];
  /** Conditions that were not met (if timed out) */
  unmetConditions: string[];
  /** Reason for completion */
  reason: 'completed' | 'timeout' | 'minWaitReached';
}

/**
 * Intelligent Waiting System
 * Replaces fixed delays with smart, condition-based waiting
 */
export class IntelligentWaiting {
  private static readonly DEFAULT_OPTIONS: Required<Omit<WaitOptions, 'conditions' | 'preset' | 'elementSelector' | 'timeout'>> = {
    maxWait: 10000,    // 10 seconds
    minWait: 250,      // 250ms minimum for stability
    checkInterval: 100, // Check every 100ms
  };

  /**
   * Smart wait that replaces setTimeout with condition-based waiting
   */
  static async waitFor(
    browserContext: BrowserContext,
    options: WaitOptions = {}
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    
    // Apply preset conditions if specified
    let conditions = options.conditions || [];
    if (options.preset) {
      conditions = await this.getPresetConditions(
        browserContext, 
        options.preset, 
        options.elementSelector
      );
    }

    // If no conditions specified, use fast preset
    if (conditions.length === 0) {
      conditions = await this.getPresetConditions(browserContext, 'fast');
    }

    logger.debug(`Starting intelligent wait with ${conditions.length} conditions`, {
      preset: options.preset,
      maxWait: config.maxWait,
      minWait: config.minWait,
      conditions: conditions.map(c => c.description)
    });

    const metConditions: string[] = [];
    const unmetConditions: string[] = [];

    // Wait for minimum time first (ensures stability)
    if (config.minWait > 0) {
      await this.sleep(config.minWait);
    }

    // Check conditions periodically
    while (Date.now() - startTime < config.maxWait) {
      const conditionResults = await Promise.allSettled(
        conditions.map(async (condition) => ({
          condition,
          result: await condition.check()
        }))
      );

      // Evaluate conditions
      metConditions.length = 0;
      unmetConditions.length = 0;

      for (const result of conditionResults) {
        if (result.status === 'fulfilled') {
          const { condition, result: conditionMet } = result.value;
          if (conditionMet) {
            metConditions.push(condition.description);
          } else {
            unmetConditions.push(condition.description);
          }
        } else {
          logger.warning('Condition check failed:', result.reason);
        }
      }

      // Check if all conditions are met
      if (unmetConditions.length === 0 && conditions.length > 0) {
        const duration = Date.now() - startTime;
        logger.debug(`All conditions met after ${duration}ms`, metConditions);
        return {
          success: true,
          duration,
          metConditions,
          unmetConditions: [],
          reason: 'completed'
        };
      }

      // Wait before next check
      await this.sleep(config.checkInterval);
    }

    // Timeout reached
    const duration = Date.now() - startTime;
    logger.debug(`Wait timed out after ${duration}ms`, {
      metConditions,
      unmetConditions
    });

    return {
      success: false,
      duration,
      metConditions,
      unmetConditions,
      reason: 'timeout'
    };
  }

  /**
   * Get preset condition sets for common scenarios
   */
  private static async getPresetConditions(
    browserContext: BrowserContext,
    preset: string,
    elementSelector?: string
  ): Promise<WaitCondition[]> {
    const page = await browserContext.getCurrentPage();

    switch (preset) {
      case 'pageLoad':
        return [
          {
            description: 'Page ready state is complete',
            check: async () => this.checkPageReadyState(page),
            weight: 0.8
          },
          {
            description: 'No pending network requests',
            check: async () => this.checkNetworkIdle(page),
            weight: 0.7
          },
          {
            description: 'DOM is stable',
            check: async () => this.checkDOMStability(page),
            weight: 0.6
          }
        ];

      case 'networkIdle':
        return [
          {
            description: 'No pending network requests',
            check: async () => this.checkNetworkIdle(page),
            weight: 1.0
          }
        ];

      case 'elementVisible':
        if (!elementSelector) {
          throw new Error('elementSelector required for elementVisible preset');
        }
        return [
          {
            description: `Element '${elementSelector}' is visible`,
            check: async () => this.checkElementVisible(page, elementSelector),
            weight: 1.0
          }
        ];

      case 'animationsComplete':
        return [
          {
            description: 'CSS animations completed',
            check: async () => this.checkAnimationsComplete(page),
            weight: 0.8
          },
          {
            description: 'Page is stable',
            check: async () => this.checkPageStable(page),
            weight: 0.6
          }
        ];

      case 'fast':
        return [
          {
            description: 'Basic page stability',
            check: async () => this.checkPageStable(page),
            weight: 1.0
          }
        ];

      case 'stable':
        return [
          {
            description: 'Page ready state is complete',
            check: async () => this.checkPageReadyState(page),
            weight: 0.9
          },
          {
            description: 'DOM is stable',
            check: async () => this.checkDOMStability(page),
            weight: 0.8
          },
          {
            description: 'Page layout is stable',
            check: async () => this.checkPageStable(page),
            weight: 0.7
          }
        ];

      default:
        logger.warning(`Unknown preset: ${preset}, using 'fast' preset`);
        return this.getPresetConditions(browserContext, 'fast');
    }
  }

  /**
   * Check if page ready state is complete
   */
  private static async checkPageReadyState(page: Page): Promise<boolean> {
    try {
      const readyState = await page.evaluateInPage(() => document.readyState);
      return readyState === 'complete';
    } catch (error) {
      logger.debug('Failed to check page ready state:', error);
      return false;
    }
  }

  /**
   * Check if network is idle (no pending requests)
   */
  private static async checkNetworkIdle(page: Page): Promise<boolean> {
    try {
      // This is a simplified check - in a full implementation,
      // we'd track actual network requests via CDP
      const hasActiveRequests = await page.evaluateInPage(() => {
        // Check for common loading indicators
        return !!(
          document.querySelector('.loading, .spinner, [data-loading="true"]') ||
          (window as any).fetch?.activeFetches > 0
        );
      });
      return !hasActiveRequests;
    } catch (error) {
      logger.debug('Failed to check network idle:', error);
      return true; // Assume idle if can't check
    }
  }

  /**
   * Check if DOM is stable (no recent mutations)
   */
  private static async checkDOMStability(page: Page): Promise<boolean> {
    try {
      const isStable = await page.evaluateInPage(() => {
        // Simple stability check - could be enhanced with MutationObserver
        const now = Date.now();
        const lastModified = (window as any).__lastDOMModification || 0;
        return now - lastModified > 500; // Stable for 500ms
      });
      return isStable;
    } catch (error) {
      logger.debug('Failed to check DOM stability:', error);
      return true; // Assume stable if can't check
    }
  }

  /**
   * Check if element is visible
   */
  private static async checkElementVisible(page: Page, selector: string): Promise<boolean> {
    try {
      const isVisible = await page.evaluateInPage((sel: string) => {
        const element = document.querySelector(sel);
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return !!(
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      }, selector);
      return isVisible;
    } catch (error) {
      logger.debug(`Failed to check element visibility for '${selector}':`, error);
      return false;
    }
  }

  /**
   * Check if animations are complete
   */
  private static async checkAnimationsComplete(page: Page): Promise<boolean> {
    try {
      const animationsComplete = await page.evaluateInPage(() => {
        const animations = document.getAnimations();
        return animations.every(animation => 
          animation.playState === 'finished' || 
          animation.playState === 'idle'
        );
      });
      return animationsComplete;
    } catch (error) {
      logger.debug('Failed to check animations:', error);
      return true; // Assume complete if can't check
    }
  }

  /**
   * Check if page is generally stable
   */
  private static async checkPageStable(page: Page): Promise<boolean> {
    try {
      // Quick stability check
      const isStable = await page.evaluateInPage(() => {
        return document.readyState !== 'loading';
      });
      return isStable;
    } catch (error) {
      logger.debug('Failed to check page stability:', error);
      return true;
    }
  }

  /**
   * Simple sleep utility (fallback for minimum waits)
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Quick wait for common scenarios (replaces most setTimeout calls)
   */
  static async quickWait(browserContext: BrowserContext, scenario: 'action' | 'scroll' | 'click' | 'input' = 'action'): Promise<WaitResult> {
    const presets: Record<string, WaitOptions> = {
      action: { preset: 'fast', maxWait: 2000, minWait: 100 },
      scroll: { preset: 'stable', maxWait: 1000, minWait: 200 },
      click: { preset: 'fast', maxWait: 1500, minWait: 50 },
      input: { preset: 'fast', maxWait: 1000, minWait: 50 }
    };

    return this.waitFor(browserContext, presets[scenario]);
  }

  /**
   * Create a custom condition
   */
  static createCondition(description: string, checkFn: () => Promise<boolean>, weight = 1.0): WaitCondition {
    return {
      description,
      check: checkFn,
      weight
    };
  }
}