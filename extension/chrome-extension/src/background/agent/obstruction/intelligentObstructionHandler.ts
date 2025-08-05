import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis, DOMChangeType } from '../utils/domChangeDetector';
import { ObstructionAnalyzer, ObstructionContext, ObstructionAnalysisResponse } from './obstructionAnalyzer';
import { ResolutionExecutor, ResolutionResult } from './resolutionExecutor';
import { ExecutionContext } from '../types/executionContext';
import { ObstructionVerifier, VerificationResult } from '../verification/obstructionVerifier';
import { SmartContinuation, ContinuationDecision, ContinuationContext } from '../verification/smartContinuation';
import { AdaptiveRetry, RetryContext, RetryAttempt, RetryDecision } from '../verification/adaptiveRetry';
import { ObstructionLearner, LearningEvent, ObstructionPattern } from '../learning/obstructionLearner';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('IntelligentObstructionHandler');

export interface ObstructionHandlingResult {
  handled: boolean;
  strategy: string;
  description: string;
  actionsPerformed: string[];
  domStabilized: boolean;
  shouldContinueWithPlan: boolean;
  planAdjustments?: string;
  adjustedActions?: Record<string, unknown>[];
  error?: string;
  analysisUsed?: ObstructionAnalysisResponse;
  verificationResult?: VerificationResult;
  continuationDecision?: ContinuationDecision;
  retryAttempts?: number;
  totalTime?: number;
  learnedPatterns?: ObstructionPattern[];
  prediction?: {
    wasPredict: boolean;
    accuracy?: number;
  };
}

export class IntelligentObstructionHandler {
  private analyzer: ObstructionAnalyzer;
  private executor: ResolutionExecutor;
  private verifier: ObstructionVerifier;
  private continuation: SmartContinuation;
  private learner: ObstructionLearner;
  private useLLMAnalysis: boolean = true;
  private maxRetries: number = 3;
  private enableLearning: boolean = true;

  constructor(llm: any, browserContext: any) {
    this.analyzer = new ObstructionAnalyzer(llm);
    this.executor = new ResolutionExecutor(browserContext);
    this.verifier = new ObstructionVerifier(browserContext);
    this.continuation = new SmartContinuation(llm);
    this.learner = new ObstructionLearner();
  }

  /**
   * Main entry point: handle an obstruction intelligently with verification and retry
   */
  async handleObstruction(
    domChange: DOMChangeAnalysis,
    executionContext: ExecutionContext,
    currentState: BrowserState,
    lastAction: Record<string, unknown>,
    nextAction: Record<string, unknown>
  ): Promise<ObstructionHandlingResult> {
    const startTime = Date.now();
    logger.info(`🚧 Starting intelligent obstruction handling: ${domChange.description}`);

    const result: ObstructionHandlingResult = {
      handled: false,
      strategy: 'unknown',
      description: '',
      actionsPerformed: [],
      domStabilized: false,
      shouldContinueWithPlan: true,
      retryAttempts: 0
    };

    try {
      // Build context for analysis
      const context = this.buildObstructionContext(
        domChange,
        executionContext,
        currentState,
        lastAction,
        nextAction
      );

      // Check for learned patterns before execution
      const learnedPatterns = await this.checkLearnedPatterns(context);
      
      // Execute with retry loop
      const finalResult = await this.executeWithRetryLoop(context, currentState, learnedPatterns);
      
      // Merge results
      Object.assign(result, finalResult);
      result.totalTime = Date.now() - startTime;
      result.learnedPatterns = learnedPatterns;

      // Learn from this experience
      if (this.enableLearning) {
        await this.recordLearningEvent(context, finalResult, currentState, startTime);
      }

      if (result.handled) {
        logger.info(`✅ Obstruction handled successfully after ${result.retryAttempts} attempts (${result.totalTime}ms): ${result.description}`);
      } else {
        logger.warning(`❌ Failed to handle obstruction after ${result.retryAttempts} attempts: ${result.error || 'Unknown error'}`);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Obstruction handling failed: ${errorMessage}`);
      
      result.error = errorMessage;
      result.totalTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Execute obstruction handling with full retry and verification loop
   */
  private async executeWithRetryLoop(
    context: ObstructionContext,
    beforeObstructionState: BrowserState,
    learnedPatterns: ObstructionPattern[] = []
  ): Promise<ObstructionHandlingResult> {
    const attempts: RetryAttempt[] = [];
    let currentAnalysis: ObstructionAnalysisResponse | null = null;
    let finalResult: ObstructionHandlingResult = {
      handled: false,
      strategy: 'unknown',
      description: 'No attempts made',
      actionsPerformed: [],
      domStabilized: false,
      shouldContinueWithPlan: true,
      retryAttempts: 0
    };

    for (let attemptNumber = 1; attemptNumber <= this.maxRetries; attemptNumber++) {
      logger.info(`🔄 Obstruction handling attempt ${attemptNumber}/${this.maxRetries}`);
      
      try {
        // Get analysis (first time or modified for retry)
        // Incorporate learned patterns into the analysis
        const enhancedContext = this.incorporateLearnedPatterns(context, learnedPatterns);
        currentAnalysis = await this.getObstructionAnalysis(enhancedContext, attempts);
        
        if (!currentAnalysis) {
          throw new Error('Failed to analyze obstruction');
        }

        logger.info(`📋 Analysis: ${currentAnalysis.analysis.whatAppeared} → ${currentAnalysis.resolution.strategy}`);

        // Safety check before executing resolution
        if (!currentAnalysis || !currentAnalysis.resolution) {
          throw new Error('Analysis is invalid - missing resolution data');
        }

        // Execute the resolution
        const resolutionResult = await this.executor.executeResolution(currentAnalysis);
        
        // Get current state for verification
        const afterResolutionState = await this.getStateAfterResolution();
        
        // Verify the resolution
        const verificationResult = await this.verifier.verifyResolution(
          context.domChange,
          resolutionResult,
          currentAnalysis,
          beforeObstructionState,
          afterResolutionState
        );

        logger.info(`🔍 Verification: ${verificationResult.verified} (${verificationResult.confidence} confidence)`);

        // Record this attempt
        const attempt: RetryAttempt = {
          attemptNumber,
          strategy: currentAnalysis.resolution.strategy,
          analysis: currentAnalysis,
          resolutionResult,
          verificationResult,
          timestamp: Date.now(),
          success: verificationResult.verified
        };
        attempts.push(attempt);

        // If verification passed, proceed to continuation decision
        if (verificationResult.verified) {
          const continuationDecision = await this.makeContinuationDecision(
            context,
            currentAnalysis,
            verificationResult,
            beforeObstructionState,
            afterResolutionState
          );

          finalResult = {
            handled: true,
            strategy: currentAnalysis.resolution.strategy,
            description: `Successfully resolved obstruction: ${verificationResult.description}`,
            actionsPerformed: resolutionResult.actionsPerformed,
            domStabilized: verificationResult.confidence > 0.8,
            shouldContinueWithPlan: continuationDecision.decision !== 'abort',
            planAdjustments: continuationDecision.reasoning,
            adjustedActions: continuationDecision.adjustedActions,
            analysisUsed: currentAnalysis,
            verificationResult,
            continuationDecision,
            retryAttempts: attemptNumber
          };

          // Success! Break out of retry loop
          break;
        }

        // Verification failed - decide whether to retry
        const continuationDecision = await this.makeContinuationDecision(
          context,
          currentAnalysis,
          verificationResult,
          beforeObstructionState,
          afterResolutionState
        );

        const retryContext: RetryContext = {
          originalObstruction: context.domChange,
          previousAttempts: attempts,
          maxRetries: this.maxRetries,
          backoffMs: 1000,
          alternativeApproaches: ['dismiss', 'wait', 'ignore']
        };

        const retryDecision = await AdaptiveRetry.decideRetry(retryContext, attempt, continuationDecision);

        if (!retryDecision.shouldRetry) {
          logger.info(`🛑 Not retrying: ${retryDecision.reasoning}`);
          
          finalResult = {
            handled: false,
            strategy: currentAnalysis.resolution.strategy,
            description: `Obstruction handling failed: ${retryDecision.reasoning}`,
            actionsPerformed: resolutionResult.actionsPerformed,
            domStabilized: false,
            shouldContinueWithPlan: false,
            error: verificationResult.description,
            analysisUsed: currentAnalysis,
            verificationResult,
            continuationDecision,
            retryAttempts: attemptNumber
          };
          break;
        }

        logger.info(`🔄 Retrying with strategy: ${retryDecision.strategy} (wait: ${retryDecision.waitTimeMs}ms)`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDecision.waitTimeMs));
        
        // Apply modifications for next attempt
        if (retryDecision.modifications.analysisModifications) {
          context = this.applyAnalysisModifications(context, retryDecision.modifications.analysisModifications);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Attempt ${attemptNumber} failed with error: ${errorMessage}`);
        
        if (attemptNumber === this.maxRetries) {
          finalResult = {
            handled: false,
            strategy: currentAnalysis?.resolution.strategy || 'unknown',
            description: `All attempts failed`,
            actionsPerformed: [],
            domStabilized: false,
            shouldContinueWithPlan: false,
            error: errorMessage,
            retryAttempts: attemptNumber
          };
        }
        
        // Wait before retrying on error
        await new Promise(resolve => setTimeout(resolve, 1000 * attemptNumber));
      }
    }

    return finalResult;
  }

  /**
   * Make continuation decision based on verification results
   */
  private async makeContinuationDecision(
    context: ObstructionContext,
    analysis: ObstructionAnalysisResponse,
    verificationResult: VerificationResult,
    beforeState: BrowserState,
    afterState: BrowserState
  ): Promise<ContinuationDecision> {
    const continuationContext: ContinuationContext = {
      originalObstruction: context.domChange,
      obstructionAnalysis: analysis,
      verificationResult,
      executionContext: context.executionContext,
      remainingActions: context.remainingActions,
      currentState: afterState,
      beforeObstructionState: beforeState
    };

    return await this.continuation.decideContinuation(continuationContext);
  }

  /**
   * Get current DOM state after resolution attempt
   */
  private async getStateAfterResolution(): Promise<BrowserState> {
    // Wait a moment for DOM to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    return await this.executor['browserContext'].getState(false);
  }

  /**
   * Apply analysis modifications for retry
   */
  private applyAnalysisModifications(
    context: ObstructionContext,
    modifications: Partial<ObstructionAnalysisResponse>
  ): ObstructionContext {
    // This would modify the context to influence the next analysis
    // For now, we'll just return the original context
    // In a full implementation, we'd merge the modifications
    return context;
  }

  /**
   * Build context for obstruction analysis
   */
  private buildObstructionContext(
    domChange: DOMChangeAnalysis,
    executionContext: ExecutionContext,
    currentState: BrowserState,
    lastAction: Record<string, unknown>,
    nextAction: Record<string, unknown>
  ): ObstructionContext {
    return {
      url: currentState.url || '',
      title: currentState.title || '',
      lastAction,
      lastActionIntent: this.extractActionIntent(lastAction),
      nextAction,
      nextActionIntent: this.extractActionIntent(nextAction),
      domChange,
      originalGoal: executionContext.originalGoal,
      completedSteps: executionContext.completedSteps.map(step => 
        `${Object.keys(step.action)[0]} - ${step.result.success ? 'Success' : 'Failed'}`
      )
    };
  }

  /**
   * Get obstruction analysis (try simple heuristics first, then LLM)
   */
  private async getObstructionAnalysis(
    context: ObstructionContext, 
    previousAttempts: RetryAttempt[] = []
  ): Promise<ObstructionAnalysisResponse | null> {
    // For first attempt, try simple heuristic analysis first
    if (previousAttempts.length === 0) {
      const simpleAnalysis = this.analyzer.analyzeSimpleObstruction(context);
      
      if (simpleAnalysis && simpleAnalysis.analysis.confidence > 0.7) {
        logger.info(`🎯 Using heuristic analysis (confidence: ${simpleAnalysis.analysis.confidence})`);
        return simpleAnalysis;
      }
    }

    // For retries or complex cases, use LLM analysis
    if (this.useLLMAnalysis) {
      const analysisType = previousAttempts.length === 0 ? 'complex obstruction' : `retry attempt ${previousAttempts.length + 1}`;
      logger.info(`🤖 Using LLM analysis for ${analysisType}`);
      
      // Build context that includes previous attempts for retry scenarios
      const enhancedContext = this.enhanceContextForRetry(context, previousAttempts);
      return await this.analyzer.analyzeObstruction(enhancedContext);
    }

    // Use simple analysis as fallback if LLM is disabled
    return this.analyzer.analyzeSimpleObstruction(context);
  }

  /**
   * Enhance context with previous attempt information for better retry analysis
   */
  private enhanceContextForRetry(
    context: ObstructionContext,
    previousAttempts: RetryAttempt[]
  ): ObstructionContext {
    if (previousAttempts.length === 0) {
      return context;
    }

    // Add information about what was tried before
    const attemptSummary = previousAttempts.map(attempt => 
      `Attempt ${attempt.attemptNumber}: ${attempt.strategy} → ${attempt.success ? 'Success' : 'Failed'} (${attempt.verificationResult.description})`
    ).join('\n');

    return {
      ...context,
      completedSteps: [
        ...context.completedSteps,
        `\n--- Previous Obstruction Handling Attempts ---`,
        attemptSummary,
        `--- End Previous Attempts ---\n`
      ]
    };
  }

  /**
   * Extract intent/description from action
   */
  private extractActionIntent(action: Record<string, unknown>): string {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName] as any;

    switch (actionName) {
      case 'input_text':
        return actionArgs.description || actionArgs.intent || `Type "${actionArgs.text}"`;
      case 'click_element':
        return actionArgs.description || actionArgs.intent || actionArgs.text || 'Click element';
      case 'select_option':
        return actionArgs.description || `Select "${actionArgs.option}"`;
      case 'navigate':
        return `Navigate to ${actionArgs.url}`;
      default:
        return actionArgs.description || actionArgs.intent || actionName;
    }
  }

  /**
   * Quick assessment to determine if obstruction needs handling
   */
  shouldHandleObstruction(domChange: DOMChangeAnalysis, nextAction: Record<string, unknown>): boolean {
    // Always handle blocking changes
    if (domChange.type === DOMChangeType.BLOCKING) {
      return true;
    }

    // Handle interactive changes that might interfere
    if (domChange.type === DOMChangeType.INTERACTIVE) {
      // Check if next action is likely to be affected
      const nextActionType = Object.keys(nextAction)[0];
      
      // Input/click actions are more likely to be affected by interactive changes
      if (['input_text', 'click_element', 'select_option'].includes(nextActionType)) {
        return true;
      }
    }

    // Navigation changes always need handling
    if (domChange.type === DOMChangeType.NAVIGATION) {
      return true;
    }

    // Minor changes usually don't need handling
    return false;
  }

  /**
   * Check for learned patterns that match current context
   */
  private async checkLearnedPatterns(context: ObstructionContext): Promise<ObstructionPattern[]> {
    if (!this.enableLearning) {
      return [];
    }

    const domain = this.extractDomain(context.url);
    const triggerAction = context.lastAction;
    const obstructionType = context.domChange.type;
    const obstructionSignature = context.domChange.description;

    const patterns = await this.learner.findMatchingPatterns(
      domain,
      obstructionType,
      triggerAction,
      obstructionSignature
    );

    if (patterns.length > 0) {
      logger.info(`🎯 Found ${patterns.length} learned patterns for this obstruction`);
    }

    return patterns;
  }

  /**
   * Record learning event for future improvement
   */
  private async recordLearningEvent(
    context: ObstructionContext,
    finalResult: ObstructionHandlingResult,
    beforeState: BrowserState,
    startTime: number
  ): Promise<void> {
    const afterState = await this.getStateAfterResolution();
    
    // Only create learning event if we have complete data
    if (!finalResult || !finalResult.strategy || !finalResult.verificationResult || !finalResult.continuationDecision) {
      logger.warning(`⚠️ Skipping learning due to incomplete data: strategy=${finalResult?.strategy}, verification=${!!finalResult?.verificationResult}, continuation=${!!finalResult?.continuationDecision}`);
      return;
    }
    
    const learningEvent: LearningEvent = {
      domain: this.extractDomain(context.url),
      originalObstruction: context.domChange,
      triggerAction: context.lastAction,
      resolutionAttempts: [], // This would be populated from the retry loop
      finalResult: {
        success: finalResult.handled,
        strategy: finalResult.strategy,
        verificationResult: finalResult.verificationResult,
        continuationDecision: finalResult.continuationDecision,
        totalTime: finalResult.totalTime || 0
      },
      pageContext: {
        url: context.url,
        title: context.title,
        beforeState,
        afterState
      },
      timestamp: Date.now()
    };

    await this.learner.learnFromObstructionHandling(learningEvent);
    logger.info(`📚 Recorded learning event for ${context.domChange.type} obstruction`);
  }

  /**
   * Predict potential obstruction before action
   */
  async predictObstruction(
    domain: string,
    nextAction: Record<string, unknown>,
    currentState: BrowserState
  ): Promise<{
    likelihood: number;
    expectedObstruction: DOMChangeType;
    suggestedPreparation: string;
    confidenceLevel: number;
  } | null> {
    if (!this.enableLearning) {
      return null;
    }

    return await this.learner.predictObstruction(domain, nextAction, currentState);
  }

  /**
   * Use learned patterns to inform analysis
   */
  private incorporateLearnedPatterns(
    context: ObstructionContext,
    learnedPatterns: ObstructionPattern[]
  ): ObstructionContext {
    if (learnedPatterns.length === 0) {
      return context;
    }

    const bestPattern = learnedPatterns[0]; // Highest confidence pattern
    
    // Add learned information to context
    const enhancedContext = {
      ...context,
      completedSteps: [
        ...context.completedSteps,
        `\n--- Learned Pattern Available ---`,
        `Pattern: ${bestPattern.id}`,
        `Success Rate: ${Math.round(bestPattern.learningMetrics.successRate * 100)}%`,
        `Recommended Strategy: ${bestPattern.successfulResolution.strategy}`,
        `Avg Resolution Time: ${bestPattern.learningMetrics.averageResolutionTime}ms`,
        `Times Encountered: ${bestPattern.learningMetrics.timesEncountered}`,
        `--- End Learned Pattern ---\n`
      ]
    };

    return enhancedContext;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || 'unknown';
    }
  }

  /**
   * Enable or disable learning
   */
  setLearningEnabled(enabled: boolean): void {
    this.enableLearning = enabled;
    logger.info(`Learning ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable LLM analysis
   */
  setUseLLMAnalysis(enabled: boolean): void {
    this.useLLMAnalysis = enabled;
    logger.info(`LLM analysis ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get comprehensive insights including learning data
   */
  getInsights(): {
    llmAnalysisEnabled: boolean;
    learningEnabled: boolean;
    learningInsights: ReturnType<ObstructionLearner['getInsights']>;
    totalHandled: number;
    successRate: number;
  } {
    return {
      llmAnalysisEnabled: this.useLLMAnalysis,
      learningEnabled: this.enableLearning,
      learningInsights: this.learner.getInsights(),
      totalHandled: 0, // TODO: Add metrics tracking
      successRate: 0   // TODO: Add metrics tracking
    };
  }

  /**
   * Get learning-specific insights
   */
  getLearningInsights() {
    return this.learner.getInsights();
  }
}