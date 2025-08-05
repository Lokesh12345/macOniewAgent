import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis } from '../utils/domChangeDetector';
import { VerificationResult } from './obstructionVerifier';
import { ContinuationDecision } from './smartContinuation';
import { ObstructionAnalysisResponse } from '../obstruction/obstructionAnalyzer';
import { ResolutionResult } from '../obstruction/resolutionExecutor';

const logger = createLogger('AdaptiveRetry');

export interface RetryContext {
  originalObstruction: DOMChangeAnalysis;
  previousAttempts: RetryAttempt[];
  maxRetries: number;
  backoffMs: number;
  alternativeApproaches: string[];
}

export interface RetryAttempt {
  attemptNumber: number;
  strategy: string;
  analysis: ObstructionAnalysisResponse;
  resolutionResult: ResolutionResult;
  verificationResult: VerificationResult;
  timestamp: number;
  success: boolean;
}

export interface RetryDecision {
  shouldRetry: boolean;
  strategy: string;
  reasoning: string;
  confidence: number;
  waitTimeMs: number;
  modifications: {
    analysisModifications?: Partial<ObstructionAnalysisResponse>;
    executionModifications?: Record<string, unknown>;
  };
}

export class AdaptiveRetry {
  /**
   * Decide whether and how to retry an obstruction handling attempt
   */
  static async decideRetry(
    context: RetryContext,
    lastAttempt: RetryAttempt,
    continuationDecision: ContinuationDecision
  ): Promise<RetryDecision> {
    logger.info(`🔄 Deciding retry for attempt ${lastAttempt.attemptNumber}/${context.maxRetries}`);

    // Check if we've exceeded retry limits
    if (context.previousAttempts.length >= context.maxRetries) {
      return {
        shouldRetry: false,
        strategy: 'abort',
        reasoning: 'Maximum retry attempts reached',
        confidence: 1.0,
        waitTimeMs: 0,
        modifications: {}
      };
    }

    // Analyze failure patterns
    const failureAnalysis = this.analyzeFailurePatterns(context.previousAttempts);
    
    // Determine best retry strategy
    const retryStrategy = this.selectRetryStrategy(
      context,
      lastAttempt,
      failureAnalysis,
      continuationDecision
    );

    return retryStrategy;
  }

  /**
   * Analyze patterns in previous failure attempts
   */
  private static analyzeFailurePatterns(attempts: RetryAttempt[]): {
    repeatedStrategies: string[];
    commonFailures: string[];
    verificationTrends: number[];
    timeToFailure: number[];
  } {
    const repeatedStrategies = attempts.map(a => a.strategy);
    const commonFailures = attempts
      .filter(a => !a.success)
      .map(a => a.resolutionResult.error || 'Unknown error');
    
    const verificationTrends = attempts.map(a => a.verificationResult.confidence);
    const timeToFailure = attempts.map(a => Date.now() - a.timestamp);

    return {
      repeatedStrategies,
      commonFailures,
      verificationTrends,
      timeToFailure
    };
  }

  /**
   * Select the best retry strategy based on analysis
   */
  private static selectRetryStrategy(
    context: RetryContext,
    lastAttempt: RetryAttempt,
    failureAnalysis: ReturnType<typeof AdaptiveRetry.analyzeFailurePatterns>,
    continuationDecision: ContinuationDecision
  ): RetryDecision {
    
    // If continuation decision explicitly suggests retry
    if (continuationDecision.decision === 'retry' && continuationDecision.retryStrategy) {
      return this.createRetryFromContinuationDecision(context, continuationDecision);
    }

    // Analyze what went wrong in the last attempt
    const lastStrategy = lastAttempt.strategy;
    const lastVerificationScore = lastAttempt.verificationResult.confidence;
    
    // If verification was close to success, try same strategy with modifications
    if (lastVerificationScore > 0.6) {
      return this.createModifiedRetry(context, lastAttempt, 'same_with_modifications');
    }

    // If same strategy was tried multiple times, try alternative
    const strategyUsageCount = failureAnalysis.repeatedStrategies.filter(s => s === lastStrategy).length;
    if (strategyUsageCount > 1) {
      return this.createAlternativeStrategyRetry(context, lastAttempt, failureAnalysis);
    }

    // Check for specific failure patterns
    const dominantError = this.findDominantError(failureAnalysis.commonFailures);
    if (dominantError) {
      return this.createErrorSpecificRetry(context, lastAttempt, dominantError);
    }

    // Default retry with backoff
    return this.createDefaultRetry(context, lastAttempt);
  }

  /**
   * Create retry decision from continuation decision
   */
  private static createRetryFromContinuationDecision(
    context: RetryContext,
    continuationDecision: ContinuationDecision
  ): RetryDecision {
    const strategy = continuationDecision.retryStrategy!;
    
    return {
      shouldRetry: true,
      strategy: 'continuation_suggested',
      reasoning: continuationDecision.reasoning,
      confidence: continuationDecision.confidence,
      waitTimeMs: strategy.backoffMs,
      modifications: {
        executionModifications: {
          maxRetries: strategy.maxRetries,
          alternativeApproaches: strategy.alternativeApproaches
        }
      }
    };
  }

  /**
   * Create modified retry (same strategy with tweaks)
   */
  private static createModifiedRetry(
    context: RetryContext,
    lastAttempt: RetryAttempt,
    modificationType: string
  ): RetryDecision {
    logger.info(`🛠️ Creating modified retry: ${modificationType}`);

    const modifications = this.generateStrategyModifications(lastAttempt, modificationType);
    
    return {
      shouldRetry: true,
      strategy: `${lastAttempt.strategy}_modified`,
      reasoning: `Previous attempt had ${lastAttempt.verificationResult.confidence} success rate, trying with modifications`,
      confidence: 0.7,
      waitTimeMs: context.backoffMs,
      modifications
    };
  }

  /**
   * Create alternative strategy retry
   */
  private static createAlternativeStrategyRetry(
    context: RetryContext,
    lastAttempt: RetryAttempt,
    failureAnalysis: ReturnType<typeof AdaptiveRetry.analyzeFailurePatterns>
  ): RetryDecision {
    logger.info('🔀 Selecting alternative strategy');

    // Find unused strategies
    const usedStrategies = new Set(failureAnalysis.repeatedStrategies);
    const availableAlternatives = context.alternativeApproaches.filter(alt => !usedStrategies.has(alt));
    
    if (availableAlternatives.length === 0) {
      return {
        shouldRetry: false,
        strategy: 'no_alternatives',
        reasoning: 'All alternative strategies have been tried',
        confidence: 0.9,
        waitTimeMs: 0,
        modifications: {}
      };
    }

    const selectedStrategy = availableAlternatives[0];
    
    return {
      shouldRetry: true,
      strategy: selectedStrategy,
      reasoning: `Previous strategy ${lastAttempt.strategy} failed multiple times, trying ${selectedStrategy}`,
      confidence: 0.6,
      waitTimeMs: context.backoffMs * 1.5, // Longer wait for strategy change
      modifications: {
        analysisModifications: {
          resolution: {
            strategy: selectedStrategy as any,
            specificAction: this.generateActionForStrategy(selectedStrategy),
            reasoning: `Alternative approach after ${lastAttempt.strategy} failed`,
            urgency: 'medium' as any
          }
        }
      }
    };
  }

  /**
   * Create error-specific retry
   */
  private static createErrorSpecificRetry(
    context: RetryContext,
    lastAttempt: RetryAttempt,
    dominantError: string
  ): RetryDecision {
    logger.info(`🎯 Creating error-specific retry for: ${dominantError}`);

    const errorStrategies = this.getErrorSpecificStrategies(dominantError);
    
    if (errorStrategies.length === 0) {
      return this.createDefaultRetry(context, lastAttempt);
    }

    const strategy = errorStrategies[0];
    
    return {
      shouldRetry: true,
      strategy: `error_specific_${strategy}`,
      reasoning: `Addressing specific error pattern: ${dominantError}`,
      confidence: 0.8,
      waitTimeMs: context.backoffMs,
      modifications: {
        executionModifications: {
          errorSpecificAdjustments: errorStrategies
        }
      }
    };
  }

  /**
   * Create default retry with exponential backoff
   */
  private static createDefaultRetry(
    context: RetryContext,
    lastAttempt: RetryAttempt
  ): RetryDecision {
    const attemptNumber = context.previousAttempts.length;
    const backoffMultiplier = Math.pow(2, attemptNumber - 1);
    const waitTime = Math.min(context.backoffMs * backoffMultiplier, 10000); // Cap at 10 seconds

    return {
      shouldRetry: true,
      strategy: 'default_backoff',
      reasoning: `Standard retry with exponential backoff (attempt ${attemptNumber})`,
      confidence: Math.max(0.3, 0.8 - (attemptNumber * 0.2)), // Decreasing confidence
      waitTimeMs: waitTime,
      modifications: {}
    };
  }

  /**
   * Generate strategy modifications based on previous attempt
   */
  private static generateStrategyModifications(
    lastAttempt: RetryAttempt,
    modificationType: string
  ): RetryDecision['modifications'] {
    const strategy = lastAttempt.analysis.resolution.strategy;
    
    switch (strategy) {
      case 'interact':
        return {
          executionModifications: {
            interactionTimeout: 3000, // Longer timeout
            fallbackToDismiss: true,
            tryMultipleOptions: true
          }
        };
        
      case 'dismiss':
        return {
          executionModifications: {
            tryAllMethods: true, // Try escape, click, backdrop
            waitAfterDismiss: 1000,
            verifyDismissal: true
          }
        };
        
      case 'wait':
        return {
          executionModifications: {
            waitTime: lastAttempt.analysis.resolution.urgency === 'high' ? 3000 : 5000,
            checkStability: true
          }
        };
        
      default:
        return {};
    }
  }

  /**
   * Find the most common error pattern
   */
  private static findDominantError(errors: string[]): string | null {
    if (errors.length === 0) return null;

    const errorCounts = errors.reduce((acc, error) => {
      acc[error] = (acc[error] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a);

    // Return dominant error if it appears in at least half the attempts
    const [dominantError, count] = sortedErrors[0];
    return count >= Math.ceil(errors.length / 2) ? dominantError : null;
  }

  /**
   * Get error-specific retry strategies
   */
  private static getErrorSpecificStrategies(error: string): string[] {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('timeout') || lowerError.includes('wait')) {
      return ['wait_longer', 'check_loading'];
    }

    if (lowerError.includes('element') && lowerError.includes('not found')) {
      return ['wait_for_element', 'retry_targeting'];
    }

    if (lowerError.includes('click') && lowerError.includes('failed')) {
      return ['try_alternative_selectors', 'scroll_to_element'];
    }

    if (lowerError.includes('modal') || lowerError.includes('dialog')) {
      return ['try_escape_key', 'click_backdrop', 'wait_for_close'];
    }

    return [];
  }

  /**
   * Generate specific action for alternative strategy
   */
  private static generateActionForStrategy(strategy: string): string {
    switch (strategy) {
      case 'interact':
        return 'Try to select relevant option or fill required fields';
      case 'dismiss':
        return 'Close or dismiss the obstruction using available methods';
      case 'wait':
        return 'Wait for the obstruction to resolve automatically';
      case 'ignore':
        return 'Continue without addressing the obstruction';
      default:
        return `Apply ${strategy} strategy to resolve obstruction`;
    }
  }

  /**
   * Calculate adaptive wait time based on failure patterns
   */
  static calculateAdaptiveWaitTime(
    baseWaitMs: number,
    attempts: RetryAttempt[],
    obstructionType: string
  ): number {
    if (attempts.length === 0) return baseWaitMs;

    // Calculate average time to failure
    const avgTimeToFailure = attempts.reduce((sum, attempt) => 
      sum + (Date.now() - attempt.timestamp), 0) / attempts.length;

    // For quick failures, increase wait time
    if (avgTimeToFailure < 1000) {
      return baseWaitMs * 2;
    }

    // For blocking obstructions, use longer waits
    if (obstructionType === 'blocking') {
      return Math.max(baseWaitMs, 2000);
    }

    // For interactive obstructions, shorter waits are usually fine
    if (obstructionType === 'interactive') {
      return Math.min(baseWaitMs, 1500);
    }

    return baseWaitMs;
  }
}