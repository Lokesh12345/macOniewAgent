import { createLogger } from '../../log';
import type BrowserContext from '../../browser/context';
import type { AgentContext, ActionResult } from '../types';
import { IntelligentWaiting } from './intelligentWaiting';
import { EnhancedElementFinder, type TargetingStrategy } from './enhancedElementFinder';
import { ActionResult as ActionResultClass } from '../types';

const logger = createLogger('ErrorRecovery');

export interface RecoveryStrategy {
  /** Human-readable description of the strategy */
  description: string;
  /** Function that attempts recovery */
  execute: () => Promise<RecoveryResult>;
  /** Priority of this strategy (higher = tried first) */
  priority: number;
  /** Whether this strategy is applicable to the current error */
  isApplicable: (error: Error, context: RecoveryContext) => boolean;
}

export interface RecoveryContext {
  /** The original error that triggered recovery */
  originalError: Error;
  /** Context information about the failed action */
  actionType: 'click' | 'input' | 'scroll' | 'navigation' | 'wait' | 'other';
  /** Element targeting information (if applicable) */
  targetingStrategy?: TargetingStrategy;
  /** Browser context for recovery operations */
  browserContext: BrowserContext;
  /** Agent context for state management */
  agentContext: AgentContext;
  /** Number of recovery attempts already made */
  attemptCount: number;
  /** Maximum recovery attempts allowed */
  maxAttempts: number;
}

export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Description of what happened during recovery */
  message: string;
  /** Whether to retry the original action */
  shouldRetry: boolean;
  /** Whether to continue with alternative approach */
  shouldContinue: boolean;
  /** Modified targeting strategy for retry (if applicable) */
  modifiedStrategy?: TargetingStrategy;
  /** Additional context for logging */
  details?: Record<string, any>;
}

/**
 * Error Recovery System
 * Provides self-healing automation through intelligent recovery strategies
 */
export class ErrorRecovery {
  private static readonly DEFAULT_MAX_ATTEMPTS = 3;
  private static readonly RECOVERY_TIMEOUT = 5000; // 5 seconds

  /**
   * Attempt to recover from an error using multiple strategies
   */
  static async attemptRecovery(context: RecoveryContext): Promise<RecoveryResult> {
    logger.info(`Starting error recovery for ${context.actionType} action`, {
      error: context.originalError.message,
      attempt: context.attemptCount,
      maxAttempts: context.maxAttempts
    });

    // Get applicable recovery strategies
    const strategies = this.getRecoveryStrategies(context);
    
    if (strategies.length === 0) {
      logger.warning('No applicable recovery strategies found');
      return {
        success: false,
        message: 'No recovery strategies available for this error type',
        shouldRetry: false,
        shouldContinue: false
      };
    }

    // Sort strategies by priority (highest first)
    strategies.sort((a, b) => b.priority - a.priority);

    // Try each strategy in order
    for (const strategy of strategies) {
      logger.debug(`Attempting recovery strategy: ${strategy.description}`);
      
      try {
        const result = await Promise.race([
          strategy.execute(),
          this.timeoutPromise(this.RECOVERY_TIMEOUT, strategy.description)
        ]);

        if (result.success) {
          logger.info(`Recovery successful using strategy: ${strategy.description}`, result);
          return result;
        } else {
          logger.debug(`Recovery strategy failed: ${strategy.description} - ${result.message}`);
        }
      } catch (error) {
        logger.warning(`Recovery strategy threw error: ${strategy.description}`, error);
      }
    }

    // All strategies failed
    logger.warning('All recovery strategies failed');
    return {
      success: false,
      message: `All ${strategies.length} recovery strategies failed`,
      shouldRetry: false,
      shouldContinue: false,
      details: {
        strategiesAttempted: strategies.map(s => s.description)
      }
    };
  }

  /**
   * Get applicable recovery strategies for the given context
   */
  private static getRecoveryStrategies(context: RecoveryContext): RecoveryStrategy[] {
    const allStrategies = [
      this.createPageRefreshStrategy(context),
      this.createScrollAndWaitStrategy(context),
      this.createElementResearchStrategy(context),
      this.createPageStabilizationStrategy(context),
      this.createAlternativeTargetingStrategy(context),
      this.createTimeoutExtensionStrategy(context),
      this.createGracefulContinuationStrategy(context)
    ];

    return allStrategies.filter(strategy => 
      strategy.isApplicable(context.originalError, context)
    );
  }

  /**
   * Strategy: Refresh page state and retry
   */
  private static createPageRefreshStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Refresh page state and retry',
      priority: 80,
      isApplicable: (error, ctx) => {
        return ctx.actionType === 'click' || ctx.actionType === 'input';
      },
      execute: async () => {
        try {
          // Get fresh page state
          await context.browserContext.getState(true); // Force refresh
          
          // Brief wait for stability
          await IntelligentWaiting.quickWait(context.browserContext, 'action');
          
          return {
            success: true,
            message: 'Page state refreshed successfully',
            shouldRetry: true,
            shouldContinue: false
          };
        } catch (error) {
          return {
            success: false,
            message: `Page refresh failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Scroll to element and wait for stability
   */
  private static createScrollAndWaitStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Scroll to target area and wait for page stability',
      priority: 75,
      isApplicable: (error, ctx) => {
        return (ctx.actionType === 'click' || ctx.actionType === 'input') && 
               error.message.includes('not found');
      },
      execute: async () => {
        try {
          const page = await context.browserContext.getCurrentPage();
          
          // Try scrolling to find the element
          if (context.targetingStrategy?.text) {
            const scrolled = await page.scrollToText(context.targetingStrategy.text, 1);
            if (scrolled) {
              await IntelligentWaiting.waitFor(context.browserContext, {
                preset: 'stable',
                maxWait: 3000
              });
              
              return {
                success: true,
                message: 'Scrolled to target text and page stabilized',
                shouldRetry: true,
                shouldContinue: false
              };
            }
          }
          
          // Try scrolling down to load more content
          await page.scrollBy(500);
          await IntelligentWaiting.waitFor(context.browserContext, {
            preset: 'stable',
            maxWait: 2000
          });
          
          return {
            success: true,
            message: 'Scrolled down and waited for stability',
            shouldRetry: true,
            shouldContinue: false
          };
        } catch (error) {
          return {
            success: false,
            message: `Scroll strategy failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Research element with expanded search
   */
  private static createElementResearchStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Research element with expanded targeting strategies',
      priority: 70,
      isApplicable: (error, ctx) => {
        return !!(ctx.targetingStrategy && error.message.includes('not found'));
      },
      execute: async () => {
        if (!context.targetingStrategy) {
          return {
            success: false,
            message: 'No targeting strategy available for research',
            shouldRetry: false,
            shouldContinue: false
          };
        }

        try {
          const state = await context.browserContext.getState();
          
          // Create expanded targeting strategy with more permissive matching
          const expandedStrategy: TargetingStrategy = {
            ...context.targetingStrategy,
            // Add more generic selectors
            selector: context.targetingStrategy.selector || 'button, input, a, [onclick], [role="button"]',
            // Make text matching more flexible
            text: context.targetingStrategy.text ? 
              context.targetingStrategy.text.split(' ')[0] : // Try just first word
              undefined
          };

          const matchResult = await EnhancedElementFinder.findElement(expandedStrategy, state);
          if (matchResult) {
            return {
              success: true,
              message: `Found element using expanded strategy: ${matchResult.strategy}`,
              shouldRetry: true,
              shouldContinue: false,
              modifiedStrategy: expandedStrategy
            };
          }

          return {
            success: false,
            message: 'Element not found even with expanded search',
            shouldRetry: false,
            shouldContinue: false
          };
        } catch (error) {
          return {
            success: false,
            message: `Element research failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Wait for page to fully stabilize
   */
  private static createPageStabilizationStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Wait for complete page stabilization',
      priority: 60,
      isApplicable: (error, ctx) => {
        return error.message.includes('not found') || 
               error.message.includes('no longer available') ||
               ctx.actionType === 'wait';
      },
      execute: async () => {
        try {
          const waitResult = await IntelligentWaiting.waitFor(context.browserContext, {
            preset: 'pageLoad',
            maxWait: 5000,
            minWait: 1000
          });

          return {
            success: waitResult.success,
            message: waitResult.success ? 
              `Page stabilized after ${waitResult.duration}ms` :
              `Page stabilization timed out after ${waitResult.duration}ms`,
            shouldRetry: true,
            shouldContinue: false,
            details: waitResult
          };
        } catch (error) {
          return {
            success: false,
            message: `Page stabilization failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Try alternative targeting approaches
   */
  private static createAlternativeTargetingStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Try alternative element targeting approaches',
      priority: 50,
      isApplicable: (error, ctx) => {
        return !!(ctx.targetingStrategy && error.message.includes('not found'));
      },
      execute: async () => {
        if (!context.targetingStrategy) {
          return {
            success: false,
            message: 'No original targeting strategy to modify',
            shouldRetry: false,
            shouldContinue: false
          };
        }

        try {
          const state = await context.browserContext.getState();
          
          // Try different combinations of targeting strategies
          const alternatives: TargetingStrategy[] = [
            // Try without attributes constraints
            { ...context.targetingStrategy, attributes: undefined },
            // Try with only text matching
            { text: context.targetingStrategy.text },
            // Try with only selector matching  
            { selector: context.targetingStrategy.selector },
            // Try with only aria matching
            { aria: context.targetingStrategy.aria }
          ].filter(strategy => Object.keys(strategy).length > 0);

          for (const altStrategy of alternatives) {
            const matchResult = await EnhancedElementFinder.findElement(altStrategy, state);
            if (matchResult) {
              return {
                success: true,
                message: `Found element using alternative strategy: ${matchResult.strategy}`,
                shouldRetry: true,
                shouldContinue: false,
                modifiedStrategy: altStrategy
              };
            }
          }

          return {
            success: false,
            message: 'No alternative targeting strategies succeeded',
            shouldRetry: false,
            shouldContinue: false
          };
        } catch (error) {
          return {
            success: false,
            message: `Alternative targeting failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Extend timeouts for slow operations
   */
  private static createTimeoutExtensionStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Extend timeout for slow-loading content',
      priority: 40,
      isApplicable: (error, ctx) => {
        return error.message.includes('timeout') || 
               error.message.includes('timed out') ||
               ctx.actionType === 'wait';
      },
      execute: async () => {
        try {
          // Extended wait with generous timeout
          const waitResult = await IntelligentWaiting.waitFor(context.browserContext, {
            preset: 'stable',
            maxWait: 10000, // 10 seconds
            minWait: 500
          });

          return {
            success: true,
            message: `Extended timeout completed in ${waitResult.duration}ms`,
            shouldRetry: true,
            shouldContinue: false,
            details: waitResult
          };
        } catch (error) {
          return {
            success: false,
            message: `Extended timeout failed: ${error instanceof Error ? error.message : String(error)}`,
            shouldRetry: false,
            shouldContinue: false
          };
        }
      }
    };
  }

  /**
   * Strategy: Graceful continuation (last resort)
   */
  private static createGracefulContinuationStrategy(context: RecoveryContext): RecoveryStrategy {
    return {
      description: 'Continue gracefully with warning',
      priority: 10,
      isApplicable: () => true, // Always applicable as last resort
      execute: async () => {
        return {
          success: true,
          message: 'Continuing execution despite error (graceful degradation)',
          shouldRetry: false,
          shouldContinue: true,
          details: {
            originalError: context.originalError.message,
            recoveryNote: 'Action skipped but task continues'
          }
        };
      }
    };
  }

  /**
   * Create a timeout promise for recovery strategies
   */
  private static timeoutPromise(ms: number, strategyName: string): Promise<RecoveryResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Recovery strategy '${strategyName}' timed out after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Create recovery context from error and action information
   */
  static createContext(
    error: Error,
    actionType: RecoveryContext['actionType'],
    browserContext: BrowserContext,
    agentContext: AgentContext,
    targetingStrategy?: TargetingStrategy,
    attemptCount = 1,
    maxAttempts = ErrorRecovery.DEFAULT_MAX_ATTEMPTS
  ): RecoveryContext {
    return {
      originalError: error,
      actionType,
      targetingStrategy,
      browserContext,
      agentContext,
      attemptCount,
      maxAttempts
    };
  }

  /**
   * Wrapper function for enhanced action execution with recovery
   */
  static async executeWithRecovery<T>(
    actionFn: () => Promise<T>,
    context: RecoveryContext
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= context.maxAttempts; attempt++) {
      try {
        return await actionFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === context.maxAttempts) {
          logger.warning(`Action failed after ${attempt} attempts, no more recovery possible`);
          throw lastError;
        }

        logger.info(`Action failed on attempt ${attempt}/${context.maxAttempts}, attempting recovery`);
        
        // Update context for this attempt
        const recoveryContext = {
          ...context,
          originalError: lastError,
          attemptCount: attempt
        };

        const recoveryResult = await this.attemptRecovery(recoveryContext);
        
        if (!recoveryResult.success || (!recoveryResult.shouldRetry && !recoveryResult.shouldContinue)) {
          logger.warning('Recovery failed or indicated not to retry');
          throw lastError;
        }

        if (recoveryResult.shouldContinue && !recoveryResult.shouldRetry) {
          logger.info('Recovery suggested graceful continuation');
          // Return a neutral result or throw a special "continue" error
          throw new Error('GRACEFUL_CONTINUATION');
        }

        // Update targeting strategy if recovery provided one
        if (recoveryResult.modifiedStrategy) {
          context.targetingStrategy = recoveryResult.modifiedStrategy;
        }

        logger.info(`Recovery successful, retrying action (attempt ${attempt + 1}/${context.maxAttempts})`);
      }
    }

    throw lastError!;
  }
}