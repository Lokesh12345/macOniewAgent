import { createLogger } from '@src/background/log';
import { ObstructionAnalysisResponse } from './obstructionAnalyzer';
import { ActionResult } from '../types';

const logger = createLogger('ResolutionExecutor');

export interface ResolutionResult {
  success: boolean;
  description: string;
  actionsPerformed: string[];
  error?: string;
  domStabilized?: boolean;
}

export class ResolutionExecutor {
  private browserContext: any;

  constructor(browserContext: any) {
    this.browserContext = browserContext;
  }

  /**
   * Execute the resolution strategy determined by the ObstructionAnalyzer
   */
  async executeResolution(analysis: ObstructionAnalysisResponse): Promise<ResolutionResult> {
    // Safety check for undefined analysis
    if (!analysis || !analysis.resolution || !analysis.resolution.strategy) {
      logger.error('🚨 ResolutionExecutor received invalid analysis:', analysis);
      return {
        success: false,
        description: 'Invalid analysis provided to ResolutionExecutor',
        actionsPerformed: [],
        error: 'Analysis or resolution strategy is undefined'
      };
    }

    logger.info(`🛠️ Executing resolution: ${analysis.resolution.strategy} - ${analysis.resolution.specificAction}`);

    const result: ResolutionResult = {
      success: false,
      description: '',
      actionsPerformed: []
    };

    try {
      switch (analysis.resolution.strategy) {
        case 'interact':
          return await this.handleInteraction(analysis);
        
        case 'dismiss':
          return await this.handleDismissal(analysis);
        
        case 'wait':
          return await this.handleWaiting(analysis);
        
        case 'ignore':
          return await this.handleIgnore(analysis);
        
        default:
          result.error = `Unknown resolution strategy: ${analysis.resolution.strategy}`;
          return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Resolution execution failed: ${errorMessage}`);
      
      result.error = errorMessage;
      return result;
    }
  }

  /**
   * Handle interaction strategy (e.g., select from autocomplete)
   */
  private async handleInteraction(analysis: ObstructionAnalysisResponse): Promise<ResolutionResult> {
    const result: ResolutionResult = {
      success: false,
      description: 'Attempted interaction with obstruction',
      actionsPerformed: []
    };

    const specificAction = analysis.resolution.specificAction.toLowerCase();

    // Autocomplete interactions
    if (specificAction.includes('autocomplete') || specificAction.includes('dropdown')) {
      return await this.handleAutocompleteInteraction(analysis, result);
    }

    // Modal interactions
    if (specificAction.includes('modal') || specificAction.includes('dialog')) {
      return await this.handleModalInteraction(analysis, result);
    }

    // Generic click interactions
    if (specificAction.includes('click')) {
      return await this.handleClickInteraction(analysis, result);
    }

    // Fallback: try multiple interaction strategies
    return await this.handleGenericInteraction(analysis, result);
  }

  /**
   * Handle autocomplete/dropdown interactions with LLM decision making
   */
  private async handleAutocompleteInteraction(
    analysis: ObstructionAnalysisResponse, 
    result: ResolutionResult
  ): Promise<ResolutionResult> {
    logger.info('🎯 Handling autocomplete interaction with intelligent analysis');

    // Strategy 1: Get available options and let LLM decide
    try {
      const availableOptions = await this.getAutocompleteOptions();
      
      if (availableOptions.length > 0) {
        logger.info(`Found ${availableOptions.length} autocomplete options:`, availableOptions);
        
        // TODO: Ask LLM what to do with these options based on context
        // For now, try the first generic option as fallback
        const firstOptionSelector = '[role="option"]:first-child, [role="listbox"] [role="option"]:first-child, [role="listbox"] li:first-child';
        
        const clicked = await this.safeClick(firstOptionSelector);
        if (clicked) {
          result.success = true;
          result.description = `Successfully selected first available option`;
          result.actionsPerformed.push(`Clicked: ${firstOptionSelector}`);
          result.domStabilized = await this.waitForDOMStabilization();
          return result;
        }
      }
    } catch (e) {
      logger.warning('Failed to analyze autocomplete options:', e);
    }

    // Strategy 2: If selection failed, try to dismiss
    logger.info('Selection failed or no suitable options found, attempting to dismiss autocomplete');
    return await this.dismissObstruction(result);
  }

  /**
   * Get available autocomplete options for LLM analysis
   */
  private async getAutocompleteOptions(): Promise<Array<{text: string, selector: string}>> {
    try {
      const page = await this.browserContext.getCurrentPage();
      
      const options = await page.evaluateInPage(() => {
        const selectors = [
          '[role="option"]',
          '[role="listbox"] li',
          '.autocomplete-suggestions li'
        ];
        
        const foundOptions: Array<{text: string, selector: string}> = [];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el, index) => {
            const text = el.textContent?.trim() || '';
            if (text) {
              foundOptions.push({
                text,
                selector: `${selector}:nth-child(${index + 1})`
              });
            }
          });
          
          if (foundOptions.length > 0) break; // Use first successful selector type
        }
        
        return foundOptions;
      });
      
      return options;
    } catch (error) {
      logger.warning('Failed to get autocomplete options:', error);
      return [];
    }
  }

  /**
   * Handle modal/dialog interactions
   */
  private async handleModalInteraction(
    analysis: ObstructionAnalysisResponse,
    result: ResolutionResult
  ): Promise<ResolutionResult> {
    logger.info('🔔 Handling modal interaction');

    // Check if we need to interact with modal content first
    const specificAction = analysis.resolution.specificAction.toLowerCase();
    
    if (specificAction.includes('fill') || specificAction.includes('enter')) {
      // Modal requires input - this would need more context
      logger.warning('Modal requires input - not implemented yet');
      result.error = 'Modal input handling not implemented';
      return result;
    }

    // Otherwise, try to close/dismiss the modal
    return await this.dismissObstruction(result);
  }

  /**
   * Handle generic click interactions
   */
  private async handleClickInteraction(
    analysis: ObstructionAnalysisResponse,
    result: ResolutionResult
  ): Promise<ResolutionResult> {
    logger.info('👆 Handling click interaction');

    const specificAction = analysis.resolution.specificAction;
    
    // Extract potential targets from the specific action
    const clickTargets = this.extractClickTargets(specificAction);
    
    for (const target of clickTargets) {
      try {
        const clicked = await this.safeClick(target.selector);
        if (clicked) {
          result.success = true;
          result.description = `Successfully clicked ${target.description}`;
          result.actionsPerformed.push(`Clicked: ${target.selector}`);
          result.domStabilized = await this.waitForDOMStabilization();
          return result;
        }
      } catch (e) {
        logger.warning(`Failed to click ${target.selector}:`, e);
      }
    }

    result.error = 'No clickable targets found';
    return result;
  }

  /**
   * Handle generic interaction when specific strategy unclear
   */
  private async handleGenericInteraction(
    analysis: ObstructionAnalysisResponse,
    result: ResolutionResult
  ): Promise<ResolutionResult> {
    logger.info('🔧 Handling generic interaction');

    // Try common interaction patterns in order of likelihood
    const strategies = [
      () => this.handleAutocompleteInteraction(analysis, { ...result }),
      () => this.handleModalInteraction(analysis, { ...result }),
      () => this.dismissObstruction({ ...result })
    ];

    for (const strategy of strategies) {
      const strategyResult = await strategy();
      if (strategyResult.success) {
        return strategyResult;
      }
    }

    result.error = 'All interaction strategies failed';
    return result;
  }

  /**
   * Handle dismissal strategy (close modals, dismiss dropdowns)
   */
  private async handleDismissal(analysis: ObstructionAnalysisResponse): Promise<ResolutionResult> {
    logger.info('❌ Handling dismissal');

    const result: ResolutionResult = {
      success: false,
      description: 'Attempted to dismiss obstruction',
      actionsPerformed: []
    };

    return await this.dismissObstruction(result);
  }

  /**
   * Handle waiting strategy (wait for loading, animations, etc.)
   */
  private async handleWaiting(analysis: ObstructionAnalysisResponse): Promise<ResolutionResult> {
    logger.info('⏳ Handling waiting strategy');

    const result: ResolutionResult = {
      success: false,
      description: 'Waited for obstruction to resolve',
      actionsPerformed: []
    };

    // Determine wait time based on urgency
    const waitTime = this.getWaitTimeForUrgency(analysis.resolution.urgency);
    
    result.actionsPerformed.push(`Waited ${waitTime}ms`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Check if DOM stabilized
    result.domStabilized = await this.waitForDOMStabilization();
    result.success = result.domStabilized || false;
    result.description = result.success ? 
      'Obstruction resolved after waiting' : 
      'Obstruction still present after waiting';

    return result;
  }

  /**
   * Handle ignore strategy (continue without addressing obstruction)
   */
  private async handleIgnore(analysis: ObstructionAnalysisResponse): Promise<ResolutionResult> {
    logger.info('🚫 Ignoring obstruction as recommended');

    return {
      success: true,
      description: 'Obstruction ignored as it does not affect next action',
      actionsPerformed: ['Ignored obstruction'],
      domStabilized: true
    };
  }

  /**
   * Generic dismissal method that tries multiple approaches
   */
  private async dismissObstruction(result: ResolutionResult): Promise<ResolutionResult> {
    // Strategy 1: Press Escape key
    try {
      const page = await this.browserContext.getCurrentPage();
      await page.sendKeys('Escape');
      result.actionsPerformed.push('Pressed Escape key');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const stabilized = await this.waitForDOMStabilization();
      if (stabilized) {
        result.success = true;
        result.description = 'Successfully dismissed obstruction with Escape key';
        result.domStabilized = true;
        return result;
      }
    } catch (e) {
      logger.warning('Escape key dismissal failed:', e);
    }

    // Strategy 2: Click common close buttons
    const closeButtonSelectors = [
      '[aria-label="Close"]',
      '[data-dismiss="modal"]',
      '.close',
      '.modal-close',
      '[aria-label="close"]',
      'button[title="Close"]',
      '[role="button"][aria-label*="close"]'
    ];

    for (const selector of closeButtonSelectors) {
      try {
        const clicked = await this.safeClick(selector);
        if (clicked) {
          result.success = true;
          result.description = `Successfully dismissed obstruction by clicking ${selector}`;
          result.actionsPerformed.push(`Clicked: ${selector}`);
          result.domStabilized = await this.waitForDOMStabilization();
          return result;
        }
      } catch (e) {
        logger.warning(`Failed to click close button ${selector}:`, e);
      }
    }

    // Strategy 3: Click outside modal (backdrop click)
    try {
      // Try to click on body or backdrop elements to dismiss modal
      const backdropClicked = await this.safeClick('body') || 
                             await this.safeClick('.modal-backdrop') ||
                             await this.safeClick('[data-backdrop="static"]');
      
      if (backdropClicked) {
        result.actionsPerformed.push('Clicked outside modal');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const stabilized = await this.waitForDOMStabilization();
        if (stabilized) {
          result.success = true;
          result.description = 'Successfully dismissed obstruction by clicking outside';
          result.domStabilized = true;
          return result;
        }
      }
    } catch (e) {
      logger.warning('Backdrop click dismissal failed:', e);
    }

    result.error = 'All dismissal strategies failed';
    return result;
  }

  /**
   * Safely click an element by selector
   */
  private async safeClick(selector: string): Promise<boolean> {
    try {
      const page = await this.browserContext.getCurrentPage();
      
      // Check if element exists and is visible
      const elementExists = await page.evaluateInPage((sel) => {
        const element = document.querySelector(sel);
        return element && element.offsetParent !== null; // Element exists and is visible
      }, selector);

      if (!elementExists) {
        return false;
      }

      // Use Page class evaluateInPage method to click elements
      await page.evaluateInPage((sel) => {
        const element = document.querySelector(sel);
        if (element && element instanceof HTMLElement) {
          element.click();
          return true;
        }
        return false;
      }, selector);
      
      return true;
    } catch (error) {
      logger.warning(`Click failed for selector ${selector}:`, error);
      return false;
    }
  }

  /**
   * Wait for DOM to stabilize (no changes for a period)
   */
  private async waitForDOMStabilization(maxWait: number = 3000): Promise<boolean> {
    const stabilizationTime = 500; // Wait for 500ms of no changes
    let lastElementCount = 0;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const page = await this.browserContext.getCurrentPage();
        const currentElementCount = await page.evaluateInPage(() => 
          document.body.children.length
        );
        
        if (currentElementCount === lastElementCount) {
          // No change for stabilization time
          await new Promise(resolve => setTimeout(resolve, stabilizationTime));
          
          const finalElementCount = await page.evaluateInPage(() => 
            document.body.children.length
          );
          
          if (finalElementCount === currentElementCount) {
            return true; // DOM is stable
          }
        }
        
        lastElementCount = currentElementCount;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        return false;
      }
    }
    
    return false; // Did not stabilize within max wait time
  }

  /**
   * Extract click targets from specific action text
   */
  private extractClickTargets(specificAction: string): Array<{ selector: string; description: string }> {
    const targets = [];
    
    if (specificAction.includes('first')) {
      targets.push({ selector: ':first-child', description: 'first element' });
    }
    
    if (specificAction.includes('button')) {
      targets.push({ selector: 'button', description: 'button' });
    }
    
    if (specificAction.includes('close') || specificAction.includes('dismiss')) {
      targets.push({ selector: '[aria-label="Close"]', description: 'close button' });
      targets.push({ selector: '.close', description: 'close element' });
    }
    
    // Default fallback
    if (targets.length === 0) {
      targets.push({ selector: 'button, [role="button"], a', description: 'interactive element' });
    }
    
    return targets;
  }

  /**
   * Get appropriate wait time based on urgency
   */
  private getWaitTimeForUrgency(urgency: string): number {
    switch (urgency) {
      case 'critical': return 1000;  // 1 second
      case 'high': return 2000;     // 2 seconds
      case 'medium': return 3000;   // 3 seconds
      case 'low': return 5000;      // 5 seconds
      default: return 2000;
    }
  }
}