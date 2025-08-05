import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis, DOMChangeType } from '../utils/domChangeDetector';
import { VerificationResult } from './obstructionVerifier';
import { ObstructionAnalysisResponse } from '../obstruction/obstructionAnalyzer';
import { ExecutionContext } from '../types/executionContext';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { convertZodToJsonSchema } from '@src/background/utils';
import { z } from 'zod';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('SmartContinuation');

// Schema for plan adjustment response
export const planAdjustmentSchema = z.object({
  shouldContinue: z.boolean().describe('Whether to continue with the original plan'),
  adjustmentType: z.enum(['none', 'retarget', 'skip', 'modify', 'replan']).describe('Type of adjustment needed'),
  adjustments: z.array(z.object({
    actionIndex: z.number().describe('Index of action to adjust'),
    originalAction: z.string().describe('Description of original action'),
    adjustedAction: z.record(z.unknown()).describe('New action definition'),
    reason: z.string().describe('Why this adjustment is needed')
  })).optional().describe('Specific adjustments to make to the plan'),
  reasoning: z.string().describe('Explanation of the continuation decision'),
  riskAssessment: z.enum(['low', 'medium', 'high']).describe('Risk level of continuing with current approach')
});

export type PlanAdjustmentResponse = z.infer<typeof planAdjustmentSchema>;

export interface ContinuationContext {
  originalObstruction: DOMChangeAnalysis;
  obstructionAnalysis: ObstructionAnalysisResponse;
  verificationResult: VerificationResult;
  executionContext: ExecutionContext;
  remainingActions: Record<string, unknown>[];
  currentState: BrowserState;
  beforeObstructionState: BrowserState;
}

export interface ContinuationDecision {
  decision: 'continue' | 'retry' | 'adjust' | 'replan' | 'abort';
  confidence: number;
  reasoning: string;
  adjustedActions?: Record<string, unknown>[];
  planAdjustments?: PlanAdjustmentResponse;
  retryStrategy?: {
    maxRetries: number;
    backoffMs: number;
    alternativeApproaches: string[];
  };
}

export class SmartContinuation {
  private llm: any;

  constructor(llm: any) {
    this.llm = llm;
  }

  /**
   * Make intelligent decision about how to continue after obstruction handling
   */
  async decideContinuation(context: ContinuationContext): Promise<ContinuationDecision> {
    logger.info(`🎯 Making continuation decision after ${context.originalObstruction.type} obstruction`);

    const decision: ContinuationDecision = {
      decision: 'continue',
      confidence: 0,
      reasoning: ''
    };

    try {
      // Quick decision for clearly successful cases
      if (context.verificationResult.verified && context.verificationResult.confidence > 0.8) {
        return this.createSuccessfulContinuation(context);
      }

      // Quick decision for clearly failed cases
      if (!context.verificationResult.verified && context.verificationResult.confidence < 0.3) {
        return this.createFailedContinuation(context);
      }

      // Complex cases - use LLM analysis
      return await this.analyzeContinuationWithLLM(context);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Continuation decision failed: ${errorMessage}`);
      
      return {
        decision: 'retry',
        confidence: 0.5,
        reasoning: `Error making continuation decision: ${errorMessage}`,
        retryStrategy: {
          maxRetries: 2,
          backoffMs: 1000,
          alternativeApproaches: ['replan', 'abort']
        }
      };
    }
  }

  /**
   * Create continuation decision for successful obstruction handling
   */
  private createSuccessfulContinuation(context: ContinuationContext): ContinuationDecision {
    logger.info('✅ Obstruction successfully resolved, continuing with plan');

    const needsTargetingAdjustment = this.checkIfTargetingAdjustmentNeeded(context);
    
    if (needsTargetingAdjustment) {
      return {
        decision: 'adjust',
        confidence: 0.9,
        reasoning: 'Obstruction resolved successfully, but element targeting may need adjustment due to DOM changes',
        adjustedActions: this.generateTargetingAdjustments(context.remainingActions, context.currentState)
      };
    }

    return {
      decision: 'continue',
      confidence: 0.95,
      reasoning: `Obstruction resolved successfully (${context.verificationResult.confidence} confidence), continuing with original plan`
    };
  }

  /**
   * Create continuation decision for failed obstruction handling
   */
  private createFailedContinuation(context: ContinuationContext): ContinuationDecision {
    logger.warning('❌ Obstruction handling failed, determining retry strategy');

    const retryWorthwhile = this.assessRetryWorthwhile(context);
    
    if (retryWorthwhile) {
      return {
        decision: 'retry',
        confidence: 0.6,
        reasoning: `Obstruction handling had low success rate (${context.verificationResult.confidence}), but retry may succeed`,
        retryStrategy: {
          maxRetries: 2,
          backoffMs: 1500,
          alternativeApproaches: this.generateAlternativeApproaches(context)
        }
      };
    }

    return {
      decision: 'replan',
      confidence: 0.8,
      reasoning: 'Obstruction handling failed and retry unlikely to succeed, need new approach'
    };
  }

  /**
   * Use LLM to analyze complex continuation scenarios
   */
  private async analyzeContinuationWithLLM(context: ContinuationContext): Promise<ContinuationDecision> {
    logger.info('🤖 Using LLM for complex continuation analysis');

    try {
      const prompt = this.buildContinuationPrompt(context);
      
      const messages = [
        new SystemMessage(this.getContinuationSystemPrompt()),
        new HumanMessage(prompt)
      ];

      const jsonSchema = convertZodToJsonSchema(planAdjustmentSchema, 'PlanAdjustment', true);
      const structuredLlm = this.llm.withStructuredOutput(jsonSchema, {
        includeRaw: true,
        name: 'plan_adjustment'
      });

      const response = await structuredLlm.invoke(messages);

      if (response.parsed) {
        const planAdjustment = response.parsed as PlanAdjustmentResponse;
        return this.convertLLMResponseToContinuationDecision(planAdjustment, context);
      } else {
        throw new Error('Failed to parse LLM continuation analysis');
      }

    } catch (error) {
      logger.error('LLM continuation analysis failed:', error);
      
      // Fallback to heuristic decision
      return this.createHeuristicContinuation(context);
    }
  }

  /**
   * Build prompt for LLM continuation analysis
   */
  private buildContinuationPrompt(context: ContinuationContext): string {
    return `
# CONTINUATION ANALYSIS REQUEST

An obstruction has been handled during task execution. Analyze the results and determine how to proceed.

## Original Goal
${context.executionContext.originalGoal}

## Obstruction Details
**Type**: ${context.originalObstruction.type}
**Description**: ${context.originalObstruction.description}
**Elements**: ${context.originalObstruction.newElements.join(', ')}

## How It Was Handled
**Strategy**: ${context.obstructionAnalysis.resolution.strategy}
**Action Taken**: ${context.obstructionAnalysis.resolution.specificAction}
**Expected Result**: ${context.obstructionAnalysis.resolution.reasoning}

## Verification Results
**Success**: ${context.verificationResult.verified}
**Confidence**: ${context.verificationResult.confidence}
**Description**: ${context.verificationResult.description}

**Specific Checks**:
${context.verificationResult.specificChecks.map(check => 
  `- ${check.name}: ${check.passed ? '✓' : '✗'} ${check.details}`
).join('\n')}

## Remaining Plan
${context.remainingActions.map((action, i) => {
  const actionName = Object.keys(action)[0];
  const actionArgs = action[actionName] as any;
  const description = actionArgs.description || actionArgs.intent || actionArgs.text || 'Unknown action';
  return `${i + 1}. ${actionName}: ${description}`;
}).join('\n')}

## Current Page State
**URL**: ${context.currentState.url}
**Title**: ${context.currentState.title}
**Elements**: ${context.currentState.selectorMap?.size || 0} total

## Your Analysis Task

Based on the obstruction handling results, determine:

1. **Should we continue** with the original plan?
2. **What adjustments** are needed (if any)?
3. **What's the risk level** of proceeding?

Consider:
- Whether the obstruction was truly resolved
- If DOM changes affect element targeting
- Whether the original plan is still valid
- Risk of similar obstructions appearing

Provide specific action adjustments if needed (e.g., updating selectors, skipping steps, modifying approaches).
`;
  }

  /**
   * System prompt for continuation analysis
   */
  private getContinuationSystemPrompt(): string {
    return `You are an expert web automation continuation analyst. Your job is to determine how to proceed after an obstruction has been handled during task execution.

Key principles:
1. **Goal-oriented**: Keep the original user goal as the priority
2. **Risk-aware**: Assess potential issues with continuing the current approach
3. **Adaptive**: Suggest specific adjustments when DOM changes affect the plan
4. **Efficient**: Prefer continuing over re-planning when safe to do so

Adjustment types:
- **none**: Continue exactly as planned
- **retarget**: Update element selectors due to DOM changes
- **skip**: Skip actions that are no longer needed/possible
- **modify**: Change action parameters or approach
- **replan**: Completely new approach needed

Be specific in your adjustments - provide exact action modifications when needed.`;
  }

  /**
   * Convert LLM response to continuation decision
   */
  private convertLLMResponseToContinuationDecision(
    planAdjustment: PlanAdjustmentResponse,
    context: ContinuationContext
  ): ContinuationDecision {
    const baseDecision: ContinuationDecision = {
      decision: planAdjustment.shouldContinue ? 'continue' : 'replan',
      confidence: this.calculateConfidenceFromRisk(planAdjustment.riskAssessment),
      reasoning: planAdjustment.reasoning,
      planAdjustments: planAdjustment
    };

    // Adjust decision based on adjustment type
    switch (planAdjustment.adjustmentType) {
      case 'none':
        baseDecision.decision = 'continue';
        break;
      case 'retarget':
      case 'modify':
        baseDecision.decision = 'adjust';
        baseDecision.adjustedActions = this.applyPlanAdjustments(context.remainingActions, planAdjustment);
        break;
      case 'skip':
        baseDecision.decision = 'adjust';
        baseDecision.adjustedActions = this.applySkipAdjustments(context.remainingActions, planAdjustment);
        break;
      case 'replan':
        baseDecision.decision = 'replan';
        break;
    }

    return baseDecision;
  }

  /**
   * Create heuristic continuation decision as fallback
   */
  private createHeuristicContinuation(context: ContinuationContext): ContinuationDecision {
    logger.info('🔧 Using heuristic continuation decision');

    const verificationScore = context.verificationResult.confidence;
    
    if (verificationScore > 0.7) {
      return {
        decision: 'continue',
        confidence: 0.8,
        reasoning: 'Heuristic: High verification score suggests successful resolution'
      };
    } else if (verificationScore > 0.4) {
      return {
        decision: 'adjust',
        confidence: 0.6,
        reasoning: 'Heuristic: Moderate verification score, attempting targeting adjustments',
        adjustedActions: this.generateTargetingAdjustments(context.remainingActions, context.currentState)
      };
    } else {
      return {
        decision: 'retry',
        confidence: 0.5,
        reasoning: 'Heuristic: Low verification score, attempting retry',
        retryStrategy: {
          maxRetries: 1,
          backoffMs: 1000,
          alternativeApproaches: ['replan']
        }
      };
    }
  }

  /**
   * Check if element targeting adjustment is needed
   */
  private checkIfTargetingAdjustmentNeeded(context: ContinuationContext): boolean {
    // Check if DOM structure changed significantly
    const beforeElements = context.beforeObstructionState.selectorMap?.size || 0;
    const afterElements = context.currentState.selectorMap?.size || 0;
    const elementChange = Math.abs(afterElements - beforeElements);
    
    // If many elements were added/removed, targeting might be affected
    return elementChange > 5;
  }

  /**
   * Generate targeting adjustments for remaining actions
   */
  private generateTargetingAdjustments(
    remainingActions: Record<string, unknown>[],
    currentState: BrowserState
  ): Record<string, unknown>[] {
    logger.info('🎯 Generating targeting adjustments');

    return remainingActions.map((action, index) => {
      const actionName = Object.keys(action)[0];
      const actionArgs = action[actionName] as any;

      // For click actions, try to use more semantic targeting
      if (actionName === 'click_element' && actionArgs.text) {
        return {
          [actionName]: {
            ...actionArgs,
            // Add semantic targeting preferences
            preferSemanticTargeting: true,
            fallbackToText: true,
            originalText: actionArgs.text
          }
        };
      }

      // For input actions, prefer label-based targeting
      if (actionName === 'input_text' && actionArgs.description) {
        return {
          [actionName]: {
            ...actionArgs,
            preferLabelTargeting: true,
            fallbackToPlaceholder: true,
            originalDescription: actionArgs.description
          }
        };
      }

      return action; // No adjustment needed
    });
  }

  /**
   * Assess if retry is worthwhile
   */
  private assessRetryWorthwhile(context: ContinuationContext): boolean {
    // Don't retry if verification was completely unsuccessful
    if (context.verificationResult.confidence < 0.2) {
      return false;
    }

    // Don't retry for navigation issues
    if (context.originalObstruction.type === DOMChangeType.NAVIGATION) {
      return false;
    }

    // Retry may help for interactive and blocking obstructions
    return [DOMChangeType.INTERACTIVE, DOMChangeType.BLOCKING].includes(context.originalObstruction.type);
  }

  /**
   * Generate alternative approaches for retry
   */
  private generateAlternativeApproaches(context: ContinuationContext): string[] {
    const alternatives = [];

    if (context.obstructionAnalysis.resolution.strategy !== 'dismiss') {
      alternatives.push('dismiss');
    }

    if (context.obstructionAnalysis.resolution.strategy !== 'wait') {
      alternatives.push('wait');
    }

    if (context.originalObstruction.type === DOMChangeType.INTERACTIVE) {
      alternatives.push('ignore');
    }

    alternatives.push('replan');

    return alternatives;
  }

  /**
   * Calculate confidence from risk assessment
   */
  private calculateConfidenceFromRisk(risk: string): number {
    switch (risk) {
      case 'low': return 0.9;
      case 'medium': return 0.7;
      case 'high': return 0.4;
      default: return 0.6;
    }
  }

  /**
   * Apply plan adjustments from LLM response
   */
  private applyPlanAdjustments(
    remainingActions: Record<string, unknown>[],
    planAdjustment: PlanAdjustmentResponse
  ): Record<string, unknown>[] {
    if (!planAdjustment.adjustments) {
      return remainingActions;
    }

    const adjustedActions = [...remainingActions];

    for (const adjustment of planAdjustment.adjustments) {
      if (adjustment.actionIndex < adjustedActions.length) {
        adjustedActions[adjustment.actionIndex] = adjustment.adjustedAction;
        logger.info(`📝 Applied adjustment to action ${adjustment.actionIndex}: ${adjustment.reason}`);
      }
    }

    return adjustedActions;
  }

  /**
   * Apply skip adjustments from LLM response
   */
  private applySkipAdjustments(
    remainingActions: Record<string, unknown>[],
    planAdjustment: PlanAdjustmentResponse
  ): Record<string, unknown>[] {
    if (!planAdjustment.adjustments) {
      return remainingActions;
    }

    let adjustedActions = [...remainingActions];

    // Sort by index in descending order to avoid index shifting issues
    const skipIndices = planAdjustment.adjustments
      .map(adj => adj.actionIndex)
      .sort((a, b) => b - a);

    for (const index of skipIndices) {
      if (index < adjustedActions.length) {
        adjustedActions.splice(index, 1);
        logger.info(`⏭️ Skipped action at index ${index}`);
      }
    }

    return adjustedActions;
  }
}