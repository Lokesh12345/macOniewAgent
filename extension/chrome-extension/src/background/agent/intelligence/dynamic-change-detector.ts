/**
 * Dynamic Change Detection System
 * Uses AI reasoning and learning to detect meaningful changes on any website
 * NO hardcoded patterns - fully adaptive and intelligent
 */

import type Page from '../../browser/page';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface DOMSnapshot {
  timestamp: number;
  visualFingerprint: string;
  semanticStructure: any;
  interactiveElements: any[];
  userVisibleContent: string;
  rawMetrics: {
    totalElements: number;
    visibleElements: number;
    interactiveElements: number;
    textLength: number;
    imageCount: number;
  };
}

export interface ChangeAnalysis {
  hasChanged: boolean;
  changeConfidence: number;
  changeType: 'content' | 'navigation' | 'form' | 'visual' | 'structural' | 'unknown';
  changeDescription: string;
  reasoning: string;
  isSuccessfulInteraction: boolean;
  learningData: any;
}

export class DynamicChangeDetector {
  private page: Page;
  private llm: BaseChatModel;
  private learningHistory: Map<string, any[]> = new Map();
  private patterns: Map<string, any> = new Map();

  constructor(page: Page, llm: BaseChatModel) {
    this.page = page;
    this.llm = llm;
  }

  /**
   * Take a comprehensive DOM snapshot for comparison
   */
  async takeSnapshot(): Promise<DOMSnapshot> {
    try {
      // 🧠 DYNAMIC: Ensure page is properly attached
      if (!this.page.attached) {
        await this.page.attachPuppeteer();
      }
      
      const snapshot = await this.page.evaluate(() => {
        // 🧠 DYNAMIC: Capture universal indicators without hardcoded selectors
        
        // Get all visible elements and their properties
        const allElements = Array.from(document.querySelectorAll('*'));
        const visibleElements = allElements.filter(el => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 rect.width > 0 && rect.height > 0;
        });

        // Extract interactive elements with their context
        const interactiveElements = allElements
          .filter(el => {
            const tagName = el.tagName.toLowerCase();
            const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName) ||
                                 el.hasAttribute('onclick') ||
                                 el.hasAttribute('role') ||
                                 window.getComputedStyle(el).cursor === 'pointer';
            return isInteractive && visibleElements.includes(el);
          })
          .map(el => ({
            tagName: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 100) || '',
            attributes: {
              type: el.getAttribute('type'),
              role: el.getAttribute('role'),
              class: el.className,
              id: el.id
            },
            position: el.getBoundingClientRect(),
            isChecked: (el as HTMLInputElement).checked || false,
            value: (el as HTMLInputElement).value || ''
          }));

        // Create a visual fingerprint of the page structure
        const visualFingerprint = visibleElements
          .map(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return `${el.tagName}:${Math.round(rect.x/10)}:${Math.round(rect.y/10)}:${Math.round(rect.width/10)}:${Math.round(rect.height/10)}:${style.backgroundColor}:${el.textContent?.substring(0, 20)}`;
          })
          .join('|');

        // Extract semantic structure without assumptions
        const semanticStructure = {
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent?.trim().substring(0, 200) || '',
            position: h.getBoundingClientRect()
          })),
          forms: Array.from(document.querySelectorAll('form')).map(form => ({
            inputs: form.querySelectorAll('input, select, textarea').length,
            buttons: form.querySelectorAll('button, input[type="submit"], input[type="button"]').length,
            hasRequired: form.querySelectorAll('[required]').length > 0
          })),
          lists: Array.from(document.querySelectorAll('ul, ol')).map(list => ({
            items: list.querySelectorAll('li').length,
            text: list.textContent?.substring(0, 100) || ''
          }))
        };

        // Get user-visible content without structure assumptions
        const userVisibleContent = visibleElements
          .filter(el => el.textContent && el.textContent.trim().length > 5)
          .map(el => el.textContent?.trim())
          .join(' ')
          .substring(0, 2000);

        return {
          timestamp: Date.now(),
          visualFingerprint,
          semanticStructure,
          interactiveElements,
          userVisibleContent,
          rawMetrics: {
            totalElements: allElements.length,
            visibleElements: visibleElements.length,
            interactiveElements: interactiveElements.length,
            textLength: document.body.textContent?.length || 0,
            imageCount: document.images.length
          }
        };
      });

      return snapshot as DOMSnapshot;
    } catch (error) {
      console.log('🧠 DYNAMIC: Failed to take DOM snapshot:', error);
      throw error;
    }
  }

  /**
   * Analyze changes between two snapshots using AI reasoning
   */
  async analyzeChanges(
    beforeSnapshot: DOMSnapshot,
    afterSnapshot: DOMSnapshot,
    actionContext: {
      elementText: string;
      actionType: string;
      userIntent: string;
    }
  ): Promise<ChangeAnalysis> {
    // 🧠 STEP 1: Raw comparison analysis
    const rawChanges = this.calculateRawChanges(beforeSnapshot, afterSnapshot);
    
    // 🧠 STEP 2: AI-powered semantic analysis
    const semanticAnalysis = await this.performSemanticAnalysis(
      beforeSnapshot, 
      afterSnapshot, 
      actionContext,
      rawChanges
    );
    
    // 🧠 STEP 3: Learning-based pattern recognition
    const patternAnalysis = this.analyzeLearnedPatterns(actionContext, rawChanges);
    
    // 🧠 STEP 4: Synthesize final decision
    const finalAnalysis = this.synthesizeAnalysis(semanticAnalysis, patternAnalysis, rawChanges);
    
    // 🧠 STEP 5: Learn from this interaction
    this.learnFromInteraction(actionContext, rawChanges, finalAnalysis);
    
    return finalAnalysis;
  }

  /**
   * Calculate raw differences between snapshots
   */
  private calculateRawChanges(before: DOMSnapshot, after: DOMSnapshot): any {
    return {
      visualFingerprintChanged: before.visualFingerprint !== after.visualFingerprint,
      visualSimilarity: this.calculateStringSimilarity(before.visualFingerprint, after.visualFingerprint),
      contentChanged: before.userVisibleContent !== after.userVisibleContent,
      contentSimilarity: this.calculateStringSimilarity(before.userVisibleContent, after.userVisibleContent),
      metricsChanged: {
        elements: Math.abs(after.rawMetrics.totalElements - before.rawMetrics.totalElements),
        visibleElements: Math.abs(after.rawMetrics.visibleElements - before.rawMetrics.visibleElements),
        interactiveElements: Math.abs(after.rawMetrics.interactiveElements - before.rawMetrics.interactiveElements),
        textLength: Math.abs(after.rawMetrics.textLength - before.rawMetrics.textLength)
      },
      interactiveElementsChanged: this.compareInteractiveElements(before.interactiveElements, after.interactiveElements),
      timeDelta: after.timestamp - before.timestamp
    };
  }

  /**
   * Use LLM to analyze changes semantically
   */
  private async performSemanticAnalysis(
    before: DOMSnapshot,
    after: DOMSnapshot,
    actionContext: any,
    rawChanges: any
  ): Promise<any> {
    try {
      const prompt = `
You are an AI that analyzes web page changes to determine if a user interaction was successful.

ACTION CONTEXT:
- User clicked on: "${actionContext.elementText}"
- Action type: ${actionContext.actionType}
- User intent: ${actionContext.userIntent}

BEFORE INTERACTION:
- Visible content sample: "${before.userVisibleContent.substring(0, 500)}"
- Interactive elements: ${before.interactiveElements.length}
- Headings: ${JSON.stringify(before.semanticStructure.headings.map((h: any) => h.text))}

AFTER INTERACTION:
- Visible content sample: "${after.userVisibleContent.substring(0, 500)}"
- Interactive elements: ${after.interactiveElements.length}
- Headings: ${JSON.stringify(after.semanticStructure.headings.map((h: any) => h.text))}

RAW CHANGES:
- Visual layout changed: ${rawChanges.visualFingerprintChanged}
- Content similarity: ${(rawChanges.contentSimilarity * 100).toFixed(1)}%
- Element count changes: ${JSON.stringify(rawChanges.metricsChanged)}

ANALYSIS TASK:
Determine if the user's interaction was successful. Consider:
1. Did the page respond appropriately to the action?
2. What type of change occurred (navigation, form update, content change, etc.)?
3. Is this the expected result for this type of interaction?
4. Rate confidence (0-100) that the interaction was successful

Respond in JSON format:
{
  "hasChanged": boolean,
  "changeConfidence": number (0-100),
  "changeType": "content|navigation|form|visual|structural|unknown",
  "changeDescription": "brief description of what changed",
  "reasoning": "explanation of your analysis",
  "isSuccessfulInteraction": boolean
}`;

      const response = await this.llm.invoke([
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in LLM response');
      }
    } catch (error) {
      console.log('🧠 DYNAMIC: LLM analysis failed, using fallback:', error);
      
      // Fallback analysis
      return {
        hasChanged: rawChanges.visualFingerprintChanged || rawChanges.contentChanged,
        changeConfidence: rawChanges.contentSimilarity < 0.9 ? 80 : 20,
        changeType: 'unknown',
        changeDescription: 'Fallback analysis detected changes',
        reasoning: 'LLM analysis unavailable, using basic comparison',
        isSuccessfulInteraction: rawChanges.visualFingerprintChanged || rawChanges.contentChanged
      };
    }
  }

  /**
   * Analyze based on learned patterns
   */
  private analyzeLearnedPatterns(actionContext: any, rawChanges: any): any {
    const domain = this.page.url().split('/')[2] || 'unknown';
    const elementType = actionContext.elementText.toLowerCase();
    
    // Check learned patterns for this domain and element type
    const domainPatterns = this.learningHistory.get(domain) || [];
    const similarActions = domainPatterns.filter(p => 
      p.elementText.toLowerCase().includes(elementType) ||
      elementType.includes(p.elementText.toLowerCase())
    );

    if (similarActions.length > 0) {
      const successRate = similarActions.filter(a => a.wasSuccessful).length / similarActions.length;
      const typicalChanges = this.calculateTypicalChanges(similarActions);
      
      return {
        hasLearnedPatterns: true,
        successRate,
        typicalChanges,
        confidence: Math.min(similarActions.length * 10, 90) // More data = more confidence
      };
    }

    return {
      hasLearnedPatterns: false,
      confidence: 0
    };
  }

  /**
   * Synthesize final analysis from all sources
   */
  private synthesizeAnalysis(semanticAnalysis: any, patternAnalysis: any, rawChanges: any): ChangeAnalysis {
    // Combine confidence from multiple sources
    let confidence = semanticAnalysis.changeConfidence;
    
    if (patternAnalysis.hasLearnedPatterns) {
      // Weight learned patterns highly
      confidence = (confidence + patternAnalysis.confidence * patternAnalysis.successRate) / 2;
    }

    // Boost confidence if multiple indicators agree
    if (semanticAnalysis.hasChanged && rawChanges.visualFingerprintChanged) {
      confidence = Math.min(confidence + 20, 100);
    }

    return {
      hasChanged: semanticAnalysis.hasChanged || rawChanges.visualFingerprintChanged,
      changeConfidence: confidence,
      changeType: semanticAnalysis.changeType,
      changeDescription: semanticAnalysis.changeDescription,
      reasoning: `${semanticAnalysis.reasoning} | Pattern analysis: ${patternAnalysis.hasLearnedPatterns ? `${patternAnalysis.confidence}% confidence from ${patternAnalysis.successRate * 100}% historical success rate` : 'No learned patterns'}`,
      isSuccessfulInteraction: semanticAnalysis.isSuccessfulInteraction,
      learningData: {
        rawChanges,
        patternAnalysis,
        semanticAnalysis
      }
    };
  }

  /**
   * Learn from this interaction for future analysis
   */
  private learnFromInteraction(actionContext: any, rawChanges: any, analysis: ChangeAnalysis): void {
    const domain = this.page.url().split('/')[2] || 'unknown';
    
    if (!this.learningHistory.has(domain)) {
      this.learningHistory.set(domain, []);
    }

    const domainHistory = this.learningHistory.get(domain)!;
    domainHistory.push({
      timestamp: Date.now(),
      elementText: actionContext.elementText,
      actionType: actionContext.actionType,
      rawChanges,
      wasSuccessful: analysis.isSuccessfulInteraction,
      changeType: analysis.changeType,
      confidence: analysis.changeConfidence
    });

    // Keep only last 100 interactions per domain
    if (domainHistory.length > 100) {
      domainHistory.splice(0, domainHistory.length - 100);
    }

    console.log(`🧠 LEARNING: Recorded interaction for ${domain}. Total learned: ${domainHistory.length}`);
  }

  // Utility methods
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  private compareInteractiveElements(before: any[], after: any[]): any {
    const beforeMap = new Map(before.map(el => [`${el.tagName}:${el.text}`, el]));
    const afterMap = new Map(after.map(el => [`${el.tagName}:${el.text}`, el]));
    
    const added = after.filter(el => !beforeMap.has(`${el.tagName}:${el.text}`));
    const removed = before.filter(el => !afterMap.has(`${el.tagName}:${el.text}`));
    const changed = [];
    
    for (const [key, afterEl] of afterMap) {
      const beforeEl = beforeMap.get(key);
      if (beforeEl && (beforeEl.isChecked !== afterEl.isChecked || beforeEl.value !== afterEl.value)) {
        changed.push({ before: beforeEl, after: afterEl });
      }
    }
    
    return { added, removed, changed };
  }

  private calculateTypicalChanges(similarActions: any[]): any {
    const changes = similarActions.map(a => a.rawChanges);
    return {
      avgContentSimilarity: changes.reduce((sum, c) => sum + c.contentSimilarity, 0) / changes.length,
      avgElementChanges: changes.reduce((sum, c) => sum + c.metricsChanged.elements, 0) / changes.length,
      commonChangeType: this.findMostCommon(similarActions.map(a => a.changeType))
    };
  }

  private findMostCommon(array: string[]): string {
    const counts = array.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): any {
    const stats = {
      domainsLearned: this.learningHistory.size,
      totalInteractions: 0,
      successRateByDomain: {} as Record<string, number>
    };

    for (const [domain, history] of this.learningHistory) {
      stats.totalInteractions += history.length;
      const successCount = history.filter(h => h.wasSuccessful).length;
      stats.successRateByDomain[domain] = history.length > 0 ? successCount / history.length : 0;
    }

    return stats;
  }
}