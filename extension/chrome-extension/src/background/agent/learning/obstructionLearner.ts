import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis, DOMChangeType } from '../utils/domChangeDetector';
import { ObstructionAnalysisResponse } from '../obstruction/obstructionAnalyzer';
import { VerificationResult } from '../verification/obstructionVerifier';
import { ContinuationDecision } from '../verification/smartContinuation';
import { RetryAttempt } from '../verification/adaptiveRetry';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('ObstructionLearner');

export interface ObstructionPattern {
  id: string;
  domain: string;
  obstructionType: DOMChangeType;
  trigger: {
    actionType: string;
    actionDescription: string;
    elementContext?: string;
  };
  obstructionSignature: {
    description: string;
    elements: string[];
    domChanges: {
      elementsAdded: number;
      elementsChanged: number;
      significantChange: boolean;
    };
  };
  successfulResolution: {
    strategy: string;
    specificAction: string;
    verificationScore: number;
    timeToResolve: number;
  };
  learningMetrics: {
    timesEncountered: number;
    successRate: number;
    averageResolutionTime: number;
    lastEncountered: number;
    confidence: number;
  };
  context: {
    pageType?: string;
    userFlow?: string;
    commonPatterns?: string[];
  };
}

export interface LearningEvent {
  domain: string;
  originalObstruction: DOMChangeAnalysis;
  triggerAction: Record<string, unknown>;
  resolutionAttempts: RetryAttempt[];
  finalResult: {
    success: boolean;
    strategy: string;
    verificationResult: VerificationResult;
    continuationDecision: ContinuationDecision;
    totalTime: number;
  };
  pageContext: {
    url: string;
    title: string;
    beforeState: BrowserState;
    afterState: BrowserState;
  };
  timestamp: number;
}

export class ObstructionLearner {
  private patterns: Map<string, ObstructionPattern> = new Map();
  private learningEvents: LearningEvent[] = [];
  private maxPatterns = 1000;
  private maxEvents = 500;

  /**
   * Learn from a complete obstruction handling sequence
   */
  async learnFromObstructionHandling(event: LearningEvent): Promise<void> {
    logger.info(`📚 Learning from obstruction: ${event.originalObstruction.description}`);

    // Store the learning event
    this.storeLearningEvent(event);

    // Extract patterns from successful resolutions
    if (event.finalResult.success) {
      await this.extractSuccessPattern(event);
    }

    // Update existing patterns
    await this.updateExistingPatterns(event);

    // Clean up old data if needed
    this.cleanupOldData();
  }

  /**
   * Store learning event for analysis
   */
  private storeLearningEvent(event: LearningEvent): void {
    this.learningEvents.push(event);

    // Keep only recent events
    if (this.learningEvents.length > this.maxEvents) {
      this.learningEvents = this.learningEvents.slice(-this.maxEvents);
    }
  }

  /**
   * Extract successful pattern from event
   */
  private async extractSuccessPattern(event: LearningEvent): Promise<void> {
    const patternId = this.generatePatternId(event);
    const existingPattern = this.patterns.get(patternId);

    if (existingPattern) {
      // Update existing pattern
      await this.updatePattern(existingPattern, event);
    } else {
      // Create new pattern
      const newPattern = this.createPatternFromEvent(event);
      this.patterns.set(patternId, newPattern);
      logger.info(`✨ Created new obstruction pattern: ${patternId}`);
    }
  }

  /**
   * Create new pattern from successful event
   */
  private createPatternFromEvent(event: LearningEvent): ObstructionPattern {
    const successfulAttempt = event.resolutionAttempts.find(a => a.success) || event.resolutionAttempts[event.resolutionAttempts.length - 1];
    
    return {
      id: this.generatePatternId(event),
      domain: this.extractDomain(event.pageContext.url),
      obstructionType: event.originalObstruction.type,
      trigger: {
        actionType: Object.keys(event.triggerAction)[0],
        actionDescription: this.extractActionDescription(event.triggerAction),
        elementContext: this.extractElementContext(event.pageContext.beforeState)
      },
      obstructionSignature: {
        description: event.originalObstruction.description,
        elements: event.originalObstruction.newElements,
        domChanges: {
          elementsAdded: this.countElementsAdded(event.pageContext.beforeState, event.pageContext.afterState),
          elementsChanged: this.countElementsChanged(event.pageContext.beforeState, event.pageContext.afterState),
          significantChange: event.originalObstruction.type !== DOMChangeType.MINOR
        }
      },
      successfulResolution: {
        strategy: successfulAttempt.strategy,
        specificAction: successfulAttempt.analysis.resolution.specificAction,
        verificationScore: successfulAttempt.verificationResult.confidence,
        timeToResolve: event.finalResult.totalTime
      },
      learningMetrics: {
        timesEncountered: 1,
        successRate: event.finalResult.success ? 1.0 : 0.0,
        averageResolutionTime: event.finalResult.totalTime,
        lastEncountered: event.timestamp,
        confidence: this.calculateInitialConfidence(event)
      },
      context: {
        pageType: this.classifyPageType(event.pageContext.url, event.pageContext.title),
        userFlow: this.identifyUserFlow(event),
        commonPatterns: this.extractCommonPatterns(event)
      }
    };
  }

  /**
   * Update existing pattern with new data
   */
  private async updatePattern(pattern: ObstructionPattern, event: LearningEvent): Promise<void> {
    const wasSuccessful = event.finalResult.success;
    
    // Update metrics
    pattern.learningMetrics.timesEncountered++;
    pattern.learningMetrics.lastEncountered = event.timestamp;
    
    // Update success rate using exponential moving average
    const alpha = 0.3; // Learning rate
    pattern.learningMetrics.successRate = 
      alpha * (wasSuccessful ? 1.0 : 0.0) + (1 - alpha) * pattern.learningMetrics.successRate;
    
    // Update average resolution time
    pattern.learningMetrics.averageResolutionTime = 
      (pattern.learningMetrics.averageResolutionTime * (pattern.learningMetrics.timesEncountered - 1) + event.finalResult.totalTime) / 
      pattern.learningMetrics.timesEncountered;
    
    // Update confidence based on recent success rate and frequency
    pattern.learningMetrics.confidence = this.calculateConfidence(pattern);
    
    // Update successful resolution if this was better
    if (wasSuccessful && event.finalResult.verificationResult.confidence > pattern.successfulResolution.verificationScore) {
      const successfulAttempt = event.resolutionAttempts.find(a => a.success)!;
      pattern.successfulResolution = {
        strategy: successfulAttempt.strategy,
        specificAction: successfulAttempt.analysis.resolution.specificAction,
        verificationScore: successfulAttempt.verificationResult.confidence,
        timeToResolve: event.finalResult.totalTime
      };
    }

    logger.info(`📈 Updated pattern ${pattern.id}: ${pattern.learningMetrics.timesEncountered} encounters, ${Math.round(pattern.learningMetrics.successRate * 100)}% success rate`);
  }

  /**
   * Update all existing patterns based on new event
   */
  private async updateExistingPatterns(event: LearningEvent): Promise<void> {
    // Update similar patterns to improve or reduce confidence
    for (const [patternId, pattern] of this.patterns.entries()) {
      if (this.isSimilarPattern(pattern, event)) {
        // Similar patterns get slight confidence adjustment
        const wasSuccessful = event.finalResult.success;
        const adjustment = wasSuccessful ? 0.05 : -0.02;
        pattern.learningMetrics.confidence = Math.max(0, Math.min(1, pattern.learningMetrics.confidence + adjustment));
      }
    }
  }

  /**
   * Find matching patterns for prediction
   */
  async findMatchingPatterns(
    domain: string,
    obstructionType: DOMChangeType,
    triggerAction: Record<string, unknown>,
    obstructionSignature: string
  ): Promise<ObstructionPattern[]> {
    const matches = Array.from(this.patterns.values())
      .filter(pattern => this.isPatternMatch(pattern, domain, obstructionType, triggerAction, obstructionSignature))
      .sort((a, b) => {
        // Sort by confidence * success rate * recency
        const scoreA = a.learningMetrics.confidence * a.learningMetrics.successRate * this.getRecencyScore(a);
        const scoreB = b.learningMetrics.confidence * b.learningMetrics.successRate * this.getRecencyScore(b);
        return scoreB - scoreA;
      });

    logger.info(`🔍 Found ${matches.length} matching patterns for ${obstructionType} on ${domain}`);
    return matches;
  }

  /**
   * Predict likely obstruction based on current context
   */
  async predictObstruction(
    domain: string,
    nextAction: Record<string, unknown>,
    currentState: BrowserState
  ): Promise<{
    likelihood: number;
    expectedObstruction: DOMChangeType;
    suggestedPreparation: string;
    confidenceLevel: number;
  } | null> {
    const actionType = Object.keys(nextAction)[0];
    
    // Find patterns that match the current context
    const relevantPatterns = Array.from(this.patterns.values())
      .filter(pattern => 
        pattern.domain === domain &&
        pattern.trigger.actionType === actionType
      );

    if (relevantPatterns.length === 0) {
      return null;
    }

    // Calculate weighted prediction
    const totalWeight = relevantPatterns.reduce((sum, pattern) => 
      sum + (pattern.learningMetrics.confidence * pattern.learningMetrics.timesEncountered), 0);

    if (totalWeight === 0) {
      return null;
    }

    // Find most likely obstruction type
    const obstructionCounts = new Map<DOMChangeType, number>();
    let weightedLikelihood = 0;

    relevantPatterns.forEach(pattern => {
      const weight = (pattern.learningMetrics.confidence * pattern.learningMetrics.timesEncountered) / totalWeight;
      const currentCount = obstructionCounts.get(pattern.obstructionType) || 0;
      obstructionCounts.set(pattern.obstructionType, currentCount + weight);
      weightedLikelihood += weight * pattern.learningMetrics.successRate;
    });

    const mostLikelyObstruction = Array.from(obstructionCounts.entries())
      .sort(([,a], [,b]) => b - a)[0];

    if (!mostLikelyObstruction || mostLikelyObstruction[1] < 0.3) {
      return null; // Not confident enough
    }

    const bestPattern = relevantPatterns
      .filter(p => p.obstructionType === mostLikelyObstruction[0])
      .sort((a, b) => b.learningMetrics.confidence - a.learningMetrics.confidence)[0];

    return {
      likelihood: mostLikelyObstruction[1],
      expectedObstruction: mostLikelyObstruction[0],
      suggestedPreparation: `Be prepared for ${mostLikelyObstruction[0]} obstruction, recommend using ${bestPattern.successfulResolution.strategy} strategy`,
      confidenceLevel: bestPattern.learningMetrics.confidence
    };
  }

  /**
   * Get learning insights and statistics
   */
  getInsights(): {
    totalPatterns: number;
    totalEvents: number;
    topDomains: Array<{ domain: string; patterns: number; successRate: number }>;
    commonObstructions: Array<{ type: DOMChangeType; count: number; avgSuccessRate: number }>;
    learningTrends: {
      recentSuccessRate: number;
      improvementTrend: 'improving' | 'stable' | 'declining';
    };
  } {
    const domainStats = new Map<string, { patterns: number; totalSuccess: number; totalAttempts: number }>();
    const obstructionStats = new Map<DOMChangeType, { count: number; totalSuccess: number }>();

    // Analyze patterns
    this.patterns.forEach(pattern => {
      // Domain stats
      const domain = pattern.domain;
      const domainStat = domainStats.get(domain) || { patterns: 0, totalSuccess: 0, totalAttempts: 0 };
      domainStat.patterns++;
      domainStat.totalAttempts += pattern.learningMetrics.timesEncountered;
      domainStat.totalSuccess += Math.round(pattern.learningMetrics.successRate * pattern.learningMetrics.timesEncountered);
      domainStats.set(domain, domainStat);

      // Obstruction stats
      const obstruction = pattern.obstructionType;
      const obstructionStat = obstructionStats.get(obstruction) || { count: 0, totalSuccess: 0 };
      obstructionStat.count++;
      obstructionStat.totalSuccess += pattern.learningMetrics.successRate;
      obstructionStats.set(obstruction, obstructionStat);
    });

    // Calculate recent success rate
    const recentEvents = this.learningEvents.slice(-50); // Last 50 events
    const recentSuccessRate = recentEvents.length > 0 ? 
      recentEvents.filter(e => e.finalResult.success).length / recentEvents.length : 0;

    return {
      totalPatterns: this.patterns.size,
      totalEvents: this.learningEvents.length,
      topDomains: Array.from(domainStats.entries())
        .map(([domain, stats]) => ({
          domain,
          patterns: stats.patterns,
          successRate: stats.totalAttempts > 0 ? stats.totalSuccess / stats.totalAttempts : 0
        }))
        .sort((a, b) => b.patterns - a.patterns)
        .slice(0, 10),
      commonObstructions: Array.from(obstructionStats.entries())
        .map(([type, stats]) => ({
          type,
          count: stats.count,
          avgSuccessRate: stats.totalSuccess / stats.count
        }))
        .sort((a, b) => b.count - a.count),
      learningTrends: {
        recentSuccessRate,
        improvementTrend: this.calculateTrend(recentSuccessRate)
      }
    };
  }

  // Helper methods
  private generatePatternId(event: LearningEvent): string {
    const domain = this.extractDomain(event.pageContext.url);
    const actionType = Object.keys(event.triggerAction)[0];
    const obstructionType = event.originalObstruction.type;
    const signature = this.hashString(event.originalObstruction.description);
    
    return `${domain}_${actionType}_${obstructionType}_${signature}`;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || 'unknown';
    }
  }

  private extractActionDescription(action: Record<string, unknown>): string {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName] as any;
    return actionArgs?.description || actionArgs?.intent || actionArgs?.text || actionName;
  }

  private extractElementContext(state: BrowserState): string {
    // Extract key element types and counts
    const elementTypes = new Map<string, number>();
    state.selectorMap?.forEach(element => {
      const tag = (element.tagName || element.tag || 'unknown').toLowerCase();
      elementTypes.set(tag, (elementTypes.get(tag) || 0) + 1);
    });

    const topElements = Array.from(elementTypes.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => `${tag}:${count}`)
      .join(',');

    return topElements;
  }

  private countElementsAdded(before: BrowserState, after: BrowserState): number {
    const beforeCount = before.selectorMap?.size || 0;
    const afterCount = after.selectorMap?.size || 0;
    return Math.max(0, afterCount - beforeCount);
  }

  private countElementsChanged(before: BrowserState, after: BrowserState): number {
    // Simplified - in reality would compare elements
    return Math.abs((before.selectorMap?.size || 0) - (after.selectorMap?.size || 0));
  }

  private calculateInitialConfidence(event: LearningEvent): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for successful resolutions
    if (event.finalResult.success) {
      confidence += 0.3;
    }

    // Higher confidence for high verification scores
    if (event.finalResult.verificationResult.confidence > 0.8) {
      confidence += 0.2;
    }

    // Lower confidence for multiple attempts needed
    if (event.resolutionAttempts.length > 1) {
      confidence -= 0.1 * (event.resolutionAttempts.length - 1);
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateConfidence(pattern: ObstructionPattern): number {
    const baseConfidence = pattern.learningMetrics.successRate;
    const frequencyBonus = Math.min(0.2, pattern.learningMetrics.timesEncountered * 0.02);
    const recencyBonus = this.getRecencyScore(pattern) * 0.1;
    
    return Math.max(0.1, Math.min(1.0, baseConfidence + frequencyBonus + recencyBonus));
  }

  private classifyPageType(url: string, title: string): string {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();

    if (urlLower.includes('gmail') || titleLower.includes('gmail')) return 'email';
    if (urlLower.includes('calendar')) return 'calendar';
    if (urlLower.includes('checkout') || urlLower.includes('cart')) return 'commerce';
    if (urlLower.includes('login') || urlLower.includes('signin')) return 'auth';
    if (urlLower.includes('form') || titleLower.includes('form')) return 'form';
    
    return 'general';
  }

  private identifyUserFlow(event: LearningEvent): string {
    const actionType = Object.keys(event.triggerAction)[0];
    const pageType = this.classifyPageType(event.pageContext.url, event.pageContext.title);
    
    return `${pageType}_${actionType}`;
  }

  private extractCommonPatterns(event: LearningEvent): string[] {
    const patterns = [];
    
    if (event.originalObstruction.description.includes('autocomplete')) {
      patterns.push('autocomplete');
    }
    if (event.originalObstruction.description.includes('modal')) {
      patterns.push('modal');
    }
    if (event.originalObstruction.description.includes('dropdown')) {
      patterns.push('dropdown');
    }
    
    return patterns;
  }

  private isSimilarPattern(pattern: ObstructionPattern, event: LearningEvent): boolean {
    return pattern.domain === this.extractDomain(event.pageContext.url) &&
           pattern.obstructionType === event.originalObstruction.type &&
           pattern.trigger.actionType === Object.keys(event.triggerAction)[0];
  }

  private isPatternMatch(
    pattern: ObstructionPattern,
    domain: string,
    obstructionType: DOMChangeType,
    triggerAction: Record<string, unknown>,
    obstructionSignature: string
  ): boolean {
    return pattern.domain === domain &&
           pattern.obstructionType === obstructionType &&
           pattern.trigger.actionType === Object.keys(triggerAction)[0] &&
           pattern.obstructionSignature.description.includes(obstructionSignature.slice(0, 20));
  }

  private getRecencyScore(pattern: ObstructionPattern): number {
    const daysSinceLastEncounter = (Date.now() - pattern.learningMetrics.lastEncountered) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - (daysSinceLastEncounter / 30)); // Decays over 30 days
  }

  private calculateTrend(recentSuccessRate: number): 'improving' | 'stable' | 'declining' {
    // This would compare with historical rates - simplified for now
    if (recentSuccessRate > 0.8) return 'improving';
    if (recentSuccessRate > 0.6) return 'stable';
    return 'declining';
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private cleanupOldData(): void {
    // Remove old patterns with low confidence and low usage
    const patternsToRemove = Array.from(this.patterns.entries())
      .filter(([id, pattern]) => 
        pattern.learningMetrics.confidence < 0.2 && 
        pattern.learningMetrics.timesEncountered < 3 &&
        this.getRecencyScore(pattern) < 0.1
      )
      .slice(0, Math.max(0, this.patterns.size - this.maxPatterns));

    patternsToRemove.forEach(([id]) => {
      this.patterns.delete(id);
      logger.info(`🗑️ Removed low-confidence pattern: ${id}`);
    });
  }
}