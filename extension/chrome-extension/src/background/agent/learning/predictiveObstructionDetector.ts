import { createLogger } from '@src/background/log';
import { DOMChangeType } from '../utils/domChangeDetector';
import { ObstructionLearner } from './obstructionLearner';
import { ExecutionContext } from '../types/executionContext';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('PredictiveObstructionDetector');

export interface ObstructionPrediction {
  likelihood: number;
  expectedType: DOMChangeType;
  expectedTrigger: string;
  suggestedStrategy: string;
  confidence: number;
  reasoningChain: string[];
  preventiveActions?: Array<{
    description: string;
    action: Record<string, unknown>;
  }>;
}

export interface PredictionContext {
  currentUrl: string;
  currentState: BrowserState;
  plannedActions: Record<string, unknown>[];
  executionContext: ExecutionContext;
  recentObstructions: Array<{
    type: DOMChangeType;
    trigger: string;
    resolved: boolean;
    timestamp: number;
  }>;
}

export class PredictiveObstructionDetector {
  private learner: ObstructionLearner;
  private predictionHistory: Array<{
    prediction: ObstructionPrediction;
    actualOutcome: {
      obstructionOccurred: boolean;
      actualType?: DOMChangeType;
      accuracy: number;
    };
    timestamp: number;
  }> = [];

  constructor(learner: ObstructionLearner) {
    this.learner = learner;
  }

  /**
   * Predict potential obstructions for upcoming actions
   */
  async predictUpcomingObstructions(context: PredictionContext): Promise<ObstructionPrediction[]> {
    logger.info(`🔮 Analyzing ${context.plannedActions.length} upcoming actions for potential obstructions`);

    const predictions: ObstructionPrediction[] = [];
    const domain = this.extractDomain(context.currentUrl);

    // Analyze each planned action
    for (let i = 0; i < Math.min(context.plannedActions.length, 5); i++) { // Look ahead max 5 actions
      const action = context.plannedActions[i];
      const actionIndex = i;

      const prediction = await this.predictForSingleAction(
        domain,
        action,
        context,
        actionIndex
      );

      if (prediction && prediction.likelihood > 0.3) { // Only include predictions with reasonable likelihood
        predictions.push(prediction);
      }
    }

    // Sort by likelihood and confidence
    predictions.sort((a, b) => (b.likelihood * b.confidence) - (a.likelihood * a.confidence));

    if (predictions.length > 0) {
      logger.info(`🎯 Found ${predictions.length} potential obstruction predictions`);
    }

    return predictions;
  }

  /**
   * Predict obstruction for a single action
   */
  private async predictForSingleAction(
    domain: string,
    action: Record<string, unknown>,
    context: PredictionContext,
    actionIndex: number
  ): Promise<ObstructionPrediction | null> {
    const actionType = Object.keys(action)[0];
    const actionArgs = action[actionType] as any;

    // Get learned prediction
    const learnedPrediction = await this.learner.predictObstruction(
      domain,
      action,
      context.currentState
    );

    // Combine with heuristic analysis
    const heuristicPrediction = this.getHeuristicPrediction(
      actionType,
      actionArgs,
      context,
      actionIndex
    );

    // Merge both predictions
    return this.mergePredictions(learnedPrediction, heuristicPrediction, action, context);
  }

  /**
   * Get heuristic prediction based on action patterns
   */
  private getHeuristicPrediction(
    actionType: string,
    actionArgs: any,
    context: PredictionContext,
    actionIndex: number
  ): ObstructionPrediction | null {
    const reasoningChain: string[] = [];
    let likelihood = 0;
    let expectedType = DOMChangeType.NONE;
    let suggestedStrategy = 'continue';

    reasoningChain.push(`Analyzing ${actionType} action`);

    // Input text predictions
    if (actionType === 'input_text') {
      const text = actionArgs.text || '';
      const description = actionArgs.description || '';

      // Email input often triggers autocomplete
      if (text.includes('@') || description.toLowerCase().includes('email')) {
        likelihood = 0.7;
        expectedType = DOMChangeType.INTERACTIVE;
        suggestedStrategy = 'interact';
        reasoningChain.push('Email input detected - high likelihood of autocomplete');
      }

      // Search inputs often trigger suggestions
      if (description.toLowerCase().includes('search') || actionArgs.intent?.includes('search')) {
        likelihood = 0.6;
        expectedType = DOMChangeType.INTERACTIVE;
        suggestedStrategy = 'interact';
        reasoningChain.push('Search input detected - moderate likelihood of suggestions');
      }

      // Form inputs on certain domains
      const url = context.currentUrl.toLowerCase();
      if (url.includes('gmail') || url.includes('calendar') || url.includes('forms')) {
        likelihood = Math.max(likelihood, 0.5);
        expectedType = DOMChangeType.INTERACTIVE;
        reasoningChain.push('Form input on dynamic site - increased likelihood');
      }
    }

    // Click action predictions
    if (actionType === 'click_element') {
      const text = actionArgs.text || '';
      const description = actionArgs.description || '';

      // Button clicks that might open modals
      const modalTriggers = ['settings', 'options', 'preferences', 'advanced', 'more', 'menu'];
      if (modalTriggers.some(trigger => 
        text.toLowerCase().includes(trigger) || description.toLowerCase().includes(trigger)
      )) {
        likelihood = 0.8;
        expectedType = DOMChangeType.BLOCKING;
        suggestedStrategy = 'dismiss';
        reasoningChain.push('Modal trigger button detected - high likelihood of dialog');
      }

      // Dropdown triggers
      const dropdownTriggers = ['dropdown', 'select', 'choose', 'pick'];
      if (dropdownTriggers.some(trigger => 
        text.toLowerCase().includes(trigger) || description.toLowerCase().includes(trigger)
      )) {
        likelihood = 0.6;
        expectedType = DOMChangeType.INTERACTIVE;
        suggestedStrategy = 'interact';
        reasoningChain.push('Dropdown trigger detected - moderate likelihood of menu');
      }

      // Navigation links
      if (text.toLowerCase().includes('continue') || text.toLowerCase().includes('next') || 
          description.toLowerCase().includes('navigate')) {
        likelihood = 0.4;
        expectedType = DOMChangeType.NAVIGATION;
        suggestedStrategy = 'wait';
        reasoningChain.push('Navigation trigger detected - possible page change');
      }
    }

    // Context-based predictions
    const recentObstructions = context.recentObstructions.filter(obs => 
      Date.now() - obs.timestamp < 30000 // Last 30 seconds
    );

    if (recentObstructions.length > 0) {
      likelihood = Math.max(likelihood, 0.3);
      reasoningChain.push(`Recent obstructions detected (${recentObstructions.length}) - increased vigilance`);
    }

    if (likelihood < 0.2) {
      return null; // Not worth predicting
    }

    return {
      likelihood,
      expectedType,
      expectedTrigger: `${actionType} action`,
      suggestedStrategy,
      confidence: this.calculateHeuristicConfidence(reasoningChain.length, likelihood),
      reasoningChain,
      preventiveActions: this.generatePreventiveActions(expectedType, suggestedStrategy)
    };
  }

  /**
   * Merge learned and heuristic predictions
   */
  private mergePredictions(
    learned: Awaited<ReturnType<ObstructionLearner['predictObstruction']>>,
    heuristic: ObstructionPrediction | null,
    action: Record<string, unknown>,
    context: PredictionContext
  ): ObstructionPrediction | null {
    if (!learned && !heuristic) {
      return null;
    }

    if (learned && !heuristic) {
      return {
        likelihood: learned.likelihood,
        expectedType: learned.expectedObstruction,
        expectedTrigger: Object.keys(action)[0],
        suggestedStrategy: this.strategyFromPreparation(learned.suggestedPreparation),
        confidence: learned.confidenceLevel,
        reasoningChain: ['Learned from historical patterns', learned.suggestedPreparation]
      };
    }

    if (!learned && heuristic) {
      return heuristic;
    }

    // Both exist - merge them
    const weightedLikelihood = (learned!.likelihood * learned!.confidenceLevel + 
                               heuristic!.likelihood * heuristic!.confidence) / 
                              (learned!.confidenceLevel + heuristic!.confidence);

    const combinedConfidence = Math.min(1.0, (learned!.confidenceLevel + heuristic!.confidence) / 2);

    return {
      likelihood: weightedLikelihood,
      expectedType: learned!.confidenceLevel > heuristic!.confidence ? 
                    learned!.expectedObstruction : heuristic!.expectedType,
      expectedTrigger: Object.keys(action)[0],
      suggestedStrategy: learned!.confidenceLevel > heuristic!.confidence ? 
                        this.strategyFromPreparation(learned!.suggestedPreparation) : 
                        heuristic!.suggestedStrategy,
      confidence: combinedConfidence,
      reasoningChain: [
        'Combined learned and heuristic analysis',
        `Learned: ${learned!.suggestedPreparation}`,
        ...heuristic!.reasoningChain
      ],
      preventiveActions: heuristic!.preventiveActions
    };
  }

  /**
   * Record prediction accuracy for learning
   */
  async recordPredictionOutcome(
    prediction: ObstructionPrediction,
    actualOutcome: {
      obstructionOccurred: boolean;
      actualType?: DOMChangeType;
      resolutionSuccess?: boolean;
    }
  ): Promise<void> {
    const accuracy = this.calculatePredictionAccuracy(prediction, actualOutcome);
    
    this.predictionHistory.push({
      prediction,
      actualOutcome: {
        ...actualOutcome,
        accuracy
      },
      timestamp: Date.now()
    });

    // Keep only recent history
    if (this.predictionHistory.length > 100) {
      this.predictionHistory = this.predictionHistory.slice(-100);
    }

    logger.info(`📊 Recorded prediction outcome: ${Math.round(accuracy * 100)}% accuracy`);
  }

  /**
   * Get prediction insights and accuracy metrics
   */
  getPredictionInsights(): {
    totalPredictions: number;
    averageAccuracy: number;
    accuracyByType: Map<DOMChangeType, number>;
    recentTrend: 'improving' | 'stable' | 'declining';
    strongestPredictors: string[];
  } {
    if (this.predictionHistory.length === 0) {
      return {
        totalPredictions: 0,
        averageAccuracy: 0,
        accuracyByType: new Map(),
        recentTrend: 'stable',
        strongestPredictors: []
      };
    }

    const totalAccuracy = this.predictionHistory.reduce((sum, record) => 
      sum + record.actualOutcome.accuracy, 0);
    const averageAccuracy = totalAccuracy / this.predictionHistory.length;

    // Group by type
    const accuracyByType = new Map<DOMChangeType, number>();
    const typeGroups = new Map<DOMChangeType, number[]>();
    
    this.predictionHistory.forEach(record => {
      const type = record.prediction.expectedType;
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(record.actualOutcome.accuracy);
    });

    typeGroups.forEach((accuracies, type) => {
      const avg = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
      accuracyByType.set(type, avg);
    });

    // Calculate trend
    const recentHistory = this.predictionHistory.slice(-20);
    const recentAccuracy = recentHistory.reduce((sum, record) => 
      sum + record.actualOutcome.accuracy, 0) / recentHistory.length;
    
    const recentTrend = recentAccuracy > averageAccuracy + 0.1 ? 'improving' :
                       recentAccuracy < averageAccuracy - 0.1 ? 'declining' : 'stable';

    return {
      totalPredictions: this.predictionHistory.length,
      averageAccuracy,
      accuracyByType,
      recentTrend,
      strongestPredictors: this.identifyStrongestPredictors()
    };
  }

  // Helper methods
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || 'unknown';
    }
  }

  private calculateHeuristicConfidence(reasoningSteps: number, likelihood: number): number {
    const baseConfidence = 0.6;
    const reasoningBonus = Math.min(0.3, reasoningSteps * 0.1);
    const likelihoodBonus = likelihood * 0.1;
    
    return Math.min(1.0, baseConfidence + reasoningBonus + likelihoodBonus);
  }

  private strategyFromPreparation(preparation: string): string {
    const prepLower = preparation.toLowerCase();
    if (prepLower.includes('dismiss') || prepLower.includes('close')) return 'dismiss';
    if (prepLower.includes('select') || prepLower.includes('interact')) return 'interact';
    if (prepLower.includes('wait')) return 'wait';
    return 'continue';
  }

  private generatePreventiveActions(
    expectedType: DOMChangeType,
    strategy: string
  ): Array<{ description: string; action: Record<string, unknown> }> {
    const actions = [];

    if (expectedType === DOMChangeType.INTERACTIVE && strategy === 'interact') {
      actions.push({
        description: 'Prepare to handle autocomplete or dropdown',
        action: { prepare_interaction: { type: 'dropdown_or_autocomplete' } }
      });
    }

    if (expectedType === DOMChangeType.BLOCKING && strategy === 'dismiss') {
      actions.push({
        description: 'Prepare to dismiss modal or dialog',
        action: { prepare_dismissal: { type: 'modal_or_dialog' } }
      });
    }

    return actions;
  }

  private calculatePredictionAccuracy(
    prediction: ObstructionPrediction,
    outcome: { obstructionOccurred: boolean; actualType?: DOMChangeType }
  ): number {
    let accuracy = 0;

    // Correct obstruction occurrence prediction
    if (prediction.likelihood > 0.5 && outcome.obstructionOccurred) {
      accuracy += 0.5;
    } else if (prediction.likelihood <= 0.5 && !outcome.obstructionOccurred) {
      accuracy += 0.5;
    }

    // Correct type prediction (if obstruction occurred)
    if (outcome.obstructionOccurred && outcome.actualType === prediction.expectedType) {
      accuracy += 0.5;
    }

    return accuracy;
  }

  private identifyStrongestPredictors(): string[] {
    const predictorAccuracy = new Map<string, number[]>();

    this.predictionHistory.forEach(record => {
      record.prediction.reasoningChain.forEach(reason => {
        if (!predictorAccuracy.has(reason)) {
          predictorAccuracy.set(reason, []);
        }
        predictorAccuracy.get(reason)!.push(record.actualOutcome.accuracy);
      });
    });

    return Array.from(predictorAccuracy.entries())
      .map(([predictor, accuracies]) => ({
        predictor,
        avgAccuracy: accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length,
        count: accuracies.length
      }))
      .filter(p => p.count >= 3) // Must have at least 3 occurrences
      .sort((a, b) => b.avgAccuracy - a.avgAccuracy)
      .slice(0, 5)
      .map(p => p.predictor);
  }
}