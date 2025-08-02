import { createLogger } from './log';

const logger = createLogger('webSocketClient');

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private serverUrl = 'ws://localhost:41899';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private maxReconnectAttempts = 10;
  private reconnectAttempts = 0;
  private reconnectDelay = 2000; // Start with 2 seconds

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
        
        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        this.isConnected = false;
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
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    
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
        break;
      
      case 'execute_task':
        // Forward task execution to the existing system
        this.forwardTaskExecution(message.data);
        break;
      
      case 'abort_task':
        // Forward task abort to the existing system
        this.forwardTaskAbort(message.data);
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

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }
}

// Create singleton instance
export const webSocketClient = new WebSocketClient();