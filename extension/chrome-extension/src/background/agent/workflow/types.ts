import type { ActionResult } from '../types';

export interface WorkflowStep {
  id: string;
  type: 'action' | 'condition' | 'loop' | 'wait' | 'variable' | 'custom';
  name: string;
  description?: string;
  config: Record<string, any>;
  enabled: boolean;
  continueOnError: boolean;
  timeout?: number;
  retries?: number;
  tags?: string[];
}

export interface ActionStep extends WorkflowStep {
  type: 'action';
  config: {
    actionType: 'click' | 'input' | 'navigate' | 'scroll' | 'wait' | 'extract' | 'custom';
    actionData: Record<string, any>;
    selector?: string;
    text?: string;
    url?: string;
    waitTime?: number;
    extractField?: string;
    customScript?: string;
  };
}

export interface ConditionStep extends WorkflowStep {
  type: 'condition';
  config: {
    condition: string; // Simple condition expression
    operator: 'equals' | 'contains' | 'exists' | 'greater_than' | 'less_than' | 'matches_regex';
    value: any;
    field?: string; // Field to check from previous step
    thenStep?: string; // Step ID to go to if true
    elseStep?: string; // Step ID to go to if false
  };
}

export interface LoopStep extends WorkflowStep {
  type: 'loop';
  config: {
    loopType: 'count' | 'while' | 'foreach';
    count?: number;
    condition?: string;
    items?: any[];
    maxIterations?: number;
    loopSteps: string[]; // Step IDs to execute in loop
  };
}

export interface VariableStep extends WorkflowStep {
  type: 'variable';
  config: {
    operation: 'set' | 'get' | 'increment' | 'append' | 'clear';
    variableName: string;
    value?: any;
    expression?: string; // For dynamic values
    scope: 'workflow' | 'global' | 'session';
  };
}

export interface WaitStep extends WorkflowStep {
  type: 'wait';
  config: {
    waitType: 'time' | 'element' | 'condition' | 'network';
    duration?: number; // milliseconds
    selector?: string; // Element to wait for
    condition?: string; // Condition to wait for
    timeout?: number;
  };
}

export interface RetryStrategy {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  retryOn: 'error' | 'failure' | 'timeout' | 'any';
  stopOn?: string[]; // Error types to not retry
}

export interface WorkflowCondition {
  id: string;
  if: string; // Condition expression
  then: string; // Step ID or action
  else?: string; // Step ID or action (optional)
  priority: number;
}

export interface WorkflowVariable {
  name: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  scope: 'workflow' | 'global' | 'session';
  persistent: boolean;
}

export interface WorkflowContext {
  variables: Map<string, WorkflowVariable>;
  stepResults: Map<string, ActionResult>;
  currentStep: number;
  executionPath: string[];
  startTime: number;
  errors: WorkflowError[];
  metadata: Record<string, any>;
}

export interface WorkflowError {
  stepId: string;
  stepName: string;
  error: string;
  timestamp: number;
  retryAttempt: number;
  recoverable: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  startTime: number;
  endTime?: number;
  context: WorkflowContext;
  currentStepId?: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  result?: {
    success: boolean;
    data?: any;
    error?: string;
  };
}

export interface SimpleWorkflow {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  conditions: WorkflowCondition[];
  retryLogic: RetryStrategy;
  config: {
    parallel: boolean;
    stopOnError: boolean;
    timeout: number;
    maxExecutions?: number;
    schedule?: {
      enabled: boolean;
      cron?: string;
      interval?: number;
    };
  };
  metadata: {
    created: number;
    updated: number;
    author: string;
    tags: string[];
    category: string;
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: Omit<SimpleWorkflow, 'id' | 'metadata'>;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: any;
  }>;
}

export interface WorkflowStats {
  totalWorkflows: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  activeExecutions: number;
  popularWorkflows: Array<{
    id: string;
    name: string;
    executions: number;
    successRate: number;
  }>;
}

export interface WorkflowEvent {
  type: 'workflow.started' | 'workflow.completed' | 'workflow.failed' | 'workflow.paused' | 
        'step.started' | 'step.completed' | 'step.failed' | 'step.skipped' |
        'condition.evaluated' | 'variable.changed' | 'error.recovered';
  workflowId: string;
  executionId: string;
  stepId?: string;
  timestamp: number;
  data?: any;
}

export type WorkflowEventHandler = (event: WorkflowEvent) => void;

export interface WorkflowBuilderConfig {
  canvas: {
    grid: boolean;
    snap: boolean;
    zoom: number;
  };
  validation: {
    realTime: boolean;
    strict: boolean;
  };
  execution: {
    debugMode: boolean;
    stepByStep: boolean;
    pauseOnError: boolean;
  };
}