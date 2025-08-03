import { z } from 'zod';
import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { ActionResult, type AgentOutput } from '../types';
import type { Action } from '../actions/builder';
import { buildDynamicActionSchema } from '../actions/builder';
import { agentBrainSchema } from '../types';
import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Actors, ExecutionState } from '../event/types';
import {
  ChatModelAuthError,
  ChatModelForbiddenError,
  EXTENSION_CONFLICT_ERROR_MESSAGE,
  ExtensionConflictError,
  isAbortedError,
  isAuthenticationError,
  isExtensionConflictError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
import { calcBranchPathHashSet } from '@src/background/browser/dom/views';
import { type BrowserState, BrowserStateHistory, URLNotAllowedError } from '@src/background/browser/views';
import { convertZodToJsonSchema, repairJsonString } from '@src/background/utils';
import { HistoryTreeProcessor } from '@src/background/browser/dom/history/service';
import { AgentStepRecord } from '../history';
import { type DOMHistoryElement } from '@src/background/browser/dom/history/view';

const logger = createLogger('NavigatorAgent');

// Simple element cache for frequently accessed elements
class ElementCache {
  private cache = new Map<string, any>();
  private relationships = new Map<string, string[]>(); // Track element relationships
  private maxSize = 50; // Keep cache small

  set(key: string, element: any): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.relationships.delete(firstKey);
    }
    this.cache.set(key, element);
    
    // Track common UI patterns (simple heuristics)
    if (element && element.tagName) {
      this.trackRelationships(key, element);
    }
  }

  private trackRelationships(key: string, element: any): void {
    const related: string[] = [];
    
    // Common form patterns
    if (element.tagName === 'input' && element.attributes?.type === 'text') {
      // Look for nearby submit buttons
      related.push('button', 'input[type=submit]');
    } else if (element.tagName === 'button' || (element.tagName === 'input' && element.attributes?.type === 'submit')) {
      // Look for nearby input fields
      related.push('input[type=text]', 'input[type=email]', 'input[type=password]');
    }
    
    if (related.length > 0) {
      this.relationships.set(key, related);
    }
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  getRelated(key: string): string[] {
    return this.relationships.get(key) || [];
  }

  clear(): void {
    this.cache.clear();
    this.relationships.clear();
  }
}

const elementCache = new ElementCache();

// Dynamic site optimization based on patterns and page characteristics
class SiteOptimizer {
  detectSiteCharacteristics(url: string, pageContent?: string): Record<string, any> {
    const characteristics = {
      isEmailService: false,
      isSearchEngine: false,
      isEcommerce: false,
      isCodeRepository: false,
      isSocialMedia: false,
      hasDynamicContent: false,
      isMediaHeavy: false,
      requiresAuth: false
    };

    // Validate URL before parsing
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return characteristics; // Return default characteristics for invalid URL
    }

    const urlLower = url.toLowerCase();
    let domain = '';
    
    try {
      domain = new URL(url).hostname;
    } catch (error) {
      // Invalid URL format - return default characteristics
      logger.warning(`Invalid URL in detectSiteCharacteristics: ${url}`);
      return characteristics;
    }
    
    // Detect patterns without hardcoding specific sites
    characteristics.isEmailService = /mail|email|inbox|compose/i.test(urlLower) || 
                                    (pageContent && /compose|inbox|sent|draft/i.test(pageContent || ''));
    
    characteristics.isSearchEngine = /search|query|\?q=|&q=/i.test(urlLower) ||
                                    (pageContent && /<input[^>]*search[^>]*>/i.test(pageContent || ''));
    
    characteristics.isEcommerce = /shop|store|cart|checkout|product|buy/i.test(urlLower) ||
                                 (pageContent && /add to cart|buy now|price|shipping/i.test(pageContent || ''));
    
    characteristics.isCodeRepository = /repo|code|commit|pull|issue|branch/i.test(urlLower) ||
                                      (pageContent && /repository|commits|branches|pull request/i.test(pageContent || ''));
    
    characteristics.isSocialMedia = /social|feed|post|profile|follow|share/i.test(urlLower) ||
                                   (pageContent && /timeline|friends|followers|likes/i.test(pageContent || ''));
    
    // Detect dynamic content indicators
    characteristics.hasDynamicContent = pageContent ? 
      /react|angular|vue|ajax|fetch|websocket/i.test(pageContent) : false;
    
    // Detect media-heavy pages
    characteristics.isMediaHeavy = pageContent ? 
      (pageContent.match(/<img/gi)?.length || 0) > 10 ||
      (pageContent.match(/<video/gi)?.length || 0) > 0 : false;
    
    // Detect auth requirements
    characteristics.requiresAuth = /login|signin|auth|account/i.test(urlLower) ||
                                  (pageContent && /password|username|email.*login/i.test(pageContent || ''));
    
    return characteristics;
  }

  getOptimizedWait(actionName: string, url: string, pageCharacteristics?: Record<string, any>): number {
    const chars = pageCharacteristics || this.detectSiteCharacteristics(url);
    
    // Dynamic timing based on page characteristics
    let baseWait = 500; // Default wait time
    
    // Adjust based on action type
    if (actionName === 'go_to_url' || actionName === 'refresh_page') {
      baseWait = 2000; // Page navigation base
      
      if (chars.isMediaHeavy) baseWait += 1000; // Media-heavy pages need more time
      if (chars.hasDynamicContent) baseWait += 500; // Dynamic content needs settling time
      if (chars.isEcommerce) baseWait += 500; // E-commerce sites often have complex layouts
    } else if (actionName === 'click_element') {
      baseWait = 500; // Click action base
      
      if (chars.isEmailService) baseWait += 300; // Email services often have animations
      if (chars.hasDynamicContent) baseWait += 200; // Dynamic content may trigger updates
    } else if (actionName === 'input_text') {
      baseWait = 200; // Input action base
      
      if (chars.isSearchEngine) baseWait = 100; // Search engines have instant feedback
      if (chars.isEcommerce) baseWait += 200; // E-commerce search may have suggestions
    }
    
    return baseWait;
  }

  getSmartSelectors(intent: string, pageCharacteristics?: Record<string, any>): string[] {
    const selectors: string[] = [];
    const intentLower = intent.toLowerCase();
    
    // Generate selectors based on intent patterns
    if (intentLower.includes('search')) {
      selectors.push(
        'input[type="search"]',
        'input[placeholder*="search" i]',
        'input[aria-label*="search" i]',
        'input[name="q"]',
        'input[name*="search" i]',
        'input[name*="query" i]'
      );
    }
    
    if (intentLower.includes('compose') || intentLower.includes('new')) {
      selectors.push(
        'button[aria-label*="compose" i]',
        'button[aria-label*="new" i]',
        'button[aria-label*="create" i]',
        'a[href*="compose"]',
        'button:has-text("New")',
        'button:has-text("Compose")'
      );
    }
    
    if (intentLower.includes('login') || intentLower.includes('sign')) {
      selectors.push(
        'input[type="email"]',
        'input[type="password"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'button[type="submit"]',
        'button:has-text("Sign in")',
        'button:has-text("Log in")'
      );
    }
    
    return selectors;
  }

  handleDynamicError(error: string, url: string, pageCharacteristics?: Record<string, any>): string | null {
    const chars = pageCharacteristics || this.detectSiteCharacteristics(url);
    const errorLower = error.toLowerCase();
    
    // Dynamic error handling based on patterns
    if (errorLower.includes('element not found')) {
      if (chars.hasDynamicContent) {
        return 'Page has dynamic content. Wait for elements to load or try refreshing.';
      }
      if (chars.requiresAuth) {
        return 'Page may require authentication. Ensure you are logged in.';
      }
      return 'Element not found. The page structure may have changed. Try alternative selectors.';
    }
    
    if (errorLower.includes('timeout')) {
      if (chars.isMediaHeavy) {
        return 'Media-heavy page detected. Allow more time for loading.';
      }
      if (chars.isEcommerce) {
        return 'Complex page structure. Consider breaking down the action into smaller steps.';
      }
      return 'Operation timed out. Check internet connection or try again.';
    }
    
    if (errorLower.includes('navigation')) {
      if (chars.requiresAuth) {
        return 'Navigation blocked. Check if authentication is required.';
      }
      return 'Navigation failed. Verify the URL is correct and accessible.';
    }
    
    return null; // No specific handling
  }
}

const siteOptimizer = new SiteOptimizer();

interface ParsedModelOutput {
  current_state?: {
    next_goal?: string;
  };
  action?: (Record<string, unknown> | null)[] | null;
}

export class NavigatorActionRegistry {
  private actions: Record<string, Action> = {};

  constructor(actions: Action[]) {
    for (const action of actions) {
      this.registerAction(action);
    }
  }

  registerAction(action: Action): void {
    this.actions[action.name()] = action;
  }

  unregisterAction(name: string): void {
    delete this.actions[name];
  }

  getAction(name: string): Action | undefined {
    return this.actions[name];
  }

  setupModelOutputSchema(): z.ZodType {
    const actionSchema = buildDynamicActionSchema(Object.values(this.actions));
    return z.object({
      current_state: agentBrainSchema,
      action: z.array(actionSchema),
    });
  }
}

export interface NavigatorResult {
  done: boolean;
}

export class NavigatorAgent extends BaseAgent<z.ZodType, NavigatorResult> {
  private actionRegistry: NavigatorActionRegistry;
  private jsonSchema: Record<string, unknown>;
  private _stateHistory: BrowserStateHistory | null = null;

  constructor(
    actionRegistry: NavigatorActionRegistry,
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>,
  ) {
    super(actionRegistry.setupModelOutputSchema(), options, { ...extraOptions, id: 'navigator' });

    this.actionRegistry = actionRegistry;

    // The zod object is too complex to be used directly, so we need to convert it to json schema first for the model to use
    this.jsonSchema = convertZodToJsonSchema(this.modelOutputSchema, 'NavigatorAgentOutput', true);
  }

  async invoke(inputMessages: BaseMessage[]): Promise<this['ModelOutput']> {
    // Use structured output
    if (this.withStructuredOutput) {
      const structuredLlm = this.chatLLM.withStructuredOutput(this.jsonSchema, {
        includeRaw: true,
        name: this.modelOutputToolName,
      });

      let response = undefined;
      try {
        response = await structuredLlm.invoke(inputMessages, {
          signal: this.context.controller.signal,
          ...this.callOptions,
        });

        if (response.parsed) {
          return response.parsed;
        }
      } catch (error) {
        if (isAbortedError(error)) {
          throw error;
        }
        const errorMessage = `Failed to invoke ${this.modelName} with structured output: ${error}`;
        throw new Error(errorMessage);
      }

      // Use type assertion to access the properties
      const rawResponse = response.raw as BaseMessage & {
        tool_calls?: Array<{
          args: {
            currentState: typeof agentBrainSchema._type;
            action: z.infer<ReturnType<typeof buildDynamicActionSchema>>;
          };
        }>;
      };

      // sometimes LLM returns an empty content, but with one or more tool calls, so we need to check the tool calls
      if (rawResponse.tool_calls && rawResponse.tool_calls.length > 0) {
        logger.info('Navigator structuredLlm tool call with empty content', rawResponse.tool_calls);
        // only use the first tool call
        const toolCall = rawResponse.tool_calls[0];
        return {
          current_state: toolCall.args.currentState,
          action: [...toolCall.args.action],
        };
      }
      throw new Error('Could not parse response');
    }

    // Fallback to parent class manual JSON extraction for models without structured output support
    return super.invoke(inputMessages);
  }

  async execute(): Promise<AgentOutput<NavigatorResult>> {
    logger.info('🧭 NAVIGATOR EXECUTE START');
    logger.info(`🔍 Navigator ID: ${this.id}`);
    
    const agentOutput: AgentOutput<NavigatorResult> = {
      id: this.id,
    };

    // Note: Browser state will be fetched when needed in doActions method

    let cancelled = false;
    let modelOutputString: string | null = null;
    let browserStateHistory: BrowserStateHistory | null = null;
    let actionResults: ActionResult[] = [];
    
    logger.info('📊 Initial state: cancelled=false, actionResults=[], browserStateHistory=null');

    try {
      logger.info('📡 Emitting STEP_START event...');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_START, 'Navigating...');

      const messageManager = this.context.messageManager;
      logger.info('🧠 Adding browser state to memory...');
      await this.addStateMessageToMemory();
      
      logger.info('🌐 Getting current page state...');
      const currentState = await this.context.browserContext.getCachedState();
      logger.info(`📄 Current State: url="${currentState.url}", title="${currentState.title}"`);
      logger.info(`🌳 DOM Tree: ${currentState.elementTree ? 'Available' : 'Missing'}`);
      
      browserStateHistory = new BrowserStateHistory(currentState);
      logger.info('📚 Browser state history created');

      // check if the task is paused or stopped
      logger.info(`🔄 Checking execution state: paused=${this.context.paused}, stopped=${this.context.stopped}`);
      if (this.context.paused || this.context.stopped) {
        logger.info('⏸️ Task paused or stopped - cancelling navigator execution');
        cancelled = true;
        return agentOutput;
      }

      // call the model to get the actions to take
      const inputMessages = messageManager.getMessages();
      logger.info(`💬 Input messages count: ${inputMessages.length}`);
      logger.info(`💬 Last message type: ${inputMessages[inputMessages.length - 1]?.constructor.name || 'None'}`);
      
      logger.info('🤖 CALLING LLM MODEL...');
      const startTime = Date.now();
      const modelOutput = await this.invoke(inputMessages);
      const llmDuration = Date.now() - startTime;
      logger.info(`🤖 LLM RESPONSE RECEIVED in ${llmDuration}ms`);
      logger.info(`📝 Model Output Keys: ${Object.keys(modelOutput).join(', ')}`);

      // check if the task is paused or stopped
      logger.info(`🔄 Checking execution state after LLM: paused=${this.context.paused}, stopped=${this.context.stopped}`);
      if (this.context.paused || this.context.stopped) {
        logger.info('⏸️ Task paused or stopped after LLM call - cancelling');
        cancelled = true;
        return agentOutput;
      }

      logger.info('🔧 Fixing actions format...');
      const actions = this.fixActions(modelOutput);
      logger.info(`🎯 Actions count: ${actions.length}`);
      actions.forEach((action, index) => {
        const actionName = Object.keys(action)[0];
        logger.info(`  Action ${index + 1}: ${actionName}`);
      });
      
      modelOutput.action = actions;
      modelOutputString = JSON.stringify(modelOutput);
      logger.info('💾 Model output stringified for storage');

      // remove the last state message from memory before adding the model output
      logger.info('🗑️ Removing last state message from memory...');
      this.removeLastStateMessageFromMemory();
      logger.info('💭 Adding model output to memory...');
      this.addModelOutputToMemory(modelOutput);

      // take the actions
      logger.info('🎬 EXECUTING ACTIONS...');
      const actionStartTime = Date.now();
      actionResults = await this.doMultiAction(actions);
      const actionDuration = Date.now() - actionStartTime;
      logger.info(`🎬 ACTIONS COMPLETED in ${actionDuration}ms`);
      logger.info(`📊 Action Results: ${actionResults.length} results`);
      actionResults.forEach((result, index) => {
        logger.info(`  Result ${index + 1}: success=${!result.error}, done=${result.isDone}, content="${result.extractedContent?.substring(0, 50) || 'None'}..."`);
        if (result.error) {
          logger.error(`    Error: ${result.error}`);
        }
      });

      logger.info('💾 Storing action results in context...');
      this.context.actionResults = actionResults;

      // check if the task is paused or stopped
      logger.info(`🔄 Final execution state check: paused=${this.context.paused}, stopped=${this.context.stopped}`);
      if (this.context.paused || this.context.stopped) {
        logger.info('⏸️ Task paused or stopped after actions - cancelling');
        cancelled = true;
        return agentOutput;
      }
      
      // emit event
      logger.info('📡 Emitting STEP_OK event...');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_OK, 'Navigation done');
      
      let done = false;
      if (actionResults.length > 0 && actionResults[actionResults.length - 1].isDone) {
        done = true;
        logger.info('✅ Task marked as DONE by final action');
      } else {
        logger.info('🔄 Task NOT done - will continue');
      }
      
      agentOutput.result = { done };
      logger.info(`🧭 NAVIGATOR EXECUTE END - returning done=${done}`);
      return agentOutput;
    } catch (error) {
      this.removeLastStateMessageFromMemory();
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError('Navigator API Authentication failed. Please verify your API key', error);
      }
      if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }
      if (isAbortedError(error)) {
        throw new RequestCancelledError((error as Error).message);
      }
      if (error instanceof URLNotAllowedError) {
        throw error;
      }
      if (isExtensionConflictError(error)) {
        throw new ExtensionConflictError(EXTENSION_CONFLICT_ERROR_MESSAGE, error);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = `Navigation failed: ${errorMessage}`;

      logger.error(errorString);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_FAIL, errorString);
      agentOutput.error = errorMessage;
      return agentOutput;
    } finally {
      // if the task is cancelled, remove the last state message from memory and emit event
      if (cancelled) {
        this.removeLastStateMessageFromMemory();
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_CANCEL, 'Navigation cancelled');
      }
      if (browserStateHistory) {
        // Create a copy of actionResults to store in history
        const actionResultsCopy = actionResults.map(result => {
          return new ActionResult({
            isDone: result.isDone,
            success: result.success,
            extractedContent: result.extractedContent,
            error: result.error,
            includeInMemory: result.includeInMemory,
            interactedElement: result.interactedElement,
          });
        });

        const history = new AgentStepRecord(modelOutputString, actionResultsCopy, browserStateHistory);
        this.context.history.history.push(history);

        // logger.info('All history', JSON.stringify(this.context.history, null, 2));
      }
    }
  }

  /**
   * Check for errors or misalignment and suggest corrections
   */
  private async checkForErrorsAndCorrections(): Promise<void> {
    try {
      const currentState = await this.context.browserContext.getCachedState();
      const currentTask = this.context.messageManager.getMessages()
        .find(m => m.content?.toString().includes('Task to execute:'))
        ?.content?.toString()
        .match(/Task to execute: "([^"]*)"/) 
        ?.[1] || '';

      // Analyze recent action results for errors or misalignment
      const recentResults = this.context.actionResults.slice(-3);
      const hasErrors = recentResults.some(r => r.error);
      const recentPages = this.context.history.history.slice(-2).map(h => h.browserStateHistory?.getCurrentState().url);
      
      // Detect common mistakes using intelligent pattern matching
      let correctionNeeded = false;
      let correctionMessage = '';

      // 1. Extract key entities from task (domains, actions, targets)
      const taskLower = currentTask.toLowerCase();
      const taskWords = taskLower.split(/\s+/);
      
      // Extract potential domains/sites mentioned in task
      const domainPattern = /(?:on|at|in|to|from)\s+(\w+(?:\.\w+)?)/g;
      const mentionedDomains: string[] = [];
      let match;
      while ((match = domainPattern.exec(taskLower)) !== null) {
        mentionedDomains.push(match[1]);
      }

      // Extract action keywords
      const searchKeywords = ['search', 'find', 'look for', 'query'];
      const isSearchTask = searchKeywords.some(keyword => taskLower.includes(keyword));
      
      // 2. Check for task-URL alignment without hardcoding
      let currentDomain = '';
      let currentDomainBase = '';
      try {
        if (currentState.url && currentState.url.trim() !== '' && (currentState.url.startsWith('http://') || currentState.url.startsWith('https://'))) {
          currentDomain = new URL(currentState.url).hostname.replace('www.', '');
          currentDomainBase = currentDomain.split('.')[0]; // Get base domain name
        }
      } catch (urlError) {
        logger.warning(`Failed to parse URL for domain extraction: ${currentState.url}`);
        // Continue without domain-based checks
      }
      
      // Check if current domain matches any mentioned domains (only if we have a valid domain)
      const isOnMentionedDomain = currentDomain ? mentionedDomains.some(domain => 
        currentDomain.includes(domain) || domain.includes(currentDomainBase)
      ) : false;

      // 3. Intelligent error detection based on patterns
      if (mentionedDomains.length > 0 && currentDomain && !isOnMentionedDomain) {
        // We're on a different domain than what's mentioned in the task
        correctionNeeded = true;
        correctionMessage = `🚨 TASK MISALIGNMENT: Task mentions "${mentionedDomains.join(', ')}" but you are on "${currentDomain}". Navigate to the correct site for the task.`;
      }

      // 4. Check for search intent vs current page
      if (isSearchTask && !currentState.url.includes('search') && !currentState.url.includes('q=')) {
        // Search task but not on a search page
        const pageText = currentState.elementTree?.getAllTextTillNextClickableElement() || '';
        const clickableText = currentState.elementTree?.clickableElementsToString() || '';
        const hasSearchBox = pageText.toLowerCase().includes('search') || 
                           clickableText.toLowerCase().includes('search');
        if (!hasSearchBox) {
          correctionNeeded = true;
          correctionMessage = '🚨 SEARCH TASK ISSUE: Task requires searching but current page lacks search functionality. Navigate to a search-capable page.';
        }
      }

      // 5. Check for repeated failures without hardcoding specific sites
      if (recentPages.length >= 2) {
        const uniqueDomains = new Set(recentPages.map(url => {
          try {
            return new URL(url || '').hostname;
          } catch {
            return '';
          }
        }));
        
        if (uniqueDomains.size >= 3 && mentionedDomains.length > 0) {
          correctionNeeded = true;
          correctionMessage = `🚨 NAVIGATION ISSUE: Visited ${uniqueDomains.size} different sites without completing the task. Focus on the task requirements.`;
        }
      }

      // 6. Check for repeated errors
      if (hasErrors) {
        const errorTypes = recentResults
          .filter(r => r.error)
          .map(r => {
            const error = r.error?.toString() || '';
            if (error.includes('not found')) return 'element not found';
            if (error.includes('timeout')) return 'timeout';
            if (error.includes('navigation')) return 'navigation error';
            return 'action failed';
          });
        
        const uniqueErrors = [...new Set(errorTypes)];
        correctionNeeded = true;
        correctionMessage = `🚨 REPEATED ERRORS: ${uniqueErrors.join(', ')}. Current approach is not working - try a different strategy.`;
      }

      // Add correction message if needed
      if (correctionNeeded) {
        this.context.messageManager.addSystemMessage(`ERROR CORRECTION NEEDED:
${correctionMessage}

Current page: ${currentState.title} (${currentState.url})
Original task: "${currentTask}"

IMMEDIATE ACTION REQUIRED: Fix this error in your next action. Do not proceed with other actions until you are on the correct page for the task.`);
        
        logger.warning(`Error correction needed: ${correctionMessage}`);
      }

    } catch (error) {
      logger.error(`❌ Error correction check failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    }
  }

  /**
   * Add the state message to the memory
   */
  public async addStateMessageToMemory() {
    if (this.context.stateMessageAdded) {
      return;
    }

    // Check for errors and suggest corrections before adding state
    // TODO: Fix this function - currently causing errors
    // await this.checkForErrorsAndCorrections();

    const messageManager = this.context.messageManager;
    // Handle results that should be included in memory
    if (this.context.actionResults.length > 0) {
      let index = 0;
      for (const r of this.context.actionResults) {
        if (r.includeInMemory) {
          if (r.extractedContent) {
            const msg = new HumanMessage(`Action result: ${r.extractedContent}`);
            // logger.info('Adding action result to memory', msg.content);
            messageManager.addMessageWithTokens(msg);
          }
          if (r.error) {
            // Get error text and convert to string
            const errorText = r.error.toString().trim();

            // Get only the last line of the error
            const lastLine = errorText.split('\n').pop() || '';

            const msg = new HumanMessage(`Action error: ${lastLine}`);
            logger.info('Adding action error to memory', msg.content);
            messageManager.addMessageWithTokens(msg);
          }
          // reset this action result to empty, we dont want to add it again in the state message
          // NOTE: in python version, all action results are reset to empty, but in ts version, only those included in memory are reset to empty
          this.context.actionResults[index] = new ActionResult();
        }
        index++;
      }
    }

    const state = await this.prompt.getUserMessage(this.context);
    messageManager.addStateMessage(state);
    this.context.stateMessageAdded = true;
  }

  /**
   * Remove the last state message from the memory
   */
  protected async removeLastStateMessageFromMemory() {
    if (!this.context.stateMessageAdded) return;
    const messageManager = this.context.messageManager;
    messageManager.removeLastStateMessage();
    this.context.stateMessageAdded = false;
  }

  private async addModelOutputToMemory(modelOutput: this['ModelOutput']) {
    const messageManager = this.context.messageManager;
    messageManager.addModelOutput(modelOutput);
  }

  /**
   * Fix the actions to be an array of objects, sometimes the action is a string or an object
   * @param response
   * @returns
   */
  private fixActions(response: this['ModelOutput']): Record<string, unknown>[] {
    let actions: Record<string, unknown>[] = [];
    if (Array.isArray(response.action)) {
      // if the item is null, skip it
      actions = response.action.filter((item: unknown) => item !== null);
      if (actions.length === 0) {
        logger.warning('No valid actions found', response.action);
      }
    } else if (typeof response.action === 'string') {
      try {
        logger.warning('Unexpected action format', response.action);
        // First try to parse the action string directly
        actions = JSON.parse(response.action);
      } catch (parseError) {
        try {
          // If direct parsing fails, try to fix the JSON first
          const fixedAction = repairJsonString(response.action);
          logger.info('Fixed action string', fixedAction);
          actions = JSON.parse(fixedAction);
        } catch (error) {
          logger.error('Invalid action format even after repair attempt', response.action);
          throw new Error('Invalid action output format');
        }
      }
    } else {
      // if the action is neither an array nor a string, it should be an object
      actions = [response.action];
    }
    return actions;
  }

  private async doMultiAction(actions: Record<string, unknown>[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    let errCount = 0;
    logger.info('Actions', actions);

    const browserContext = this.context.browserContext;
    const browserState = await browserContext.getState(this.context.options.useVision);
    
    const cachedPathHashes = await calcBranchPathHashSet(browserState);

    await browserContext.removeHighlight();

    for (const [i, action] of actions.entries()) {
      const actionName = Object.keys(action)[0];
      const actionArgs = action[actionName];
      try {
        // check if the task is paused or stopped
        if (this.context.paused || this.context.stopped) {
          return results;
        }

        const actionInstance = this.actionRegistry.getAction(actionName);
        if (actionInstance === undefined) {
          throw new Error(`Action ${actionName} not exists`);
        }

        const indexArg = actionInstance.getIndexArg(actionArgs);
        if (i > 0 && indexArg !== null) {
          const newState = await browserContext.getState(this.context.options.useVision);
          const newPathHashes = await calcBranchPathHashSet(newState);
          // next action requires index but there are new elements on the page
          if (!newPathHashes.isSubsetOf(cachedPathHashes)) {
            const msg = `Something new appeared after action ${i} / ${actions.length}`;
            logger.info(msg);
            results.push(
              new ActionResult({
                extractedContent: msg,
                includeInMemory: true,
              }),
            );
            logger.info('🛑 Stopping action sequence due to page changes');
            break;
          } else {
            logger.info('✅ Page unchanged - continuing with action sequence');
          }
        }

        logger.info(`🎬 Executing action: ${actionName}...`);
        const actionStartTime = Date.now();
        const result = await actionInstance.call(actionArgs);
        const actionDuration = Date.now() - actionStartTime;
        logger.info(`🎬 Action completed in ${actionDuration}ms`);
        logger.info(`📄 Action result: success=${!result.error}, done=${result.isDone}`);
        if (result.extractedContent) {
          logger.info(`📝 Extracted content: "${result.extractedContent.substring(0, 100)}..."`);
        }
        if (result.error) {
          logger.error(`❌ Action error: ${result.error}`);
        }
        
        if (result === undefined) {
          logger.error(`❌ Action ${actionName} returned undefined`);
          throw new Error(`Action ${actionName} returned undefined`);
        }

        // if the action has an index argument, record the interacted element to the result
        if (indexArg !== null) {
          const elementKey = `${browserState.url}_${indexArg}`;
          
          // Try to get from cache first
          let domElement = elementCache.get(elementKey);
          if (!domElement) {
            domElement = browserState.selectorMap.get(indexArg);
            // Cache the element for future use
            if (domElement) {
              elementCache.set(elementKey, domElement);
            }
          }

          if (domElement) {
            const interactedElement = HistoryTreeProcessor.convertDomElementToHistoryElement(domElement);
            result.interactedElement = interactedElement;
            logger.info('Interacted element', interactedElement);
            logger.info('Result', result);
          }
        }
        results.push(result);

        // check if the task is paused or stopped
        if (this.context.paused || this.context.stopped) {
          return results;
        }
        // Smart waiting with dynamic optimization
        const pageContent = browserState.elementTree?.getAllTextTillNextClickableElement().substring(0, 1000) || ''; // Sample for characteristics
        const waitTime = siteOptimizer.getOptimizedWait(actionName, browserState.url, 
          siteOptimizer.detectSiteCharacteristics(browserState.url, pageContent));
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } catch (error) {
        if (error instanceof URLNotAllowedError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Try dynamic error handling
        const pageContent = browserState.elementTree?.getAllTextTillNextClickableElement().substring(0, 1000) || '';
        const dynamicAdvice = siteOptimizer.handleDynamicError(errorMessage, browserState.url,
          siteOptimizer.detectSiteCharacteristics(browserState.url, pageContent));
        const finalErrorMessage = dynamicAdvice ? 
          `${errorMessage} (Suggestion: ${dynamicAdvice})` : 
          errorMessage;
        
        logger.error(
          'doAction error',
          actionName,
          JSON.stringify(actionArgs, null, 2),
          JSON.stringify(finalErrorMessage, null, 2),
        );
        // unexpected error, emit event
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, finalErrorMessage);
        errCount++;
        if (errCount > 3) {
          throw new Error('Too many errors in actions');
        }
        results.push(
          new ActionResult({
            error: errorMessage,
            isDone: false,
            includeInMemory: true,
          }),
        );
      }
    }
    return results;
  }

  /**
   * Parse and validate model output from history item
   */
  private parseHistoryModelOutput(historyItem: AgentStepRecord): {
    parsedOutput: ParsedModelOutput;
    goal: string;
    actionsToReplay: (Record<string, unknown> | null)[] | null;
  } {
    if (!historyItem.modelOutput) {
      throw new Error('No model output found in history item');
    }

    let parsedOutput: ParsedModelOutput;
    try {
      parsedOutput = JSON.parse(historyItem.modelOutput) as ParsedModelOutput;
    } catch (error) {
      throw new Error(`Could not parse modelOutput: ${error}`);
    }

    // logger.info('Parsed output', JSON.stringify(parsedOutput, null, 2));

    const goal = parsedOutput?.current_state?.next_goal || '';
    const actionsToReplay = parsedOutput?.action;

    // Validate that there are actions to replay
    if (
      !parsedOutput || // No model output string at all
      !actionsToReplay || // 'action' field is missing or null after parsing
      (Array.isArray(actionsToReplay) && actionsToReplay.length === 0) || // 'action' is an empty array
      (Array.isArray(actionsToReplay) && actionsToReplay.length === 1 && actionsToReplay[0] === null) // 'action' is [null]
    ) {
      throw new Error('No action to replay');
    }

    return { parsedOutput, goal, actionsToReplay };
  }

  /**
   * Execute actions from history with element index updates
   */
  private async executeHistoryActions(
    parsedOutput: ParsedModelOutput,
    historyItem: AgentStepRecord,
    delay: number,
  ): Promise<ActionResult[]> {
    const state = await this.context.browserContext.getState(this.context.options.useVision);
    if (!state) {
      throw new Error('Invalid browser state');
    }

    const updatedActions: (Record<string, unknown> | null)[] = [];
    for (let i = 0; i < parsedOutput.action!.length; i++) {
      const result = historyItem.result[i];
      if (!result) {
        break;
      }
      const interactedElement = result.interactedElement;
      const currentAction = parsedOutput.action![i];

      // Skip null actions
      if (currentAction === null) {
        updatedActions.push(null);
        continue;
      }

      // If there's no interacted element, just use the action as is
      if (!interactedElement) {
        updatedActions.push(currentAction);
        continue;
      }

      const updatedAction = await this.updateActionIndices(interactedElement, currentAction, state);
      updatedActions.push(updatedAction);

      if (updatedAction === null) {
        throw new Error(`Could not find matching element ${i} in current page`);
      }
    }

    logger.debug('updatedActions', updatedActions);

    // Filter out null values and cast to the expected type
    const validActions = updatedActions.filter((action): action is Record<string, unknown> => action !== null);
    const result = await this.doMultiAction(validActions);

    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, delay));
    return result;
  }

  async executeHistoryStep(
    historyItem: AgentStepRecord,
    stepIndex: number,
    totalSteps: number,
    maxRetries = 3,
    delay = 1000,
    skipFailures = true,
  ): Promise<ActionResult[]> {
    const replayLogger = createLogger('NavigatorAgent:executeHistoryStep');
    const results: ActionResult[] = [];

    // Parse and validate model output
    let parsedData: {
      parsedOutput: ParsedModelOutput;
      goal: string;
      actionsToReplay: (Record<string, unknown> | null)[] | null;
    };
    try {
      parsedData = this.parseHistoryModelOutput(historyItem);
    } catch (error) {
      const errorMsg = `Step ${stepIndex + 1}: ${error instanceof Error ? error.message : String(error)}`;
      replayLogger.warning(errorMsg);
      return [
        new ActionResult({
          error: errorMsg,
          includeInMemory: false,
        }),
      ];
    }

    const { parsedOutput, goal, actionsToReplay } = parsedData;
    replayLogger.info(`Replaying step ${stepIndex + 1}/${totalSteps}: goal: ${goal}`);
    replayLogger.debug(`🔄 Replaying actions:`, actionsToReplay);

    // Try to execute the step with retries
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
      try {
        // Check if execution should stop
        if (this.context.stopped) {
          replayLogger.info('Replay stopped by user');
          break;
        }

        // Execute the history actions
        const stepResults = await this.executeHistoryActions(parsedOutput, historyItem, delay);
        results.push(...stepResults);
        success = true;
      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (retryCount >= maxRetries) {
          const failMsg = `Step ${stepIndex + 1} failed after ${maxRetries} attempts: ${errorMessage}`;
          replayLogger.error(failMsg);

          results.push(
            new ActionResult({
              error: failMsg,
              includeInMemory: true,
            }),
          );

          if (!skipFailures) {
            throw new Error(failMsg);
          }
        } else {
          replayLogger.warning(`Step ${stepIndex + 1} failed (attempt ${retryCount}/${maxRetries}), retrying...`);
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return results;
  }

  async updateActionIndices(
    historicalElement: DOMHistoryElement,
    action: Record<string, unknown>,
    currentState: BrowserState,
  ): Promise<Record<string, unknown> | null> {
    // If no historical element or no element tree in current state, return the action unchanged
    if (!historicalElement || !currentState.elementTree) {
      return action;
    }

    // Find the current element in the tree based on the historical element
    const currentElement = await HistoryTreeProcessor.findHistoryElementInTree(
      historicalElement,
      currentState.elementTree,
    );

    // If no current element found or it doesn't have a highlight index, return null
    if (!currentElement || currentElement.highlightIndex === null) {
      return null;
    }

    // Get action name and args
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName] as Record<string, unknown>;

    // Get the action instance to access the index
    const actionInstance = this.actionRegistry.getAction(actionName);
    if (!actionInstance) {
      return action;
    }

    // Get the index argument from the action
    const oldIndex = actionInstance.getIndexArg(actionArgs);

    // If the index has changed, update it
    if (oldIndex !== null && oldIndex !== currentElement.highlightIndex) {
      // Create a new action object with the updated index
      const updatedAction: Record<string, unknown> = { [actionName]: { ...actionArgs } };

      // Update the index in the action arguments
      actionInstance.setIndexArg(updatedAction[actionName] as Record<string, unknown>, currentElement.highlightIndex);

      logger.info(`Element moved in DOM, updated index from ${oldIndex} to ${currentElement.highlightIndex}`);
      return updatedAction;
    }

    return action;
  }
}
