import { createLogger } from './log';

const logger = createLogger('webSocketClient');

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private serverUrl = 'ws://localhost:41899';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private maxReconnectAttempts = Infinity; // Keep trying forever
  private reconnectAttempts = 0;
  private reconnectDelay = 2000; // Start with 2 seconds
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Don't auto-connect in constructor, let background script control this
  }

  public connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.info('WebSocket is already connected');
      return;
    }

    // Reset reconnect attempts for manual connection
    this.reconnectAttempts = 0;

    try {
      logger.info('Attempting to connect to Mac app:', this.serverUrl);
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        logger.info('Connected to Mac app WebSocket server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000;
        
        // Send initial ping
        this.sendMessage({
          type: 'ping',
          data: { source: 'extension' }
        });
        
        // Request all settings from Mac app on connection after a short delay
        setTimeout(() => {
          logger.info('Requesting settings from Mac app after connection established');
          this.requestAllSettingsFromMac();
        }, 500);
        
        // Start periodic ping
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logger.info('Received message from Mac app:', message);
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        logger.info('WebSocket connection closed:', event.code, event.reason);
        this.isConnected = false;
        this.ws = null;
        this.stopPingInterval();
        
        // Attempt to reconnect if not manually closed
        if (event.code !== 1000) {
          this.scheduleReconnect();
        } else {
          logger.info('WebSocket closed normally');
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        logger.error('Connection failed to:', this.serverUrl);
        this.isConnected = false;
        // Check if Mac app is running
        if (this.reconnectAttempts === 0) {
          logger.error('Make sure the Oniew Agent Mac app is running');
        }
      };

    } catch (error) {
      logger.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    // Cap reconnect attempts counter for delay calculation
    const attemptForDelay = Math.min(this.reconnectAttempts, 10);
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, attemptForDelay - 1), 30000);
    
    logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(message: any) {
    if (!message || !message.type) {
      logger.warning('Received invalid message:', message);
      return;
    }

    switch (message.type) {
      case 'pong':
        // Handle pong response
        logger.info('Received pong from Mac app');
        break;
      
      case 'ping':
        // Respond with pong
        this.sendMessage({
          type: 'pong',
          data: { source: 'extension' }
        });
        logger.info('Received ping, sent pong');
        break;
      
      case 'execute_task':
        // Forward task execution to the existing system
        this.forwardTaskExecution(message.data);
        break;
      
      case 'abort_task':
        // Forward task abort to the existing system
        this.forwardTaskAbort(message.data);
        break;
      
      case 'settings_update':
        // Apply settings from Mac app to Chrome extension
        this.applySettingsFromMac(message.data);
        break;
      
      case 'general_settings_update':
        // Apply general settings from Mac app to Chrome extension
        this.applyGeneralSettingsFromMac(message.data);
        break;
      
      case 'firewall_settings_update':
        // Apply firewall settings from Mac app to Chrome extension
        this.applyFirewallSettingsFromMac(message.data);
        break;

      default:
        // Check for registered handlers
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.data);
        } else {
          logger.warning('Unknown message type from Mac app:', message.type);
        }
    }
  }

  private forwardTaskExecution(data: any) {
    logger.info('Forwarding task execution to internal system:', data);
    
    // We need to trigger task execution through the existing background script system
    // Since we're already in the background script, we can call the internal functions directly
    // This will be handled when we integrate the WebSocket client properly
    
    // For now, let's broadcast this as a custom event
    globalThis.dispatchEvent(new CustomEvent('websocket-task', {
      detail: {
        type: 'new_task',
        task: data.task,
        taskId: data.taskId,
        tabId: data.tabId
      }
    }));
  }

  private forwardTaskAbort(data: any) {
    logger.info('Forwarding task abort to internal system:', data);
    
    // Broadcast abort event
    globalThis.dispatchEvent(new CustomEvent('websocket-abort', {
      detail: {
        type: 'abort_task',
        reason: data.reason || 'user_canceled'
      }
    }));
  }

  public sendMessage(message: any) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warning('Cannot send message: WebSocket not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error);
      return false;
    }
  }

  public sendExecutorEvent(event: any) {
    this.sendMessage({
      type: 'executor_event',
      data: { event },
      timestamp: new Date().toISOString()
    });
  }

  // Enhanced progress tracking methods
  public sendTaskAnalysis(task: string, phase: string, details?: any) {
    this.sendMessage({
      type: 'task_analysis',
      data: { 
        task, 
        phase, 
        details: details || {},
        timestamp: new Date().toISOString()
      }
    });
  }

  public sendLLMThinking(phase: string, reasoning: string, prompt?: string) {
    this.sendMessage({
      type: 'llm_thinking',
      data: {
        phase,
        reasoning,
        prompt: prompt || '',
        timestamp: new Date().toISOString()
      }
    });
  }

  public sendStepProgress(step: number, action: string, status: 'starting' | 'in_progress' | 'completed' | 'failed', details?: any) {
    this.sendMessage({
      type: 'step_progress',
      data: {
        step,
        action,
        status,
        details: details || {},
        timestamp: new Date().toISOString()
      }
    });
  }

  public sendUserInputRequest(prompt: string, inputType: 'text' | 'choice' | 'confirmation', options?: any) {
    const inputId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sendMessage({
      type: 'user_input_needed',
      data: {
        inputId,
        prompt,
        inputType,
        options: options || {},
        timestamp: new Date().toISOString()
      }
    });
    return inputId; // Return ID for response matching
  }

  public sendTaskCompletion(success: boolean, result?: string, error?: string) {
    this.sendMessage({
      type: 'task_completion',
      data: {
        success,
        result: result || '',
        error: error || '',
        timestamp: new Date().toISOString()
      }
    });
  }

  public registerMessageHandler(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler);
  }

  public unregisterMessageHandler(type: string) {
    this.messageHandlers.delete(type);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public forceReconnect() {
    logger.info('Forcing WebSocket reconnection...');
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 1000);
  }

  public disconnect() {
    logger.info('Disconnecting WebSocket...');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  private startPingInterval() {
    this.stopPingInterval();
    // Send ping every 25 seconds (less than server's 30 second timeout)
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendMessage({
          type: 'ping',
          data: { source: 'extension', timestamp: Date.now() }
        });
        logger.info('Sent ping to keep connection alive');
      }
    }, 25000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async applySettingsFromMac(data: any) {
    try {
      logger.info('Applying settings from Mac app:', data);
      logger.info('Raw data received:', JSON.stringify(data, null, 2));
      
      // Import storage modules dynamically to avoid circular dependencies
      const { llmProviderStore, agentModelStore } = await import('@extension/storage');
      
      // Apply provider settings
      if (data.providers) {
        logger.info('Applying providers:', Object.keys(data.providers));
        for (const [providerId, providerData] of Object.entries(data.providers)) {
          if (typeof providerData === 'object' && providerData !== null) {
            const provider = providerData as any;
            logger.info(`Setting provider ${providerId}:`, provider);
            await llmProviderStore.setProvider(providerId, {
              apiKey: provider.apiKey || '',
              name: provider.name,
              type: provider.type,
              baseUrl: provider.baseUrl,
              modelNames: provider.modelNames,
              createdAt: provider.createdAt || Date.now()
            });
          }
        }
      }
      
      // Apply agent model settings
      if (data.agentModels) {
        const { AgentNameEnum } = await import('@extension/storage');
        logger.info('Applying agent models:', Object.keys(data.agentModels));
        
        for (const [agentName, modelData] of Object.entries(data.agentModels)) {
          logger.info(`Processing agent ${agentName}:`, modelData);
          if (typeof modelData === 'object' && modelData !== null) {
            const model = modelData as any;
            
            // Map agent name string to AgentNameEnum
            let agentEnum: string | undefined;
            // The agentName from Mac app is already lowercase, and AgentNameEnum values are also lowercase
            switch (agentName) {
              case 'planner':
                agentEnum = AgentNameEnum.Planner;
                break;
              case 'navigator':
                agentEnum = AgentNameEnum.Navigator;
                break;
              case 'validator':
                agentEnum = AgentNameEnum.Validator;
                break;
              default:
                logger.warning(`Unknown agent name: ${agentName}`);
                continue;
            }
            
            if (agentEnum && model.provider && model.modelName) {
              logger.info(`Setting agent model for ${agentName}:`, {
                provider: model.provider,
                modelName: model.modelName,
                parameters: model.parameters,
                reasoningEffort: model.reasoningEffort
              });
              
              await agentModelStore.setAgentModel(agentEnum, {
                provider: model.provider,
                modelName: model.modelName,
                parameters: model.parameters,
                reasoningEffort: model.reasoningEffort
              });
            }
          }
        }
      }
      
      logger.info('Settings successfully applied from Mac app');
      
    } catch (error) {
      logger.error('Failed to apply settings from Mac app:', error);
    }
  }

  private async applyGeneralSettingsFromMac(data: any) {
    try {
      logger.info('Applying general settings from Mac app:', data);
      
      // Import storage modules dynamically to avoid circular dependencies
      const { generalSettingsStore } = await import('@extension/storage');
      
      // Apply general settings
      if (data) {
        const settingsToApply: any = {};
        
        // Map settings from Mac app to extension format
        if (typeof data.maxSteps === 'number') settingsToApply.maxSteps = data.maxSteps;
        if (typeof data.maxActionsPerStep === 'number') settingsToApply.maxActionsPerStep = data.maxActionsPerStep;
        if (typeof data.maxFailures === 'number') settingsToApply.maxFailures = data.maxFailures;
        if (typeof data.useVision === 'boolean') settingsToApply.useVision = data.useVision;
        if (typeof data.displayHighlights === 'boolean') settingsToApply.displayHighlights = data.displayHighlights;
        if (typeof data.planningInterval === 'number') settingsToApply.planningInterval = data.planningInterval;
        if (typeof data.minWaitPageLoad === 'number') settingsToApply.minWaitPageLoad = data.minWaitPageLoad;
        if (typeof data.replayHistoricalTasks === 'boolean') settingsToApply.replayHistoricalTasks = data.replayHistoricalTasks;
        
        // Update the extension's general settings store
        await generalSettingsStore.updateSettings(settingsToApply);
        
        logger.info('General settings successfully applied from Mac app:', settingsToApply);
      }
      
    } catch (error) {
      logger.error('Failed to apply general settings from Mac app:', error);
    }
  }

  private async applyFirewallSettingsFromMac(data: any) {
    try {
      logger.info('Applying firewall settings from Mac app:', data);
      
      // Import storage modules dynamically to avoid circular dependencies
      const { firewallStore } = await import('@extension/storage');
      
      // Apply firewall settings
      if (data) {
        const firewallSettings: any = {};
        
        // Map settings from Mac app to extension format
        if (typeof data.enabled === 'boolean') firewallSettings.enabled = data.enabled;
        if (Array.isArray(data.allowList)) firewallSettings.allowList = data.allowList;
        if (Array.isArray(data.denyList)) firewallSettings.denyList = data.denyList;
        
        // Update the extension's firewall settings store
        await firewallStore.updateFirewall(firewallSettings);
        
        logger.info('Firewall settings successfully applied from Mac app:', firewallSettings);
      }
      
    } catch (error) {
      logger.error('Failed to apply firewall settings from Mac app:', error);
    }
  }

  public requestAllSettingsFromMac() {
    logger.info('Requesting all settings from Mac app...');
    
    // Request LLM/agent settings, general settings, and firewall settings
    this.sendMessage({
      type: 'settings_request',
      data: { source: 'extension' }
    });
    
    this.sendMessage({
      type: 'general_settings_request',
      data: { source: 'extension' }
    });
    
    this.sendMessage({
      type: 'firewall_settings_request',
      data: { source: 'extension' }
    });
  }

  public requestSettingsFromMac() {
    this.sendMessage({
      type: 'settings_request',
      data: { source: 'extension' }
    });
  }
}

// Create singleton instance
export const webSocketClient = new WebSocketClient();