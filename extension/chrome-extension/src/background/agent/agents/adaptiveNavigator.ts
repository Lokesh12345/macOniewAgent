import { NavigatorAgent, NavigatorActionRegistry } from './navigator';
import { AdaptiveNavigatorPrompt } from '../prompts/adaptiveNavigator';
import { BaseAgentOptions, ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { ActionResult } from '../types';
import { ExecutionContext, ExecutionMode, ExecutionStep, DOMChangeType, ReplanningResponse, replanningResponseSchema } from '../types/executionContext';
import { DOMChangeDetector, DOMChangeAnalysis } from '../utils/domChangeDetector';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IntelligentWaiting } from '../actions/intelligentWaiting';
import { convertZodToJsonSchema } from '@src/background/utils';

const logger = createLogger('AdaptiveNavigator');

export class AdaptiveNavigatorAgent extends NavigatorAgent {
  private executionContext: ExecutionContext | null = null;
  private currentExecutionMode: ExecutionMode = ExecutionMode.ADAPTIVE;

  constructor(
    actionRegistry: NavigatorActionRegistry,
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>,
  ) {
    // Use adaptive prompt if not provided
    if (!options.prompt || options.prompt.constructor.name === 'NavigatorPrompt') {
      options.prompt = new AdaptiveNavigatorPrompt(options.context?.options?.maxActionsPerStep || 10);
    }
    super(actionRegistry, options, { ...extraOptions, id: 'adaptive-navigator' });
  }

  /**
   * Override doMultiAction to add adaptive execution
   */
  protected async doMultiAction(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    logger.info(`🚀 Starting adaptive execution with ${actions.length} actions`);
    
    // Initialize execution context
    this.executionContext = {
      originalGoal: this.context.task || '',
      originalPlan: actions.map(a => `${Object.keys(a)[0]}: ${JSON.stringify(Object.values(a)[0])}`),
      executionMode: this.currentExecutionMode,
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

    // Decide initial execution mode based on page analysis
    const initialMode = await this.determineInitialExecutionMode(actions);
    logger.info(`📊 Initial execution mode: ${initialMode}`);

    if (initialMode === ExecutionMode.SINGLE_STEP) {
      return await this.executeSingleStep(actions);
    } else {
      return await this.executeBatchWithAdaptation(actions);
    }
  }

  /**
   * Determine initial execution mode based on page and action analysis
   */
  private async determineInitialExecutionMode(actions: Record<string, unknown>[]): Promise<ExecutionMode> {
    // Check if actions include potentially dynamic triggers
    const hasDynamicTriggers = actions.some(action => {
      const actionName = Object.keys(action)[0];
      return ['input_text', 'click_element', 'select_option'].includes(actionName);
    });

    // Check current page for dynamic indicators
    const state = await this.context.browserContext.getCachedState();
    const pageAnalysis = await this.analyzePageForDynamicContent(state);

    if (pageAnalysis.isDynamic || (hasDynamicTriggers && actions.length > 2)) {
      logger.info('🎯 Detected dynamic page or triggers, using single-step mode');
      return ExecutionMode.SINGLE_STEP;
    }

    return ExecutionMode.BATCH;
  }

  /**
   * Analyze page for dynamic content indicators
   */
  private async analyzePageForDynamicContent(state: any): Promise<{ isDynamic: boolean; indicators: string[] }> {
    const indicators: string[] = [];
    
    // Check for common dynamic patterns in the DOM
    const dynamicSelectors = [
      'input[type="search"]',
      'input[autocomplete]',
      '[role="combobox"]',
      '[data-toggle="modal"]',
      '.typeahead',
      '[onclick]',
      'form[data-ajax]'
    ];

    for (const selector of dynamicSelectors) {
      if (state?.selectorMap?.querySelector?.(selector)) {
        indicators.push(selector);
      }
    }

    // Check URL patterns
    const dynamicUrlPatterns = [
      'gmail.com',
      'outlook.com',
      'facebook.com',
      'twitter.com',
      'search',
      'compose',
      'checkout'
    ];

    const url = state?.url || '';
    for (const pattern of dynamicUrlPatterns) {
      if (url.includes(pattern)) {
        indicators.push(`URL contains: ${pattern}`);
      }
    }

    return {
      isDynamic: indicators.length > 0,
      indicators
    };
  }

  /**
   * Execute actions in single-step mode
   */
  private async executeSingleStep(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    logger.info('🚶 Executing in single-step mode');
    const results: ActionResult[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionName = Object.keys(action)[0];
      
      logger.info(`📍 Step ${i + 1}/${actions.length}: ${actionName}`);

      // Execute single action
      const result = await this.executeSingleAction(action, i);
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

      // Check for DOM changes after action
      if (i < actions.length - 1) {
        const domAnalysis = await this.checkForDOMChanges(action);
        
        if (domAnalysis.type !== DOMChangeType.NONE) {
          logger.info(`🔄 DOM change detected: ${domAnalysis.description}`);
          
          // Handle the DOM change
          const handled = await this.handleDOMChange(domAnalysis, actions.slice(i + 1));
          
          if (!handled) {
            // Need re-planning
            const replanResult = await this.replanWithLLM(domAnalysis, actions.slice(i + 1));
            if (replanResult) {
              // Execute new plan
              const newResults = await this.executeSingleStep(replanResult.updatedPlan);
              results.push(...newResults);
              break;
            }
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
   * Execute batch with DOM change adaptation
   */
  private async executeBatchWithAdaptation(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    logger.info('📦 Executing in batch mode with adaptation');
    
    // Start with regular batch execution
    const results: ActionResult[] = [];
    let remainingActions = [...actions];

    while (remainingActions.length > 0) {
      // Try batch execution
      const batchResults = await this.executeBatch(remainingActions);
      results.push(...batchResults);

      // Check if batch was interrupted by DOM change
      const lastResult = batchResults[batchResults.length - 1];
      if (lastResult?.extractedContent?.includes('Something new appeared')) {
        logger.info('🔄 Batch interrupted by DOM change, switching to adaptive mode');
        
        // Find where we stopped
        const completedCount = batchResults.length - 1; // Minus the DOM change message
        remainingActions = remainingActions.slice(completedCount);

        if (remainingActions.length > 0) {
          // Switch to single-step for remaining actions
          logger.info(`📍 Switching to single-step for ${remainingActions.length} remaining actions`);
          const singleStepResults = await this.executeSingleStep(remainingActions);
          results.push(...singleStepResults);
        }
        break;
      } else {
        // Batch completed successfully
        break;
      }
    }

    return results;
  }

  /**
   * Execute a batch of actions (original doMultiAction logic)
   */
  private async executeBatch(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    // Call parent's doMultiAction implementation
    return super['doMultiAction'](actions);
  }

  /**
   * Execute a single action
   */
  private async executeSingleAction(action: Record<string, unknown>, index: number): Promise<ActionResult> {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName];
    
    try {
      const actionInstance = this['actionRegistry'].getAction(actionName);
      if (!actionInstance) {
        throw new Error(`Action ${actionName} not found`);
      }

      // Execute the action directly without highlighting
      const result = await actionInstance.call(actionArgs);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Action ${actionName} failed: ${errorMessage}`);
      
      return new ActionResult({
        error: errorMessage,
        isDone: false,
        includeInMemory: true
      });
    }
  }

  /**
   * Check for DOM changes after an action
   */
  private async checkForDOMChanges(lastAction: Record<string, unknown>): Promise<DOMChangeAnalysis> {
    const oldState = await this.context.browserContext.getCachedState();
    
    // Wait a bit for DOM to stabilize
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const newState = await this.context.browserContext.getState(this.context.options.useVision);
    
    return await DOMChangeDetector.analyzeDOMChanges(oldState, newState, lastAction);
  }

  /**
   * Handle DOM changes without LLM re-planning if possible
   */
  private async handleDOMChange(analysis: DOMChangeAnalysis, remainingActions: Record<string, unknown>[]): Promise<boolean> {
    logger.info(`🛠️ Attempting to handle ${analysis.type} DOM change automatically`);

    switch (analysis.type) {
      case DOMChangeType.INTERACTIVE:
        // For autocomplete/dropdown, we might be able to continue
        if (analysis.description.includes('autocomplete') || analysis.description.includes('dropdown')) {
          // Wait for user to make selection or dropdown to close
          const waitResult = await IntelligentWaiting.waitFor(this.context.browserContext, {
            preset: 'stable',
            maxWait: 3000
          });
          
          if (waitResult.success) {
            logger.info('✅ Dropdown/autocomplete handled by waiting');
            return true;
          }
        }
        break;

      case DOMChangeType.MINOR:
        // For minor changes, usually safe to continue
        logger.info('✅ Minor DOM change, continuing execution');
        return true;

      case DOMChangeType.BLOCKING:
        // For modals/alerts, try to find and click close button
        const closeActions = [
          { click_element: { intent: 'Close modal', text: 'Close' } },
          { click_element: { intent: 'Dismiss dialog', text: 'OK' } },
          { click_element: { intent: 'Cancel dialog', text: 'Cancel' } },
          { keyboard_press: { key: 'Escape' } }
        ];

        for (const closeAction of closeActions) {
          try {
            const result = await this.executeSingleAction(closeAction, -1);
            if (!result.error) {
              logger.info('✅ Successfully closed blocking element');
              return true;
            }
          } catch (e) {
            // Try next method
          }
        }
        break;
    }

    logger.info('❌ Could not handle DOM change automatically, need LLM re-planning');
    return false;
  }

  /**
   * Re-plan with LLM given the DOM changes
   */
  private async replanWithLLM(
    domAnalysis: DOMChangeAnalysis,
    remainingActions: Record<string, unknown>[]
  ): Promise<ReplanningResponse | null> {
    logger.info('🤖 Requesting LLM re-planning due to DOM changes');

    const replanPrompt = this.buildReplanningPrompt(domAnalysis, remainingActions);
    
    try {
      // Create a temporary message manager for re-planning
      const messages = [
        new SystemMessage('You are an adaptive web automation agent. Analyze the DOM changes and provide an updated plan.'),
        new HumanMessage(replanPrompt)
      ];

      // Use structured output for re-planning
      const jsonSchema = convertZodToJsonSchema(replanningResponseSchema, 'ReplanningResponse', true);
      const structuredLlm = this['chatLLM'].withStructuredOutput(jsonSchema, {
        includeRaw: true,
        name: 'replanning_response'
      });

      const response = await structuredLlm.invoke(messages, {
        signal: this.context.controller.signal,
        ...this['callOptions']
      });

      if (response.parsed) {
        logger.info('✅ LLM provided updated plan:', response.parsed);
        return response.parsed as ReplanningResponse;
      }
    } catch (error) {
      logger.error('Failed to get re-planning from LLM:', error);
    }

    return null;
  }

  /**
   * Build re-planning prompt with full context
   */
  private buildReplanningPrompt(
    domAnalysis: DOMChangeAnalysis,
    remainingActions: Record<string, unknown>[]
  ): string {
    const context = this.executionContext!;
    
    return `
## CONTEXT: Adaptive Web Automation Re-planning Needed

### Original Goal
${context.originalGoal}

### Original Plan (${context.originalPlan.length} steps)
${context.originalPlan.map((step, i) => `${i + 1}. ${step}`).join('\n')}

### Execution Progress
Completed: ${context.completedSteps.length} / ${context.originalPlan.length} steps

### Completed Actions
${context.completedSteps.map((step, i) => 
  `${i + 1}. ${Object.keys(step.action)[0]} - ${step.result.success ? '✓ Success' : '✗ Failed: ' + step.result.error}`
).join('\n')}

### DOM Change Detected
Type: ${domAnalysis.type}
Description: ${domAnalysis.description}
New Elements: ${domAnalysis.newElements.join(', ')}
Recommendations: ${domAnalysis.recommendations.join(', ')}

### Remaining Original Actions (${remainingActions.length})
${remainingActions.map((action, i) => 
  `${i + 1}. ${Object.keys(action)[0]}: ${JSON.stringify(Object.values(action)[0])}`
).join('\n')}

### Current Page State
URL: ${context.currentState.url}
Title: ${context.currentState.title}

### Your Task
The DOM has changed during execution. Analyze the situation and provide:
1. A brief analysis of what happened and why re-planning is needed
2. The best execution mode for remaining actions (batch, single-step, or adaptive)
3. An updated action plan that accounts for the DOM changes
4. Your reasoning for the chosen approach

Focus on:
- Handling any new interactive elements (dropdowns, modals, etc.)
- Re-targeting elements if indexes have shifted
- Achieving the original goal despite the changes
`;
  }
}