import { createLogger } from '@src/background/log';
import { createVisionModel } from '../../agent/helper';
import type { HumanMessage } from '@langchain/core/messages';

const logger = createLogger('VisualElementDetector');

export interface VisualElementQuery {
  visual?: string;        // "blue Submit button"
  near?: string;          // "email input field"
  fallback?: string;      // "[type='submit']"
  confidence?: number;    // minimum confidence score (0-1)
}

export interface ElementMatch {
  element: Element;
  confidence: number;
  reasoning: string;
  selector: string;
}

export interface DetectionResult {
  success: boolean;
  matches: ElementMatch[];
  error?: string;
  fallbackUsed?: boolean;
}

export class VisualElementDetector {
  private visionModel: any;
  private screenshotCache: Map<string, string> = new Map();
  private lastScreenshotTime = 0;
  private readonly SCREENSHOT_CACHE_TTL = 2000; // 2 seconds

  constructor(visionProvider: string, visionModel: string) {
    try {
      this.visionModel = createVisionModel(visionProvider, visionModel);
      logger.info(`Initialized VisualElementDetector with ${visionProvider}:${visionModel}`);
    } catch (error) {
      logger.error('Failed to initialize vision model:', error);
      throw new Error(`Failed to initialize vision model: ${error}`);
    }
  }

  /**
   * Find elements using visual description and AI analysis
   */
  async findElement(query: VisualElementQuery, tabId: number): Promise<DetectionResult> {
    const startTime = Date.now();
    logger.info(`Finding element with query:`, query);

    try {
      // 1. Try fallback selector first (fastest path)
      if (query.fallback) {
        const fallbackResult = await this.tryFallbackSelector(query.fallback, tabId);
        if (fallbackResult.success) {
          logger.info(`Found element using fallback selector in ${Date.now() - startTime}ms`);
          return { ...fallbackResult, fallbackUsed: true };
        }
      }

      // 2. Use visual detection if we have a visual description
      if (query.visual) {
        const visualResult = await this.detectWithVision(query, tabId);
        if (visualResult.success) {
          logger.info(`Found element using vision in ${Date.now() - startTime}ms`);
          return visualResult;
        }
      }

      // 3. If all methods fail
      return {
        success: false,
        matches: [],
        error: 'No element found matching the criteria'
      };

    } catch (error) {
      logger.error('Error in findElement:', error);
      return {
        success: false,
        matches: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Try using the fallback CSS selector
   */
  private async tryFallbackSelector(selector: string, tabId: number): Promise<DetectionResult> {
    try {
      // Execute selector in the page context
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          const elements = document.querySelectorAll(sel);
          if (elements.length === 0) return null;
          
          // Return info about found elements
          return Array.from(elements).map(el => ({
            tagName: el.tagName,
            textContent: el.textContent?.slice(0, 100) || '',
            className: el.className,
            id: el.id,
            selector: sel
          }));
        },
        args: [selector]
      });

      if (result[0]?.result && result[0].result.length > 0) {
        // For now, we can't return actual DOM elements across boundaries
        // We'll return metadata that can be used to re-query the element
        const matches: ElementMatch[] = result[0].result.map((elementInfo: any) => ({
          element: null as any, // Will be resolved later
          confidence: 0.9, // High confidence for direct selectors
          reasoning: `Found using fallback selector: ${selector}`,
          selector: selector
        }));

        return {
          success: true,
          matches
        };
      }

      return {
        success: false,
        matches: []
      };

    } catch (error) {
      logger.error('Error trying fallback selector:', error);
      return {
        success: false,
        matches: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Use AI vision to detect elements
   */
  private async detectWithVision(query: VisualElementQuery, tabId: number): Promise<DetectionResult> {
    try {
      // 1. Take screenshot of the page
      const screenshot = await this.takeScreenshot(tabId);
      if (!screenshot) {
        throw new Error('Failed to take screenshot');
      }

      // 2. Get current page DOM structure for context
      const domContext = await this.getDOMContext(tabId);

      // 3. Create prompt for vision model
      const prompt = this.createVisionPrompt(query, domContext);

      // 4. Send to vision model for analysis
      const visionResponse = await this.analyzeWithVision(prompt, screenshot);

      // 5. Parse response and find matching elements
      return this.parseVisionResponse(visionResponse, tabId);

    } catch (error) {
      logger.error('Error in vision detection:', error);
      return {
        success: false,
        matches: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Take a screenshot of the current tab
   */
  private async takeScreenshot(tabId: number): Promise<string | null> {
    try {
      const cacheKey = `screenshot_${tabId}`;
      const now = Date.now();

      // Use cached screenshot if recent
      if (this.screenshotCache.has(cacheKey) && (now - this.lastScreenshotTime) < this.SCREENSHOT_CACHE_TTL) {
        logger.debug('Using cached screenshot');
        return this.screenshotCache.get(cacheKey)!;
      }

      // Take new screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
      const base64 = dataUrl.split(',')[1];

      // Cache the screenshot
      this.screenshotCache.set(cacheKey, base64);
      this.lastScreenshotTime = now;

      logger.debug('Took new screenshot');
      return base64;

    } catch (error) {
      logger.error('Error taking screenshot:', error);
      return null;
    }
  }

  /**
   * Get DOM context for better element understanding
   */
  private async getDOMContext(tabId: number): Promise<string> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Get basic page info and clickable elements
          const clickableElements = document.querySelectorAll('button, a, input, select, [onclick], [role="button"]');
          const elements = Array.from(clickableElements).slice(0, 20).map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
              index,
              tagName: el.tagName,
              text: el.textContent?.trim().slice(0, 50) || '',
              type: (el as HTMLInputElement).type || '',
              placeholder: (el as HTMLInputElement).placeholder || '',
              className: el.className,
              id: el.id,
              visible: rect.width > 0 && rect.height > 0,
              position: `${Math.round(rect.left)},${Math.round(rect.top)}`
            };
          }).filter(el => el.visible);

          return {
            url: window.location.href,
            title: document.title,
            elements
          };
        }
      });

      return JSON.stringify(result[0]?.result || {}, null, 2);

    } catch (error) {
      logger.error('Error getting DOM context:', error);
      return '{}';
    }
  }

  /**
   * Create a prompt for the vision model
   */
  private createVisionPrompt(query: VisualElementQuery, domContext: string): string {
    return `You are helping with web automation by identifying UI elements in a screenshot.

TASK: Find the element described as "${query.visual}"${query.near ? ` near "${query.near}"` : ''}.

CURRENT PAGE CONTEXT:
${domContext}

INSTRUCTIONS:
1. Look at the screenshot and identify the element that matches the description
2. Consider the spatial relationship if "near" is specified
3. Return a JSON response with this exact format:

{
  "found": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explain why you selected this element",
  "selector": "CSS selector that could target this element",
  "elementInfo": {
    "text": "visible text on the element",
    "type": "button/input/link/etc",
    "position": "approximate position description"
  }
}

Focus on being accurate. If you're not confident (confidence < 0.7), set found to false.`;
  }

  /**
   * Analyze screenshot with vision model
   */
  private async analyzeWithVision(prompt: string, screenshot: string): Promise<string> {
    try {
      const message: HumanMessage = {
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshot}` }
          }
        ]
      } as any;

      const response = await this.visionModel.invoke([message]);
      return response.content || '';

    } catch (error) {
      logger.error('Error analyzing with vision model:', error);
      throw error;
    }
  }

  /**
   * Parse the vision model response
   */
  private parseVisionResponse(response: string, tabId: number): DetectionResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in vision response');
      }

      const visionResult = JSON.parse(jsonMatch[0].replace(/```json\n|\n```/g, ''));

      if (!visionResult.found || visionResult.confidence < (this.getMinConfidence() || 0.7)) {
        return {
          success: false,
          matches: [],
          error: `Element not found or confidence too low (${visionResult.confidence})`
        };
      }

      const match: ElementMatch = {
        element: null as any, // Will be resolved when actually clicking
        confidence: visionResult.confidence,
        reasoning: visionResult.reasoning,
        selector: visionResult.selector
      };

      return {
        success: true,
        matches: [match]
      };

    } catch (error) {
      logger.error('Error parsing vision response:', error);
      return {
        success: false,
        matches: [],
        error: `Failed to parse vision response: ${error}`
      };
    }
  }

  /**
   * Get minimum confidence threshold
   */
  private getMinConfidence(): number {
    return 0.7; // Default confidence threshold
  }

  /**
   * Clear caches
   */
  public clearCaches(): void {
    this.screenshotCache.clear();
    logger.debug('Cleared screenshot cache');
  }
}