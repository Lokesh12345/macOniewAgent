import { createLogger } from '../../log';
import type { TaskComplexity, ModelSelection, AgentCapability } from './types';

const logger = createLogger('AgentSelector');

/**
 * Smart Agent Selection
 * Chooses appropriate models based on task complexity
 */
export class SmartAgentSelector {
  private modelCapabilities: Map<string, AgentCapability[]> = new Map();
  
  constructor() {
    this.initializeModelCapabilities();
  }

  /**
   * Initialize model capabilities mapping
   */
  private initializeModelCapabilities(): void {
    // Define capabilities for different model tiers
    // These would be customized based on actual available models
    
    // Lightweight models for simple tasks
    this.modelCapabilities.set('light', [
      {
        agentType: 'navigator',
        capabilities: ['click', 'input', 'navigate', 'scroll'],
        complexity: 'simple',
        tokenCost: 'low',
      },
      {
        agentType: 'validator',
        capabilities: ['basic_validation'],
        complexity: 'simple',
        tokenCost: 'low',
      },
    ]);

    // Standard models for moderate tasks
    this.modelCapabilities.set('standard', [
      {
        agentType: 'navigator',
        capabilities: ['all_actions', 'error_recovery', 'dynamic_wait'],
        complexity: 'moderate',
        tokenCost: 'medium',
      },
      {
        agentType: 'planner',
        capabilities: ['goal_planning', 'strategy_adjustment'],
        complexity: 'moderate',
        tokenCost: 'medium',
      },
      {
        agentType: 'validator',
        capabilities: ['comprehensive_validation', 'output_analysis'],
        complexity: 'moderate',
        tokenCost: 'medium',
      },
    ]);

    // Advanced models for complex tasks
    this.modelCapabilities.set('advanced', [
      {
        agentType: 'navigator',
        capabilities: ['all_actions', 'advanced_recovery', 'multi_step'],
        complexity: 'complex',
        tokenCost: 'high',
      },
      {
        agentType: 'planner',
        capabilities: ['deep_planning', 'dynamic_replanning', 'context_aware'],
        complexity: 'complex',
        tokenCost: 'high',
      },
      {
        agentType: 'validator',
        capabilities: ['deep_validation', 'semantic_analysis', 'correction_suggestions'],
        complexity: 'complex',
        tokenCost: 'high',
      },
    ]);
  }

  /**
   * Analyze task complexity
   */
  analyzeTaskComplexity(task: string, context?: any): TaskComplexity {
    const taskLower = task.toLowerCase();
    
    // Simple navigation tasks
    if (this.isSimpleNavigation(taskLower)) {
      return {
        type: 'navigation',
        estimatedSteps: 1,
        requiresPlanning: false,
        requiresValidation: false,
      };
    }

    // Form filling tasks
    if (this.isFormFilling(taskLower)) {
      return {
        type: 'form_filling',
        estimatedSteps: 5,
        requiresPlanning: false,
        requiresValidation: true,
      };
    }

    // Data extraction tasks
    if (this.isDataExtraction(taskLower)) {
      return {
        type: 'data_extraction',
        estimatedSteps: 10,
        requiresPlanning: true,
        requiresValidation: true,
      };
    }

    // Multi-step complex tasks
    if (this.isMultiStep(taskLower)) {
      return {
        type: 'multi_step',
        estimatedSteps: 20,
        requiresPlanning: true,
        requiresValidation: true,
      };
    }

    // Default to moderate complexity
    return {
      type: 'unknown',
      estimatedSteps: 10,
      requiresPlanning: true,
      requiresValidation: true,
    };
  }

  /**
   * Select appropriate models based on task complexity
   */
  selectModels(
    complexity: TaskComplexity,
    availableModels: string[]
  ): ModelSelection {
    let selection: ModelSelection;

    // Map available models to tiers (this would be customized based on actual models)
    const modelTiers = this.mapModelsToTiers(availableModels);

    switch (complexity.type) {
      case 'navigation':
        selection = {
          navigatorModel: modelTiers.light || modelTiers.standard || modelTiers.advanced,
          plannerModel: modelTiers.light || modelTiers.standard, // Not really needed
          validatorModel: modelTiers.light || modelTiers.standard,
          extractorModel: modelTiers.light || modelTiers.standard,
          reason: 'Simple navigation task - using lightweight models',
        };
        break;

      case 'form_filling':
        selection = {
          navigatorModel: modelTiers.standard || modelTiers.advanced,
          plannerModel: modelTiers.light || modelTiers.standard,
          validatorModel: modelTiers.standard || modelTiers.advanced,
          extractorModel: modelTiers.standard || modelTiers.advanced,
          reason: 'Form filling requires accurate element targeting and validation',
        };
        break;

      case 'data_extraction':
        selection = {
          navigatorModel: modelTiers.standard || modelTiers.advanced,
          plannerModel: modelTiers.standard || modelTiers.advanced,
          validatorModel: modelTiers.standard || modelTiers.advanced,
          extractorModel: modelTiers.advanced || modelTiers.standard,
          reason: 'Data extraction needs planning and accurate extraction',
        };
        break;

      case 'multi_step':
      default:
        selection = {
          navigatorModel: modelTiers.advanced || modelTiers.standard,
          plannerModel: modelTiers.advanced || modelTiers.standard,
          validatorModel: modelTiers.advanced || modelTiers.standard,
          extractorModel: modelTiers.advanced || modelTiers.standard,
          reason: 'Complex multi-step task requires advanced capabilities',
        };
        break;
    }

    logger.info('Model selection:', selection);
    return selection;
  }

  /**
   * Check if task is simple navigation
   */
  private isSimpleNavigation(task: string): boolean {
    const patterns = [
      /^(go to|navigate to|open|visit)\s+\w+/,
      /^click (on\s+)?(the\s+)?\w+(\s+button)?$/,
      /^press\s+\w+$/,
      /^scroll\s+(up|down|to)/,
    ];
    
    return patterns.some(pattern => pattern.test(task));
  }

  /**
   * Check if task is form filling
   */
  private isFormFilling(task: string): boolean {
    const keywords = ['fill', 'form', 'input', 'enter', 'type', 'submit', 'register', 'sign up'];
    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check if task is data extraction
   */
  private isDataExtraction(task: string): boolean {
    const keywords = ['extract', 'scrape', 'get', 'find', 'collect', 'gather', 'list', 'data'];
    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check if task is multi-step
   */
  private isMultiStep(task: string): boolean {
    const indicators = [
      'and then',
      'after that',
      'multiple',
      'several',
      'steps',
      'process',
      'workflow',
    ];
    return indicators.some(indicator => task.includes(indicator)) ||
           task.split(/[,;]/).length > 2; // Multiple comma/semicolon separated instructions
  }

  /**
   * Map available models to capability tiers
   */
  private mapModelsToTiers(models: string[]): Record<string, string> {
    const tiers: Record<string, string> = {};
    
    // This mapping would be customized based on actual model names and capabilities
    models.forEach(model => {
      const modelLower = model.toLowerCase();
      
      if (modelLower.includes('gpt-4') || modelLower.includes('claude-3')) {
        tiers.advanced = model;
      } else if (modelLower.includes('gpt-3.5') || modelLower.includes('claude-2')) {
        tiers.standard = model;
      } else if (modelLower.includes('gpt-3') || modelLower.includes('claude-instant')) {
        tiers.light = model;
      }
    });

    // Fallback to first available model if no mapping found
    if (Object.keys(tiers).length === 0 && models.length > 0) {
      tiers.standard = models[0];
    }

    return tiers;
  }

  /**
   * Get recommended agent configuration
   */
  getAgentConfiguration(
    complexity: TaskComplexity
  ): {
    maxSteps: number;
    planningInterval: number;
    validateOutput: boolean;
    useVision: boolean;
  } {
    switch (complexity.type) {
      case 'navigation':
        return {
          maxSteps: 10,
          planningInterval: 0, // No planning needed
          validateOutput: false,
          useVision: false,
        };
        
      case 'form_filling':
        return {
          maxSteps: 30,
          planningInterval: 10,
          validateOutput: true,
          useVision: false,
        };
        
      case 'data_extraction':
        return {
          maxSteps: 50,
          planningInterval: 5,
          validateOutput: true,
          useVision: false,
        };
        
      case 'multi_step':
      default:
        return {
          maxSteps: 100,
          planningInterval: 3,
          validateOutput: true,
          useVision: false,
        };
    }
  }

  /**
   * Estimate token usage for task
   */
  estimateTokenUsage(complexity: TaskComplexity): {
    navigator: number;
    planner: number;
    validator: number;
    total: number;
  } {
    const baseTokens = {
      navigator: 500,
      planner: 300,
      validator: 200,
    };

    const multipliers = {
      navigation: 1,
      form_filling: 3,
      data_extraction: 5,
      multi_step: 10,
      unknown: 5,
    };

    const multiplier = multipliers[complexity.type];

    return {
      navigator: baseTokens.navigator * multiplier * complexity.estimatedSteps,
      planner: complexity.requiresPlanning ? baseTokens.planner * multiplier * Math.ceil(complexity.estimatedSteps / 3) : 0,
      validator: complexity.requiresValidation ? baseTokens.validator * multiplier : 0,
      total: 0, // Will be calculated
    };
  }

  /**
   * Get model recommendations as string
   */
  getModelRecommendations(task: string, availableModels: string[]): string {
    const complexity = this.analyzeTaskComplexity(task);
    const selection = this.selectModels(complexity, availableModels);
    const config = this.getAgentConfiguration(complexity);
    const tokens = this.estimateTokenUsage(complexity);
    
    tokens.total = tokens.navigator + tokens.planner + tokens.validator;

    return `
Task Analysis:
- Type: ${complexity.type}
- Estimated Steps: ${complexity.estimatedSteps}
- Requires Planning: ${complexity.requiresPlanning}
- Requires Validation: ${complexity.requiresValidation}

Model Selection:
- Navigator: ${selection.navigatorModel}
- Planner: ${selection.plannerModel}
- Validator: ${selection.validatorModel}
- Extractor: ${selection.extractorModel}
- Reason: ${selection.reason}

Configuration:
- Max Steps: ${config.maxSteps}
- Planning Interval: ${config.planningInterval}
- Validate Output: ${config.validateOutput}

Estimated Token Usage:
- Navigator: ~${tokens.navigator.toLocaleString()} tokens
- Planner: ~${tokens.planner.toLocaleString()} tokens
- Validator: ~${tokens.validator.toLocaleString()} tokens
- Total: ~${tokens.total.toLocaleString()} tokens
    `.trim();
  }
}