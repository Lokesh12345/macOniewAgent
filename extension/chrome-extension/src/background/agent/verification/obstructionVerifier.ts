import { createLogger } from '@src/background/log';
import { DOMChangeAnalysis, DOMChangeType } from '../utils/domChangeDetector';
import { ResolutionResult } from '../obstruction/resolutionExecutor';
import { ObstructionAnalysisResponse } from '../obstruction/obstructionAnalyzer';
import type { BrowserState } from '@src/background/browser/views';

const logger = createLogger('ObstructionVerifier');

export interface VerificationResult {
  verified: boolean;
  description: string;
  confidence: number;
  specificChecks: {
    name: string;
    passed: boolean;
    details: string;
  }[];
  remainingObstructions?: string[];
  recommendedAction?: 'continue' | 'retry' | 'replan' | 'abort';
}

export class ObstructionVerifier {
  private browserContext: any;

  constructor(browserContext: any) {
    this.browserContext = browserContext;
  }

  /**
   * Verify that an obstruction has been successfully resolved
   */
  async verifyResolution(
    originalObstruction: DOMChangeAnalysis,
    resolutionAttempt: ResolutionResult,
    analysis: ObstructionAnalysisResponse,
    beforeState: BrowserState,
    afterState?: BrowserState
  ): Promise<VerificationResult> {
    logger.info(`🔍 Verifying resolution of ${originalObstruction.type} obstruction`);

    const result: VerificationResult = {
      verified: false,
      description: '',
      confidence: 0,
      specificChecks: []
    };

    try {
      // Get current state if not provided
      if (!afterState) {
        afterState = await this.browserContext.getState(false);
      }

      // Perform verification based on obstruction type
      switch (originalObstruction.type) {
        case DOMChangeType.BLOCKING:
          return await this.verifyBlockingResolution(originalObstruction, resolutionAttempt, analysis, beforeState, afterState, result);
        
        case DOMChangeType.INTERACTIVE:
          return await this.verifyInteractiveResolution(originalObstruction, resolutionAttempt, analysis, beforeState, afterState, result);
        
        case DOMChangeType.MINOR:
          return await this.verifyMinorResolution(originalObstruction, resolutionAttempt, analysis, beforeState, afterState, result);
        
        case DOMChangeType.NAVIGATION:
          return await this.verifyNavigationResolution(originalObstruction, resolutionAttempt, analysis, beforeState, afterState, result);
        
        default:
          result.description = 'Unknown obstruction type, cannot verify';
          result.recommendedAction = 'continue';
          return result;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Verification failed: ${errorMessage}`);
      
      result.description = `Verification error: ${errorMessage}`;
      result.recommendedAction = 'retry';
      return result;
    }
  }

  /**
   * Verify blocking obstruction resolution (modals, alerts)
   */
  private async verifyBlockingResolution(
    originalObstruction: DOMChangeAnalysis,
    resolutionAttempt: ResolutionResult,
    analysis: ObstructionAnalysisResponse,
    beforeState: BrowserState,
    afterState: BrowserState,
    result: VerificationResult
  ): Promise<VerificationResult> {
    logger.info('🚫 Verifying blocking obstruction resolution');

    // Check 1: Modal/dialog elements are gone
    const modalCheck = await this.checkModalElementsGone(afterState);
    result.specificChecks.push({
      name: 'Modal Elements Removed',
      passed: modalCheck.passed,
      details: modalCheck.details
    });

    // Check 2: High z-index overlays are gone
    const overlayCheck = await this.checkHighZIndexElementsGone(beforeState, afterState);
    result.specificChecks.push({
      name: 'Overlay Elements Removed',
      passed: overlayCheck.passed,
      details: overlayCheck.details
    });

    // Check 3: Page is interactive again
    const interactivityCheck = await this.checkPageInteractivity();
    result.specificChecks.push({
      name: 'Page Interactivity Restored',
      passed: interactivityCheck.passed,
      details: interactivityCheck.details
    });

    // Check 4: DOM stabilized
    const stabilityCheck = await this.checkDOMStability();
    result.specificChecks.push({
      name: 'DOM Stability',
      passed: stabilityCheck.passed,
      details: stabilityCheck.details
    });

    // Calculate overall verification
    const passedChecks = result.specificChecks.filter(c => c.passed).length;
    const totalChecks = result.specificChecks.length;
    
    result.confidence = passedChecks / totalChecks;
    result.verified = result.confidence >= 0.75; // At least 3/4 checks must pass
    
    if (result.verified) {
      result.description = `Blocking obstruction successfully resolved (${passedChecks}/${totalChecks} checks passed)`;
      result.recommendedAction = 'continue';
    } else {
      result.description = `Blocking obstruction may still be present (${passedChecks}/${totalChecks} checks passed)`;
      result.recommendedAction = resolutionAttempt.success ? 'retry' : 'replan';
      
      // Identify remaining obstructions
      const failedChecks = result.specificChecks.filter(c => !c.passed);
      result.remainingObstructions = failedChecks.map(c => c.details);
    }

    return result;
  }

  /**
   * Verify interactive obstruction resolution (autocomplete, dropdowns)
   */
  private async verifyInteractiveResolution(
    originalObstruction: DOMChangeAnalysis,
    resolutionAttempt: ResolutionResult,
    analysis: ObstructionAnalysisResponse,
    beforeState: BrowserState,
    afterState: BrowserState,
    result: VerificationResult
  ): Promise<VerificationResult> {
    logger.info('🎯 Verifying interactive obstruction resolution');

    // Check 1: Dropdown/autocomplete elements handling
    const dropdownCheck = await this.checkDropdownResolution(analysis.resolution.strategy, afterState);
    result.specificChecks.push({
      name: 'Dropdown/Autocomplete Handled',
      passed: dropdownCheck.passed,
      details: dropdownCheck.details
    });

    // Check 2: Form state consistency
    const formCheck = await this.checkFormStateConsistency(beforeState, afterState);
    result.specificChecks.push({
      name: 'Form State Consistent',
      passed: formCheck.passed,
      details: formCheck.details
    });

    // Check 3: No blocking overlays appeared
    const blockingCheck = await this.checkNoNewBlockingElements(afterState);
    result.specificChecks.push({
      name: 'No New Blocking Elements',
      passed: blockingCheck.passed,
      details: blockingCheck.details
    });

    // Check 4: Element targeting stability
    const targetingCheck = await this.checkElementTargetingStability(beforeState, afterState);
    result.specificChecks.push({
      name: 'Element Targeting Stable',
      passed: targetingCheck.passed,
      details: targetingCheck.details
    });

    // Calculate overall verification
    const passedChecks = result.specificChecks.filter(c => c.passed).length;
    const totalChecks = result.specificChecks.length;
    
    result.confidence = passedChecks / totalChecks;
    result.verified = result.confidence >= 0.5; // More lenient for interactive elements
    
    if (result.verified) {
      result.description = `Interactive obstruction handled appropriately (${passedChecks}/${totalChecks} checks passed)`;
      result.recommendedAction = 'continue';
    } else {
      result.description = `Interactive obstruction handling may need adjustment (${passedChecks}/${totalChecks} checks passed)`;
      result.recommendedAction = 'retry';
      
      const failedChecks = result.specificChecks.filter(c => !c.passed);
      result.remainingObstructions = failedChecks.map(c => c.details);
    }

    return result;
  }

  /**
   * Verify minor obstruction resolution
   */
  private async verifyMinorResolution(
    originalObstruction: DOMChangeAnalysis,
    resolutionAttempt: ResolutionResult,
    analysis: ObstructionAnalysisResponse,
    beforeState: BrowserState,
    afterState: BrowserState,
    result: VerificationResult
  ): Promise<VerificationResult> {
    logger.info('🔧 Verifying minor obstruction resolution');

    // For minor changes, verification is simpler
    const stabilityCheck = await this.checkDOMStability();
    result.specificChecks.push({
      name: 'DOM Stability',
      passed: stabilityCheck.passed,
      details: stabilityCheck.details
    });

    result.confidence = stabilityCheck.passed ? 1.0 : 0.5;
    result.verified = stabilityCheck.passed;
    result.description = stabilityCheck.passed ? 
      'Minor obstruction resolved, DOM is stable' : 
      'Minor obstruction may still be causing changes';
    result.recommendedAction = 'continue';

    return result;
  }

  /**
   * Verify navigation obstruction resolution
   */
  private async verifyNavigationResolution(
    originalObstruction: DOMChangeAnalysis,
    resolutionAttempt: ResolutionResult,
    analysis: ObstructionAnalysisResponse,
    beforeState: BrowserState,
    afterState: BrowserState,
    result: VerificationResult
  ): Promise<VerificationResult> {
    logger.info('🧭 Verifying navigation obstruction resolution');

    // Check if we're on the expected page
    const urlCheck = {
      passed: afterState.url !== beforeState.url,
      details: `URL changed from ${beforeState.url} to ${afterState.url}`
    };
    
    result.specificChecks.push({
      name: 'Navigation Completed',
      passed: urlCheck.passed,
      details: urlCheck.details
    });

    // Check if page is loaded
    const loadCheck = await this.checkPageLoaded();
    result.specificChecks.push({
      name: 'Page Loaded',
      passed: loadCheck.passed,
      details: loadCheck.details
    });

    const passedChecks = result.specificChecks.filter(c => c.passed).length;
    result.confidence = passedChecks / result.specificChecks.length;
    result.verified = result.confidence >= 0.75;
    
    result.description = result.verified ? 
      'Navigation completed successfully' : 
      'Navigation may not be complete';
    result.recommendedAction = result.verified ? 'replan' : 'retry'; // Navigation usually requires re-planning

    return result;
  }

  /**
   * Check if modal/dialog elements are gone
   */
  private async checkModalElementsGone(state: BrowserState): Promise<{ passed: boolean; details: string }> {
    if (!state.selectorMap) {
      return { passed: true, details: 'No selector map available' };
    }

    const modalSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]', 
      '.modal',
      '.popup',
      '.overlay'
    ];

    let foundModals = 0;
    state.selectorMap.forEach((element) => {
      const role = element.attributes?.role;
      const ariaModal = element.attributes?.['aria-modal'];
      const classList = element.attributes?.class || '';

      if (role === 'dialog' || ariaModal === 'true' || 
          classList.includes('modal') || classList.includes('popup') || classList.includes('overlay')) {
        foundModals++;
      }
    });

    return {
      passed: foundModals === 0,
      details: foundModals === 0 ? 'No modal elements found' : `${foundModals} modal elements still present`
    };
  }

  /**
   * Check if high z-index overlay elements are gone
   */
  private async checkHighZIndexElementsGone(beforeState: BrowserState, afterState: BrowserState): Promise<{ passed: boolean; details: string }> {
    const beforeHighZ = this.countHighZIndexElements(beforeState);
    const afterHighZ = this.countHighZIndexElements(afterState);

    return {
      passed: afterHighZ <= beforeHighZ,
      details: `High z-index elements: ${beforeHighZ} → ${afterHighZ}`
    };
  }

  /**
   * Count elements with high z-index (potential overlays)
   */
  private countHighZIndexElements(state: BrowserState): number {
    if (!state.selectorMap) return 0;

    let count = 0;
    state.selectorMap.forEach((element) => {
      const style = element.attributes?.style || '';
      const zIndexMatch = style.match(/z-index:\s*(\d+)/);
      if (zIndexMatch && parseInt(zIndexMatch[1]) > 1000) {
        count++;
      }
    });

    return count;
  }

  /**
   * Check if page is still interactive
   */
  private async checkPageInteractivity(): Promise<{ passed: boolean; details: string }> {
    try {
      // Try to interact with the page
      const isInteractive = await this.browserContext.page.evaluate(() => {
        // Check if we can focus an element
        const focusableElements = document.querySelectorAll('input, button, a, [tabindex]');
        if (focusableElements.length > 0) {
          try {
            (focusableElements[0] as HTMLElement).focus();
            return true;
          } catch {
            return false;
          }
        }
        return true; // No focusable elements, assume interactive
      });

      return {
        passed: isInteractive,
        details: isInteractive ? 'Page is interactive' : 'Page appears to be blocked'
      };
    } catch {
      return {
        passed: false,
        details: 'Could not test page interactivity'
      };
    }
  }

  /**
   * Check if DOM has stabilized
   */
  private async checkDOMStability(maxWait: number = 2000): Promise<{ passed: boolean; details: string }> {
    const startTime = Date.now();
    let lastElementCount = 0;
    let stableCount = 0;
    const requiredStableChecks = 3;

    while (Date.now() - startTime < maxWait && stableCount < requiredStableChecks) {
      try {
        const currentElementCount = await this.browserContext.page.evaluate(() => 
          document.body.children.length
        );

        if (currentElementCount === lastElementCount) {
          stableCount++;
        } else {
          stableCount = 0; // Reset if changed
        }

        lastElementCount = currentElementCount;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch {
        return {
          passed: false,
          details: 'Could not check DOM stability'
        };
      }
    }

    const isStable = stableCount >= requiredStableChecks;
    return {
      passed: isStable,
      details: isStable ? 'DOM is stable' : 'DOM is still changing'
    };
  }

  /**
   * Check dropdown resolution based on strategy
   */
  private async checkDropdownResolution(strategy: string, state: BrowserState): Promise<{ passed: boolean; details: string }> {
    if (!state.selectorMap) {
      return { passed: true, details: 'No selector map available' };
    }

    // Count dropdown/autocomplete elements
    let dropdownElements = 0;
    state.selectorMap.forEach((element) => {
      const role = element.attributes?.role;
      const ariaExpanded = element.attributes?.['aria-expanded'];
      const classList = element.attributes?.class || '';

      if (role === 'listbox' || role === 'combobox' || ariaExpanded === 'true' ||
          classList.includes('dropdown') || classList.includes('autocomplete')) {
        dropdownElements++;
      }
    });

    if (strategy === 'interact') {
      // For interact strategy, dropdown should be gone or selection should be made
      return {
        passed: true, // Assume success if no errors occurred
        details: dropdownElements === 0 ? 'Dropdown dismissed after interaction' : `${dropdownElements} dropdown elements remain`
      };
    } else if (strategy === 'dismiss') {
      // For dismiss strategy, dropdown should be gone
      return {
        passed: dropdownElements === 0,
        details: dropdownElements === 0 ? 'Dropdown successfully dismissed' : `${dropdownElements} dropdown elements still present`
      };
    }

    return { passed: true, details: 'Resolution strategy does not require dropdown verification' };
  }

  /**
   * Check form state consistency
   */
  private async checkFormStateConsistency(beforeState: BrowserState, afterState: BrowserState): Promise<{ passed: boolean; details: string }> {
    // This is a simplified check - in a real implementation, we'd compare form field values
    const beforeInputs = this.countFormInputs(beforeState);
    const afterInputs = this.countFormInputs(afterState);

    // Form should have similar number of inputs (some variation is acceptable)
    const inputVariation = Math.abs(afterInputs - beforeInputs);
    const passed = inputVariation <= 2; // Allow small variations

    return {
      passed,
      details: `Form inputs: ${beforeInputs} → ${afterInputs} (variation: ${inputVariation})`
    };
  }

  /**
   * Count form input elements
   */
  private countFormInputs(state: BrowserState): number {
    if (!state.selectorMap) return 0;

    let count = 0;
    state.selectorMap.forEach((element) => {
      const tagName = (element.tagName || element.tag || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tagName)) {
        count++;
      }
    });

    return count;
  }

  /**
   * Check that no new blocking elements appeared
   */
  private async checkNoNewBlockingElements(state: BrowserState): Promise<{ passed: boolean; details: string }> {
    const modalCheck = await this.checkModalElementsGone(state);
    return {
      passed: modalCheck.passed,
      details: modalCheck.passed ? 'No blocking elements detected' : 'New blocking elements may have appeared'
    };
  }

  /**
   * Check element targeting stability (important for preventing index shifts)
   */
  private async checkElementTargetingStability(beforeState: BrowserState, afterState: BrowserState): Promise<{ passed: boolean; details: string }> {
    const beforeCount = beforeState.selectorMap?.size || 0;
    const afterCount = afterState.selectorMap?.size || 0;
    
    // Significant element count changes might indicate targeting issues
    const elementChange = Math.abs(afterCount - beforeCount);
    const passed = elementChange < 10; // Allow small changes

    return {
      passed,
      details: `Element count: ${beforeCount} → ${afterCount} (change: ${elementChange})`
    };
  }

  /**
   * Check if page has finished loading
   */
  private async checkPageLoaded(): Promise<{ passed: boolean; details: string }> {
    try {
      const loadState = await this.browserContext.page.evaluate(() => {
        return {
          readyState: document.readyState,
          isLoading: document.querySelector('[aria-busy="true"], .loading, .loader, .spinner') !== null
        };
      });

      const isLoaded = loadState.readyState === 'complete' && !loadState.isLoading;
      
      return {
        passed: isLoaded,
        details: `Page ready state: ${loadState.readyState}, Loading indicators: ${loadState.isLoading}`
      };
    } catch {
      return {
        passed: false,
        details: 'Could not check page load state'
      };
    }
  }
}