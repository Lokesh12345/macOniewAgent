import { createLogger } from '../../log';
import type { AgentContext, ActionResult } from '../types';
import type { 
  SimpleWorkflow, 
  WorkflowStep, 
  WorkflowExecution, 
  WorkflowContext, 
  WorkflowError,
  WorkflowEvent,
  WorkflowEventHandler,
  ActionStep,
  ConditionStep,
  LoopStep,
  VariableStep,
  WaitStep,
  RetryStrategy
} from './types';
import { ActionBuilder } from '../actions/builder';
import { IntelligentWaiting } from '../actions/intelligentWaiting';
import { performanceMonitoring } from '../../browser/monitoring';

const logger = createLogger('WorkflowEngine');

/**
 * Workflow Engine Foundation
 * Executes workflows with minimal token usage through pre-defined logic
 */
export class WorkflowEngine {
  private executions = new Map<string, WorkflowExecution>();
  private eventHandlers = new Set<WorkflowEventHandler>();
  private actionBuilder: ActionBuilder;
  
  constructor(
    private context: AgentContext,
    private options: {
      maxConcurrentExecutions?: number;
      defaultTimeout?: number;
      enableMetrics?: boolean;
    } = {}
  ) {
    this.actionBuilder = new ActionBuilder(context, context.extractorLLM);
    
    // Set defaults
    this.options = {
      maxConcurrentExecutions: 5,
      defaultTimeout: 300000, // 5 minutes
      enableMetrics: true,
      ...options
    };

    logger.debug('Workflow engine initialized', this.options);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflow: SimpleWorkflow, initialVariables?: Record<string, any>): Promise<WorkflowExecution> {
    // Check concurrent execution limit
    const activeExecutions = Array.from(this.executions.values())
      .filter(e => e.status === 'running' || e.status === 'pending').length;
    
    if (activeExecutions >= (this.options.maxConcurrentExecutions || 5)) {
      throw new Error('Maximum concurrent executions reached');
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create execution context
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      status: 'pending',
      startTime: Date.now(),
      context: this.createWorkflowContext(initialVariables),
      progress: {
        current: 0,
        total: workflow.steps.length,
        percentage: 0
      }
    };

    this.executions.set(executionId, execution);
    
    // Record metrics
    if (this.options.enableMetrics) {
      performanceMonitoring.recordMetric('workflow.executions.started', 1, 'counter', {
        workflowId: workflow.id,
        workflowName: workflow.name
      });
    }

    // Emit start event
    this.emitEvent({
      type: 'workflow.started',
      workflowId: workflow.id,
      executionId,
      timestamp: Date.now(),
      data: { initialVariables }
    });

    try {
      execution.status = 'running';
      
      // Execute workflow steps
      const result = await this.executeSteps(workflow, execution);
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;
      
      // Record success metrics
      if (this.options.enableMetrics) {
        const duration = execution.endTime - execution.startTime;
        performanceMonitoring.recordMetric('workflow.executions.completed', 1, 'counter', {
          workflowId: workflow.id
        });
        performanceMonitoring.recordMetric('workflow.execution.duration', duration, 'timer', {
          workflowId: workflow.id
        });
      }

      // Emit completion event
      this.emitEvent({
        type: 'workflow.completed',
        workflowId: workflow.id,
        executionId,
        timestamp: Date.now(),
        data: result
      });

      return execution;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      // Record failure metrics
      if (this.options.enableMetrics) {
        performanceMonitoring.recordMetric('workflow.executions.failed', 1, 'counter', {
          workflowId: workflow.id,
          errorType: error instanceof Error ? error.name : 'Unknown'
        });
      }

      // Emit failure event
      this.emitEvent({
        type: 'workflow.failed',
        workflowId: workflow.id,
        executionId,
        timestamp: Date.now(),
        data: { error: execution.result.error }
      });

      throw error;
    }
  }

  /**
   * Execute workflow steps sequentially
   */
  private async executeSteps(workflow: SimpleWorkflow, execution: WorkflowExecution): Promise<{ success: boolean; data?: any; error?: string }> {
    const steps = workflow.steps.filter(step => step.enabled);
    let currentStepIndex = 0;
    
    while (currentStepIndex < steps.length) {
      const step = steps[currentStepIndex];
      execution.currentStepId = step.id;
      
      // Update progress
      execution.progress.current = currentStepIndex + 1;
      execution.progress.percentage = Math.round((currentStepIndex / steps.length) * 100);

      try {
        // Check if execution was cancelled
        if (execution.status === 'cancelled') {
          return { success: false, error: 'Execution was cancelled' };
        }

        // Emit step start event
        this.emitEvent({
          type: 'step.started',
          workflowId: workflow.id,
          executionId: execution.id,
          stepId: step.id,
          timestamp: Date.now(),
          data: { stepName: step.name, stepType: step.type }
        });

        // Execute step with retries
        const stepResult = await this.executeStepWithRetry(step, execution, workflow.retryLogic);
        
        // Store step result
        execution.context.stepResults.set(step.id, stepResult);
        execution.context.executionPath.push(step.id);

        // Check for step failure
        if (stepResult.error && !step.continueOnError) {
          if (workflow.config.stopOnError) {
            throw new Error(`Step '${step.name}' failed: ${stepResult.error}`);
          }
        }

        // Emit step completion event
        this.emitEvent({
          type: 'step.completed',
          workflowId: workflow.id,
          executionId: execution.id,
          stepId: step.id,
          timestamp: Date.now(),
          data: { result: stepResult }
        });

        // Handle conditional logic
        const nextStepIndex = await this.evaluateConditions(workflow, execution, currentStepIndex);
        if (nextStepIndex !== null) {
          currentStepIndex = nextStepIndex;
        } else {
          currentStepIndex++;
        }

      } catch (error) {
        const workflowError: WorkflowError = {
          stepId: step.id,
          stepName: step.name,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          retryAttempt: 0,
          recoverable: step.continueOnError
        };

        execution.context.errors.push(workflowError);

        // Emit step failure event
        this.emitEvent({
          type: 'step.failed',
          workflowId: workflow.id,
          executionId: execution.id,
          stepId: step.id,
          timestamp: Date.now(),
          data: { error: workflowError }
        });

        if (!step.continueOnError) {
          throw error;
        }

        currentStepIndex++;
      }
    }

    // Extract final result
    const finalResult = this.extractFinalResult(execution);
    
    return {
      success: true,
      data: finalResult
    };
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    step: WorkflowStep, 
    execution: WorkflowExecution, 
    retryStrategy: RetryStrategy
  ): Promise<ActionResult> {
    let lastError: Error | null = null;
    let attempt = 0;
    
    while (attempt < retryStrategy.maxAttempts) {
      try {
        return await this.executeStep(step, execution);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt >= retryStrategy.maxAttempts) {
          break;
        }

        // Calculate delay with backoff
        const delay = Math.min(
          retryStrategy.delayMs * Math.pow(retryStrategy.backoffMultiplier, attempt - 1),
          retryStrategy.maxDelayMs
        );

        logger.debug(`Step '${step.name}' failed (attempt ${attempt}), retrying in ${delay}ms`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Step execution failed after all retry attempts');
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, execution: WorkflowExecution): Promise<ActionResult> {
    const startTime = Date.now();
    
    try {
      let result: ActionResult;

      switch (step.type) {
        case 'action':
          result = await this.executeActionStep(step as ActionStep, execution);
          break;
          
        case 'condition':
          result = await this.executeConditionStep(step as ConditionStep, execution);
          break;
          
        case 'loop':
          result = await this.executeLoopStep(step as LoopStep, execution);
          break;
          
        case 'variable':
          result = await this.executeVariableStep(step as VariableStep, execution);
          break;
          
        case 'wait':
          result = await this.executeWaitStep(step as WaitStep, execution);
          break;
          
        default:
          throw new Error(`Unsupported step type: ${step.type}`);
      }

      // Record step timing
      if (this.options.enableMetrics) {
        const duration = Date.now() - startTime;
        performanceMonitoring.recordMetric('workflow.step.duration', duration, 'timer', {
          stepType: step.type,
          stepName: step.name
        });
      }

      return result;

    } catch (error) {
      // Record step failure
      if (this.options.enableMetrics) {
        performanceMonitoring.recordMetric('workflow.step.failed', 1, 'counter', {
          stepType: step.type,
          stepName: step.name
        });
      }

      throw error;
    }
  }

  /**
   * Execute an action step
   */
  private async executeActionStep(step: ActionStep, execution: WorkflowExecution): Promise<ActionResult> {
    const { actionType, actionData } = step.config;
    
    // Build the action based on type
    const actions = this.actionBuilder.buildDefaultActions();
    const action = actions.find(a => a.name() === this.mapActionType(actionType));
    
    if (!action) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    // Substitute variables in action data
    const processedData = this.substituteVariables(actionData, execution.context);
    
    // Execute the action
    return await action.call(processedData);
  }

  /**
   * Execute a condition step
   */
  private async executeConditionStep(step: ConditionStep, execution: WorkflowExecution): Promise<ActionResult> {
    const { condition, operator, value, field } = step.config;
    
    // Evaluate the condition
    const conditionResult = this.evaluateCondition(condition, operator, value, field, execution.context);
    
    // Emit condition evaluation event
    this.emitEvent({
      type: 'condition.evaluated',
      workflowId: execution.workflowId,
      executionId: execution.id,
      stepId: step.id,
      timestamp: Date.now(),
      data: { condition, result: conditionResult }
    });

    return new ActionResult({
      extractedContent: `Condition '${condition}' evaluated to: ${conditionResult}`,
      includeInMemory: false
    });
  }

  /**
   * Execute a loop step
   */
  private async executeLoopStep(step: LoopStep, execution: WorkflowExecution): Promise<ActionResult> {
    const { loopType, count, condition, items, maxIterations } = step.config;
    
    let iterations = 0;
    const maxIters = maxIterations || 100;
    const results: ActionResult[] = [];

    switch (loopType) {
      case 'count':
        for (let i = 0; i < (count || 1) && iterations < maxIters; i++) {
          // Execute loop steps
          iterations++;
        }
        break;
        
      case 'while':
        while (this.evaluateSimpleCondition(condition || 'false', execution.context) && iterations < maxIters) {
          // Execute loop steps
          iterations++;
        }
        break;
        
      case 'foreach':
        const itemsArray = items || [];
        for (const item of itemsArray) {
          if (iterations >= maxIters) break;
          // Set current item as variable
          execution.context.variables.set('currentItem', {
            name: 'currentItem',
            value: item,
            type: typeof item as any,
            scope: 'workflow',
            persistent: false
          });
          iterations++;
        }
        break;
    }

    return new ActionResult({
      extractedContent: `Loop completed ${iterations} iterations`,
      includeInMemory: false
    });
  }

  /**
   * Execute a variable step
   */
  private async executeVariableStep(step: VariableStep, execution: WorkflowExecution): Promise<ActionResult> {
    const { operation, variableName, value, expression, scope } = step.config;
    
    switch (operation) {
      case 'set':
        const finalValue = expression ? this.evaluateExpression(expression, execution.context) : value;
        execution.context.variables.set(variableName, {
          name: variableName,
          value: finalValue,
          type: typeof finalValue as any,
          scope,
          persistent: scope === 'global'
        });
        break;
        
      case 'get':
        const variable = execution.context.variables.get(variableName);
        return new ActionResult({
          extractedContent: variable ? String(variable.value) : '',
          includeInMemory: false
        });
        
      case 'increment':
        const existing = execution.context.variables.get(variableName);
        if (existing && typeof existing.value === 'number') {
          existing.value += 1;
        }
        break;
        
      case 'clear':
        execution.context.variables.delete(variableName);
        break;
    }

    // Emit variable change event
    this.emitEvent({
      type: 'variable.changed',
      workflowId: execution.workflowId,
      executionId: execution.id,
      stepId: step.id,
      timestamp: Date.now(),
      data: { variableName, operation, value }
    });

    return new ActionResult({
      extractedContent: `Variable '${variableName}' ${operation} completed`,
      includeInMemory: false
    });
  }

  /**
   * Execute a wait step
   */
  private async executeWaitStep(step: WaitStep, execution: WorkflowExecution): Promise<ActionResult> {
    const { waitType, duration, selector, condition, timeout } = step.config;
    
    switch (waitType) {
      case 'time':
        await new Promise(resolve => setTimeout(resolve, duration || 1000));
        break;
        
      case 'element':
        if (selector) {
          await IntelligentWaiting.waitFor(this.context.browserContext, {
            preset: 'elementVisible',
            elementSelector: selector,
            maxWait: timeout || 10000
          });
        }
        break;
        
      case 'condition':
        const startTime = Date.now();
        const maxWait = timeout || 10000;
        
        while (Date.now() - startTime < maxWait) {
          if (this.evaluateSimpleCondition(condition || 'true', execution.context)) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        break;
        
      case 'network':
        await IntelligentWaiting.waitFor(this.context.browserContext, {
          preset: 'networkIdle',
          maxWait: timeout || 5000
        });
        break;
    }

    return new ActionResult({
      extractedContent: `Wait (${waitType}) completed`,
      includeInMemory: false
    });
  }

  /**
   * Evaluate workflow conditions to determine next step
   */
  private async evaluateConditions(
    workflow: SimpleWorkflow, 
    execution: WorkflowExecution, 
    currentIndex: number
  ): Promise<number | null> {
    // Check workflow-level conditions
    for (const condition of workflow.conditions) {
      if (this.evaluateSimpleCondition(condition.if, execution.context)) {
        const targetStepId = condition.then;
        const targetIndex = workflow.steps.findIndex(step => step.id === targetStepId);
        
        if (targetIndex >= 0) {
          return targetIndex;
        }
      }
    }

    return null; // Continue with next step
  }

  /**
   * Create workflow execution context
   */
  private createWorkflowContext(initialVariables?: Record<string, any>): WorkflowContext {
    const context: WorkflowContext = {
      variables: new Map(),
      stepResults: new Map(),
      currentStep: 0,
      executionPath: [],
      startTime: Date.now(),
      errors: [],
      metadata: {}
    };

    // Set initial variables
    if (initialVariables) {
      for (const [key, value] of Object.entries(initialVariables)) {
        context.variables.set(key, {
          name: key,
          value,
          type: typeof value as any,
          scope: 'workflow',
          persistent: false
        });
      }
    }

    return context;
  }

  /**
   * Substitute variables in data
   */
  private substituteVariables(data: any, context: WorkflowContext): any {
    if (typeof data === 'string') {
      return data.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const variable = context.variables.get(varName);
        return variable ? String(variable.value) : match;
      });
    }
    
    if (typeof data === 'object' && data !== null) {
      const result: any = Array.isArray(data) ? [] : {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.substituteVariables(value, context);
      }
      return result;
    }
    
    return data;
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateSimpleCondition(condition: string, context: WorkflowContext): boolean {
    // Simple condition evaluation (can be expanded)
    try {
      // Replace variables
      const processedCondition = condition.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const variable = context.variables.get(varName);
        return variable ? JSON.stringify(variable.value) : 'null';
      });
      
      // Basic evaluation (in production, use a safe expression evaluator)
      return new Function('return ' + processedCondition)();
    } catch {
      return false;
    }
  }

  /**
   * Evaluate a condition with operator
   */
  private evaluateCondition(
    condition: string, 
    operator: string, 
    value: any, 
    field: string | undefined, 
    context: WorkflowContext
  ): boolean {
    let leftValue: any;
    
    if (field) {
      const variable = context.variables.get(field);
      leftValue = variable ? variable.value : null;
    } else {
      leftValue = this.evaluateExpression(condition, context);
    }

    switch (operator) {
      case 'equals':
        return leftValue === value;
      case 'contains':
        return String(leftValue).includes(String(value));
      case 'exists':
        return leftValue !== null && leftValue !== undefined;
      case 'greater_than':
        return Number(leftValue) > Number(value);
      case 'less_than':
        return Number(leftValue) < Number(value);
      case 'matches_regex':
        return new RegExp(String(value)).test(String(leftValue));
      default:
        return false;
    }
  }

  /**
   * Evaluate an expression
   */
  private evaluateExpression(expression: string, context: WorkflowContext): any {
    // Simple expression evaluation
    return this.substituteVariables(expression, context);
  }

  /**
   * Map action type to action name
   */
  private mapActionType(actionType: string): string {
    const actionMap: Record<string, string> = {
      'click': 'click_element',
      'input': 'input_text',
      'navigate': 'go_to_url',
      'scroll': 'scroll_to_percent',
      'wait': 'wait',
      'extract': 'cache_content'
    };
    
    return actionMap[actionType] || actionType;
  }

  /**
   * Extract final result from execution
   */
  private extractFinalResult(execution: WorkflowExecution): any {
    const lastResults = Array.from(execution.context.stepResults.values());
    const finalResult = lastResults[lastResults.length - 1];
    
    return {
      stepResults: Object.fromEntries(execution.context.stepResults),
      variables: Object.fromEntries(
        Array.from(execution.context.variables.entries()).map(([key, variable]) => [key, variable.value])
      ),
      executionPath: execution.context.executionPath,
      errors: execution.context.errors,
      finalOutput: finalResult?.extractedContent
    };
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      
      this.emitEvent({
        type: 'workflow.failed',
        workflowId: execution.workflowId,
        executionId,
        timestamp: Date.now(),
        data: { reason: 'cancelled' }
      });
      
      return true;
    }
    return false;
  }

  /**
   * Add event handler
   */
  addEventListener(handler: WorkflowEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: WorkflowEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warning('Event handler error:', error);
      }
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  } {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed');
    const failed = executions.filter(e => e.status === 'failed');
    
    const avgTime = completed.length > 0 
      ? completed.reduce((sum, e) => sum + ((e.endTime || 0) - e.startTime), 0) / completed.length
      : 0;
    
    return {
      totalExecutions: executions.length,
      activeExecutions: executions.filter(e => e.status === 'running').length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      averageExecutionTime: avgTime
    };
  }

  /**
   * Clean up old executions
   */
  cleanup(olderThanMs: number = 3600000): number {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;
    
    for (const [id, execution] of this.executions) {
      if (execution.endTime && execution.endTime < cutoff) {
        this.executions.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Destroy the engine
   */
  destroy(): void {
    this.executions.clear();
    this.eventHandlers.clear();
    logger.debug('Workflow engine destroyed');
  }
}