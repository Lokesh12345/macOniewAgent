/**
 * Task Rewriter System
 * Transforms ambiguous user tasks into structured, trackable goals
 * Similar to Claude Code's task clarification system
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface RewrittenTask {
  originalTask: string;
  rewrittenTask: string;
  goalType: 'quiz' | 'form' | 'navigation' | 'search' | 'general';
  completionCriteria: {
    type: 'count' | 'condition' | 'navigation' | 'content';
    target: number | string;
    description: string;
  };
  tracking: {
    shouldTrackProgress: boolean;
    progressMetric: string;
    completionSignal: string;
  };
  context: {
    domain?: string;
    pageType?: string;
    expectedElements?: string[];
  };
}

export class TaskRewriter {
  private llm: BaseChatModel;

  constructor(llm: BaseChatModel) {
    this.llm = llm;
  }

  /**
   * Rewrite a user task to be more structured and trackable
   */
  async rewriteTask(originalTask: string, currentUrl?: string, pageTitle?: string): Promise<RewrittenTask> {
    const prompt = `
You are a task clarification system. Your job is to transform ambiguous user tasks into structured, trackable goals.

ORIGINAL TASK: "${originalTask}"
CURRENT URL: ${currentUrl || 'unknown'}
PAGE TITLE: ${pageTitle || 'unknown'}

Analyze this task and provide a JSON response with the following structure:

{
  "originalTask": "${originalTask}",
  "rewrittenTask": "Clear, specific task with completion criteria",
  "goalType": "quiz|form|navigation|search|general",
  "completionCriteria": {
    "type": "count|condition|navigation|content",
    "target": "number or specific condition",
    "description": "What indicates completion"
  },
  "tracking": {
    "shouldTrackProgress": true/false,
    "progressMetric": "what to count/track",
    "completionSignal": "specific signal that task is done"
  },
  "context": {
    "domain": "website domain if relevant",
    "pageType": "quiz|form|article|etc",
    "expectedElements": ["button types", "form fields", "etc"]
  }
}

ANALYSIS RULES:
1. If task mentions numbers (like "3 questions"), extract the exact count
2. If task is about quizzes/tests, set goalType to "quiz" and track question count
3. If task is about forms, set goalType to "form" and track field completion
4. Always make the rewritten task specific and measurable
5. Include clear stopping conditions

EXAMPLES:

Input: "answer this test answer 3 questions in this"
Output: {
  "rewrittenTask": "Complete a quiz by answering exactly 3 questions, then stop",
  "goalType": "quiz",
  "completionCriteria": {
    "type": "count",
    "target": 3,
    "description": "Answer exactly 3 quiz questions"
  },
  "tracking": {
    "shouldTrackProgress": true,
    "progressMetric": "questions_answered",
    "completionSignal": "3 questions completed"
  }
}

Input: "fill out the contact form"
Output: {
  "rewrittenTask": "Complete and submit the contact form by filling all required fields",
  "goalType": "form",
  "completionCriteria": {
    "type": "condition",
    "target": "form_submitted",
    "description": "Form successfully submitted"
  }
}

Respond ONLY with valid JSON:`;

    try {
      const response = await this.llm.invoke([
        { role: 'user', content: prompt }
      ]);

      const content = response.content.toString();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as RewrittenTask;
        
        // Validate and set defaults
        return {
          originalTask,
          rewrittenTask: parsed.rewrittenTask || originalTask,
          goalType: parsed.goalType || 'general',
          completionCriteria: {
            type: parsed.completionCriteria?.type || 'condition',
            target: parsed.completionCriteria?.target || 'unknown',
            description: parsed.completionCriteria?.description || 'Task completion'
          },
          tracking: {
            shouldTrackProgress: parsed.tracking?.shouldTrackProgress ?? true,
            progressMetric: parsed.tracking?.progressMetric || 'progress',
            completionSignal: parsed.tracking?.completionSignal || 'task_done'
          },
          context: {
            domain: parsed.context?.domain || this.extractDomain(currentUrl),
            pageType: parsed.context?.pageType || 'unknown',
            expectedElements: parsed.context?.expectedElements || []
          }
        };
      } else {
        throw new Error('No JSON found in LLM response');
      }
    } catch (error) {
      console.log('🔄 TASK REWRITER: LLM failed, using fallback analysis:', error);
      
      // Fallback analysis for common patterns
      return this.fallbackRewrite(originalTask, currentUrl, pageTitle);
    }
  }

  /**
   * Fallback rewriter for when LLM fails
   */
  private fallbackRewrite(originalTask: string, currentUrl?: string, pageTitle?: string): RewrittenTask {
    const lowerTask = originalTask.toLowerCase();
    
    // Quiz/test detection
    if (lowerTask.includes('quiz') || lowerTask.includes('test') || lowerTask.includes('question')) {
      const numberMatch = originalTask.match(/(\d+)\s*question/i);
      const questionCount = numberMatch ? parseInt(numberMatch[1]) : 1;
      
      return {
        originalTask,
        rewrittenTask: `Complete a quiz by answering exactly ${questionCount} question${questionCount > 1 ? 's' : ''}, then stop`,
        goalType: 'quiz',
        completionCriteria: {
          type: 'count',
          target: questionCount,
          description: `Answer exactly ${questionCount} quiz question${questionCount > 1 ? 's' : ''}`
        },
        tracking: {
          shouldTrackProgress: true,
          progressMetric: 'questions_answered',
          completionSignal: `${questionCount} questions completed`
        },
        context: {
          domain: this.extractDomain(currentUrl),
          pageType: 'quiz',
          expectedElements: ['question', 'answer options', 'next button', 'submit button']
        }
      };
    }
    
    // Form detection
    if (lowerTask.includes('form') || lowerTask.includes('fill') || lowerTask.includes('submit')) {
      return {
        originalTask,
        rewrittenTask: 'Complete and submit the form by filling all required fields',
        goalType: 'form',
        completionCriteria: {
          type: 'condition',
          target: 'form_submitted',
          description: 'Form successfully submitted'
        },
        tracking: {
          shouldTrackProgress: true,
          progressMetric: 'fields_completed',
          completionSignal: 'form submission success'
        },
        context: {
          domain: this.extractDomain(currentUrl),
          pageType: 'form',
          expectedElements: ['input fields', 'submit button']
        }
      };
    }
    
    // Generic fallback
    return {
      originalTask,
      rewrittenTask: originalTask,
      goalType: 'general',
      completionCriteria: {
        type: 'condition',
        target: 'task_complete',
        description: 'Task completion'
      },
      tracking: {
        shouldTrackProgress: false,
        progressMetric: 'progress',
        completionSignal: 'task_done'
      },
      context: {
        domain: this.extractDomain(currentUrl),
        pageType: 'unknown',
        expectedElements: []
      }
    };
  }

  private extractDomain(url?: string): string {
    if (!url) return 'unknown';
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }
}