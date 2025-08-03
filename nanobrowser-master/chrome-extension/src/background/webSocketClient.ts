import { createLogger } from './log';
import type { 
  WebSocketMessage, 
  MessageType, 
  MessageData,
  LLMRequestData,
  TaskPlanningRequestData,
  DOMStrategyRequestData,
  TabAnalysisRequestData,
  AgentProgressData,
  ProtocolMessageBuilder,
  BrowserTabInfo,
  TaskContext,
  AgentType,
  AgentPhase,
  ProgressDetails,
  PageComplexity,
  DOMFailure
} from '../types/protocol';

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

    // Try to parse as enhanced protocol message first
    if (this.isEnhancedProtocolMessage(message)) {
      this.handleEnhancedMessage(message as WebSocketMessage);
    } else {
      // Fall back to legacy message handling
      this.handleLegacyMessage(message);
    }
  }

  private isEnhancedProtocolMessage(message: any): boolean {
    return message.version && message.messageId && message.timestamp && message.data;
  }

  private handleEnhancedMessage(message: WebSocketMessage) {
    logger.info('Handling enhanced protocol message:', message.type);

    switch (message.type) {
      // LLM Coordination responses
      case 'llm_response':
        this.handleLLMResponse(message);
        break;

      // Task Planning responses
      case 'task_planning_response':
        this.handleTaskPlanningResponse(message);
        break;

      // DOM Strategy responses
      case 'dom_strategy_response':
        this.handleDOMStrategyResponse(message);
        break;

      // Action Coordination responses
      case 'action_coordination_response':
        this.handleActionCoordinationResponse(message);
        break;

      // Tab Analysis responses
      case 'tab_analysis_response':
        this.handleTabAnalysisResponse(message);
        break;

      // Progress and status updates
      case 'task_roadmap_update':
        this.handleTaskRoadmapUpdate(message);
        break;

      // Legacy message types handled by enhanced protocol
      case 'ping':
        this.sendEnhancedMessage({
          type: 'pong',
          version: '1.0',
          messageId: this.generateMessageId(),
          timestamp: new Date().toISOString(),
          data: { source: 'extension' }
        });
        logger.info('Received enhanced ping, sent pong');
        break;

      case 'pong':
        logger.info('Received enhanced pong from Mac app');
        break;

      default:
        // Check for registered handlers
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.data);
        } else {
          logger.warning('Unknown enhanced message type from Mac app:', message.type);
        }
    }
  }

  private handleLegacyMessage(message: any) {
    switch (message.type) {
      case 'pong':
        logger.info('Received legacy pong from Mac app');
        break;
      
      case 'ping':
        this.sendMessage({
          type: 'pong',
          data: { source: 'extension' }
        });
        logger.info('Received legacy ping, sent pong');
        break;
      
      case 'execute_task':
        this.forwardTaskExecution(message.data);
        break;
      
      case 'abort_task':
        this.forwardTaskAbort(message.data);
        break;
      
      case 'settings_update':
        this.applySettingsFromMac(message.data);
        break;
      
      case 'general_settings_update':
        this.applyGeneralSettingsFromMac(message.data);
        break;
      
      case 'firewall_settings_update':
        this.applyFirewallSettingsFromMac(message.data);
        break;

      default:
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.data);
        } else {
          logger.warning('Unknown legacy message type from Mac app:', message.type);
        }
    }
  }

  // MARK: - Enhanced Message Handlers

  private handleLLMResponse(message: WebSocketMessage) {
    logger.info('LLM Response received:', message.data);
    // Forward to LLM handling system
    const handler = this.messageHandlers.get('llm_response');
    if (handler) {
      handler(message.data);
    }
  }

  private handleTaskPlanningResponse(message: WebSocketMessage) {
    logger.info('Task Planning Response received:', message.data);
    const handler = this.messageHandlers.get('task_planning_response');
    if (handler) {
      handler(message.data);
    }
  }

  private handleDOMStrategyResponse(message: WebSocketMessage) {
    logger.info('DOM Strategy Response received:', message.data);
    const handler = this.messageHandlers.get('dom_strategy_response');
    if (handler) {
      handler(message.data);
    }
  }

  private handleActionCoordinationResponse(message: WebSocketMessage) {
    logger.info('Action Coordination Response received:', message.data);
    const handler = this.messageHandlers.get('action_coordination_response');
    if (handler) {
      handler(message.data);
    }
  }

  private handleTabAnalysisResponse(message: WebSocketMessage) {
    logger.info('Tab Analysis Response received:', message.data);
    const handler = this.messageHandlers.get('tab_analysis_response');
    if (handler) {
      handler(message.data);
    }
  }

  private handleTaskRoadmapUpdate(message: WebSocketMessage) {
    logger.info('Task Roadmap Update received:', message.data);
    const handler = this.messageHandlers.get('task_roadmap_update');
    if (handler) {
      handler(message.data);
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

  // MARK: - Enhanced Protocol Message Sending

  public sendEnhancedMessage<T extends MessageData>(message: WebSocketMessage<T>): boolean {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warning('Cannot send enhanced message: WebSocket not connected');
      return false;
    }

    try {
      logger.info('Sending enhanced protocol message:', message.type);
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send enhanced WebSocket message:', error);
      return false;
    }
  }

  // MARK: - Enhanced Protocol Convenience Methods

  public sendLLMRequest(
    requestId: string,
    provider: string,
    modelName: string,
    messages: any[],
    parameters?: any,
    context?: TaskContext,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): string {
    const message = ProtocolMessageBuilder.createLLMRequest(
      requestId,
      provider,
      modelName,
      messages,
      parameters,
      context,
      priority
    );
    
    this.sendEnhancedMessage(message);
    return message.messageId;
  }

  public sendTaskPlanningRequest(
    userRequest: string,
    currentUrl?: string,
    availableTabs: BrowserTabInfo[] = [],
    browserContext?: any,
    preferences?: any
  ): string {
    const requestId = this.generateRequestId();
    const message = ProtocolMessageBuilder.createTaskPlanningRequest(
      requestId,
      userRequest,
      currentUrl,
      availableTabs,
      browserContext || this.getBrowserContext(),
      preferences
    );
    
    this.sendEnhancedMessage(message);
    return requestId;
  }

  public sendDOMStrategyRequest(
    pageUrl: string,
    pageTitle: string,
    pageComplexity?: PageComplexity,
    previousFailures?: DOMFailure[],
    targetActions: string[] = []
  ): string {
    const requestId = this.generateRequestId();
    const message = ProtocolMessageBuilder.createDOMStrategyRequest(
      requestId,
      pageUrl,
      pageTitle,
      pageComplexity,
      previousFailures,
      targetActions
    );
    
    this.sendEnhancedMessage(message);
    return requestId;
  }

  public sendTabAnalysisRequest(
    taskContext: TaskContext,
    availableTabs: BrowserTabInfo[] = []
  ): string {
    const requestId = this.generateRequestId();
    const message = ProtocolMessageBuilder.createTabAnalysisRequest(
      requestId,
      taskContext,
      availableTabs
    );
    
    this.sendEnhancedMessage(message);
    return requestId;
  }

  public sendAgentProgress(
    stepId: string,
    agent: AgentType,
    phase: AgentPhase,
    progress: ProgressDetails,
    context: TaskContext
  ): void {
    const message = ProtocolMessageBuilder.createAgentProgress(
      stepId,
      agent,
      phase,
      progress,
      context
    );
    
    this.sendEnhancedMessage(message);
  }

  // MARK: - Utility Methods

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getBrowserContext(): any {
    // This will be implemented to gather actual browser context
    return {
      activeTabId: 0,
      windowCount: 1,
      totalTabs: 1,
      memoryUsage: undefined
    };
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