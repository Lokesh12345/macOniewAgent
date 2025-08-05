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
import { IntelligentObstructionHandler } from '../obstruction/intelligentObstructionHandler';
import { PredictiveObstructionDetector, PredictionContext } from '../learning/predictiveObstructionDetector';

const logger = createLogger('AdaptiveNavigator');

export class AdaptiveNavigatorAgent extends NavigatorAgent {
  private executionContext: ExecutionContext | null = null;
  private currentExecutionMode: ExecutionMode = ExecutionMode.ADAPTIVE;
  private obstructionHandler: IntelligentObstructionHandler;
  private predictiveDetector: PredictiveObstructionDetector;

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
    
    // Initialize intelligent obstruction handler
    this.obstructionHandler = new IntelligentObstructionHandler(
      this['chatLLM'], // Access the LLM from parent class
      this.context.browserContext
    );
    
    // Initialize predictive detector
    this.predictiveDetector = new PredictiveObstructionDetector(
      this.obstructionHandler['learner'] // Access the learner from obstruction handler
    );
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

    // Get predictive analysis for upcoming actions
    await this.performPredictiveAnalysis(actions);

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
          
          // Use intelligent obstruction handler
          const currentState = await this.context.browserContext.getState(this.context.options.useVision);
          const obstructionResult = await this.obstructionHandler.handleObstruction(
            domAnalysis,
            this.executionContext!,
            currentState,
            action,
            actions[i + 1] || {}
          );
          
          logger.info(`📊 Obstruction handling result: ${obstructionResult.handled} - ${obstructionResult.description}`);
          
          if (obstructionResult.handled) {
            // Obstruction was resolved, continue with plan
            if (obstructionResult.planAdjustments) {
              logger.info(`📝 Plan adjustment needed: ${obstructionResult.planAdjustments}`);
            }
            
            if (!obstructionResult.shouldContinueWithPlan) {
              logger.info('🛑 Stopping execution as recommended by obstruction handler');
              break;
            }

            // CRITICAL FIX: Re-analyze DOM and update remaining actions after obstruction resolution
            if (i < actions.length - 1) { // Only if there are remaining actions
              logger.info('🔄 Re-analyzing DOM state after obstruction resolution to update remaining actions');
              
              try {
                // Get fresh DOM state
                const freshState = await this.context.browserContext.getState();
                
                // Re-plan remaining actions with LLM using fresh state
                const remainingActions = actions.slice(i + 1);
                const replanResult = await this.replanWithLLMAndFreshState(
                  `DOM changed after resolving ${domAnalysis.description}. Need to update element targeting for remaining actions.`,
                  remainingActions, 
                  freshState
                );
                
                if (replanResult && replanResult.updatedPlan.length > 0) {
                  logger.info(`✅ Successfully re-planned ${replanResult.updatedPlan.length} remaining actions with fresh DOM indices`);
                  
                  // Replace remaining actions with updated ones
                  actions.splice(i + 1, remainingActions.length, ...replanResult.updatedPlan);
                  
                  logger.info('📋 Continuing execution with updated action plan');
                } else {
                  logger.warning('⚠️ Failed to re-plan remaining actions, continuing with original plan (may have stale indices)');
                }
              } catch (error) {
                logger.error(`❌ Error during DOM re-analysis: ${error}. Continuing with original plan.`);
              }
            }
          } else {
            // Obstruction handling failed, try re-planning
            logger.warning(`❌ Obstruction handling failed: ${obstructionResult.error}`);
            
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
   * Perform predictive analysis for upcoming actions
   */
  private async performPredictiveAnalysis(actions: Record<string, unknown>[]): Promise<void> {
    if (!this.executionContext) return;

    const currentState = await this.context.browserContext.getCachedState();
    const predictionContext: PredictionContext = {
      currentUrl: currentState?.url || '',
      currentState,
      plannedActions: actions,
      executionContext: this.executionContext,
      recentObstructions: this.executionContext.domChangeHistory.map(change => ({
        type: change.changeType,
        trigger: change.afterAction,
        resolved: change.handled,
        timestamp: Date.now() - 60000 // Approximation - would track actual timestamps
      }))
    };

    const predictions = await this.predictiveDetector.predictUpcomingObstructions(predictionContext);
    
    if (predictions.length > 0) {
      logger.info(`🔮 Predicted ${predictions.length} potential obstructions:`);
      predictions.forEach(prediction => {
        logger.info(`  • ${prediction.expectedType} (${Math.round(prediction.likelihood * 100)}% likelihood) - ${prediction.suggestedStrategy}`);
      });
    }
  }

  /**
   * Check if obstruction should be handled before next action
   */
  private shouldHandleObstruction(domAnalysis: DOMChangeAnalysis, nextAction: Record<string, unknown>): boolean {
    return this.obstructionHandler.shouldHandleObstruction(domAnalysis, nextAction);
  }

  /**
   * Re-plan with LLM using fresh DOM state after obstruction resolution
   */
  private async replanWithLLMAndFreshState(
    reason: string,
    remainingActions: Record<string, unknown>[],
    freshState: any
  ): Promise<ReplanningResponse | null> {
    logger.info('🔄 Requesting LLM re-planning with fresh DOM state');
    
    try {
      // Build a prompt that includes the fresh DOM state
      const prompt = this.buildFreshStateReplanningPrompt(reason, remainingActions, freshState);
      
      const messages = [
        new SystemMessage('You are an adaptive web automation agent. The DOM has changed after resolving an obstruction. Re-analyze the current state and update the remaining actions with correct element indices.'),
        new HumanMessage(prompt)
      ];

      // Use structured output for re-planning
      const jsonSchema = convertZodToJsonSchema(replanningResponseSchema, 'ReplanningResponse', true);
      const structuredLlm = this['chatLLM'].withStructuredOutput(jsonSchema, {
        includeRaw: true,
        name: 'replanning_response'
      });

      const response = await structuredLlm.invoke(messages);
      
      if (!response.parsed || response.parsed.needsReplanning === false) {
        logger.info('🤷 LLM determined no re-planning needed');
        return null;
      }

      logger.info(`✅ LLM re-planning successful: ${response.parsed.reasoning}`);
      return response.parsed as ReplanningResponse;
      
    } catch (error) {
      logger.error(`❌ LLM re-planning failed: ${error}`);
      return null;
    }
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
   * Build re-planning prompt with fresh DOM state
   */
  private buildFreshStateReplanningPrompt(
    reason: string,
    remainingActions: Record<string, unknown>[],
    freshState: any
  ): string {
    const context = this.executionContext!;
    
    // Extract element info for the prompt
    const elementInfo = this.extractElementInfoForPrompt(freshState);
    
    return `
## CONTEXT: DOM Re-analysis After Obstruction Resolution

### What Happened
${reason}

### Original Goal  
${context.originalGoal}

### CRITICAL: Remaining Actions Need Updated Element Indices
The following actions were planned with the OLD DOM state and are now BROKEN:

${remainingActions.map((action, i) => {
  const actionName = Object.keys(action)[0];
  const actionArgs = action[actionName];
  return `${i + 1}. ${actionName} - Args: ${JSON.stringify(actionArgs)}`;
}).join('\n')}

### CURRENT DOM STATE - AVAILABLE ELEMENTS
**Use these EXACT indices and aria labels:**

${elementInfo}

## TASK: Fix the Broken Actions

Return the EXACT same actions but with CORRECTED indices and aria labels from the current DOM state.

**RESPONSE FORMAT REQUIRED:**
{
  "needsReplanning": true,
  "analysis": "DOM changed, need to update element targeting",
  "executionMode": "single-step", 
  "updatedPlan": [
    {
      "input_text": {
        "index": [CORRECT_SUBJECT_INDEX_FROM_ABOVE],
        "aria": "[EXACT_SUBJECT_ARIA_LABEL_FROM_ABOVE]",
        "text": "Leave Application"
      }
    },
    {
      "input_text": {
        "index": [CORRECT_BODY_INDEX_FROM_ABOVE],
        "aria": "[EXACT_BODY_ARIA_LABEL_FROM_ABOVE]", 
        "text": "Dear Sir/Madam,\\n\\nI would like to request a leave of absence for 2 days starting from August 12.\\n\\nThank you for your understanding.\\n\\nBest regards,\\nP. Lokesh."
      }
    }
  ],
  "reasoning": "Updated indices and aria labels based on current DOM state"
}

**CRITICAL: Use ONLY the indices and aria labels listed in "CURRENT DOM STATE" above.**
`;
  }

  /**
   * Extract element information for the re-planning prompt
   */
  private extractElementInfoForPrompt(freshState: any): string {
    if (!freshState || !freshState.selectorMap) {
      return 'DOM state not available';
    }

    // Convert selectorMap to array and find relevant elements
    const elements: string[] = [];
    let index = 0;
    
    // Look for subject and message body related elements
    const subjectKeywords = ['subject', 'title', 'Subject'];
    const bodyKeywords = ['message', 'body', 'compose', 'text', 'Message Body', 'content'];
    
    try {
      if (freshState.selectorMap && typeof freshState.selectorMap.forEach === 'function') {
        freshState.selectorMap.forEach((element: any, selector: string) => {
          const ariaLabel = element?.attributes?.['aria-label'] || '';
          const placeholder = element?.attributes?.placeholder || '';
          const tagName = element?.tagName?.toLowerCase() || '';
          
          // Check if this looks like a subject or body field
          const isSubjectField = subjectKeywords.some(keyword => 
            ariaLabel.toLowerCase().includes(keyword.toLowerCase()) ||
            placeholder.toLowerCase().includes(keyword.toLowerCase())
          );
          
          const isBodyField = bodyKeywords.some(keyword => 
            ariaLabel.toLowerCase().includes(keyword.toLowerCase()) ||
            placeholder.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if ((isSubjectField || isBodyField) && (tagName === 'input' || tagName === 'textarea' || tagName === 'div')) {
            elements.push(`[${index}] ${tagName} - aria-label: "${ariaLabel}" - placeholder: "${placeholder}"`);
          }
          
          index++;
        });
      }
    } catch (error) {
      // Fallback if selectorMap iteration fails
      return `DOM state parsing error: ${error}. Total elements: ${freshState?.selectorMap?.size || 'unknown'}`;
    }
    
    if (elements.length === 0) {
      return `No subject/body fields found in ${freshState?.selectorMap?.size || 0} total elements`;
    }
    
    return elements.join('\n');
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