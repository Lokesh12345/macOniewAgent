import { createLogger } from '@src/background/log';

const logger = createLogger('SessionContext');

export interface ActionRecord {
  type: 'click' | 'input' | 'scroll' | 'navigate' | 'other';
  elementInfo?: string;
  value?: string;
  url?: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface SharedSessionContext {
  currentUrl: string;
  lastAction: ActionRecord | null;
  actionHistory: ActionRecord[];
  currentGoal: string;
  lastError: string | null;
  pageLoadTimestamp: number;
  agentStates: {
    navigator: 'idle' | 'working' | 'completed' | 'failed';
    planner: 'idle' | 'working' | 'completed' | 'failed';
    validator: 'idle' | 'working' | 'completed' | 'failed';
  };
}

class SessionContextManager {
  private context: SharedSessionContext = {
    currentUrl: '',
    lastAction: null,
    actionHistory: [],
    currentGoal: '',
    lastError: null,
    pageLoadTimestamp: Date.now(),
    agentStates: {
      navigator: 'idle',
      planner: 'idle',
      validator: 'idle'
    }
  };

  private readonly MAX_HISTORY = 20; // Keep last 20 actions

  /**
   * Get the current shared context
   */
  getContext(): SharedSessionContext {
    return { ...this.context };
  }

  /**
   * Update current URL
   */
  setCurrentUrl(url: string): void {
    if (this.context.currentUrl !== url) {
      logger.info(`URL changed: ${this.context.currentUrl} -> ${url}`);
      this.context.currentUrl = url;
      this.context.pageLoadTimestamp = Date.now();
    }
  }

  /**
   * Set the current goal for the session
   */
  setGoal(goal: string): void {
    this.context.currentGoal = goal;
    logger.info(`Goal set: ${goal}`);
  }

  /**
   * Record an action taken by any agent
   */
  recordAction(action: Omit<ActionRecord, 'timestamp'>): void {
    const actionRecord: ActionRecord = {
      ...action,
      timestamp: Date.now()
    };

    this.context.lastAction = actionRecord;
    this.context.actionHistory.unshift(actionRecord);

    // Keep only the most recent actions
    if (this.context.actionHistory.length > this.MAX_HISTORY) {
      this.context.actionHistory = this.context.actionHistory.slice(0, this.MAX_HISTORY);
    }

    logger.info(`Action recorded: ${action.type} ${action.success ? '✅' : '❌'}`);
  }

  /**
   * Update agent state
   */
  setAgentState(agent: keyof SharedSessionContext['agentStates'], state: SharedSessionContext['agentStates'][keyof SharedSessionContext['agentStates']]): void {
    this.context.agentStates[agent] = state;
    logger.debug(`Agent ${agent} state: ${state}`);
  }

  /**
   * Set last error
   */
  setError(error: string): void {
    this.context.lastError = error;
    logger.warning(`Error recorded: ${error}`);
  }

  /**
   * Clear last error
   */
  clearError(): void {
    this.context.lastError = null;
  }

  /**
   * Get recent actions of a specific type
   */
  getRecentActions(type?: ActionRecord['type'], limit = 5): ActionRecord[] {
    let actions = this.context.actionHistory;
    
    if (type) {
      actions = actions.filter(action => action.type === type);
    }
    
    return actions.slice(0, limit);
  }

  /**
   * Get actions since a specific timestamp
   */
  getActionsSince(timestamp: number): ActionRecord[] {
    return this.context.actionHistory.filter(action => action.timestamp > timestamp);
  }

  /**
   * Check if URL has changed since last page load
   */
  hasUrlChanged(url: string): boolean {
    return this.context.currentUrl !== url;
  }

  /**
   * Get time since last action
   */
  getTimeSinceLastAction(): number {
    if (!this.context.lastAction) {
      return Date.now() - this.context.pageLoadTimestamp;
    }
    return Date.now() - this.context.lastAction.timestamp;
  }

  /**
   * Get summary for agent context
   */
  getSummaryForAgent(): string {
    const { currentUrl, lastAction, currentGoal, actionHistory } = this.context;
    
    let summary = `Current URL: ${currentUrl}\n`;
    summary += `Goal: ${currentGoal}\n`;
    
    if (lastAction) {
      const timeAgo = Math.round((Date.now() - lastAction.timestamp) / 1000);
      summary += `Last action: ${lastAction.type} (${timeAgo}s ago) ${lastAction.success ? '✅' : '❌'}\n`;
    }
    
    const recentActions = actionHistory.slice(0, 3);
    if (recentActions.length > 0) {
      summary += `Recent actions: ${recentActions.map(a => `${a.type}${a.success ? '✅' : '❌'}`).join(', ')}\n`;
    }
    
    return summary;
  }

  /**
   * Reset context for new session
   */
  reset(): void {
    this.context = {
      currentUrl: '',
      lastAction: null,
      actionHistory: [],
      currentGoal: '',
      lastError: null,
      pageLoadTimestamp: Date.now(),
      agentStates: {
        navigator: 'idle',
        planner: 'idle',
        validator: 'idle'
      }
    };
    logger.info('Session context reset');
  }
}

// Export singleton instance
export const sessionContext = new SessionContextManager();