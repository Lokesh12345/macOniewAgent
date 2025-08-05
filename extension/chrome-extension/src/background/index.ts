import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  initializeDefaults,
} from '@extension/storage';
import BrowserContext from './browser/context';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { ExecutionState } from './agent/event/types';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
import { SpeechToTextService } from './services/speechToText';

const logger = createLogger('background');

const browserContext = new BrowserContext({});
let currentExecutor: Executor | null = null;
let currentPort: chrome.runtime.Port | null = null;

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));

// Function to check if script is already injected
async function isScriptInjected(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Object.prototype.hasOwnProperty.call(window, 'buildDomTree'),
    });
    return results[0]?.result || false;
  } catch (err) {
    console.error('Failed to check script injection status:', err);
    return false;
  }
}

// // Function to inject the buildDomTree script
async function injectBuildDomTree(tabId: number) {
  try {
    // Check if already injected
    const alreadyInjected = await isScriptInjected(tabId);
    if (alreadyInjected) {
      console.log('Scripts already injected, skipping...');
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['buildDomTree.js'],
    });
    console.log('Scripts successfully injected');
  } catch (err) {
    console.error('Failed to inject scripts:', err);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId && changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    await injectBuildDomTree(tabId);
  }
});

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  browserContext.removeAttachedPage(tabId);
});

logger.info('background loaded');

// Initialize defaults for fresh installations
initializeDefaults().catch(error => {
  console.error('Failed to initialize defaults:', error);
});

// Listen for simple messages (e.g., from options page)
chrome.runtime.onMessage.addListener(() => {
  // Handle other message types if needed in the future
  // Return false if response is not sent asynchronously
  // return false;
});

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    currentPort = port;

    port.onMessage.addListener(async message => {
      try {
        switch (message.type) {
          case 'heartbeat':
            // Acknowledge heartbeat
            port.postMessage({ type: 'heartbeat_ack' });
            break;

          case 'new_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: 'No task provided' });
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });

            logger.info('new_task', message.tabId, message.task);
            currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
            subscribeToExecutorEvents(currentExecutor);

            const result = await currentExecutor.execute();
            logger.info('new_task execution result', message.tabId, result);
            break;
          }
          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: 'No follow up task provided' });
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });

            logger.info('follow_up_task', message.tabId, message.task);

            // If executor exists, add follow-up task
            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              // Re-subscribe to events in case the previous subscription was cleaned up
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              // executor was cleaned up, can not add follow-up task
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return port.postMessage({ type: 'error', error: 'Executor was cleaned up, can not add follow-up task' });
            }
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No task to cancel' });
            await currentExecutor.cancel();
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No task to resume' });
            await currentExecutor.resume();
            return port.postMessage({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No task to pause' });
            await currentExecutor.pause();
            return port.postMessage({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'state': {
            try {
              const browserState = await browserContext.getState(true);
              const elementsText = browserState.elementTree.clickableElementsToString(
                DEFAULT_AGENT_OPTIONS.includeAttributes,
              );

              logger.info('state', browserState);
              logger.info('interactive elements', elementsText);
              return port.postMessage({ type: 'success', msg: 'State printed to console' });
            } catch (error) {
              logger.error('Failed to get state:', error);
              return port.postMessage({ type: 'error', error: 'Failed to get state' });
            }
          }

          case 'nohighlight': {
            const page = await browserContext.getCurrentPage();
            await page.removeHighlight();
            return port.postMessage({ type: 'success', msg: 'highlight removed' });
          }

          case 'speech_to_text': {
            try {
              if (!message.audio) {
                return port.postMessage({
                  type: 'speech_to_text_error',
                  error: 'No audio data provided',
                });
              }

              logger.info('Processing speech-to-text request...');

              // Get all providers for speech-to-text service
              const providers = await llmProviderStore.getAllProviders();

              // Create speech-to-text service with all providers
              const speechToTextService = await SpeechToTextService.create(providers);

              // Extract base64 audio data (remove data URL prefix if present)
              let base64Audio = message.audio;
              if (base64Audio.startsWith('data:')) {
                base64Audio = base64Audio.split(',')[1];
              }

              // Transcribe audio
              const transcribedText = await speechToTextService.transcribeAudio(base64Audio);

              logger.info('Speech-to-text completed successfully');
              return port.postMessage({
                type: 'speech_to_text_result',
                text: transcribedText,
              });
            } catch (error) {
              logger.error('Speech-to-text failed:', error);
              return port.postMessage({
                type: 'speech_to_text_error',
                error: error instanceof Error ? error.message : 'Speech recognition failed',
              });
            }
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });
            if (!message.taskId) return port.postMessage({ type: 'error', error: 'No task ID provided' });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: 'No history session ID provided' });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              // Switch to the specified tab
              await browserContext.switchTab(message.tabId);
              // Setup executor with the new taskId and a dummy task description
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
              subscribeToExecutorEvents(currentExecutor);

              // Run replayHistory with the history session ID
              const result = await currentExecutor.replayHistory(message.historySessionId);
              logger.debug('replay execution result', message.tabId, result);
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : 'Replay failed',
              });
            }
            break;
          }

          default:
            return port.postMessage({ type: 'error', error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    port.onDisconnect.addListener(() => {
      // this event is also triggered when the side panel is closed, so we need to cancel the task
      console.log('Side panel disconnected');
      currentPort = null;
      currentExecutor?.cancel();
    });
  } else if (port.name === 'dom-analyzer') {
    // Handle DOM Analyzer connections
    port.onMessage.addListener(async message => {
      try {
        if (message.type === 'execute_action') {
          const { action, params } = message;
          
          // Get active tab
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!activeTab || !activeTab.id) {
            return port.postMessage({ 
              type: 'action_result', 
              success: false, 
              error: 'No active tab found' 
            });
          }

          // Create a minimal executor for the action
          try {
            // Ensure page is attached
            const page = await browserContext.switchTab(activeTab.id);
            
            // Handle special mouse event testing actions
            if (action.startsWith('mouse_') || action === 'focus_click' || action === 'pointer_event') {
              // Execute mouse events directly on the page
              const result = await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: (actionType: string, elementIndex: number) => {
                  try {
                    // Find element by index using the DOM tree
                    const elements = document.querySelectorAll('[data-highlight-index]');
                    let targetElement: Element | null = null;
                    
                    for (const el of elements) {
                      if (el.getAttribute('data-highlight-index') === String(elementIndex)) {
                        targetElement = el;
                        break;
                      }
                    }
                    
                    if (!targetElement) {
                      // Fallback: try to find by the highlight overlay
                      const highlights = document.querySelectorAll('.playwright-highlight');
                      for (const highlight of highlights) {
                        if (highlight.textContent?.includes(`[${elementIndex}]`)) {
                          // Get the actual element behind the highlight
                          const rect = highlight.getBoundingClientRect();
                          const actualElement = document.elementFromPoint(
                            rect.left + rect.width / 2,
                            rect.top + rect.height / 2
                          );
                          if (actualElement && actualElement !== highlight) {
                            targetElement = actualElement;
                            break;
                          }
                        }
                      }
                    }
                    
                    if (!targetElement) {
                      return { success: false, error: `Element with index ${elementIndex} not found` };
                    }
                    
                    switch (actionType) {
                      case 'mouse_click':
                        // Simple synthetic click
                        (targetElement as HTMLElement).click();
                        return { success: true, result: 'Synthetic click executed' };
                      
                      case 'mouse_event':
                        // Dispatch MouseEvent
                        const clickEvent = new MouseEvent('click', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          detail: 1,
                          screenX: 0,
                          screenY: 0,
                          clientX: 0,
                          clientY: 0,
                          button: 0,
                          buttons: 1,
                        });
                        targetElement.dispatchEvent(clickEvent);
                        return { success: true, result: 'Mouse event dispatched' };
                      
                      case 'mouse_sequence':
                        // Full mouse sequence
                        const mouseDown = new MouseEvent('mousedown', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          button: 0,
                          buttons: 1,
                        });
                        const mouseUp = new MouseEvent('mouseup', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          button: 0,
                          buttons: 0,
                        });
                        const click = new MouseEvent('click', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          button: 0,
                        });
                        
                        targetElement.dispatchEvent(mouseDown);
                        targetElement.dispatchEvent(mouseUp);
                        targetElement.dispatchEvent(click);
                        return { success: true, result: 'Mouse down+up+click sequence executed' };
                      
                      case 'focus_click':
                        // Focus then click
                        if (targetElement instanceof HTMLElement) {
                          targetElement.focus();
                          setTimeout(() => targetElement.click(), 50);
                          return { success: true, result: 'Focus + click executed' };
                        }
                        return { success: false, error: 'Element is not focusable' };
                      
                      case 'pointer_event':
                        // Modern pointer event
                        const pointerDown = new PointerEvent('pointerdown', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          pointerId: 1,
                          pointerType: 'mouse',
                          button: 0,
                          buttons: 1,
                        });
                        const pointerUp = new PointerEvent('pointerup', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          pointerId: 1,
                          pointerType: 'mouse',
                          button: 0,
                          buttons: 0,
                        });
                        const pointerClick = new PointerEvent('click', {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          pointerId: 1,
                          pointerType: 'mouse',
                          button: 0,
                        });
                        
                        targetElement.dispatchEvent(pointerDown);
                        targetElement.dispatchEvent(pointerUp);
                        targetElement.dispatchEvent(pointerClick);
                        return { success: true, result: 'Pointer events executed' };
                      
                      default:
                        return { success: false, error: 'Unknown action type' };
                    }
                  } catch (error) {
                    return { success: false, error: error instanceof Error ? error.message : 'Failed to execute' };
                  }
                },
                args: [action, params.index || 0],
              });
              
              const execResult = result[0]?.result;
              port.postMessage({ 
                type: 'action_result', 
                success: execResult?.success || false,
                result: execResult?.result || execResult?.error || 'Unknown error'
              });
              return;
            }
            
            // Regular action handling (existing code)
            const providers = await llmProviderStore.getAllProviders();
            const agentModels = await agentModelStore.getAllAgentModels();
            const navigatorModel = agentModels[AgentNameEnum.Navigator];
            
            if (!navigatorModel || !providers[navigatorModel.provider]) {
              throw new Error('Navigator model not configured');
            }
            
            const navigatorLLM = createChatModel(providers[navigatorModel.provider], navigatorModel);
            
            // Import action builder and navigator
            const { ActionBuilder } = await import('./agent/actions/builder');
            const { NavigatorActionRegistry } = await import('./agent/agents/navigator');
            
            // Create minimal context for action execution
            const minimalContext = {
              browserContext,
              emitEvent: () => {}, // No-op for DOM analyzer
              options: { useVision: false },
            };
            
            // Build actions
            const actionBuilder = new ActionBuilder(minimalContext as any, navigatorLLM);
            const actions = actionBuilder.buildDefaultActions();
            const actionRegistry = new NavigatorActionRegistry(actions);
            
            // Find and execute the action
            const actionInstance = actionRegistry.getAction(action);
            if (!actionInstance) {
              throw new Error(`Action ${action} not found`);
            }
            
            // Execute the action
            const result = await actionInstance.call(params);
            
            port.postMessage({ 
              type: 'action_result', 
              success: !result.error,
              result: result.extractedContent || result.error || 'Action completed'
            });
          } catch (error) {
            port.postMessage({ 
              type: 'action_result', 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to execute action' 
            });
          }
        }
      } catch (error) {
        console.error('Error handling DOM analyzer message:', error);
        port.postMessage({
          type: 'action_result',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
    
    port.onDisconnect.addListener(() => {
      console.log('DOM Analyzer disconnected');
    });
  }
});

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error('Please configure API keys in the settings first');
  }
  const agentModels = await agentModelStore.getAllAgentModels();
  // verify if every provider used in the agent models exists in the providers
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(`Provider ${agentModel.provider} not found in the settings`);
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error('Please choose a model for the navigator in the settings first');
  }
  // Log the provider config being used for the navigator
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    // Log the provider config being used for the planner
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  let validatorLLM: BaseChatModel | null = null;
  const validatorModel = agentModels[AgentNameEnum.Validator];
  if (validatorModel) {
    // Log the provider config being used for the validator
    const validatorProviderConfig = providers[validatorModel.provider];
    validatorLLM = createChatModel(validatorProviderConfig, validatorModel);
  }

  // Apply firewall settings to browser context
  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
    displayHighlights: generalSettings.displayHighlights,
  });

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    validatorLLM: validatorLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      useVision: generalSettings.useVision,
      useVisionForPlanner: true,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
  });

  return executor;
}

// Update subscribeToExecutorEvents to use port
async function subscribeToExecutorEvents(executor: Executor) {
  // Clear previous event listeners to prevent multiple subscriptions
  executor.clearExecutionEvents();

  // Subscribe to new events
  executor.subscribeExecutionEvents(async event => {
    try {
      if (currentPort) {
        currentPort.postMessage(event);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      event.state === ExecutionState.TASK_OK ||
      event.state === ExecutionState.TASK_FAIL ||
      event.state === ExecutionState.TASK_CANCEL
    ) {
      await currentExecutor?.cleanup();
    }
  });
}
