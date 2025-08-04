import { createLogger } from '../../log';
import type { DOMElementNode } from '../dom/views';

const logger = createLogger('TaskMemory');

export interface FormFieldMemory {
  fieldName: string;
  fieldValue: string;
  fieldType: string;
  selector: string;
  timestamp: number;
}

export interface ElementPattern {
  selector: string;
  action: string;
  success: boolean;
  context: string;
  frequency: number;
}

export interface TaskMemory {
  taskId: string;
  userIntent: string;
  currentGoal: string;
  startTime: number;
  lastUpdate: number;
  
  // Form context preservation
  filledFields: Map<string, FormFieldMemory>;
  formProgress: {
    currentStep: number;
    totalSteps: number;
    completedFields: string[];
  };
  
  // Element learning
  successfulElements: ElementPattern[];
  failedSelectors: string[];
  
  // Navigation context
  visitedUrls: string[];
  navigationPath: string[];
  currentDomain: string;
  
  // Workflow state
  completedActions: string[];
  currentAction: string;
  workflowStep: number;
}

export enum NavigationType {
  SAME_PAGE = 'same_page',           // SPA navigation, hash changes
  RELATED_WORKFLOW = 'related',      // Multi-step forms, same domain
  NEW_SUBTASK = 'subtask',          // Different page but same task
  CONTEXT_BREAK = 'break'           // Different domain/task
}

/**
 * Unified Task Memory Manager
 * Preserves context across navigation events
 */
export class TaskMemoryManager {
  private memoryStore = new Map<string, TaskMemory>();
  private readonly maxMemoryAge = 1800000; // 30 minutes
  private readonly maxStoredTasks = 10;

  constructor() {
    // Cleanup old memories every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Create or get task memory
   */
  getOrCreateMemory(taskId: string, userIntent: string): TaskMemory {
    let memory = this.memoryStore.get(taskId);
    
    if (!memory) {
      memory = {
        taskId,
        userIntent,
        currentGoal: userIntent,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        filledFields: new Map(),
        formProgress: {
          currentStep: 1,
          totalSteps: 1,
          completedFields: []
        },
        successfulElements: [],
        failedSelectors: [],
        visitedUrls: [],
        navigationPath: [],
        currentDomain: '',
        completedActions: [],
        currentAction: '',
        workflowStep: 1
      };
      
      this.memoryStore.set(taskId, memory);
      logger.info(`Created task memory for: ${taskId}`);
    }
    
    memory.lastUpdate = Date.now();
    return memory;
  }

  /**
   * Update form field memory
   */
  rememberFormField(taskId: string, field: FormFieldMemory): void {
    const memory = this.memoryStore.get(taskId);
    if (!memory) return;

    memory.filledFields.set(field.fieldName, field);
    memory.formProgress.completedFields.push(field.fieldName);
    memory.lastUpdate = Date.now();
    
    logger.debug(`Remembered form field: ${field.fieldName} = ${field.fieldValue}`);
  }

  /**
   * Remember successful element interaction
   */
  rememberSuccessfulElement(taskId: string, element: DOMElementNode, action: string, context: string): void {
    const memory = this.memoryStore.get(taskId);
    if (!memory) return;

    // Find existing pattern or create new one
    const existingPattern = memory.successfulElements.find(
      p => p.selector === element.xpath && p.action === action
    );

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.context = context; // Update context
    } else {
      memory.successfulElements.push({
        selector: element.xpath,
        action,
        success: true,
        context,
        frequency: 1
      });
    }

    memory.lastUpdate = Date.now();
    logger.debug(`Remembered successful ${action} on ${element.tagName}`);
  }

  /**
   * Remember failed selector
   */
  rememberFailedSelector(taskId: string, selector: string): void {
    const memory = this.memoryStore.get(taskId);
    if (!memory) return;

    if (!memory.failedSelectors.includes(selector)) {
      memory.failedSelectors.push(selector);
      memory.lastUpdate = Date.now();
      logger.debug(`Remembered failed selector: ${selector}`);
    }
  }

  /**
   * Analyze navigation type
   */
  analyzeNavigation(oldUrl: string, newUrl: string, taskId?: string): NavigationType {
    if (!oldUrl || !newUrl) return NavigationType.CONTEXT_BREAK;

    const oldUrlObj = new URL(oldUrl);
    const newUrlObj = new URL(newUrl);

    // Same page navigation (SPA, hash changes)
    if (oldUrlObj.origin === newUrlObj.origin && 
        oldUrlObj.pathname === newUrlObj.pathname) {
      return NavigationType.SAME_PAGE;
    }

    // Same domain navigation
    if (oldUrlObj.hostname === newUrlObj.hostname) {
      // Check if it's a workflow continuation
      if (this.isWorkflowContinuation(oldUrl, newUrl, taskId)) {
        return NavigationType.RELATED_WORKFLOW;
      }
      return NavigationType.NEW_SUBTASK;
    }

    // Different domain
    return NavigationType.CONTEXT_BREAK;
  }

  /**
   * Check if navigation is workflow continuation
   */
  private isWorkflowContinuation(oldUrl: string, newUrl: string, taskId?: string): boolean {
    if (!taskId) return false;

    const memory = this.memoryStore.get(taskId);
    if (!memory) return false;

    // Check for common workflow patterns
    const workflowPatterns = [
      /\/step-?\d+/,           // /step1, /step-2
      /\/page-?\d+/,           // /page1, /page-2  
      /checkout|payment|review/, // E-commerce flows
      /register|signup|profile/, // Registration flows
      /apply|application/,       // Application flows
    ];

    return workflowPatterns.some(pattern => 
      pattern.test(oldUrl) || pattern.test(newUrl)
    );
  }

  /**
   * Preserve context during navigation
   */
  preserveContextForNavigation(taskId: string, oldUrl: string, newUrl: string): void {
    const memory = this.memoryStore.get(taskId);
    if (!memory) return;

    const navigationType = this.analyzeNavigation(oldUrl, newUrl, taskId);
    
    // Always update navigation history
    memory.visitedUrls.push(newUrl);
    memory.navigationPath.push(`${oldUrl} → ${newUrl}`);
    memory.currentDomain = new URL(newUrl).hostname;
    memory.lastUpdate = Date.now();

    logger.info(`Navigation detected: ${navigationType} (${oldUrl} → ${newUrl})`);

    // Navigation-specific preservation logic
    switch (navigationType) {
      case NavigationType.SAME_PAGE:
        // Preserve everything - just SPA navigation
        logger.debug('Same page navigation - preserving all context');
        break;

      case NavigationType.RELATED_WORKFLOW:
        // Preserve form data and workflow state
        memory.workflowStep++;
        logger.debug('Workflow navigation - preserving forms and workflow state');
        break;

      case NavigationType.NEW_SUBTASK:
        // Keep element patterns but reset form progress
        memory.formProgress.currentStep++;
        logger.debug('Subtask navigation - preserving element patterns');
        break;

      case NavigationType.CONTEXT_BREAK:
        // Minimal preservation - only keep basic task info
        this.minimizeContextForNewDomain(memory);
        logger.debug('Context break navigation - minimal preservation');
        break;
    }
  }

  /**
   * Minimize context for domain changes
   */
  private minimizeContextForNewDomain(memory: TaskMemory): void {
    // Keep only essential context
    const essentialElements = memory.successfulElements.filter(el => el.frequency >= 3);
    memory.successfulElements = essentialElements;
    
    // Clear form data (not relevant across domains)
    memory.filledFields.clear();
    memory.formProgress.completedFields = [];
    
    // Keep failed selectors (useful to avoid same mistakes)
    // memory.failedSelectors remains unchanged
  }

  /**
   * Get preserved form data for restoration
   */
  getFormData(taskId: string): Map<string, FormFieldMemory> {
    const memory = this.memoryStore.get(taskId);
    return memory?.filledFields || new Map();
  }

  /**
   * Get successful element patterns
   */
  getElementPatterns(taskId: string): ElementPattern[] {
    const memory = this.memoryStore.get(taskId);
    return memory?.successfulElements || [];
  }

  /**
   * Check if selector should be avoided
   */
  isFailedSelector(taskId: string, selector: string): boolean {
    const memory = this.memoryStore.get(taskId);
    return memory?.failedSelectors.includes(selector) || false;
  }

  /**
   * Get task memory stats
   */
  getMemoryStats(taskId: string): any {
    const memory = this.memoryStore.get(taskId);
    if (!memory) return null;

    return {
      taskId: memory.taskId,
      userIntent: memory.userIntent,
      age: Date.now() - memory.startTime,
      formsRemembered: memory.filledFields.size,
      successfulPatterns: memory.successfulElements.length,
      failedSelectors: memory.failedSelectors.length,
      pagesVisited: memory.visitedUrls.length,
      workflowStep: memory.workflowStep
    };
  }

  /**
   * Clear task memory
   */
  clearMemory(taskId: string): void {
    if (this.memoryStore.delete(taskId)) {
      logger.info(`Cleared task memory: ${taskId}`);
    }
  }

  /**
   * Cleanup old memories
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, memory] of this.memoryStore) {
      if (now - memory.lastUpdate > this.maxMemoryAge) {
        this.memoryStore.delete(taskId);
        cleanedCount++;
      }
    }

    // Limit total stored tasks
    if (this.memoryStore.size > this.maxStoredTasks) {
      const sortedByAge = Array.from(this.memoryStore.entries())
        .sort(([,a], [,b]) => a.lastUpdate - b.lastUpdate);
      
      const toRemove = sortedByAge.slice(0, this.memoryStore.size - this.maxStoredTasks);
      toRemove.forEach(([taskId]) => {
        this.memoryStore.delete(taskId);
        cleanedCount++;
      });
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} old task memories`);
    }
  }

  /**
   * Get all stored task IDs
   */
  getStoredTasks(): string[] {
    return Array.from(this.memoryStore.keys());
  }
}

// Global instance
export const taskMemoryManager = new TaskMemoryManager();