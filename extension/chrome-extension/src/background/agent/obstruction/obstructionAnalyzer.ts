import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis, DOMChangeType } from '../utils/domChangeDetector';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { convertZodToJsonSchema } from '@src/background/utils';
import { z } from 'zod';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('ObstructionAnalyzer');

// Schema for LLM obstruction analysis response
export const obstructionAnalysisSchema = z.object({
  analysis: z.object({
    whatAppeared: z.string().describe('Description of what new element(s) appeared'),
    whyItAppeared: z.string().describe('Likely reason this element appeared (e.g., user typed in email field)'),
    impactOnNextAction: z.string().describe('How this affects the next planned action'),
    confidence: z.number().min(0).max(1).describe('Confidence level in this analysis')
  }),
  resolution: z.object({
    strategy: z.enum(['interact', 'dismiss', 'wait', 'ignore']).describe('Best strategy to handle this obstruction'),
    specificAction: z.string().describe('Specific action to take (e.g., "click first autocomplete option", "press Escape to dismiss")'),
    reasoning: z.string().describe('Why this resolution strategy was chosen'),
    urgency: z.enum(['critical', 'high', 'medium', 'low']).describe('How urgently this needs to be resolved')
  }),
  continuation: z.object({
    shouldContinueWithPlan: z.boolean().describe('Whether to continue with original plan after resolution'),
    planAdjustments: z.string().optional().describe('Any adjustments needed to the original plan'),
    targetingChanges: z.string().optional().describe('Changes needed for element targeting (if DOM indexes shifted)')
  })
});

export type ObstructionAnalysisResponse = z.infer<typeof obstructionAnalysisSchema>;

export interface ObstructionContext {
  // Current page state
  url: string;
  title: string;
  
  // What just happened
  lastAction: Record<string, unknown>;
  lastActionIntent: string;
  
  // What's planned next
  nextAction: Record<string, unknown>;
  nextActionIntent: string;
  
  // DOM change details
  domChange: DOMChangeAnalysis;
  
  // Execution context
  originalGoal: string;
  completedSteps: string[];
}

export class ObstructionAnalyzer {
  private llm: any;

  constructor(llm: any) {
    this.llm = llm;
  }

  /**
   * Analyze an obstruction using LLM to understand context and determine resolution
   */
  async analyzeObstruction(context: ObstructionContext): Promise<ObstructionAnalysisResponse | null> {
    logger.info(`🔍 Analyzing obstruction: ${context.domChange.description}`);

    try {
      const prompt = this.buildAnalysisPrompt(context);
      
      const messages = [
        new SystemMessage(this.getSystemPrompt()),
        new HumanMessage(prompt)
      ];

      // Use structured output for consistent analysis
      const jsonSchema = convertZodToJsonSchema(obstructionAnalysisSchema, 'ObstructionAnalysis', true);
      const structuredLlm = this.llm.withStructuredOutput(jsonSchema, {
        includeRaw: true,
        name: 'obstruction_analysis'
      });

      const response = await structuredLlm.invoke(messages);

      if (response.parsed) {
        const analysis = response.parsed as ObstructionAnalysisResponse;
        logger.info(`✅ LLM Analysis: ${analysis.analysis.whatAppeared} → ${analysis.resolution.strategy}`);
        return analysis;
      } else {
        logger.error('Failed to parse LLM response for obstruction analysis');
        return null;
      }
    } catch (error) {
      logger.error('Error analyzing obstruction with LLM:', error);
      return null;
    }
  }

  /**
   * Build the analysis prompt with full context
   */
  private buildAnalysisPrompt(context: ObstructionContext): string {
    return `
# OBSTRUCTION ANALYSIS REQUEST

You are an expert web automation analyst. A DOM change has been detected during task execution that may be blocking progress. Analyze the situation and provide a resolution strategy.

## Current Situation
**Page**: ${context.url}
**Goal**: ${context.originalGoal}

## Execution Context
**Last Action**: ${this.formatAction(context.lastAction)}
**Intent**: ${context.lastActionIntent}

**Next Planned Action**: ${this.formatAction(context.nextAction)}  
**Intent**: ${context.nextActionIntent}

**Completed Steps**:
${context.completedSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## DOM Change Detected
**Type**: ${context.domChange.type}
**Description**: ${context.domChange.description}
**New Elements**: ${context.domChange.newElements.join(', ')}
**Recommendations**: ${context.domChange.recommendations.join(', ')}

## Your Analysis Task

Analyze this obstruction in the context of the overall goal and provide:

1. **What Appeared**: Clearly describe what new element(s) appeared on the page
2. **Why It Appeared**: Explain the likely cause (e.g., typing triggered autocomplete)
3. **Impact Assessment**: How does this affect the next planned action?
4. **Resolution Strategy**: What's the best way to handle this?
5. **Continuation Plan**: How to proceed after resolution

## Strategy Guidelines

- **Interact**: If the obstruction is helpful (autocomplete with relevant options)
- **Dismiss**: If the obstruction blocks progress (modal, unwanted dropdown)  
- **Wait**: If the obstruction will resolve itself (loading spinner)
- **Ignore**: If the obstruction doesn't affect the next action

Focus on achieving the original goal efficiently while handling the obstruction appropriately.
`;
  }

  /**
   * System prompt for obstruction analysis
   */
  private getSystemPrompt(): string {
    return `You are an expert web automation obstruction analyst. Your job is to analyze DOM changes that occur during task execution and determine the best resolution strategy.

When analyzing obstructions:
1. Consider the USER'S ORIGINAL GOAL - don't get sidetracked
2. Understand WHY the obstruction appeared (usually triggered by previous action)
3. Assess whether the obstruction HELPS or HINDERS progress toward the goal
4. Choose the most EFFICIENT resolution strategy
5. Plan how to CONTINUE after resolving the obstruction

Common scenarios:
- **Autocomplete after typing**: Usually helpful - select relevant option or dismiss if not needed
- **Modal after clicking**: Usually blocking - interact with modal or close it
- **Loading indicators**: Usually temporary - wait for completion
- **Validation errors**: Usually critical - must fix before continuing

Be decisive and practical. The goal is to keep the automation moving toward its objective.`;
  }

  /**
   * Format action for display in prompt
   */
  private formatAction(action: Record<string, unknown>): string {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName] as any;
    
    switch (actionName) {
      case 'input_text':
        return `Type "${actionArgs.text}" into ${actionArgs.description || 'field'}`;
      case 'click_element':
        return `Click ${actionArgs.description || actionArgs.text || 'element'}`;
      case 'select_option':
        return `Select "${actionArgs.option}" from ${actionArgs.description || 'dropdown'}`;
      case 'navigate':
        return `Navigate to ${actionArgs.url}`;
      default:
        return `${actionName}: ${JSON.stringify(actionArgs)}`;
    }
  }

  /**
   * Quick analysis without LLM for simple cases
   */
  analyzeSimpleObstruction(context: ObstructionContext): ObstructionAnalysisResponse | null {
    const { domChange, lastAction, nextAction } = context;
    
    // Simple heuristics for common cases
    const lastActionType = Object.keys(lastAction)[0];
    
    if (lastActionType === 'input_text' && domChange.type === DOMChangeType.INTERACTIVE) {
      // Likely autocomplete
      return {
        analysis: {
          whatAppeared: 'Autocomplete dropdown with suggestions',
          whyItAppeared: 'Text input triggered autocomplete suggestions',
          impactOnNextAction: 'May interfere with next action if not handled',
          confidence: 0.8
        },
        resolution: {
          strategy: 'interact',
          specificAction: 'Select relevant autocomplete option or press Escape to dismiss',
          reasoning: 'Autocomplete can help or hinder - need to determine relevance',
          urgency: 'medium'
        },
        continuation: {
          shouldContinueWithPlan: true,
          planAdjustments: 'May need to adjust element targeting if DOM changed'
        }
      };
    }

    if (lastActionType === 'click_element' && domChange.type === DOMChangeType.BLOCKING) {
      // Likely modal
      return {
        analysis: {
          whatAppeared: 'Modal or blocking overlay',
          whyItAppeared: 'Click action opened a modal dialog',
          impactOnNextAction: 'Blocks all further actions until resolved',
          confidence: 0.9
        },
        resolution: {
          strategy: 'dismiss',
          specificAction: 'Close modal by clicking X button or pressing Escape',
          reasoning: 'Modal blocks further progress and must be handled',
          urgency: 'critical'
        },
        continuation: {
          shouldContinueWithPlan: true,
          planAdjustments: 'Continue with original plan after modal is closed'
        }
      };
    }

    return null; // Fall back to LLM analysis
  }
}