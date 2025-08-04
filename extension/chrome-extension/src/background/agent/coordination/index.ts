import { createLogger } from '../../log';
import { SharedContextManager } from './sharedContext';
import { SmartAgentSelector } from './agentSelector';
import { ContextCompressor } from './contextCompressor';
import type { AgentCoordinationConfig, SharedContext, TaskComplexity, ModelSelection } from './types';
import { DEFAULT_COORDINATION_CONFIG } from './types';
import type { AgentContext } from '../types';
import type { BaseMessage } from '@langchain/core/messages';
import { performanceMonitoring } from '../../browser/monitoring';

const logger = createLogger('AgentCoordination');

/**
 * Enhanced Agent Coordination System
 * Coordinates agents efficiently to minimize token usage
 */
export class AgentCoordinationSystem {
  private config: AgentCoordinationConfig;
  private sharedContextManager: SharedContextManager;
  private agentSelector: SmartAgentSelector;
  private contextCompressor: ContextCompressor;
  private initialized = false;

  constructor(config: Partial<AgentCoordinationConfig> = {}) {
    this.config = { ...DEFAULT_COORDINATION_CONFIG, ...config };
    this.sharedContextManager = new SharedContextManager(this.config);
    this.agentSelector = new SmartAgentSelector();
    this.contextCompressor = new ContextCompressor();
  }

  /**
   * Initialize the coordination system
   */
  initialize(): void {
    if (this.initialized) return;
    
    this.initialized = true;
    logger.info('Agent coordination system initialized', this.config);
    
    // Record initialization
    performanceMonitoring.recordMetric('coordination.initialized', 1, 'counter');
  }

  /**
   * Get or create shared context for a task
   */
  async getSharedContext(agentContext: AgentContext): Promise<SharedContext> {
    if (!this.config.enableSharedContext) {
      throw new Error('Shared context is disabled');
    }

    const browserState = await agentContext.browserContext.getState(false);
    const context = await this.sharedContextManager.createOrUpdateContext(agentContext, browserState);
    
    // Record context usage
    performanceMonitoring.recordMetric('coordination.context.accessed', 1, 'counter', {
      taskId: agentContext.taskId,
      compressed: String(context.compressed)
    });

    return context;
  }

  /**
   * Update shared context after agent action
   */
  async updateSharedContext(
    agentContext: AgentContext,
    agentType: 'navigator' | 'planner' | 'validator',
    update: any
  ): Promise<void> {
    if (!this.config.enableSharedContext) return;

    const context = this.sharedContextManager.getContext(agentContext.taskId);
    if (!context) return;

    // Update agent-specific context
    switch (agentType) {
      case 'navigator':
        context.navigatorContext = update;
        break;
      case 'planner':
        context.plannerContext = update;
        break;
    }

    context.metadata.updated = Date.now();
    
    // Record update
    performanceMonitoring.recordMetric('coordination.context.updated', 1, 'counter', {
      agentType,
      taskId: agentContext.taskId
    });
  }

  /**
   * Analyze task and recommend agent configuration
   */
  analyzeTask(task: string): {
    complexity: TaskComplexity;
    modelSelection?: ModelSelection;
    configuration: any;
  } {
    const complexity = this.agentSelector.analyzeTaskComplexity(task);
    
    let modelSelection: ModelSelection | undefined;
    if (this.config.enableSmartSelection) {
      // In production, this would use actual available models
      const availableModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'];
      modelSelection = this.agentSelector.selectModels(complexity, availableModels);
    }

    const configuration = this.agentSelector.getAgentConfiguration(complexity);
    
    // Record task analysis
    performanceMonitoring.recordMetric('coordination.task.analyzed', 1, 'counter', {
      taskType: complexity.type,
      estimatedSteps: String(complexity.estimatedSteps)
    });

    return { complexity, modelSelection, configuration };
  }

  /**
   * Compress message history for long sessions
   */
  async compressMessageHistory(
    messages: BaseMessage[],
    targetTokens: number,
    preserveRecent: number = 5
  ): Promise<BaseMessage[]> {
    if (!this.config.enableContextCompression) {
      return messages;
    }

    const startTime = Date.now();
    const { messages: compressed, result } = await this.contextCompressor.compressMessages(
      messages,
      targetTokens,
      preserveRecent
    );

    // Record compression metrics
    performanceMonitoring.recordMetric('coordination.compression.performed', 1, 'counter');
    performanceMonitoring.recordMetric('coordination.compression.ratio', result.ratio, 'gauge');
    performanceMonitoring.recordMetric('coordination.compression.duration', Date.now() - startTime, 'timer');

    logger.info('Message history compressed', {
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      ratio: result.ratio,
      lossLevel: result.lossLevel
    });

    return compressed;
  }

  /**
   * Check if messages should be compressed
   */
  shouldCompressMessages(agentContext: AgentContext): boolean {
    const shouldCompress = this.config.enableContextCompression &&
           agentContext.nSteps >= this.config.compressionThreshold;
    
    logger.info(`Compression check: enabled=${this.config.enableContextCompression}, steps=${agentContext.nSteps}, threshold=${this.config.compressionThreshold}, shouldCompress=${shouldCompress}`);
    
    return shouldCompress;
  }

  /**
   * Get agent-specific context
   */
  getAgentContext(
    agentContext: AgentContext,
    agentType: 'navigator' | 'planner' | 'validator'
  ): any {
    const sharedContext = this.sharedContextManager.getContext(agentContext.taskId);
    if (!sharedContext) return null;

    switch (agentType) {
      case 'navigator':
        return {
          browserState: sharedContext.browserState,
          recentActions: sharedContext.actionHistory.recentActions,
          failedActions: sharedContext.actionHistory.failedActions,
          navigatorContext: sharedContext.navigatorContext,
        };
        
      case 'planner':
        return {
          browserState: sharedContext.browserState,
          actionHistory: sharedContext.actionHistory,
          plannerContext: sharedContext.plannerContext,
        };
        
      case 'validator':
        return {
          completedGoals: sharedContext.plannerContext?.completedGoals,
          successfulPatterns: sharedContext.actionHistory.successfulPatterns,
        };
        
      default:
        return null;
    }
  }

  /**
   * Get coordination statistics
   */
  getStats(): any {
    const contextStats = this.sharedContextManager.getStats();
    
    return {
      config: this.config,
      sharedContext: contextStats,
      initialized: this.initialized,
    };
  }

  /**
   * Get model recommendations for a task
   */
  getModelRecommendations(task: string, availableModels: string[]): string {
    return this.agentSelector.getModelRecommendations(task, availableModels);
  }

  /**
   * Clear all contexts
   */
  clear(): void {
    this.sharedContextManager.clear();
    logger.info('Agent coordination system cleared');
  }

  /**
   * Destroy the coordination system
   */
  destroy(): void {
    this.clear();
    this.initialized = false;
    logger.info('Agent coordination system destroyed');
  }
}

// Export singleton instance
export const agentCoordination = new AgentCoordinationSystem();

// Export all types and classes
export * from './types';
export { SharedContextManager } from './sharedContext';
export { SmartAgentSelector } from './agentSelector';
export { ContextCompressor } from './contextCompressor';