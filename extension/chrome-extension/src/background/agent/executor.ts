import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type ActionResult, AgentContext, type AgentOptions } from './types';
import { NavigatorAgent, NavigatorActionRegistry } from './agents/navigator';
import { PlannerAgent, type PlannerOutput } from './agents/planner';
import { ValidatorAgent } from './agents/validator';
import { NavigatorPrompt } from './prompts/navigator';
import { PlannerPrompt } from './prompts/planner';
import { ValidatorPrompt } from './prompts/validator';
import { createLogger } from '@src/background/log';
import MessageManager from './messages/service';
import type BrowserContext from '../browser/context';
import { ActionBuilder } from './actions/builder';
import { EventManager } from './event/manager';
import { Actors, type EventCallback, EventType, ExecutionState } from './event/types';
import {
  ChatModelAuthError,
  ChatModelForbiddenError,
  ExtensionConflictError,
  RequestCancelledError,
} from './agents/errors';
import { wrapUntrustedContent } from './messages/utils';
import { URLNotAllowedError } from '../browser/views';
import { chatHistoryStore } from '@extension/storage/lib/chat';
import type { AgentStepHistory } from './history';
import type { GeneralSettingsConfig } from '@extension/storage';
import { TaskRewriter } from './task-rewriter';
import { GoalTracker } from './goal-tracker';
import { SystemMessage } from '@langchain/core/messages';

const logger = createLogger('Executor');

export interface ExecutorExtraArgs {
  plannerLLM?: BaseChatModel;
  validatorLLM?: BaseChatModel;
  extractorLLM?: BaseChatModel;
  agentOptions?: Partial<AgentOptions>;
  generalSettings?: GeneralSettingsConfig;
  context?: any;
}

export class Executor {
  private readonly navigator: NavigatorAgent;
  private readonly planner: PlannerAgent;
  private readonly validator: ValidatorAgent;
  private readonly context: AgentContext;
  private readonly plannerPrompt: PlannerPrompt;
  private readonly navigatorPrompt: NavigatorPrompt;
  private readonly validatorPrompt: ValidatorPrompt;
  private readonly generalSettings: GeneralSettingsConfig | undefined;
  private tasks: string[] = [];
  private pendingUserInputs: Map<string, { resolve: (value: string) => void; reject: (reason?: any) => void }> = new Map();
  
  // 🎯 Task rewriting and goal tracking
  private readonly taskRewriter: TaskRewriter;
  private readonly goalTracker: GoalTracker;
  
  // 🚨 Pattern detection for stuck clicking
  private lastClickedElements: Array<{elementIndex: number, step: number, result: string}> = [];
  constructor(
    task: string,
    taskId: string,
    browserContext: BrowserContext,
    navigatorLLM: BaseChatModel,
    extraArgs?: Partial<ExecutorExtraArgs>,
  ) {
    const messageManager = new MessageManager();

    const plannerLLM = extraArgs?.plannerLLM ?? navigatorLLM;
    const validatorLLM = extraArgs?.validatorLLM ?? navigatorLLM;
    const extractorLLM = extraArgs?.extractorLLM ?? navigatorLLM;
    const eventManager = new EventManager();
    const context = new AgentContext(
      taskId,
      browserContext,
      messageManager,
      eventManager,
      extraArgs?.agentOptions ?? {},
    );

    this.generalSettings = extraArgs?.generalSettings;
    
    // 🎯 Initialize task rewriting and goal tracking
    this.taskRewriter = new TaskRewriter(plannerLLM);
    this.goalTracker = new GoalTracker(taskId);
    
    this.tasks.push(task);
    this.navigatorPrompt = new NavigatorPrompt(context.options.maxActionsPerStep);
    this.plannerPrompt = new PlannerPrompt(extraArgs?.context);
    this.validatorPrompt = new ValidatorPrompt(task);

    const actionBuilder = new ActionBuilder(context, extractorLLM);
    const navigatorActionRegistry = new NavigatorActionRegistry(actionBuilder.buildDefaultActions());

    // Initialize agents with their respective prompts
    this.navigator = new NavigatorAgent(navigatorActionRegistry, {
      chatLLM: navigatorLLM,
      context: context,
      prompt: this.navigatorPrompt,
    });

    this.planner = new PlannerAgent({
      chatLLM: plannerLLM,
      context: context,
      prompt: this.plannerPrompt,
    });

    this.validator = new ValidatorAgent({
      chatLLM: validatorLLM,
      context: context,
      prompt: this.validatorPrompt,
    });

    this.context = context;
    // Initialize message history
    this.context.messageManager.initTaskMessages(this.navigatorPrompt.getSystemMessage(), task);
  }

  subscribeExecutionEvents(callback: EventCallback): void {
    this.context.eventManager.subscribe(EventType.EXECUTION, callback);
  }

  clearExecutionEvents(): void {
    // Clear all execution event listeners
    this.context.eventManager.clearSubscribers(EventType.EXECUTION);
  }

  addFollowUpTask(task: string): void {
    this.tasks.push(task);
    this.context.messageManager.addNewTask(task);
    // update validator prompt
    this.validatorPrompt.addFollowUpTask(task);

    // need to reset previous action results that are not included in memory
    this.context.actionResults = this.context.actionResults.filter(result => result.includeInMemory);
  }

  /**
   * Execute the task
   *
   * @returns {Promise<void>}
   */
  async execute(): Promise<void> {
    const originalTask = this.tasks[this.tasks.length - 1];
    logger.info(`🚀 Executing task: ${originalTask}`);
    
    // 🎯 TASK REWRITING: Transform ambiguous task into structured goal
    try {
      const currentPage = await this.context.browserContext.getCurrentPage();
      const currentUrl = currentPage?.url();
      const currentTitle = await currentPage?.title();
      
      const rewrittenTask = await this.taskRewriter.rewriteTask(originalTask, currentUrl, currentTitle);
      
      console.log('🎯 TASK REWRITER: Original task:', originalTask);
      console.log('🎯 TASK REWRITER: Rewritten task:', rewrittenTask.rewrittenTask);
      console.log('🎯 TASK REWRITER: Goal type:', rewrittenTask.goalType);
      console.log('🎯 TASK REWRITER: Completion criteria:', rewrittenTask.completionCriteria);
      
      // Initialize goal tracking
      this.goalTracker.initializeGoal(rewrittenTask);
      
      // Update the task in our tasks array
      this.tasks[this.tasks.length - 1] = rewrittenTask.rewrittenTask;
      
    } catch (error) {
      console.log('🎯 TASK REWRITER: Failed, using original task:', error);
      // Continue with original task if rewriting fails
    }
    
    // reset the step counter
    const context = this.context;
    context.nSteps = 0;
    const allowedMaxSteps = this.context.options.maxSteps;

    try {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      let done = false;
      let step = 0;
      let validatorFailed = false;
      let webTask = undefined;
      for (step = 0; step < allowedMaxSteps; step++) {
        context.stepInfo = {
          stepNumber: context.nSteps,
          maxSteps: context.options.maxSteps,
        };

        logger.info(`🔄 Step ${step + 1} / ${allowedMaxSteps}`);
        if (await this.shouldStop()) {
          break;
        }

        // Check if we need to force re-planning due to DOM changes (like autocomplete)
        const needsReplanning = this.shouldForceReplanning();
        
        // Run planner if configured
        if (this.planner && (context.nSteps % context.options.planningInterval === 0 || validatorFailed || needsReplanning)) {
          if (needsReplanning) {
            console.log('🎯 PLANNER: Re-planning triggered by DOM changes (e.g., autocomplete)');
          } else if (validatorFailed) {
            console.log('🎯 PLANNER: Re-planning triggered by validator failure');  
          } else {
            console.log(`🎯 PLANNER: Regular planning interval (step ${context.nSteps})`);
          }
          validatorFailed = false;
          // The first planning step is special, we don't want to add the browser state message to memory
          let positionForPlan = 0;
          if (this.tasks.length > 1 || step > 0) {
            await this.navigator.addStateMessageToMemory();
            positionForPlan = this.context.messageManager.length() - 1;
          } else {
            positionForPlan = this.context.messageManager.length();
          }

          const planOutput = await this.planner.execute();
          if (planOutput.result) {
            // logger.info(`🔄 Planner output: ${JSON.stringify(planOutput.result, null, 2)}`);
            // observation in planner is untrusted content, they are not instructions
            const observation = wrapUntrustedContent(planOutput.result.observation);
            const plan: PlannerOutput = {
              ...planOutput.result,
              observation,
            };
            this.context.messageManager.addPlan(JSON.stringify(plan), positionForPlan);

            if (webTask === undefined) {
              // set the web task, and keep it not change from now on
              webTask = planOutput.result.web_task;
            }

            if (planOutput.result.done) {
              // task is complete, skip navigation
              done = true;
              this.validator.setPlan(planOutput.result.next_steps);
            } else {
              // task is not complete, let's navigate
              this.validator.setPlan(null);
              done = false;
            }

            if (!webTask && planOutput.result.done) {
              break;
            }
          }
        }

        // execute the navigation step
        if (!done) {
          done = await this.navigate();
        }
        
        // 🎯 GOAL TRACKING: Check if goal is complete after navigation
        if (!done && this.goalTracker.isGoalComplete()) {
          console.log('🎯 GOAL COMPLETED! Stopping execution.');
          console.log('🎯 FINAL STATUS:', this.goalTracker.getProgressSummary());
          done = true;
        }

        // validate the output
        if (done && this.context.options.validateOutput && !this.context.stopped && !this.context.paused) {
          const validatorOutput = await this.validator.execute();
          if (validatorOutput.result?.is_valid) {
            logger.info('✅ Task completed successfully');
            break;
          }
          validatorFailed = true;
          context.consecutiveValidatorFailures++;
          if (context.consecutiveValidatorFailures >= context.options.maxValidatorFailures) {
            logger.error(`Stopping due to ${context.options.maxValidatorFailures} consecutive validator failures`);
            throw new Error('Too many failures of validation');
          }
        }
      }

      if (done) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, this.context.taskId);
      } else if (step >= allowedMaxSteps) {
        logger.info('❌ Task failed: Max steps reached');
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, 'Task failed: Max steps reached');
      } else if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Task cancelled');
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_PAUSE, 'Task paused');
      }
    } catch (error) {
      if (error instanceof RequestCancelledError) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Task cancelled');
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, `Task failed: ${errorMessage}`);
      }
    } finally {
      if (import.meta.env.DEV) {
        logger.debug('Executor history', JSON.stringify(this.context.history, null, 2));
      }
      // store the history only if replay is enabled
      if (this.generalSettings?.replayHistoricalTasks) {
        const historyString = JSON.stringify(this.context.history);
        logger.info(`Executor history size: ${historyString.length}`);
        await chatHistoryStore.storeAgentStepHistory(this.context.taskId, this.tasks[0], historyString);
      } else {
        logger.info('Replay historical tasks is disabled, skipping history storage');
      }
    }
  }

  /**
   * 🚨 CRITICAL: Detect if agent is stuck clicking same elements repeatedly
   * Force scroll action if pattern detected
   */
  private detectStuckClickingPattern(): void {
    const context = this.context;
    
    console.log(`🔍 PATTERN CHECK: Step ${context.nSteps}, Total action results: ${context.actionResults.length}`);
    
    // Track ALL recent actions from action results - Comprehensive memory tracking
    const recentActions = context.actionResults
      .slice(-8) // Look at last 8 actions (increased for better pattern detection)
      .map((result, index) => {
        const content = result.extractedContent || '';
        
        // Classify action type and extract relevant data
        let actionType = 'unknown';
        let elementIndex: number | null = null;
        let actionDetails = '';
        
        if (content.includes('Clicked button with index') || content.includes('CLICK COMPLETED')) {
          actionType = 'click';
          // Updated patterns to match actual log formats
          const match = content.match(/(?:Clicked button with index|CLICK COMPLETED.*index)\s*(\d+)/);
          elementIndex = match ? parseInt(match[1]) : null;
          // Extract button text after the index
          const textMatch = content.match(/index\s*\d+:\s*([^⚠️]+?)(?:\s*⚠️|$)/);
          actionDetails = textMatch ? textMatch[1].trim() : content;
        } else if (content.includes('Scrolled') || content.includes('scroll_small') || content.includes('SCROLL')) {
          actionType = 'scroll';
          actionDetails = content;
        } else if (content.includes('Typed')) {
          actionType = 'input';
          actionDetails = content;
        } else if (content.includes('Navigated')) {
          actionType = 'navigation';
          actionDetails = content;
        } else {
          actionType = content.split(' ')[0]?.toLowerCase() || 'unknown';
          actionDetails = content;
        }
        
        return {
          actionType,
          elementIndex,
          actionDetails,
          step: context.nSteps - (context.actionResults.length - index - 1),
          fullResult: content,
          hasError: !!result.error
        };
      })
      .filter(action => action.actionType !== 'unknown');

    // Separate click actions for specific click pattern detection  
    const recentClickActions = recentActions.filter(action => action.actionType === 'click');

    // Comprehensive action memory logging
    console.log(`🔍 COMPREHENSIVE ACTION MEMORY (last 8 actions):`);
    recentActions.forEach((action, i) => {
      const errorFlag = action.hasError ? ' ❌' : ' ✅';
      console.log(`  ${i+1}. ${action.actionType.toUpperCase()}: ${action.actionDetails}${errorFlag}`);
    });
    
    console.log(`🔍 CLICK ACTIONS FOUND: ${recentClickActions.length} clicks:`, 
      recentClickActions.map(a => `Element ${a.elementIndex} (${a.actionDetails.substring(0, 20)}...)`));

    // Enhanced pattern detection with all action types
    if (recentActions.length < 3) {
      console.log(`🔍 INSUFFICIENT ACTION HISTORY: Need at least 3 actions, found ${recentActions.length}`);
      return;
    }

    // 1. CHECK FOR REPEATED CLICKS (original logic)
    const elementCounts = new Map<number, number>();
    for (const action of recentClickActions) {
      if (action.elementIndex !== null) {
        elementCounts.set(action.elementIndex, (elementCounts.get(action.elementIndex) || 0) + 1);
      }
    }

    const repeatedElements = Array.from(elementCounts.entries()).filter(([_, count]) => count >= 2);
    
    // 2. CHECK FOR STUCK PATTERNS WITH COMPREHENSIVE ACTION ANALYSIS
    const lastFourActions = recentActions.slice(-4);
    const actionTypePattern = lastFourActions.map(a => a.actionType).join(' → ');
    
    // Detect common stuck patterns
    const stuckPatterns = {
      repeatedClicks: repeatedElements.length > 0,
      clickScrollLoop: actionTypePattern.includes('click → scroll → click') || actionTypePattern.includes('scroll → click → scroll'),
      noSuccessfulActions: lastFourActions.filter(a => !a.hasError).length < 2,
      sameElementRepeated: repeatedElements.length > 0
    };
    
    console.log(`🔍 STUCK PATTERN ANALYSIS:`, stuckPatterns);
    console.log(`🔍 ACTION PATTERN: ${actionTypePattern}`);
    
    // 3. TRIGGER INTERVENTION IF PATTERNS DETECTED
    let shouldIntervene = false;
    let interventionReason = '';
    
    if (stuckPatterns.repeatedClicks) {
      const [repeatedIndex, clickCount] = repeatedElements[0];
      const hasNavigationButtons = recentClickActions.some(action => 
        action.elementIndex === repeatedIndex && 
        (action.fullResult.includes('Next') || action.fullResult.includes('Continue') || action.fullResult.includes('Submit'))
      );

      if (hasNavigationButtons) {
        shouldIntervene = true;
        interventionReason = `Element ${repeatedIndex} clicked ${clickCount} times (Next/Continue button)`;
      }
    }
    
    if (stuckPatterns.clickScrollLoop && !shouldIntervene) {
      shouldIntervene = true;
      interventionReason = `Click-scroll loop detected: ${actionTypePattern}`;
    }
    
    if (stuckPatterns.noSuccessfulActions && context.nSteps >= 3 && !shouldIntervene) {
      shouldIntervene = true;
      interventionReason = `Too many failed actions in sequence (less than 2 successful in last 4)`;
    }

    // 4. APPLY INTERVENTION IF NEEDED
    if (shouldIntervene) {
      const forceScrollMsg = `🚨 STUCK PATTERN DETECTED: ${interventionReason}. ` +
        `Action history: ${actionTypePattern}. ` +
        `FORCING SCROLL: scroll_small down 25% to break pattern and find active elements.`;
      
      console.log(forceScrollMsg);
      logger.info(forceScrollMsg);
      
      // Force add a scroll action to the context
      const scrollAction = {
        scroll_small: {
          intent: 'FORCED - Break stuck pattern using comprehensive action analysis',
          direction: 'down' as const,
          amount: 25
        }
      };

      // Add the forced scroll as high-priority message with action context
      const contextualMessage = `${forceScrollMsg}\n\n` +
        `RECENT ACTION MEMORY:\n${recentActions.map((a, i) => `${i+1}. ${a.actionType}: ${a.actionDetails}`).join('\n')}\n\n` +
        `FORCED ACTION REQUIRED: ${JSON.stringify(scrollAction)}\n\n` +
        `Execute this scroll action immediately to break the detected stuck pattern.`;
        
      // Create a system message for the forced scroll
      const systemMessage = new SystemMessage(contextualMessage);
      context.messageManager.addMessageWithTokens(systemMessage, 'forced_scroll');

      // Mark for re-planning to incorporate the forced scroll
      context.needsReplanning = true;
      
      console.log(`🚨 INTERVENTION APPLIED: Added scroll action with full action context`);
    } else {
      console.log(`✅ NO STUCK PATTERNS DETECTED: Action flow appears normal`);
    }
  }

  private async navigate(): Promise<boolean> {
    const context = this.context;
    try {
      // Get and execute navigation action
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        return false;
      }

      // 🚨 CRITICAL: Pattern detection for stuck clicking before executing
      this.detectStuckClickingPattern();

      const navOutput = await this.navigator.execute();
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        return false;
      }
      
      // 🎯 GOAL TRACKING: Analyze recent actions for goal progress
      this.trackGoalProgress(context.actionResults);
      
      // Check if any action results indicate DOM changes (like autocomplete)
      if (context.actionResults && context.actionResults.length > 0) {
        for (const result of context.actionResults) {
          if (result.extractedContent?.includes('Autocomplete appeared') || 
              result.extractedContent?.includes('re-analyze DOM')) {
            console.log('🎯 DOM CHANGE DETECTED - Will trigger re-planning on next iteration');
            console.log('🎯 Trigger content:', result.extractedContent);
            context.needsReplanning = true;
            break; // Only need to set the flag once
          }
        }
      }
      
      context.nSteps++;
      if (navOutput.error) {
        throw new Error(navOutput.error);
      }
      context.consecutiveFailures = 0;
      if (navOutput.result?.done) {
        return true;
      }
    } catch (error) {
      logger.error(`Failed to execute step: ${error}`);
      if (
        error instanceof ChatModelAuthError ||
        error instanceof ChatModelForbiddenError ||
        error instanceof URLNotAllowedError ||
        error instanceof RequestCancelledError ||
        error instanceof ExtensionConflictError
      ) {
        throw error;
      }
      context.consecutiveFailures++;
      logger.error(`Failed to execute step: ${error}`);
      if (context.consecutiveFailures >= context.options.maxFailures) {
        throw new Error('Max failures reached');
      }
    }
    return false;
  }

  /**
   * Check if we need to force re-planning due to DOM changes
   */
  private shouldForceReplanning(): boolean {
    const needsReplanning = this.context.needsReplanning || false;
    if (needsReplanning) {
      console.log('🎯 FORCING RE-PLANNING due to DOM changes');
      // Reset the flag after consuming it
      this.context.needsReplanning = false;
    }
    return needsReplanning;
  }

  private async shouldStop(): Promise<boolean> {
    if (this.context.stopped) {
      logger.info('Agent stopped');
      return true;
    }

    while (this.context.paused) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (this.context.stopped) {
        return true;
      }
    }

    if (this.context.consecutiveFailures >= this.context.options.maxFailures) {
      logger.error(`Stopping due to ${this.context.options.maxFailures} consecutive failures`);
      return true;
    }

    return false;
  }

  async cancel(): Promise<void> {
    this.context.stop();
  }

  async resume(): Promise<void> {
    this.context.resume();
  }

  async pause(): Promise<void> {
    this.context.pause();
  }

  async cleanup(): Promise<void> {
    try {
      await this.context.browserContext.cleanup();
    } catch (error) {
      logger.error(`Failed to cleanup browser context: ${error}`);
    }
  }

  async getCurrentTaskId(): Promise<string> {
    return this.context.taskId;
  }

  /**
   * Replays a saved history of actions with error handling and retry logic.
   *
   * @param history - The history to replay
   * @param maxRetries - Maximum number of retries per action
   * @param skipFailures - Whether to skip failed actions or stop execution
   * @param delayBetweenActions - Delay between actions in seconds
   * @returns List of action results
   */
  async replayHistory(
    sessionId: string,
    maxRetries = 3,
    skipFailures = true,
    delayBetweenActions = 2.0,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    const replayLogger = createLogger('Executor:replayHistory');

    logger.info('replay task', this.tasks[0]);

    try {
      const historyFromStorage = await chatHistoryStore.loadAgentStepHistory(sessionId);
      if (!historyFromStorage) {
        throw new Error('History not found');
      }

      const history = JSON.parse(historyFromStorage.history) as AgentStepHistory;
      if (history.history.length === 0) {
        throw new Error('History is empty');
      }
      logger.debug(`🔄 Replaying history: ${JSON.stringify(history, null, 2)}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      for (let i = 0; i < history.history.length; i++) {
        const historyItem = history.history[i];

        // Check if execution should stop
        if (this.context.stopped) {
          replayLogger.info('Replay stopped by user');
          break;
        }

        // Execute the history step with enhanced method that handles all the logic
        const stepResults = await this.navigator.executeHistoryStep(
          historyItem,
          i,
          history.history.length,
          maxRetries,
          delayBetweenActions * 1000,
          skipFailures,
        );

        results.push(...stepResults);

        // If stopped during execution, break the loop
        if (this.context.stopped) {
          break;
        }
      }

      if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Replay cancelled');
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, 'Replay completed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      replayLogger.error(`Replay failed: ${errorMessage}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, `Replay failed: ${errorMessage}`);
    }

    return results;
  }

  /**
   * Request user input and wait for response
   */
  async requestUserInput(prompt: string, inputType: string = 'text'): Promise<string> {
    const inputId = `user_input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      // Store the promise resolvers
      this.pendingUserInputs.set(inputId, { resolve, reject });
      
      // Send request to Mac app via event system
      // We need to send this via the background script's message system
      // For now, we'll emit an event and handle it in the background script
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.ACT_OK, `Requesting user input: ${prompt}`);
      
      // Set timeout for user input (5 minutes)
      setTimeout(() => {
        if (this.pendingUserInputs.has(inputId)) {
          this.pendingUserInputs.delete(inputId);
          reject(new Error('User input timeout'));
        }
      }, 300000); // 5 minutes
    });
  }

  /**
   * Handle user input response from Mac app
   */
  async handleUserInput(inputId: string, value: string): Promise<void> {
    const pending = this.pendingUserInputs.get(inputId);
    if (pending) {
      this.pendingUserInputs.delete(inputId);
      
      if (value === 'CANCELLED' || value === 'DISMISSED') {
        pending.reject(new Error('User cancelled input'));
      } else if (value === 'SKIP') {
        pending.resolve(''); // Empty string for skip
      } else {
        pending.resolve(value);
      }
      
      logger.info(`User input received for ${inputId}: ${value}`);
    } else {
      logger.error(`No pending user input found for ID: ${inputId}`);
    }
  }

  /**
   * 🎯 Track goal progress based on recent actions
   */
  private trackGoalProgress(actionResults: ActionResult[]): void {
    if (!actionResults || actionResults.length === 0) return;

    const goalState = this.goalTracker.getGoalState();
    if (!goalState) return;

    // Analyze recent actions for goal-relevant progress
    const recentActions = actionResults.slice(-5); // Look at last 5 actions
    
    for (const action of recentActions) {
      const content = action.extractedContent || '';
      
      // Track quiz progress
      if (goalState.task.goalType === 'quiz') {
        // Detect successful Next button clicks (indicating question progression)
        if (content.includes('Next ❯') && 
            (content.includes('SUCCESS') || content.includes('Changes detected'))) {
          
          console.log('🎯 QUIZ PROGRESS: Detected successful Next button click');
          this.goalTracker.recordQuestionAnswered('Question progression detected');
          console.log('🎯 CURRENT STATUS:', this.goalTracker.getProgressSummary());
        }
        
        // Detect answer selections
        if (content.includes('Clicked') && 
            !content.includes('Next') && 
            !content.includes('<script>') &&
            (content.includes('SUCCESS') || content.includes('Changes detected'))) {
          
          console.log('🎯 QUIZ PROGRESS: Detected answer selection');
          this.goalTracker.recordAction(`Answer selected: ${content.substring(0, 100)}...`);
        }
      }
      
      // Track form progress
      if (goalState.task.goalType === 'form') {
        if (content.includes('submit') || content.includes('Submit')) {
          console.log('🎯 FORM PROGRESS: Detected form submission');
          this.goalTracker.recordFormCompleted('Form submission detected');
        }
        
        if (content.includes('Typed') || content.includes('input')) {
          console.log('🎯 FORM PROGRESS: Detected input field completion');
          this.goalTracker.recordAction(`Input completed: ${content.substring(0, 100)}...`);
        }
      }
      
      // Track page navigation for all goal types
      if (content.includes('Navigated to') || content.includes('navigateTo')) {
        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          this.goalTracker.recordPageVisit(urlMatch[0]);
        }
      }
    }
    
    // Log progress periodically
    if (recentActions.length > 0) {
      console.log('🎯 GOAL PROGRESS UPDATE:', this.goalTracker.getDetailedProgress());
    }
  }
}
