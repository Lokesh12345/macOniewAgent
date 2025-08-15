import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  initializeDefaults,
  forceInitializeDefaults,
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

// WebSocket connection to Mac app
let macAppSocket: WebSocket | null = null;
const MAC_APP_WEBSOCKET_URL = 'ws://localhost:41899';

// Gather browser context information
async function gatherBrowserContext(activeTab: chrome.tabs.Tab): Promise<any> {
  try {
    // Browser information
    const browserInfo = await chrome.runtime.getPlatformInfo();
    const browserVersion = chrome.runtime.getManifest().version;
    
    // Active tab information
    const tabInfo = {
      url: activeTab.url || '',
      title: activeTab.title || '',
      favIconUrl: activeTab.favIconUrl || '',
      windowId: activeTab.windowId,
      index: activeTab.index,
      pinned: activeTab.pinned || false,
      audible: activeTab.audible || false,
      discarded: activeTab.discarded || false,
      autoDiscardable: activeTab.autoDiscardable !== false,
      incognito: activeTab.incognito || false
    };
    
    // Window information
    let windowInfo = {};
    if (activeTab.windowId) {
      try {
        const window = await chrome.windows.get(activeTab.windowId);
        windowInfo = {
          windowType: window.type,
          windowState: window.state,
          windowWidth: window.width,
          windowHeight: window.height,
          windowFocused: window.focused,
          windowIncognito: window.incognito || false
        };
      } catch (e) {
        console.warn('Could not get window info:', e);
      }
    }
    
    // Browser language and user agent from content script (if possible)
    let browserLanguage = 'en';
    let userAgent = '';
    try {
      const results = await chrome.tabs.executeScript(activeTab.id!, {
        code: `({ 
          language: navigator.language, 
          userAgent: navigator.userAgent,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
          platform: navigator.platform,
          screenWidth: screen.width,
          screenHeight: screen.height,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        })`
      });
      
      if (results && results[0]) {
        const navInfo = results[0];
        browserLanguage = navInfo.language;
        userAgent = navInfo.userAgent;
        
        return {
          // Browser Context
          browser: {
            name: 'Chrome',
            version: browserVersion,
            platform: browserInfo.os,
            architecture: browserInfo.arch,
            language: browserLanguage,
            userAgent: userAgent,
            cookieEnabled: navInfo.cookieEnabled,
            onLine: navInfo.onLine,
            navigatorPlatform: navInfo.platform
          },
          
          // Screen and Display
          screen: {
            width: navInfo.screenWidth,
            height: navInfo.screenHeight,
            colorDepth: navInfo.colorDepth,
            pixelDepth: navInfo.pixelDepth
          },
          
          // Viewport
          viewport: navInfo.viewport,
          
          // Tab Context
          tab: tabInfo,
          
          // Window Context
          window: windowInfo,
          
          // Detected timezone (may override system)
          detectedTimezone: navInfo.timezone
        };
      }
    } catch (e) {
      console.warn('Could not execute script on tab:', e);
    }
    
    // Fallback if script execution fails
    return {
      browser: {
        name: 'Chrome',
        version: browserVersion,
        platform: browserInfo.os,
        architecture: browserInfo.arch,
        language: browserLanguage
      },
      tab: tabInfo,
      window: windowInfo
    };
    
  } catch (error) {
    console.error('Error gathering browser context:', error);
    return {
      browser: {
        name: 'Chrome',
        error: 'Could not gather full browser context'
      }
    };
  }
}

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

// Connect to Mac app WebSocket server
function connectToMacApp() {
  try {
    macAppSocket = new WebSocket(MAC_APP_WEBSOCKET_URL);
    
    macAppSocket.onopen = () => {
      console.log('✅ Connected to Mac app WebSocket server');
      // Send a ping to confirm connection
      sendToMacApp('ping', {});
    };
    
    macAppSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('🎯 Extension received message from Mac app:', message);
        handleMacAppMessage(message);
      } catch (error) {
        console.error('❌ Error parsing Mac app message:', error);
      }
    };
    
    macAppSocket.onclose = () => {
      console.log('🔌 Disconnected from Mac app WebSocket server, attempting reconnect...');
      macAppSocket = null;
      // Reconnect after 2 seconds
      setTimeout(connectToMacApp, 2000);
    };
    
    macAppSocket.onerror = (error) => {
      console.error('❌ Mac app WebSocket error:', error);
    };
  } catch (error) {
    console.error('❌ Failed to connect to Mac app:', error);
    // Retry connection after 2 seconds
    setTimeout(connectToMacApp, 2000);
  }
}

// Send message to Mac app
function sendToMacApp(type: string, data: any) {
  if (macAppSocket && macAppSocket.readyState === WebSocket.OPEN) {
    const message = {
      type,
      data,
      timestamp: new Date().toISOString()
    };
    macAppSocket.send(JSON.stringify(message));
    console.log('📤 Sent to Mac app:', message);
  } else {
    console.warn('⚠️ Mac app WebSocket not connected, cannot send:', type);
  }
}

// Make sendToMacApp globally available for the action builder
(globalThis as any).sendToMacApp = sendToMacApp;

// Handle messages from Mac app
async function handleMacAppMessage(message: any) {
  const { type, data } = message;
  
  switch (type) {
    case 'pong':
      console.log('🏓 Received pong from Mac app');
      break;
      
    case 'execute_task':
      console.log('🚀 Mac app requested task execution:', data);
      // Get current active tab - same as side panel does
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        throw new Error('No active tab found');
      }
      const tabId = tabs[0].id;
      if (!tabId) {
        throw new Error('Invalid tab ID');
      }
      
      // Gather browser context and merge with Mac app context
      const browserContext = await gatherBrowserContext(tabs[0]);
      const combinedContext = {
        ...data.context, // Mac app context
        ...browserContext // Browser context (will override Mac app if same keys)
      };
      
      console.log('🌐 Combined context:', combinedContext);
      
      // Create a mock message object that matches side panel format
      const mockMessage = {
        type: 'new_task',
        task: data.task,
        taskId: data.taskId,
        tabId: tabId,
        context: combinedContext
      };
      
      // Use the exact same code path as side panel
      await handleNewTaskMessage(mockMessage);
      break;
      
    case 'abort_task':
      console.log('🛑 Mac app requested task abort');
      if (currentExecutor) {
        await currentExecutor.cancel();
      }
      break;
      
    case 'user_input_response':
      console.log('📨 Mac app sent user input response:', data);
      
      // Handle both executor-based and action-based user input
      if (currentExecutor) {
        // Pass the user input to the executor
        await currentExecutor.handleUserInput(data.inputId, data.value);
      }
      
      // Also handle global pending user inputs from actions
      const globalPendingInputs = (globalThis as any).pendingUserInputs;
      if (globalPendingInputs && globalPendingInputs.has(data.inputId)) {
        const pending = globalPendingInputs.get(data.inputId);
        globalPendingInputs.delete(data.inputId);
        
        if (data.value === 'CANCELLED' || data.value === 'DISMISSED') {
          pending.reject(new Error('User cancelled input'));
        } else if (data.value === 'SKIP') {
          pending.resolve(''); // Empty string for skip
        } else {
          pending.resolve(data.value);
        }
      }
      break;
      
    default:
      console.log('⚠️ Unknown message type from Mac app:', type);
  }
}


// Subscribe to executor events and send to ALL clients (Mac app + side panel)
function subscribeToAllClients(executor: Executor) {
  executor.clearExecutionEvents();
  
  executor.subscribeExecutionEvents(async (event) => {
    console.log('📡 Broadcasting executor event to all clients:', event);
    
    // Send to Mac app via WebSocket
    sendToMacApp('executor_event', { event });
    
    // Send to side panel via Chrome runtime port
    if (currentPort) {
      try {
        currentPort.postMessage(event);
      } catch (error) {
        console.error('Failed to send to side panel:', error);
      }
    }
    
    // Cleanup if task is complete
    if (['TASK_OK', 'TASK_FAIL', 'TASK_CANCEL'].includes(event.state)) {
      await currentExecutor?.cleanup();
    }
  });
}

// Shared function to handle new task execution (used by both Mac app and side panel)
async function handleNewTaskMessage(message: any) {
  if (!message.task) {
    console.error('❌ No task provided');
    throw new Error('No task provided');
  }
  if (!message.tabId) {
    console.error('❌ No tab ID provided');
    throw new Error('No tab ID provided');
  }

  // ENSURE INITIALIZATION IS COMPLETE BEFORE RUNNING TASK
  console.log('🔄 Ensuring initialization before running task...');
  await ensureInitialized();
  console.log('✅ Initialization confirmed, proceeding with task...');

  logger.info('new_task', message.tabId, message.task);
  currentExecutor = await setupExecutor(message.taskId, message.task, browserContext, message.context);
  
  // Subscribe to events and send to BOTH side panel AND Mac app
  subscribeToAllClients(currentExecutor);

  const result = await currentExecutor.execute();
  logger.info('new_task execution result', message.tabId, result);
  return result;
}

// Start WebSocket connection
connectToMacApp();

// Initialize defaults SYNCHRONOUSLY before any tasks can run
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (isInitialized) return;
  
  if (!initializationPromise) {
    console.log('🚀 Starting BLOCKING initialization...');
    initializationPromise = (async () => {
      try {
        await forceInitializeDefaults();
        console.log('✅ BLOCKING initialization completed successfully');
        isInitialized = true;
      } catch (error) {
        console.error('❌ BLOCKING initialization failed:', error);
        throw error;
      }
    })();
  }
  
  await initializationPromise;
}

// Run initialization immediately
ensureInitialized().catch(error => {
  console.error('❌ Failed to ensure initialization:', error);
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
            try {
              await handleNewTaskMessage(message);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return port.postMessage({ type: 'error', error: errorMessage });
            }
            break;
          }
          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: 'No follow up task provided' });
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });

            // ENSURE INITIALIZATION IS COMPLETE 
            await ensureInitialized();

            logger.info('follow_up_task', message.tabId, message.task);

            // If executor exists, add follow-up task
            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              // Re-subscribe to events for ALL clients (Mac app + side panel)
              subscribeToAllClients(currentExecutor);
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
            
            // ENSURE INITIALIZATION IS COMPLETE 
            await ensureInitialized();
            
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              // Switch to the specified tab
              await browserContext.switchTab(message.tabId);
              // Setup executor with the new taskId and a dummy task description
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext, message.context);
              subscribeToAllClients(currentExecutor);

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

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext, context?: any) {
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
    context: context,
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
