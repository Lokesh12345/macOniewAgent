import { NavigatorAgent, NavigatorActionRegistry } from './navigator';
import { BaseAgentOptions, ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { ActionResult } from '../types';
import { ExecutionContext, ExecutionMode, ExecutionStep, DOMChangeType } from '../types/executionContext';
import { IntelligentDOMDetector, IntelligentDOMAnalysis } from '../learning/intelligentDOMDetector';
import { LearningContext } from '../learning/domPatternLearner';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IntelligentWaiting } from '../actions/intelligentWaiting';

const logger = createLogger('LearningNavigator');

export class LearningNavigator extends NavigatorAgent {
  private intelligentDetector: IntelligentDOMDetector;
  private executionContext: ExecutionContext | null = null;
  private learningMode = true;

  constructor(
    actionRegistry: NavigatorActionRegistry,
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>,
  ) {
    super(actionRegistry, options, { ...extraOptions, id: 'learning-navigator' });
    this.intelligentDetector = new IntelligentDOMDetector();
  }

  /**
   * Override doMultiAction to add learning-based execution
   */
  protected async doMultiAction(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    logger.info(`🧠 Starting learning-based execution with ${actions.length} actions`);
    
    // Initialize execution context
    this.executionContext = {
      originalGoal: this.context.task || '',
      originalPlan: actions.map(a => `${Object.keys(a)[0]}: ${JSON.stringify(Object.values(a)[0])}`),
      executionMode: ExecutionMode.ADAPTIVE,
      completedSteps: [],
      remainingActions: [...actions],
      currentState: {
        url: (await this.context.browserContext.getCachedState())?.url || '',
        title: (await this.context.browserContext.getCachedState())?.title || '',
        hasPopup: false,
        hasAlert: false,
        hasAutocomplete: false
      },
      domChangeHistory: []
    };

    return await this.executeWithLearning(actions);
  }

  /**
   * Execute actions with learning and adaptation
   */
  private async executeWithLearning(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionName = Object.keys(action)[0];
      
      logger.info(`🔍 Step ${i + 1}/${actions.length}: ${actionName}`);

      // Get DOM state before action
      const domBefore = await this.context.browserContext.getCachedState();
      
      // Execute single action
      const result = await this.executeSingleActionWithLearning(action, i, domBefore);
      results.push(result);

      if (result.error || result.isDone) {
        break;
      }

      // Record execution step
      this.executionContext!.completedSteps.push({
        action,
        result: {
          success: !result.error,
          error: result.error,
          extractedContent: result.extractedContent
        },
        timestamp: Date.now()
      });

      // Check for DOM changes after action (if not last action)
      if (i < actions.length - 1) {
        const adaptationResult = await this.handlePostActionAdaptation(
          action, 
          domBefore,
          actions.slice(i + 1)
        );
        
        if (adaptationResult) {
          if (adaptationResult.newActions) {
            // Insert new actions into the sequence
            actions.splice(i + 1, 0, ...adaptationResult.newActions);
            logger.info(`📝 Inserted ${adaptationResult.newActions.length} learned actions`);
          }
          
          if (adaptationResult.skipRemaining) {
            logger.info('🛑 Skipping remaining actions due to DOM changes');
            break;
          }
        }
      }

      // Intelligent wait between actions
      if (i < actions.length - 1) {
        await IntelligentWaiting.quickWait(this.context.browserContext, 'action');
      }
    }

    return results;
  }

  /**
   * Execute single action and learn from outcome
   */
  private async executeSingleActionWithLearning(
    action: Record<string, unknown>,
    index: number,
    domBefore: any
  ): Promise<ActionResult> {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName];
    
    try {
      const actionInstance = this['actionRegistry'].getAction(actionName);
      if (!actionInstance) {
        throw new Error(`Action ${actionName} not found`);
      }

      // Execute the action
      const result = await actionInstance.call(actionArgs);
      
      logger.info(`✅ Action executed: ${actionName} → ${result.error ? 'failed' : 'success'}`);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Action ${actionName} failed: ${errorMessage}`);
      
      return new ActionResult({
        error: errorMessage,
        isDone: false,
        includeInMemory: true
      });
    }
  }

  /**
   * Handle post-action adaptation using learned patterns
   */
  private async handlePostActionAdaptation(
    action: Record<string, unknown>,
    domBefore: any,
    remainingActions: Record<string, unknown>[]
  ): Promise<{
    newActions?: Record<string, unknown>[];
    skipRemaining?: boolean;
  } | null> {
    
    // Wait a moment for DOM to settle
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get new DOM state
    const domAfter = await this.context.browserContext.getState(this.context.options.useVision);
    
    // Use intelligent detector to analyze changes
    const analysis = await this.intelligentDetector.analyzeDOMChanges(
      domBefore,
      domAfter,
      action
    );

    if (analysis.type === DOMChangeType.NONE) {
      return null; // No changes, continue normally
    }

    logger.info(`🔍 DOM change detected: ${analysis.description} (confidence: ${analysis.confidence})`);

    // Record this in our execution context
    this.executionContext!.domChangeHistory.push({
      afterAction: Object.keys(action)[0],
      changeType: analysis.type,
      handled: false
    });

    // Try to apply learned solution
    if (analysis.suggestions.length > 0) {
      logger.info(`🤖 Applying learned solution: ${analysis.suggestions[0].type}`);
      
      const solutionResult = await this.intelligentDetector.applySolution(
        analysis,
        this.context.browserContext
      );

      // Learn from the outcome
      if (this.learningMode) {
        await this.recordLearningOutcome(action, domBefore, domAfter, analysis, solutionResult);
      }

      if (solutionResult.success) {
        logger.info(`✅ Solution successful: ${solutionResult.description}`);
        
        // Mark as handled
        this.executionContext!.domChangeHistory[this.executionContext!.domChangeHistory.length - 1].handled = true;
        
        return null; // Continue with original plan
      } else {
        logger.warn(`❌ Solution failed: ${solutionResult.description}`);
      }
    }

    // If we reach here, we couldn't handle the change automatically
    // Decide based on change type
    switch (analysis.type) {
      case DOMChangeType.BLOCKING:
        logger.warn('🚫 Blocking change detected - may need to skip remaining actions');
        return { skipRemaining: true };
        
      case DOMChangeType.INTERACTIVE:
        // For interactive changes like autocomplete, we might want to wait
        logger.info('⏳ Interactive change detected - adding wait action');
        return {
          newActions: [
            { wait: { milliseconds: 2000, reason: 'Wait for interactive element to settle' } }
          ]
        };
        
      case DOMChangeType.NAVIGATION:
        logger.info('🔄 Navigation detected - stopping current sequence');
        return { skipRemaining: true };
        
      default:
        return null;
    }
  }

  /**
   * Record learning outcome for future improvement
   */
  private async recordLearningOutcome(
    action: Record<string, unknown>,
    domBefore: any,
    domAfter: any,
    analysis: IntelligentDOMAnalysis,
    solutionResult: { success: boolean; description: string }
  ): Promise<void> {
    const context: LearningContext = {
      domain: this.extractDomain(domAfter.url || ''),
      url: domAfter.url || '',
      actionTaken: action,
      domBefore,
      domAfter
    };

    const solutionTried = analysis.suggestions[0];
    if (solutionTried) {
      await this.intelligentDetector.recordOutcome(
        context,
        analysis.type,
        solutionTried,
        solutionResult.success
      );
      
      logger.info(`📝 Recorded learning outcome: ${solutionResult.success ? 'success' : 'failure'}`);
    }
  }

  /**
   * Get learning insights for monitoring and debugging
   */
  getLearningInsights() {
    return {
      detector: this.intelligentDetector.getInsights(),
      execution: {
        totalSteps: this.executionContext?.completedSteps.length || 0,
        domChanges: this.executionContext?.domChangeHistory.length || 0,
        handledChanges: this.executionContext?.domChangeHistory.filter(h => h.handled).length || 0
      }
    };
  }

  /**
   * Enable or disable learning mode
   */
  setLearningMode(enabled: boolean): void {
    this.learningMode = enabled;
    logger.info(`Learning mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || 'unknown';
    }
  }
}