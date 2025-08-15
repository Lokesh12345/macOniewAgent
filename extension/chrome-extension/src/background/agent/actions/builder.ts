import { ActionResult, type AgentContext } from '@src/background/agent/types';
import {
  clickElementActionSchema,
  doneActionSchema,
  goBackActionSchema,
  goToUrlActionSchema,
  inputTextActionSchema,
  openTabActionSchema,
  searchGoogleActionSchema,
  switchTabActionSchema,
  type ActionSchema,
  sendKeysActionSchema,
  scrollToTextActionSchema,
  cacheContentActionSchema,
  selectDropdownOptionActionSchema,
  getDropdownOptionsActionSchema,
  closeTabActionSchema,
  waitActionSchema,
  requestUserInputActionSchema,
  scrollSmallActionSchema,
  scrollToElementActionSchema,
  previousPageActionSchema,
  scrollToPercentActionSchema,
  nextPageActionSchema,
  scrollToTopActionSchema,
  scrollToBottomActionSchema,
} from './schemas';
import { z } from 'zod';
import { createLogger } from '@src/background/log';
import { ExecutionState, Actors } from '../event/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { wrapUntrustedContent } from '../messages/utils';
import { DynamicChangeDetector, type DOMSnapshot } from '../intelligence/dynamic-change-detector';

const logger = createLogger('Action');

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * An action is a function that takes an input and returns an ActionResult
 */
export class Action {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly handler: (input: any) => Promise<ActionResult>,
    public readonly schema: ActionSchema,
    // Whether this action has an index argument
    public readonly hasIndex: boolean = false,
  ) {}

  async call(input: unknown): Promise<ActionResult> {
    // Validate input before calling the handler
    const schema = this.schema.schema;

    // check if the schema is schema: z.object({}), if so, ignore the input
    const isEmptySchema =
      schema instanceof z.ZodObject &&
      Object.keys((schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape || {}).length === 0;

    if (isEmptySchema) {
      return await this.handler({});
    }

    const parsedArgs = this.schema.schema.safeParse(input);
    if (!parsedArgs.success) {
      const errorMessage = parsedArgs.error.message;
      throw new InvalidInputError(errorMessage);
    }
    return await this.handler(parsedArgs.data);
  }

  name() {
    return this.schema.name;
  }

  /**
   * Returns the prompt for the action
   * @returns {string} The prompt for the action
   */
  prompt() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemaShape = (this.schema.schema as z.ZodObject<any>).shape || {};
    const schemaProperties = Object.entries(schemaShape).map(([key, value]) => {
      const zodValue = value as z.ZodTypeAny;
      return `'${key}': {'type': '${zodValue.description}', ${zodValue.isOptional() ? "'optional': true" : "'required': true"}}`;
    });

    const schemaStr =
      schemaProperties.length > 0 ? `{${this.name()}: {${schemaProperties.join(', ')}}}` : `{${this.name()}: {}}`;

    return `${this.schema.description}:\n${schemaStr}`;
  }

  /**
   * Get the index argument from the input if this action has an index
   * @param input The input to extract the index from
   * @returns The index value if found, null otherwise
   */
  getIndexArg(input: unknown): number | null {
    if (!this.hasIndex) {
      return null;
    }
    if (input && typeof input === 'object' && 'index' in input) {
      return (input as { index: number }).index;
    }
    return null;
  }

  /**
   * Set the index argument in the input if this action has an index
   * @param input The input to update the index in
   * @param newIndex The new index value to set
   * @returns Whether the index was set successfully
   */
  setIndexArg(input: unknown, newIndex: number): boolean {
    if (!this.hasIndex) {
      return false;
    }
    if (input && typeof input === 'object') {
      (input as { index: number }).index = newIndex;
      return true;
    }
    return false;
  }
}

// TODO: can not make every action optional, don't know why
export function buildDynamicActionSchema(actions: Action[]): z.ZodType {
  let schema = z.object({});
  for (const action of actions) {
    // create a schema for the action, it could be action.schema.schema or null
    // but don't use default: null as it causes issues with Google Generative AI
    const actionSchema = action.schema.schema;
    schema = schema.extend({
      [action.name()]: actionSchema.nullable().optional().describe(action.schema.description),
    });
  }
  return schema;
}

export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;
  private dynamicDetector: DynamicChangeDetector | null = null;

  constructor(context: AgentContext, extractorLLM: BaseChatModel) {
    this.context = context;
    this.extractorLLM = extractorLLM;
  }

  /**
   * Initialize dynamic change detector when page is ready
   */
  private async ensureDynamicDetector(): Promise<DynamicChangeDetector> {
    if (!this.dynamicDetector) {
      try {
        const page = await this.context.browserContext.getCurrentPage();
        this.dynamicDetector = new DynamicChangeDetector(page, this.extractorLLM);
        console.log('🧠 DYNAMIC: Intelligent change detector initialized');
      } catch (error) {
        console.log('🧠 DYNAMIC: Failed to initialize detector:', error);
        throw error;
      }
    }
    return this.dynamicDetector;
  }

  buildDefaultActions() {
    const actions = [];

    const done = new Action(async (input: z.infer<typeof doneActionSchema.schema>) => {
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, doneActionSchema.name);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, input.text);
      return new ActionResult({
        isDone: true,
        extractedContent: input.text,
      });
    }, doneActionSchema);
    actions.push(done);

    const searchGoogle = new Action(async (input: z.infer<typeof searchGoogleActionSchema.schema>) => {
      const context = this.context;
      const intent = input.intent || `Searching for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await context.browserContext.navigateTo(`https://www.google.com/search?q=${input.query}`);

      const msg2 = `Searched for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, searchGoogleActionSchema);
    actions.push(searchGoogle);

    const goToUrl = new Action(async (input: z.infer<typeof goToUrlActionSchema.schema>) => {
      const intent = input.intent || `Navigating to ${input.url}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await this.context.browserContext.navigateTo(input.url);
      const msg2 = `Navigated to ${input.url}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goToUrlActionSchema);
    actions.push(goToUrl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const goBack = new Action(async (input: z.infer<typeof goBackActionSchema.schema>) => {
      const intent = input.intent || 'Navigating back';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.goBack();
      const msg2 = 'Navigated back';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goBackActionSchema);
    actions.push(goBack);

    const wait = new Action(async (input: z.infer<typeof waitActionSchema.schema>) => {
      const seconds = input.seconds || 3;
      const intent = input.intent || `Waiting for ${seconds} seconds`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      const msg = `${seconds} seconds elapsed`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, waitActionSchema);
    actions.push(wait);

    const requestUserInput = new Action(async (input: z.infer<typeof requestUserInputActionSchema.schema>) => {
      const prompt = input.prompt;
      const inputType = input.inputType || 'text';
      
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, `Wait for user input`);
      
      try {
        // Send user input request to Mac app through global sendToMacApp function
        // First, send the request
        const inputId = `user_input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Access the global sendToMacApp function from background script
        // We'll use a Promise to wait for the response
        const result = await new Promise<string>((resolve, reject) => {
          // Store the resolver in a global map that can be accessed by the background script
          if (typeof (globalThis as any).pendingUserInputs === 'undefined') {
            (globalThis as any).pendingUserInputs = new Map();
          }
          (globalThis as any).pendingUserInputs.set(inputId, { resolve, reject });
          
          // Send message to Mac app via the global function
          if (typeof (globalThis as any).sendToMacApp === 'function') {
            (globalThis as any).sendToMacApp('user_input_needed', {
              inputId,
              prompt,
              inputType
            });
          } else {
            reject(new Error('Mac app connection not available'));
            return;
          }
          
          // Set timeout
          setTimeout(() => {
            if ((globalThis as any).pendingUserInputs?.has(inputId)) {
              (globalThis as any).pendingUserInputs.delete(inputId);
              reject(new Error('User input timeout'));
            }
          }, 300000); // 5 minutes
        });
        
        const msg = `User provided: ${result}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ 
          extractedContent: result, 
          includeInMemory: true 
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'User input failed';
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
        return new ActionResult({ 
          error: errorMsg, 
          includeInMemory: true 
        });
      }
    }, requestUserInputActionSchema);
    actions.push(requestUserInput);

    // Smart scroll small amounts
    const scrollSmall = new Action(async (input: z.infer<typeof scrollSmallActionSchema.schema>) => {
      const intent = input.intent || `Scroll ${input.direction} by ${input.amount}% of viewport`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      
      const page = await this.context.browserContext.getCurrentPage();
      
      // Use the new method for smooth incremental scrolling
      const scrollAmount = await page.scrollSmallAmount(input.direction, input.amount);
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const msg = `Scrolled ${input.direction} by ${scrollAmount}px (${input.amount}% of viewport)`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollSmallActionSchema);
    actions.push(scrollSmall);

    // Smart scroll to element with positioning
    const scrollToElement = new Action(async (input: z.infer<typeof scrollToElementActionSchema.schema>) => {
      const intent = input.intent || `Scroll to element ${input.index} positioned at ${input.position}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      
      const page = await this.context.browserContext.getCurrentPage();
      const state = await page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      
      if (!elementNode) {
        const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
        return new ActionResult({ error: errorMsg, includeInMemory: true });
      }

      try {
        await page.scrollToElementWithPosition(elementNode, input.position);
        const msg = `Scrolled to element ${input.index} positioned at ${input.position}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ extractedContent: msg, includeInMemory: true });
      } catch (error) {
        const errorMsg = `Failed to scroll to element: ${error instanceof Error ? error.message : String(error)}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
        return new ActionResult({ error: errorMsg, includeInMemory: true });
      }
    }, scrollToElementActionSchema);
    actions.push(scrollToElement);

    // Element Interaction Actions
    const clickElement = new Action(
      async (input: z.infer<typeof clickElementActionSchema.schema>) => {
        const intent = input.intent || `Click element with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          // Instead of failing, provide context about what was accomplished and what needs to be done
          const accomplishedActions = this.context.actionResults
            .filter(r => r.success !== false && r.extractedContent)
            .map(r => r.extractedContent)
            .join('; ');
          
          // Get the original task and current plan context
          const originalTasks = this.context.messageManager.getMessages()
            .filter(m => typeof m.content === 'string' && m.content.includes('ultimate task'))
            .map(m => {
              const content = m.content as string;
              const match = content.match(/ultimate task is: """([^"]+)"""/);
              return match ? match[1] : null;
            })
            .filter(Boolean);
          
          const lastPlan = this.context.messageManager.getMessages()
            .filter(m => typeof m.content === 'string' && m.content.includes('next_steps'))
            .slice(-1)[0]?.content as string || '';
          
          const recoveryMsg = `Element index ${input.index} no longer exists (DOM changed). ` +
            `ULTIMATE TASK: ${originalTasks[originalTasks.length - 1] || 'Unknown task'}. ` +
            `ACCOMPLISHED: ${accomplishedActions || 'Started task'}. ` +
            `STILL NEEDED: Click the intended element. ` +
            `PLAN CONTEXT: ${lastPlan.includes('next_steps') ? 'Check current plan in recent messages' : 'Continue with task'}. ` +
            `ACTION: Re-analyze current DOM state and find the correct element for this action.`;
          
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, recoveryMsg);
          return new ActionResult({ 
            extractedContent: recoveryMsg, 
            includeInMemory: true,
            success: false // Mark as needing retry with fresh analysis
          });
        }

        // Check if element is a file uploader
        if (page.isFileUploader(elementNode)) {
          const msg = `Index ${input.index} - has an element which opens file upload dialog. To upload files please use a specific function to upload files`;
          logger.info(msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        try {
          const initialTabIds = await this.context.browserContext.getAllTabIds();
          
          // 🚨 CRITICAL: Check if element is actually visible/in-view before clicking
          const elementText = elementNode.getAllTextTillNextClickableElement(2);
          console.log(`🎯 CLICK_ELEMENT: Attempting to click index ${input.index}: "${elementText}"`);
          
          // Check for common out-of-view indicators
          // NOTE: Radio buttons and checkboxes often have empty text - the label is separate
          // Only warn, don't block the click
          if (!elementText || elementText.trim() === '' || elementText === 'undefined') {
            console.log(`⚠️ WARNING: Element ${input.index} has no visible text (might be radio/checkbox or truly out of view)`);
            // Don't block - let it try to click anyway
          }
          
          // 🧠 DYNAMIC: Use AI-powered change detection instead of hardcoded patterns
          let beforeSnapshot: DOMSnapshot | null = null;
          let dynamicDetector: DynamicChangeDetector | null = null;
          
          try {
            dynamicDetector = await this.ensureDynamicDetector();
            beforeSnapshot = await dynamicDetector.takeSnapshot();
            console.log('🧠 DYNAMIC: Captured before-action snapshot');
          } catch (error) {
            console.log('🧠 DYNAMIC: Failed to take before snapshot, falling back to basic detection:', error);
          }
          
          await page.clickElementNode(this.context.options.useVision, elementNode);
          
          // Wait for dynamic page updates
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // 🧠 DYNAMIC: Use AI-powered change analysis
          let changeAnalysis: any = null;
          let pageChanged = false;
          let changeDetails = 'Dynamic analysis not available';
          
          if (beforeSnapshot && dynamicDetector) {
            try {
              const afterSnapshot = await dynamicDetector.takeSnapshot();
              console.log('🧠 DYNAMIC: Captured after-action snapshot');
              
              changeAnalysis = await dynamicDetector.analyzeChanges(
                beforeSnapshot,
                afterSnapshot,
                {
                  elementText,
                  actionType: 'click_element',
                  userIntent: `Click on "${elementText}" button/element`
                }
              );
              
              pageChanged = changeAnalysis.isSuccessfulInteraction;
              changeDetails = `AI Analysis: ${changeAnalysis.changeDescription} (${changeAnalysis.changeConfidence}% confidence, Type: ${changeAnalysis.changeType})`;
              
              console.log('🧠 DYNAMIC: AI Analysis Result:', {
                hasChanged: changeAnalysis.hasChanged,
                confidence: changeAnalysis.changeConfidence,
                changeType: changeAnalysis.changeType,
                isSuccessful: changeAnalysis.isSuccessfulInteraction,
                reasoning: changeAnalysis.reasoning
              });
              
              // Show learning stats
              const learningStats = dynamicDetector.getLearningStats();
              console.log('🧠 LEARNING STATS:', learningStats);
              
            } catch (error) {
              console.log('🧠 DYNAMIC: AI analysis failed, using fallback:', error);
              // Fallback to basic detection
              const newUrl = page.url();
              const newScrollY = await page.getScrollInfo().then(([scrollY]) => scrollY);
              const newPageHeight = await page.getScrollInfo().then(([, , scrollHeight]) => scrollHeight);
              
              pageChanged = newUrl !== page.url() || Math.abs(newScrollY - 0) > 50 || Math.abs(newPageHeight - 1000) > 20;
              changeDetails = 'Fallback: Basic URL/scroll detection';
            }
          } else {
            console.log('🧠 DYNAMIC: Snapshots not available, using basic detection');
            // Basic fallback detection
            const newUrl = page.url();
            pageChanged = newUrl !== page.url(); // Very basic check
            changeDetails = 'Basic: No dynamic analysis available';
          }
          
          let msg = `Clicked button with index ${input.index}: ${elementText}`;
          
          // 🧠 DYNAMIC: AI-powered validation and logging
          if (changeAnalysis) {
            // Use AI analysis for validation
            if (changeAnalysis.isSuccessfulInteraction) {
              msg += ` ✅ AI SUCCESS: ${changeAnalysis.changeDescription} (${changeAnalysis.changeType}, ${changeAnalysis.changeConfidence}% confidence)`;
              console.log(`🧠 SUCCESSFUL AI INTERACTION: ${msg}`);
              console.log(`🧠 AI REASONING: ${changeAnalysis.reasoning}`);
            } else if (changeAnalysis.hasChanged) {
              msg += ` ⚠️ AI PARTIAL: Changes detected but success unclear (${changeAnalysis.changeConfidence}% confidence)`;
              console.log(`🧠 PARTIAL AI INTERACTION: ${msg}`);
              console.log(`🧠 AI REASONING: ${changeAnalysis.reasoning}`);
            } else {
              // Only warn for navigation buttons if AI is confident no changes occurred
              if ((elementText.includes('Next') || elementText.includes('Continue') || elementText.includes('Submit')) && changeAnalysis.changeConfidence > 70) {
                msg += ` ⚠️ AI WARNING: Navigation button may not have worked (${changeAnalysis.changeConfidence}% confidence no changes)`;
                console.log(`🧠 SUSPICIOUS AI INTERACTION: ${msg}`);
              } else {
                msg += ` ℹ️ AI INFO: No significant changes detected (may be normal for this element)`;
                console.log(`🧠 NEUTRAL AI INTERACTION: ${msg}`);
              }
              console.log(`🧠 AI REASONING: ${changeAnalysis.reasoning}`);
            }
            console.log(`🧠 DYNAMIC DETAILS: ${changeDetails}`);
          } else {
            // Fallback to simple logging
            if (pageChanged) {
              msg += ` ✅ SUCCESS: Changes detected`;
              console.log(`✅ SUCCESSFUL CLICK: ${msg}`);
            } else {
              msg += ` ⚠️ WARNING: No changes detected`;
              console.log(`⚠️ CLICK COMPLETED: ${msg}`);
            }
            console.log(`📊 FALLBACK DETAILS: ${changeDetails}`);
          }
          
          logger.info(msg);

          // TODO: could be optimized by chrome extension tab api
          const currentTabIds = await this.context.browserContext.getAllTabIds();
          if (currentTabIds.size > initialTabIds.size) {
            const newTabMsg = 'New tab opened - switching to it';
            msg += ` - ${newTabMsg}`;
            logger.info(newTabMsg);
            // find the tab id that is not in the initial tab ids
            const newTabId = Array.from(currentTabIds).find(id => !initialTabIds.has(id));
            if (newTabId) {
              await this.context.browserContext.switchTab(newTabId);
            }
          }
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const msg = `Element no longer available with index ${input.index} - most likely the page changed`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      clickElementActionSchema,
      true,
    );
    actions.push(clickElement);

    const inputText = new Action(
      async (input: z.infer<typeof inputTextActionSchema.schema>) => {
        const intent = input.intent || `Input text into index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        console.log(`🔍 INPUT_TEXT: index ${input.index}, text:"${input.text}" - ${elementNode ? 'FOUND' : 'MISSING'} (${elementNode?.tagName || 'none'})`);
        
        if (!elementNode) {
          // Instead of failing, provide context about what was accomplished and what needs to be done
          const accomplishedActions = this.context.actionResults
            .filter(r => r.success !== false && r.extractedContent)
            .map(r => r.extractedContent)
            .join('; ');
          
          // Get the original task and current plan context
          const originalTasks = this.context.messageManager.getMessages()
            .filter(m => typeof m.content === 'string' && m.content.includes('ultimate task'))
            .map(m => {
              const content = m.content as string;
              const match = content.match(/ultimate task is: """([^"]+)"""/);
              return match ? match[1] : null;
            })
            .filter(Boolean);
          
          const lastPlan = this.context.messageManager.getMessages()
            .filter(m => typeof m.content === 'string' && m.content.includes('next_steps'))
            .slice(-1)[0]?.content as string || '';
          
          const recoveryMsg = `Element index ${input.index} no longer exists (DOM changed). ` +
            `ULTIMATE TASK: ${originalTasks[originalTasks.length - 1] || 'Unknown task'}. ` +
            `ACCOMPLISHED: ${accomplishedActions || 'Started task'}. ` +
            `STILL NEEDED: Input "${input.text}" into appropriate field. ` +
            `PLAN CONTEXT: ${lastPlan.includes('next_steps') ? 'Check current plan in recent messages' : 'Continue with task'}. ` +
            `ACTION: Re-analyze current DOM state and find the correct element for this input.`;
          
          console.log(`🔍 INPUT_TEXT: RECOVERY - ${recoveryMsg.substring(0,100)}...`);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, recoveryMsg);
          return new ActionResult({ 
            extractedContent: recoveryMsg, 
            includeInMemory: true,
            success: false // Mark as needing retry with fresh analysis
          });
        }

        /**
         * CRITICAL AUTOCOMPLETE HANDLING - DO NOT MODIFY WITHOUT READING docs/AUTOCOMPLETE_HANDLING.md
         * 
         * This section handles Gmail autocomplete which completely changes DOM structure.
         * Key requirements:
         * 1. MUST validate element types before input (prevents span/button targeting)
         * 2. MUST detect autocomplete ONLY on combobox inputs (prevents false positives)
         * 3. MUST break action sequence when autocomplete detected (prevents wrong field targeting)
         * 4. MUST trigger re-planning after autocomplete (gives LLM fresh DOM state)
         * 
         * Breaking these rules will cause Gmail compose to fail catastrophically.
         */
        
        // Element type validation - only allow proper input elements
        const validInputElements = ['input', 'textarea'];
        const validComboboxElements = ['input', 'div']; // Gmail uses div with contenteditable for some fields
        
        if (!validInputElements.includes(elementNode.tagName) && 
            !validComboboxElements.includes(elementNode.tagName)) {
          const msg = `Cannot input text into ${elementNode.tagName} element at index ${input.index}. Need input, textarea, or contenteditable div.`;
          console.log(`🚫 INVALID ELEMENT: ${msg}`);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({ 
            error: msg, 
            includeInMemory: true 
          });
        }
        
        console.log(`🎯 VALID INPUT: Entering "${input.text}" into index ${input.index} (${elementNode.tagName})`);
        await page.inputTextElementNode(this.context.options.useVision, elementNode, input.text);
        
        // Check for autocomplete only on specific element types that can have autocomplete
        if (elementNode.tagName === 'input' && elementNode.attributes?.role === 'combobox') {
          await new Promise(resolve => setTimeout(resolve, 500));
          const postInputState = await page.getState();
          
          // Look for autocomplete dropdown near the input element, not across entire page
          const hasAutocomplete = Array.from(postInputState.selectorMap.values()).some(node => 
            (node.attributes?.role === 'listbox' || node.attributes?.role === 'option') &&
            node.highlightIndex !== null // Only consider visible/interactive elements
          );
          
          if (hasAutocomplete) {
            console.log(`🎯 AUTOCOMPLETE DETECTED - Breaking sequence to let LLM handle it`);
            const msg = `Input ${input.text} into index ${input.index}. Autocomplete appeared - re-analyze DOM and handle autocomplete options.`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ 
              extractedContent: msg, 
              includeInMemory: true 
            });
          }
        }
        
        const msg = `Input ${input.text} into index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ extractedContent: msg, includeInMemory: true });
      },
      inputTextActionSchema,
      true,
    );
    actions.push(inputText);

    // Tab Management Actions
    const switchTab = new Action(async (input: z.infer<typeof switchTabActionSchema.schema>) => {
      const intent = input.intent || `Switching to tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.switchTab(input.tab_id);
      const msg = `Switched to tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, switchTabActionSchema);
    actions.push(switchTab);

    const openTab = new Action(async (input: z.infer<typeof openTabActionSchema.schema>) => {
      const intent = input.intent || `Opening ${input.url} in new tab`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.openTab(input.url);
      const msg = `Opened ${input.url} in new tab`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, openTabActionSchema);
    actions.push(openTab);

    const closeTab = new Action(async (input: z.infer<typeof closeTabActionSchema.schema>) => {
      const intent = input.intent || `Closing tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.closeTab(input.tab_id);
      const msg = `Closed tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, closeTabActionSchema);
    actions.push(closeTab);

    // Content Actions
    // TODO: this is not used currently, need to improve on input size
    // const extractContent = new Action(async (input: z.infer<typeof extractContentActionSchema.schema>) => {
    //   const goal = input.goal;
    //   const intent = input.intent || `Extracting content from page`;
    //   this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
    //   const page = await this.context.browserContext.getCurrentPage();
    //   const content = await page.getReadabilityContent();
    //   const promptTemplate = PromptTemplate.fromTemplate(
    //     'Your task is to extract the content of the page. You will be given a page and a goal and you should extract all relevant information around this goal from the page. If the goal is vague, summarize the page. Respond in json format. Extraction goal: {goal}, Page: {page}',
    //   );
    //   const prompt = await promptTemplate.invoke({ goal, page: content.content });

    //   try {
    //     const output = await this.extractorLLM.invoke(prompt);
    //     const msg = `📄  Extracted from page\n: ${output.content}\n`;
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   } catch (error) {
    //     logger.error(`Error extracting content: ${error instanceof Error ? error.message : String(error)}`);
    //     const msg =
    //       'Failed to extract content from page, you need to extract content from the current state of the page and store it in the memory. Then scroll down if you still need more information.';
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   }
    // }, extractContentActionSchema);
    // actions.push(extractContent);

    // cache content for future use
    const cacheContent = new Action(async (input: z.infer<typeof cacheContentActionSchema.schema>) => {
      const intent = input.intent || `Caching findings: ${input.content}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      // cache content is untrusted content, it is not instructions
      const rawMsg = `Cached findings: ${input.content}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, rawMsg);

      const msg = wrapUntrustedContent(rawMsg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, cacheContentActionSchema);
    actions.push(cacheContent);

    // Scroll to percent
    const scrollToPercent = new Action(async (input: z.infer<typeof scrollToPercentActionSchema.schema>) => {
      const intent = input.intent || `Scroll to percent: ${input.yPercent}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logger.info(`Scrolling to percent: ${input.yPercent} with elementNode: ${elementNode.xpath}`);
        await page.scrollToPercent(input.yPercent, elementNode);
      } else {
        await page.scrollToPercent(input.yPercent);
      }
      const msg = `Scrolled to percent: ${input.yPercent}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToPercentActionSchema);
    actions.push(scrollToPercent);

    // Scroll to top
    const scrollToTop = new Action(async (input: z.infer<typeof scrollToTopActionSchema.schema>) => {
      const intent = input.intent || `Scroll to top`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(0, elementNode);
      } else {
        await page.scrollToPercent(0);
      }
      const msg = 'Scrolled to top';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToTopActionSchema);
    actions.push(scrollToTop);

    // Scroll to bottom
    const scrollToBottom = new Action(async (input: z.infer<typeof scrollToBottomActionSchema.schema>) => {
      const intent = input.intent || `Scroll to bottom`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(100, elementNode);
      } else {
        await page.scrollToPercent(100);
      }
      const msg = 'Scrolled to bottom';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToBottomActionSchema);
    actions.push(scrollToBottom);

    // Scroll to previous page
    const previousPage = new Action(async (input: z.infer<typeof previousPageActionSchema.schema>) => {
      const intent = input.intent || `Scroll to previous page`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at top of its scrollable area
        try {
          const [elementScrollTop] = await page.getElementScrollInfo(elementNode);
          if (elementScrollTop === 0) {
            const msg = `Element with index ${input.index} is already at top, cannot scroll to previous page`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToPreviousPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToPreviousPage(elementNode);
      } else {
        // Check if page is already at top
        const [initialScrollY] = await page.getScrollInfo();
        if (initialScrollY === 0) {
          const msg = 'Already at top of page, cannot scroll to previous page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToPreviousPage();
      }
      const msg = 'Scrolled to previous page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, previousPageActionSchema);
    actions.push(previousPage);

    // Scroll to next page
    const nextPage = new Action(async (input: z.infer<typeof nextPageActionSchema.schema>) => {
      const intent = input.intent || `Scroll to next page`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at bottom of its scrollable area
        try {
          const [elementScrollTop, elementClientHeight, elementScrollHeight] =
            await page.getElementScrollInfo(elementNode);
          if (elementScrollTop + elementClientHeight >= elementScrollHeight) {
            const msg = `Element with index ${input.index} is already at bottom, cannot scroll to next page`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToNextPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToNextPage(elementNode);
      } else {
        // Check if page is already at bottom
        const [initialScrollY, initialVisualViewportHeight, initialScrollHeight] = await page.getScrollInfo();
        if (initialScrollY + initialVisualViewportHeight >= initialScrollHeight) {
          const msg = 'Already at bottom of page, cannot scroll to next page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToNextPage();
      }
      const msg = 'Scrolled to next page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, nextPageActionSchema);
    actions.push(nextPage);

    // Scroll to text
    const scrollToText = new Action(async (input: z.infer<typeof scrollToTextActionSchema.schema>) => {
      const intent =
        input.intent ||
        `Scroll to text: ${input.text}${input.nth > 1 ? ` (${input.nth}${input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'} occurrence)` : ''}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      try {
        const scrolled = await page.scrollToText(input.text, input.nth);
        const msg = scrolled
          ? `Scrolled to text: ${input.text}${input.nth > 1 ? ` (${input.nth}${input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'} occurrence)` : ''}`
          : `Text '${input.text}' not found or not visible on page${input.nth > 1 ? ` (${input.nth}${input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'} occurrence)` : ''}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ extractedContent: msg, includeInMemory: true });
      } catch (error) {
        const msg = `Failed to scroll to text: ${error instanceof Error ? error.message : String(error)}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
        return new ActionResult({ error: msg, includeInMemory: true });
      }
    }, scrollToTextActionSchema);
    actions.push(scrollToText);

    // Keyboard Actions
    const sendKeys = new Action(async (input: z.infer<typeof sendKeysActionSchema.schema>) => {
      const intent = input.intent || `Send keys: ${input.keys}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.sendKeys(input.keys);
      const msg = `Sent keys: ${input.keys}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, sendKeysActionSchema);
    actions.push(sendKeys);

    // Get all options from a native dropdown
    const getDropdownOptions = new Action(
      async (input: z.infer<typeof getDropdownOptionsActionSchema.schema>) => {
        const intent = input.intent || `Getting options from dropdown with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          logger.error(errorMsg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        try {
          // Use the existing getDropdownOptions method
          const options = await page.getDropdownOptions(input.index);

          if (options && options.length > 0) {
            // Format options for display
            const formattedOptions: string[] = options.map(opt => {
              // Encoding ensures AI uses the exact string in select_dropdown_option
              const encodedText = JSON.stringify(opt.text);
              return `${opt.index}: text=${encodedText}`;
            });

            let msg = formattedOptions.join('\n');
            msg += '\nUse the exact text string in select_dropdown_option';
            logger.info(msg);
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              `Got ${options.length} options from dropdown`,
            );
            return new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
          }

          // This code should not be reached as getDropdownOptions throws an error when no options found
          // But keeping as fallback
          const msg = 'No options found in dropdown';
          logger.info(msg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to get dropdown options: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMsg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      getDropdownOptionsActionSchema,
      true,
    );
    actions.push(getDropdownOptions);

    // Select dropdown option for interactive element index by the text of the option you want to select'
    const selectDropdownOption = new Action(
      async (input: z.infer<typeof selectDropdownOptionActionSchema.schema>) => {
        const intent = input.intent || `Select option "${input.text}" from dropdown with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        // Validate that we're working with a select element
        if (!elementNode.tagName || elementNode.tagName.toLowerCase() !== 'select') {
          const errorMsg = `Cannot select option: Element with index ${input.index} is a ${elementNode.tagName || 'unknown'}, not a SELECT`;
          logger.error(errorMsg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        logger.debug(`Attempting to select '${input.text}' using xpath: ${elementNode.xpath}`);
        logger.debug(`Element attributes: ${JSON.stringify(elementNode.attributes)}`);
        logger.debug(`Element tag: ${elementNode.tagName}`);

        try {
          const result = await page.selectDropdownOption(input.index, input.text);
          const msg = `Selected option "${input.text}" from dropdown with index ${input.index}`;
          logger.info(msg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: result,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to select option: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMsg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      selectDropdownOptionActionSchema,
      true,
    );
    actions.push(selectDropdownOption);

    return actions;
  }
}
