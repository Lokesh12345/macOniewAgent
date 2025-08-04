import type { SimpleWorkflow, WorkflowStep, WorkflowCondition, RetryStrategy } from './types';
import { workflowSystem } from './index';
import { createLogger } from '../../log';

const logger = createLogger('WorkflowBuilder');

/**
 * Visual Workflow Builder
 * Provides a programmatic interface for building workflows step by step
 */
export class WorkflowBuilder {
  private workflow: Partial<SimpleWorkflow> = {};
  private steps: WorkflowStep[] = [];
  private conditions: WorkflowCondition[] = [];

  constructor(name?: string, description?: string) {
    this.workflow = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name || 'Untitled Workflow',
      description: description || 'A workflow created with the visual builder',
      version: '1.0.0',
      steps: [],
      conditions: [],
      retryLogic: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
        retryOn: 'error'
      },
      config: {
        parallel: false,
        stopOnError: true,
        timeout: 300000
      },
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        author: 'builder',
        tags: [],
        category: 'custom'
      }
    };
  }

  /**
   * Set workflow metadata
   */
  setMetadata(metadata: Partial<SimpleWorkflow['metadata']>): WorkflowBuilder {
    this.workflow.metadata = { ...this.workflow.metadata!, ...metadata };
    return this;
  }

  /**
   * Set workflow configuration
   */
  setConfig(config: Partial<SimpleWorkflow['config']>): WorkflowBuilder {
    this.workflow.config = { ...this.workflow.config!, ...config };
    return this;
  }

  /**
   * Set retry strategy
   */
  setRetryLogic(retryLogic: Partial<RetryStrategy>): WorkflowBuilder {
    this.workflow.retryLogic = { ...this.workflow.retryLogic!, ...retryLogic };
    return this;
  }

  /**
   * Add a navigation step
   */
  navigate(url: string, options: {
    id?: string;
    name?: string;
    description?: string;
    timeout?: number;
    continueOnError?: boolean;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `navigate_${this.steps.length + 1}`,
      type: 'action',
      name: options.name || 'Navigate',
      description: options.description || `Navigate to ${url}`,
      config: {
        actionType: 'navigate',
        actionData: { url }
      },
      enabled: true,
      continueOnError: options.continueOnError || false,
      timeout: options.timeout
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a click step
   */
  click(selector: string, options: {
    id?: string;
    name?: string;
    description?: string;
    index?: number;
    xpath?: string;
    text?: string;
    continueOnError?: boolean;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `click_${this.steps.length + 1}`,
      type: 'action',
      name: options.name || 'Click Element',
      description: options.description || `Click element: ${selector}`,
      config: {
        actionType: 'click',
        actionData: {
          selector,
          index: options.index,
          xpath: options.xpath,
          text: options.text
        }
      },
      enabled: true,
      continueOnError: options.continueOnError || false
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add an input step
   */
  input(selector: string, text: string, options: {
    id?: string;
    name?: string;
    description?: string;
    index?: number;
    clear?: boolean;
    continueOnError?: boolean;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `input_${this.steps.length + 1}`,
      type: 'action',
      name: options.name || 'Input Text',
      description: options.description || `Input text into: ${selector}`,
      config: {
        actionType: 'input',
        actionData: {
          selector,
          text,
          index: options.index,
          clear: options.clear
        }
      },
      enabled: true,
      continueOnError: options.continueOnError || false
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a wait step
   */
  wait(type: 'time' | 'element' | 'condition' | 'network', options: {
    id?: string;
    name?: string;
    description?: string;
    duration?: number;
    selector?: string;
    condition?: string;
    timeout?: number;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `wait_${this.steps.length + 1}`,
      type: 'wait',
      name: options.name || 'Wait',
      description: options.description || `Wait for ${type}`,
      config: {
        waitType: type,
        duration: options.duration,
        selector: options.selector,
        condition: options.condition,
        timeout: options.timeout
      },
      enabled: true,
      continueOnError: false
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a variable step
   */
  setVariable(name: string, value: any, options: {
    id?: string;
    description?: string;
    scope?: 'workflow' | 'global' | 'session';
    expression?: string;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `var_${this.steps.length + 1}`,
      type: 'variable',
      name: `Set Variable: ${name}`,
      description: options.description || `Set variable ${name} = ${value}`,
      config: {
        operation: 'set',
        variableName: name,
        value: value,
        expression: options.expression,
        scope: options.scope || 'workflow'
      },
      enabled: true,
      continueOnError: false
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a condition step
   */
  condition(condition: string, operator: string, value: any, options: {
    id?: string;
    name?: string;
    description?: string;
    thenStep?: string;
    elseStep?: string;
    field?: string;
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `condition_${this.steps.length + 1}`,
      type: 'condition',
      name: options.name || 'Check Condition',
      description: options.description || `Check if ${condition} ${operator} ${value}`,
      config: {
        condition,
        operator,
        value,
        field: options.field,
        thenStep: options.thenStep,
        elseStep: options.elseStep
      },
      enabled: true,
      continueOnError: false
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a loop step
   */
  loop(type: 'count' | 'while' | 'foreach', options: {
    id?: string;
    name?: string;
    description?: string;
    count?: number;
    condition?: string;
    items?: any[];
    maxIterations?: number;
    loopSteps?: string[];
  } = {}): WorkflowBuilder {
    const step: WorkflowStep = {
      id: options.id || `loop_${this.steps.length + 1}`,
      type: 'loop',
      name: options.name || 'Loop',
      description: options.description || `Loop ${type}`,
      config: {
        loopType: type,
        count: options.count,
        condition: options.condition,
        items: options.items,
        maxIterations: options.maxIterations || 100,
        loopSteps: options.loopSteps || []
      },
      enabled: true,
      continueOnError: true
    };

    this.steps.push(step);
    return this;
  }

  /**
   * Add a workflow-level condition
   */
  addCondition(condition: WorkflowCondition): WorkflowBuilder {
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add a simple workflow condition
   */
  addSimpleCondition(
    ifCondition: string,
    thenStep: string,
    elseStep?: string,
    priority: number = 1
  ): WorkflowBuilder {
    const condition: WorkflowCondition = {
      id: `condition_${this.conditions.length + 1}`,
      if: ifCondition,
      then: thenStep,
      else: elseStep,
      priority
    };

    this.conditions.push(condition);
    return this;
  }

  /**
   * Remove a step by ID
   */
  removeStep(stepId: string): WorkflowBuilder {
    this.steps = this.steps.filter(step => step.id !== stepId);
    return this;
  }

  /**
   * Update a step
   */
  updateStep(stepId: string, updates: Partial<WorkflowStep>): WorkflowBuilder {
    const stepIndex = this.steps.findIndex(step => step.id === stepId);
    if (stepIndex >= 0) {
      this.steps[stepIndex] = { ...this.steps[stepIndex], ...updates };
    }
    return this;
  }

  /**
   * Get all steps
   */
  getSteps(): WorkflowStep[] {
    return [...this.steps];
  }

  /**
   * Get workflow preview
   */
  preview(): Partial<SimpleWorkflow> {
    return {
      ...this.workflow,
      steps: [...this.steps],
      conditions: [...this.conditions]
    };
  }

  /**
   * Validate the workflow
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!this.workflow.name || this.workflow.name.trim() === '') {
      errors.push('Workflow name is required');
    }

    if (this.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Validate step references in conditions
    const stepIds = new Set(this.steps.map(step => step.id));
    
    this.conditions.forEach((condition, index) => {
      if (condition.then && !stepIds.has(condition.then)) {
        errors.push(`Condition ${index + 1}: Referenced step '${condition.then}' does not exist`);
      }
      if (condition.else && !stepIds.has(condition.else)) {
        errors.push(`Condition ${index + 1}: Referenced step '${condition.else}' does not exist`);
      }
    });

    // Validate loop step references
    this.steps.forEach((step, index) => {
      if (step.type === 'loop') {
        const loopSteps = (step.config as any).loopSteps || [];
        loopSteps.forEach((loopStepId: string) => {
          if (!stepIds.has(loopStepId)) {
            errors.push(`Step ${index + 1}: Loop references non-existent step '${loopStepId}'`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Build and create the workflow
   */
  build(): SimpleWorkflow {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    const workflow: SimpleWorkflow = {
      ...this.workflow,
      steps: [...this.steps],
      conditions: [...this.conditions]
    } as SimpleWorkflow;

    // Update timestamp
    workflow.metadata!.updated = Date.now();

    // Register with workflow system
    workflowSystem.createCustomWorkflow(workflow);

    logger.info(`Built workflow: ${workflow.name}`, { 
      workflowId: workflow.id, 
      steps: workflow.steps.length, 
      conditions: workflow.conditions.length 
    });

    return workflow;
  }

  /**
   * Quick execute the built workflow
   */
  async execute(initialVariables?: Record<string, any>): Promise<any> {
    const workflow = this.build();
    return await workflowSystem.executeWorkflow(workflow.id, initialVariables);
  }

  /**
   * Create a copy of this builder
   */
  clone(): WorkflowBuilder {
    const builder = new WorkflowBuilder();
    builder.workflow = JSON.parse(JSON.stringify(this.workflow));
    builder.steps = JSON.parse(JSON.stringify(this.steps));
    builder.conditions = JSON.parse(JSON.stringify(this.conditions));
    
    // Generate new ID for the clone
    builder.workflow.id = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return builder;
  }
}

/**
 * Factory function to create a new workflow builder
 */
export function createWorkflow(name?: string, description?: string): WorkflowBuilder {
  return new WorkflowBuilder(name, description);
}

/**
 * Quick builder functions for common workflows
 */
export const workflowTemplates = {
  /**
   * Quick login workflow builder
   */
  login(loginUrl: string, usernameSelector: string, passwordSelector: string, submitSelector: string) {
    return createWorkflow('Quick Login', 'Login workflow created with quick builder')
      .navigate(loginUrl)
      .wait('network', { timeout: 10000 })
      .input(usernameSelector, '{{username}}')
      .input(passwordSelector, '{{password}}')
      .click(submitSelector)
      .wait('time', { duration: 3000 });
  },

  /**
   * Quick form filler workflow builder
   */
  formFiller(formUrl: string, formData: Record<string, string>) {
    let builder = createWorkflow('Quick Form Filler', 'Form filling workflow created with quick builder')
      .navigate(formUrl)
      .wait('element', { selector: 'form', timeout: 10000 });

    // Add input steps for each form field
    Object.entries(formData).forEach(([selector, value]) => {
      builder = builder.input(selector, value);
    });

    return builder;
  },

  /**
   * Quick data extractor workflow builder
   */
  dataExtractor(targetUrl: string, selectors: Record<string, string>) {
    let builder = createWorkflow('Quick Data Extractor', 'Data extraction workflow created with quick builder')
      .navigate(targetUrl)
      .wait('network', { timeout: 10000 })
      .setVariable('extractedData', {}, { scope: 'workflow' });

    // Add extraction logic for each selector
    Object.entries(selectors).forEach(([fieldName, selector]) => {
      builder = builder
        .wait('element', { selector, timeout: 5000 })
        .setVariable(`extracted_${fieldName}`, `document.querySelector('${selector}').textContent`, { 
          scope: 'workflow',
          expression: `document.querySelector('${selector}').textContent`
        });
    });

    return builder;
  }
};

// Console helpers for easy access
(globalThis as any).createWorkflow = createWorkflow;
(globalThis as any).workflowTemplates = workflowTemplates;

// Usage examples (accessible from browser console):
// const workflow = createWorkflow('My Workflow', 'Description')
//   .navigate('https://example.com')
//   .wait('network')
//   .click('.login-button')
//   .input('#username', 'user@example.com')
//   .input('#password', 'password123')
//   .click('#submit')
//   .build();
//
// const loginWorkflow = workflowTemplates.login(
//   'https://example.com/login',
//   '#username',
//   '#password', 
//   '#login-btn'
// ).build();