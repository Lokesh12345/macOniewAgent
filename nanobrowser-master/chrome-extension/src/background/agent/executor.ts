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
import { webSocketClient } from '../webSocketClient';
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

const logger = createLogger('Executor');

export interface ExecutorExtraArgs {
  plannerLLM?: BaseChatModel;
  validatorLLM?: BaseChatModel;
  extractorLLM?: BaseChatModel;
  agentOptions?: Partial<AgentOptions>;
  generalSettings?: GeneralSettingsConfig;
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
  private currentPlan: string | null = null;
  private completedSteps: string[] = [];
  private remainingSteps: string[] = [];
  
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
    this.tasks.push(task);
    this.navigatorPrompt = new NavigatorPrompt(context.options.maxActionsPerStep);
    this.plannerPrompt = new PlannerPrompt();
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
   * Preprocessing phase to ensure system readiness before task execution
   */
  private async preprocessingPhase(): Promise<void> {
    const currentTask = this.tasks[this.tasks.length - 1];
    logger.info(`🚀 Starting task: "${currentTask}"`);
    this.context.emitEvent(Actors.SYSTEM, ExecutionState.STEP_START, 'System preparation');

    try {
      // Ensure Puppeteer connection
      const currentPage = await this.context.browserContext.getCurrentPage();
      if (!currentPage.attached) {
        await this.context.browserContext.attachPage(currentPage);
        logger.info('✅ Browser connected');
      }

      // Get current state
      const currentState = await this.context.browserContext.getCachedState();
      const tabInfos = await this.context.browserContext.getTabInfos();
      
      // Add minimal system context to agent memory
      const systemMessage = `Task: "${currentTask}"
Current page: ${currentState.title || 'Unknown'} (${currentState.url || 'Unknown'})
Total tabs: ${tabInfos.length}`;

      this.context.messageManager.addSystemMessage(systemMessage);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.STEP_OK, 'System ready');
      logger.info('✅ System ready');

    } catch (error) {
      const errorMsg = `Preprocessing failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.STEP_FAIL, errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Let the agent evaluate its own progress and adapt plan if needed
   */
  private async updateProgressTracking(): Promise<void> {
    try {
      if (!this.currentPlan || this.remainingSteps.length === 0) {
        return;
      }

      const recentActions = this.context.history.history
        .slice(-1)
        .map(h => h.actionResults?.map(r => r.extractedContent).join(', '))
        .filter(Boolean)
        .join('; ');

      if (!recentActions) {
        return;
      }

      // Simple progress reminder
      const progressReminder = `Progress check:
Task: "${this.tasks[this.tasks.length - 1]}"
Next step: "${this.remainingSteps[0]}"
Recent action: ${recentActions}

Continue with your plan. If obstacles appear, adapt your approach but stay focused on the original task.`;

      this.context.messageManager.addSystemMessage(progressReminder);
      
      // Simple step completion check
      const lastAction = this.context.history.history.slice(-1)[0];
      if (lastAction?.actionResults?.some(r => r.extractedContent?.toLowerCase().includes('completed') || 
                                              r.extractedContent?.toLowerCase().includes('done'))) {
        if (this.remainingSteps.length > 0) {
          const completedStep = this.remainingSteps.shift()!;
          this.completedSteps.push(completedStep);
          logger.info(`✅ Step completed: "${completedStep}"`);
        }
      }
      
    } catch (error) {
      // Silent fail - don't spam logs
    }
  }

  /**
   * Determine if replanning is needed based on current page context
   */
  private async shouldReplanBasedOnContext(currentState: any, stepNumber: number): Promise<boolean> {
    try {
      if (!this.currentPlan || stepNumber < 3) {
        return false;
      }

      // Simple checks for major page changes
      const lastActionResult = this.context.history.history.slice(-1)[0]?.actionResults?.[0];
      const hasError = lastActionResult?.extractedContent?.includes('failed') || 
                      lastActionResult?.extractedContent?.includes('Error');
      
      if (hasError) {
        logger.info('🔄 Replanning due to errors');
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Provide simple task context guidance
   */
  private async validateTaskContext(stepNumber: number): Promise<void> {
    try {
      const currentTask = this.tasks[this.tasks.length - 1];
      
      let contextGuidance = `Task: "${currentTask}"`;

      if (this.currentPlan && this.remainingSteps.length > 0) {
        contextGuidance += `
Next step: "${this.remainingSteps[0]}"
Focus on completing this step while staying true to the original task.`;
      } else {
        contextGuidance += `
Focus on completing this task step by step.`;
      }

      this.context.messageManager.addSystemMessage(contextGuidance);
      
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Execute the task
   *
   * @returns {Promise<void>}
   */
  async execute(): Promise<void> {
    logger.info(`🚀 Executing task: ${this.tasks[this.tasks.length - 1]}`);
    // reset the step counter
    const context = this.context;
    context.nSteps = 0;
    const allowedMaxSteps = this.context.options.maxSteps;

    try {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      // Run preprocessing phase before starting task execution
      await this.preprocessingPhase();

      let done = false;
      let step = 0;
      let validatorFailed = false;
      let webTask = undefined;
      for (step = 0; step < allowedMaxSteps; step++) {
        context.stepInfo = {
          stepNumber: context.nSteps,
          maxSteps: context.options.maxSteps,
        };

        logger.info(`🚀 Step ${step + 1}/${allowedMaxSteps}`);
        
        // Send step progress to Mac app
        webSocketClient.sendStepProgress(
          step + 1, 
          `Step ${step + 1}: Analyzing page...`, 
          'starting',
          { totalSteps: allowedMaxSteps, currentNSteps: context.nSteps }
        );
        
        if (await this.shouldStop()) {
          break;
        }

        // Add task validation and progress tracking before each step
        await this.validateTaskContext(step);
        await this.updateProgressTracking();

        // Check if DOM changes or unexpected page state require plan re-evaluation
        const currentState = await this.context.browserContext.getCachedState();
        const shouldReplan = await this.shouldReplanBasedOnContext(currentState, step);
        
        // Run planner if configured or if replanning is needed
        const shouldRunPlanner = this.planner && (
          context.nSteps % context.options.planningInterval === 0 || 
          validatorFailed || 
          shouldReplan
        );
        if (shouldRunPlanner) {
          logger.info('🧠 Planning...');
          validatorFailed = false;
          
          // Send LLM thinking notification
          const thinkingMessage = shouldReplan ? 
            'Planner is adapting strategy based on page changes...' : 
            'Planner is analyzing the current situation and creating a strategy...';
          logger.info('📡 Sending planner thinking notification to Mac app...');
          webSocketClient.sendLLMThinking('planning', thinkingMessage);
          
          // Add adaptation context if this is a replanning session
          if (shouldReplan && this.currentPlan) {
            const adaptationContext = `PLAN ADAPTATION REQUIRED:
ORIGINAL USER TASK (UNCHANGEABLE): "${this.tasks[this.tasks.length - 1]}"

Your Current Plan: ${this.currentPlan}
Completed Steps: [${this.completedSteps.join(', ')}]
Remaining Steps: [${this.remainingSteps.join(', ')}]

🔄 ADAPTATION GUIDANCE:
- Page content or structure has changed
- Your current plan may need adjustments to handle new conditions
- KEEP the same GOAL (original user task)
- ADAPT the approach/method based on new page reality
- Add steps for obstacles (popups, forms, etc.) but stay focused on original task
- Do NOT expand beyond what user asked for

Analyze the current page and adapt your remaining steps as needed while staying true to the original task.`;
            
            this.context.messageManager.addSystemMessage(adaptationContext);
            logger.info('🔄 Plan adaptation context added to planner memory');
          }
          
          // The first planning step is special, we don't want to add the browser state message to memory
          let positionForPlan = 0;
          if (this.tasks.length > 1 || step > 0) {
            await this.navigator.addStateMessageToMemory();
            positionForPlan = this.context.messageManager.length() - 1;
          } else {
            positionForPlan = this.context.messageManager.length();
          }

          logger.info('🧠 PLANNER EXECUTION START');
          const planOutput = await this.planner.execute();
          logger.info(`📝 Planner Result: ${planOutput.result ? 'Success' : 'Failed'}`);
          if (planOutput.result) {
            logger.info(`📄 Planner Output:`);
            logger.info(`  📋 Observation: ${planOutput.result.observation || 'None'}`);
            logger.info(`  🧐 Reasoning: ${planOutput.result.reasoning || 'None'}`);
            logger.info(`  🎯 Web Task: ${planOutput.result.web_task || 'None'}`);
            logger.info(`  ✅ Done: ${planOutput.result.done ? 'Yes' : 'No'}`);
            logger.info(`  📅 Next Steps: ${planOutput.result.next_steps || 'None'}`);
            
            // Send planner reasoning to Mac app
            logger.info('📡 Sending planner completion to Mac app...');
            webSocketClient.sendLLMThinking('planning_complete', 
              planOutput.result.reasoning || 'Plan created', 
              `Observation: ${planOutput.result.observation || 'Analyzing current state'}`
            );
            
            // Store the plan for memory and tracking
            const previousPlan = this.currentPlan;
            this.currentPlan = planOutput.result.next_steps || null;
            if (this.currentPlan) {
              // Parse steps from the plan
              const newRemainingSteps = this.currentPlan.split('\n')
                .filter(step => step.trim())
                .map(step => step.replace(/^\d+\.\s*/, '').trim())
                .filter(step => step.length > 0);
              
              const isAdaptedPlan = previousPlan && previousPlan !== this.currentPlan;
              if (isAdaptedPlan) {
                logger.info(`🔄 Plan adapted: ${newRemainingSteps.length} new steps`);
                logger.info(`📋 Previous plan had ${this.remainingSteps.length} remaining steps`);
                logger.info(`📋 New plan has ${newRemainingSteps.length} remaining steps`);
              } else {
                logger.info(`📋 Plan created: ${newRemainingSteps.length} steps total`);
              }
              
              this.remainingSteps = newRemainingSteps;
              this.remainingSteps.forEach((step, index) => {
                logger.info(`  Step ${index + 1}: ${step}`);
              });
              
              // Add plan awareness to agent memory
              const planType = isAdaptedPlan ? 'ADAPTED' : 'CREATED';
              const planMemoryMessage = `PLAN ${planType} FOR TASK: "${this.tasks[this.tasks.length - 1]}"

${isAdaptedPlan ? `Previous plan adapted due to page changes. 
Completed so far: [${this.completedSteps.join(', ')}] (${this.completedSteps.length} steps done)

` : ''}Your ${isAdaptedPlan ? 'updated' : 'new'} plan has ${this.remainingSteps.length} ${isAdaptedPlan ? 'remaining' : 'total'} steps:
${this.remainingSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Remember: 
- You ${isAdaptedPlan ? 'adapted' : 'created'} this plan based on current page conditions
- Follow it step by step to complete your ORIGINAL task: "${this.tasks[this.tasks.length - 1]}"
- Track your progress as you work through each step
${isAdaptedPlan ? '- This adaptation helps you handle page changes while staying focused on the original goal' : ''}`;
              
              this.context.messageManager.addSystemMessage(planMemoryMessage);
              logger.info(`💾 Plan ${planType.toLowerCase()} awareness added to agent memory`);
            }
            
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
              logger.info('✅ Planner indicates task is COMPLETE - skipping navigation');
              done = true;
              this.validator.setPlan(planOutput.result.next_steps);
            } else {
              // task is not complete, let's navigate
              logger.info('🔄 Planner indicates task is NOT complete - proceeding with navigation');
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
          logger.info('🦭 NAVIGATOR EXECUTION START');
          webSocketClient.sendLLMThinking('navigation', 'Navigator is analyzing the page and deciding what action to take...');
          logger.info('📡 Navigator thinking notification sent to Mac app');
          done = await this.navigate();
          logger.info(`🦭 Navigator Result: ${done ? 'Task completed' : 'Continuing to next step'}`);
        } else {
          logger.info('⏭️ Skipping navigation - task marked as done by planner');
        }

        // validate the output (run in parallel with potential next step preparation)
        const shouldValidate = done && this.context.options.validateOutput && !this.context.stopped && !this.context.paused;
        logger.info(`🔍 Validator Decision: ${shouldValidate ? 'Running validator' : 'Skipping validator'}`);
        if (shouldValidate) {
          logger.info('🕵️ VALIDATOR EXECUTION START');
          const validatorOutput = await this.validator.execute();
          logger.info(`📄 Validator Result: ${validatorOutput.result ? 'Success' : 'Failed'}`);
          if (validatorOutput.result?.is_valid) {
            logger.info('✅ Validator confirms: Task completed successfully!');
            logger.info('🎉 TASK EXECUTION COMPLETE');
            break;
          } else {
            logger.warning('❌ Validator failed - task not completed correctly');
            validatorFailed = true;
            context.consecutiveValidatorFailures++;
            logger.info(`📈 Consecutive validator failures: ${context.consecutiveValidatorFailures}/${context.options.maxValidatorFailures}`);
            if (context.consecutiveValidatorFailures >= context.options.maxValidatorFailures) {
              logger.error(`🚫 Stopping due to ${context.options.maxValidatorFailures} consecutive validator failures`);
              throw new Error('Too many failures of validation');
            }
          }
        }
      }

      logger.info('🏁 EXECUTION LOOP COMPLETE');
      logger.info(`📋 Final Status: done=${done}, step=${step}, maxSteps=${allowedMaxSteps}, stopped=${this.context.stopped}`);
      
      if (done) {
        logger.info('✅ TASK SUCCESS: Task completed successfully');
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, this.context.taskId);
      } else if (step >= allowedMaxSteps) {
        logger.error('❌ TASK FAILED: Max steps reached');
        logger.error(`📋 Reached step limit: ${step}/${allowedMaxSteps}`);
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, 'Task failed: Max steps reached');
      } else if (this.context.stopped) {
        logger.info('⏹️ TASK CANCELLED: User stopped execution');
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Task cancelled');
      } else {
        logger.info('⏸️ TASK PAUSED: Execution paused');
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

  private async navigate(): Promise<boolean> {
    const context = this.context;
    logger.info('🧭 NAVIGATE FUNCTION START');
    try {
      // Get and execute navigation action
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        logger.info('⏸️ Navigation skipped - context paused or stopped');
        return false;
      }
      
      logger.info('🎯 Calling Navigator.execute()...');
      const navOutput = await this.navigator.execute();
      logger.info(`🎯 Navigator.execute() completed: ${navOutput.result ? 'Success' : 'Failed'}`);
      if (navOutput.result) {
        logger.info(`🎬 Action Taken: ${navOutput.result.action || 'Unknown'}`);
        logger.info(`✅ Action Done: ${navOutput.result.done ? 'Yes' : 'No'}`);
      }
      if (navOutput.error) {
        logger.error(`❌ Navigator Error: ${navOutput.error}`);
      }
      
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        logger.info('⏸️ Navigation interrupted - context paused or stopped');
        return false;
      }
      
      context.nSteps++;
      logger.info(`📈 Step counter incremented to: ${context.nSteps}`);
      
      // Send step completion progress
      webSocketClient.sendStepProgress(
        context.nSteps,
        `Step ${context.nSteps} completed: ${navOutput.result?.action || 'Navigation action executed'}`,
        'completed',
        { 
          totalSteps: context.options.maxSteps, 
          actionTaken: navOutput.result?.action,
          actionResult: navOutput.result?.done ? 'Task completed' : 'Continuing...'
        }
      );
      
      if (navOutput.error) {
        webSocketClient.sendStepProgress(
          context.nSteps,
          `Step ${context.nSteps} failed: ${navOutput.error}`,
          'failed',
          { error: navOutput.error }
        );
        throw new Error(navOutput.error);
      }
      context.consecutiveFailures = 0;
      logger.info('✅ Navigation step successful - resetting failure counter');
      
      if (navOutput.result?.done) {
        logger.info('🎉 Navigator indicates task is DONE!');
        return true;
      } else {
        logger.info('🔄 Navigator indicates task is NOT done - continuing');
      }
    } catch (error) {
      logger.error(`❌ NAVIGATION FAILED: ${error}`);
      logger.error(`📊 Error type: ${error.constructor.name}`);
      
      if (
        error instanceof ChatModelAuthError ||
        error instanceof ChatModelForbiddenError ||
        error instanceof URLNotAllowedError ||
        error instanceof RequestCancelledError ||
        error instanceof ExtensionConflictError
      ) {
        logger.error('🚫 Critical error - rethrowing immediately');
        throw error;
      }
      
      context.consecutiveFailures++;
      logger.error(`📈 Consecutive failures: ${context.consecutiveFailures}/${context.options.maxFailures}`);
      
      if (context.consecutiveFailures >= context.options.maxFailures) {
        logger.error('🛑 Max failures reached - throwing error');
        throw new Error('Max failures reached');
      } else {
        logger.info('🔄 Within failure limit - will retry');
      }
    }
    
    logger.info('🧭 NAVIGATE FUNCTION END - returning false (continue)');
    return false;
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
}
