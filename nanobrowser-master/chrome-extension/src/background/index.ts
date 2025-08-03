import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
} from '@extension/storage';
import BrowserContext from './browser/context';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { ExecutionState } from './agent/event/types';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
import { SpeechToTextService } from './services/speechToText';
import { webSocketClient } from './webSocketClient';

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
chrome.tabs.onRemoved.addListener(async tabId => {
  browserContext.removeAttachedPage(tabId);
  // Also cleanup persistent connection from pool
  const { puppeteerPool } = await import('./browser/puppeteer-pool');
  await puppeteerPool.disconnect(tabId);
  // Cleanup DOM cache for the tab
  const { domCache } = await import('./browser/dom/cache');
  domCache.invalidate(tabId);
});

logger.info('background loaded');

// Initialize WebSocket connection when background script loads
function initializeWebSocketConnection() {
  try {
    logger.info('Initializing WebSocket connection to Mac app...');
    // Force a fresh connection attempt
    webSocketClient.forceReconnect();
    
    // Request ALL settings from Mac app after connection is established
    setTimeout(() => {
      if (webSocketClient.getConnectionStatus()) {
        logger.info('Requesting all settings from Mac app...');
        webSocketClient.requestAllSettingsFromMac();
      }
    }, 2000);
  } catch (error) {
    logger.error('Failed to initialize WebSocket connection:', error);
  }
}

// Initialize connection when script loads
initializeWebSocketConnection();

// Set up periodic connection health check
setInterval(() => {
  if (!webSocketClient.getConnectionStatus()) {
    logger.warning('WebSocket connection lost, attempting to reconnect...');
    webSocketClient.connect();
  }
}, 60000); // Check every 60 seconds

// Handle service worker lifecycle - reconnect when needed
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    logger.info('Chrome startup detected, reinitializing WebSocket...');
    initializeWebSocketConnection();
  });
}

// Also handle when extension is enabled/reloaded
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
      logger.info('Extension installed/updated, initializing WebSocket...');
      initializeWebSocketConnection();
    }
  });
}

// Listen for WebSocket task events
globalThis.addEventListener('websocket-task', async (event: any) => {
  const detail = event.detail;
  logger.info('Received WebSocket task event:', detail);
  
  try {
    if (detail.type === 'new_task') {
      logger.info('Processing WebSocket task:', detail.task);
      
      // Send initial task analysis
      webSocketClient.sendTaskAnalysis(detail.task, 'starting', {
        message: 'Task received, analyzing requirements...'
      });
      
      // Get current active tab if no tabId specified
      let tabId = detail.tabId;
      if (!tabId || tabId === 0) {
        webSocketClient.sendTaskAnalysis(detail.task, 'tab_analysis', {
          message: 'Finding active browser tab...'
        });
        
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          tabId = tabs[0].id;
          logger.info('Using active tab ID:', tabId);
          webSocketClient.sendTaskAnalysis(detail.task, 'tab_ready', {
            message: `Using tab: ${tabs[0].title}`,
            tabId: tabId
          });
        }
      }
      
      if (tabId) {
        try {
          webSocketClient.sendTaskAnalysis(detail.task, 'setup', {
            message: 'Setting up AI agents and browser context...'
          });
          
          // Switch to the tab and setup executor
          await browserContext.switchTab(tabId);
          currentExecutor = await setupExecutor(detail.taskId, detail.task, browserContext);
          subscribeToExecutorEvents(currentExecutor);
          
          webSocketClient.sendTaskAnalysis(detail.task, 'execution_start', {
            message: 'AI agents ready, starting task execution...'
          });
          
          const result = await currentExecutor.execute();
          logger.info('WebSocket task execution result:', result);
          
          // Send completion
          webSocketClient.sendTaskCompletion(true, 'Task completed successfully');
          
        } catch (error) {
          logger.error('Task execution failed:', error);  
          webSocketClient.sendTaskCompletion(false, undefined, error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        logger.error('No valid tab ID found for WebSocket task');
        webSocketClient.sendTaskCompletion(false, undefined, 'No active browser tab found');
      }
    }
  } catch (error) {
    logger.error('Failed to process WebSocket task:', error);
  }
});

// Listen for WebSocket abort events
globalThis.addEventListener('websocket-abort', async (event: any) => {
  const detail = event.detail;
  logger.info('Received WebSocket abort event:', detail);
  
  try {
    if (detail.type === 'abort_task') {
      logger.info('Aborting current task:', detail.reason);
      
      // Cancel the current executor
      if (currentExecutor) {
        await currentExecutor.cancel();
        logger.info('Current task cancelled successfully');
        
        // Send task completion notification
        webSocketClient.sendTaskCompletion(false, undefined, 'Task aborted by user');
      } else {
        logger.warning('No current executor to abort');
      }
    }
  } catch (error) {
    logger.error('Failed to abort task:', error);
  }
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
  }
});

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  // Send LLM thinking update
  webSocketClient.sendLLMThinking('setup', 'Checking available AI models and API keys...');
  
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error('Please configure API keys in the settings first');
  }
  
  webSocketClient.sendLLMThinking('setup', `Found ${Object.keys(providers).length} configured AI providers`);
  
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
      
      // Also send to Mac app via WebSocket
      webSocketClient.sendExecutorEvent(event);
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
