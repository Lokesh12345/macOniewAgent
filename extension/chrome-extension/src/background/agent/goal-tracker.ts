/**
 * Goal Tracking System
 * Maintains persistent goal state across page transitions and task steps
 */

import type { RewrittenTask } from './task-rewriter';

export interface GoalProgress {
  questionsAnswered: number;
  formsCompleted: number;
  pagesVisited: string[];
  actionsCompleted: string[];
  currentStep: string;
  lastUpdate: number;
}

export interface GoalState {
  task: RewrittenTask;
  progress: GoalProgress;
  isComplete: boolean;
  completionReason?: string;
  startTime: number;
  completionTime?: number;
}

export class GoalTracker {
  private goalState: GoalState | null = null;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Initialize goal tracking with a rewritten task
   */
  initializeGoal(task: RewrittenTask): void {
    this.goalState = {
      task,
      progress: {
        questionsAnswered: 0,
        formsCompleted: 0,
        pagesVisited: [],
        actionsCompleted: [],
        currentStep: 'started',
        lastUpdate: Date.now()
      },
      isComplete: false,
      startTime: Date.now()
    };

    console.log('🎯 GOAL TRACKER: Initialized with task:', task.rewrittenTask);
    console.log('🎯 COMPLETION CRITERIA:', task.completionCriteria);
  }

  /**
   * Record that a question was answered
   */
  recordQuestionAnswered(questionText?: string): boolean {
    if (!this.goalState || this.goalState.isComplete) return false;

    this.goalState.progress.questionsAnswered++;
    this.goalState.progress.currentStep = `Question ${this.goalState.progress.questionsAnswered} answered`;
    this.goalState.progress.lastUpdate = Date.now();

    if (questionText) {
      this.goalState.progress.actionsCompleted.push(`Answered: ${questionText.substring(0, 50)}...`);
    }

    console.log(`🎯 PROGRESS: Question answered (${this.goalState.progress.questionsAnswered}/${this.getTargetQuestions()})`);

    return this.checkCompletion();
  }

  /**
   * Record that a form was completed
   */
  recordFormCompleted(formType?: string): boolean {
    if (!this.goalState || this.goalState.isComplete) return false;

    this.goalState.progress.formsCompleted++;
    this.goalState.progress.currentStep = 'Form completed';
    this.goalState.progress.lastUpdate = Date.now();

    if (formType) {
      this.goalState.progress.actionsCompleted.push(`Form completed: ${formType}`);
    }

    console.log(`🎯 PROGRESS: Form completed (${this.goalState.progress.formsCompleted})`);

    return this.checkCompletion();
  }

  /**
   * Record page navigation
   */
  recordPageVisit(url: string, title?: string): void {
    if (!this.goalState) return;

    const pageInfo = title ? `${title} (${url})` : url;
    this.goalState.progress.pagesVisited.push(pageInfo);
    this.goalState.progress.lastUpdate = Date.now();

    console.log(`🎯 NAVIGATION: Visited ${pageInfo}`);
  }

  /**
   * Record a general action
   */
  recordAction(action: string): void {
    if (!this.goalState) return;

    this.goalState.progress.actionsCompleted.push(action);
    this.goalState.progress.lastUpdate = Date.now();

    console.log(`🎯 ACTION: ${action}`);
  }

  /**
   * Check if goal is complete based on completion criteria
   */
  private checkCompletion(): boolean {
    if (!this.goalState || this.goalState.isComplete) return false;

    const { task, progress } = this.goalState;
    const criteria = task.completionCriteria;

    let isComplete = false;
    let reason = '';

    switch (criteria.type) {
      case 'count':
        if (task.goalType === 'quiz') {
          const targetQuestions = typeof criteria.target === 'number' ? criteria.target : parseInt(criteria.target as string);
          isComplete = progress.questionsAnswered >= targetQuestions;
          reason = isComplete ? `Completed ${targetQuestions} questions as required` : '';
        } else if (task.goalType === 'form') {
          const targetForms = typeof criteria.target === 'number' ? criteria.target : parseInt(criteria.target as string);
          isComplete = progress.formsCompleted >= targetForms;
          reason = isComplete ? `Completed ${targetForms} forms as required` : '';
        }
        break;
        
      case 'condition':
        // For condition-based completion, we'll need more specific logic
        // This can be extended based on specific conditions
        if (criteria.target === 'form_submitted' && progress.formsCompleted > 0) {
          isComplete = true;
          reason = 'Form successfully submitted';
        }
        break;
        
      case 'navigation':
        // Check if we've navigated to the target URL
        if (typeof criteria.target === 'string') {
          isComplete = progress.pagesVisited.some(page => page.includes(criteria.target as string));
          reason = isComplete ? `Navigated to target: ${criteria.target}` : '';
        }
        break;
        
      default:
        // Generic completion check
        isComplete = false;
    }

    if (isComplete) {
      this.goalState.isComplete = true;
      this.goalState.completionReason = reason;
      this.goalState.completionTime = Date.now();
      
      console.log('🎯 GOAL COMPLETED! 🎉');
      console.log(`🎯 REASON: ${reason}`);
      console.log(`🎯 TIME TAKEN: ${((this.goalState.completionTime - this.goalState.startTime) / 1000).toFixed(1)}s`);
    }

    return isComplete;
  }

  /**
   * Get the target number of questions for quiz goals
   */
  private getTargetQuestions(): number {
    if (!this.goalState || this.goalState.task.goalType !== 'quiz') return 0;
    
    const target = this.goalState.task.completionCriteria.target;
    return typeof target === 'number' ? target : parseInt(target as string) || 0;
  }

  /**
   * Get current goal state
   */
  getGoalState(): GoalState | null {
    return this.goalState;
  }

  /**
   * Check if goal is complete
   */
  isGoalComplete(): boolean {
    return this.goalState?.isComplete ?? false;
  }

  /**
   * Get progress summary for display
   */
  getProgressSummary(): string {
    if (!this.goalState) return 'No active goal';

    const { task, progress } = this.goalState;
    
    if (this.goalState.isComplete) {
      return `✅ COMPLETED: ${this.goalState.completionReason}`;
    }

    switch (task.goalType) {
      case 'quiz':
        const targetQ = this.getTargetQuestions();
        return `🎯 Quiz Progress: ${progress.questionsAnswered}/${targetQ} questions answered`;
        
      case 'form':
        return `🎯 Form Progress: ${progress.formsCompleted} forms completed`;
        
      default:
        return `🎯 Progress: ${progress.actionsCompleted.length} actions completed`;
    }
  }

  /**
   * Get detailed progress for debugging
   */
  getDetailedProgress(): object {
    if (!this.goalState) return { status: 'No active goal' };

    return {
      task: this.goalState.task.rewrittenTask,
      goalType: this.goalState.task.goalType,
      completionCriteria: this.goalState.task.completionCriteria,
      progress: this.goalState.progress,
      isComplete: this.goalState.isComplete,
      progressSummary: this.getProgressSummary()
    };
  }

  /**
   * Force complete the goal (for emergency stops)
   */
  forceComplete(reason: string): void {
    if (!this.goalState) return;

    this.goalState.isComplete = true;
    this.goalState.completionReason = `Force completed: ${reason}`;
    this.goalState.completionTime = Date.now();

    console.log('🎯 GOAL FORCE COMPLETED:', reason);
  }

  /**
   * Reset goal state
   */
  reset(): void {
    this.goalState = null;
    console.log('🎯 GOAL TRACKER: Reset');
  }
}