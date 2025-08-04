import { WorkflowEngine } from './engine';
import { WorkflowTemplates } from './templates';
import type { AgentContext } from '../types';
import type { SimpleWorkflow, WorkflowTemplate, WorkflowExecution } from './types';
import { createLogger } from '../../log';

const logger = createLogger('WorkflowSystem');

/**
 * Central Workflow System Manager
 * Coordinates workflow creation, execution, and management
 */
export class WorkflowSystem {
  private engine: WorkflowEngine | null = null;
  private workflows = new Map<string, SimpleWorkflow>();
  private initialized = false;

  /**
   * Initialize the workflow system
   */
  initialize(context: AgentContext): void {
    if (this.initialized) {
      return;
    }

    this.engine = new WorkflowEngine(context, {
      maxConcurrentExecutions: 3,
      defaultTimeout: 300000,
      enableMetrics: true
    });

    this.initialized = true;
    logger.info('Workflow system initialized');
  }

  /**
   * Get all available workflow templates
   */
  getAvailableTemplates(): WorkflowTemplate[] {
    return WorkflowTemplates.getAllTemplates();
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return WorkflowTemplates.getTemplatesByCategory(category);
  }

  /**
   * Create workflow from template
   */
  createWorkflowFromTemplate(templateId: string, parameters: Record<string, any>): SimpleWorkflow {
    const template = WorkflowTemplates.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const workflow = WorkflowTemplates.createWorkflowFromTemplate(template, parameters);
    this.workflows.set(workflow.id, workflow);
    
    logger.info(`Created workflow from template: ${templateId}`, { workflowId: workflow.id });
    return workflow;
  }

  /**
   * Create custom workflow
   */
  createCustomWorkflow(workflow: SimpleWorkflow): void {
    this.workflows.set(workflow.id, workflow);
    logger.info(`Created custom workflow: ${workflow.name}`, { workflowId: workflow.id });
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(workflowId: string, initialVariables?: Record<string, any>): Promise<WorkflowExecution> {
    if (!this.engine) {
      throw new Error('Workflow system not initialized');
    }

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    logger.info(`Executing workflow: ${workflow.name}`, { workflowId, initialVariables });
    return await this.engine.executeWorkflow(workflow, initialVariables);
  }

  /**
   * Get workflow execution status
   */
  getExecution(executionId: string): WorkflowExecution | null {
    if (!this.engine) {
      return null;
    }
    return this.engine.getExecution(executionId);
  }

  /**
   * Cancel workflow execution
   */
  cancelExecution(executionId: string): boolean {
    if (!this.engine) {
      return false;
    }
    return this.engine.cancelExecution(executionId);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): SimpleWorkflow | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): SimpleWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Delete workflow
   */
  deleteWorkflow(workflowId: string): boolean {
    return this.workflows.delete(workflowId);
  }

  /**
   * Get execution statistics
   */
  getStats() {
    if (!this.engine) {
      return {
        totalExecutions: 0,
        activeExecutions: 0,
        completedExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0
      };
    }
    return this.engine.getStats();
  }

  /**
   * Add event handler for workflow events
   */
  addEventListener(handler: (event: any) => void): () => void {
    if (!this.engine) {
      throw new Error('Workflow system not initialized');
    }
    return this.engine.addEventListener(handler);
  }

  /**
   * Clean up old executions
   */
  cleanup(olderThanMs: number = 3600000): number {
    if (!this.engine) {
      return 0;
    }
    return this.engine.cleanup(olderThanMs);
  }

  /**
   * Destroy the workflow system
   */
  destroy(): void {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this.workflows.clear();
    this.initialized = false;
    logger.info('Workflow system destroyed');
  }
}

// Export singleton instance
export const workflowSystem = new WorkflowSystem();

// Export all types and classes
export * from './types';
export * from './engine';
export * from './templates';
export * from './builder';
export * from './demo';