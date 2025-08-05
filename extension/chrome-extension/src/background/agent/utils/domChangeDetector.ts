import { createLogger } from '@src/background/log';
import { DOMChangeType } from '../types/executionContext';
import type { BrowserState } from '@src/background/browser/views';

// Re-export DOMChangeType for other modules
export { DOMChangeType } from '../types/executionContext';

const logger = createLogger('DOMChangeDetector');

export interface DOMChangeAnalysis {
  type: DOMChangeType;
  description: string;
  newElements: string[];
  recommendations: string[];
}

export class DOMChangeDetector {
  /**
   * Analyzes DOM changes and classifies them by type
   */
  static async analyzeDOMChanges(
    oldState: BrowserState,
    newState: BrowserState,
    lastAction?: Record<string, unknown>
  ): Promise<DOMChangeAnalysis> {
    const newElements: string[] = [];
    const analysis: DOMChangeAnalysis = {
      type: DOMChangeType.NONE,
      description: 'No significant changes detected',
      newElements,
      recommendations: []
    };

    // Early return if no state data
    if (!oldState || !newState) {
      return analysis;
    }

    // Wrap entire analysis in try-catch to prevent crashes
    try {

    // Add semantic element detection for better classification
    const semanticChanges = this.detectSemanticChanges(oldState, newState, lastAction);
    if (semanticChanges.detected) {
      analysis.type = semanticChanges.type;
      analysis.description = semanticChanges.description;
      analysis.newElements.push(...semanticChanges.elements);
      analysis.recommendations.push(...semanticChanges.recommendations);
      return analysis;
    }

    // Check for alerts/confirms/prompts (with error handling)
    try {
      if (await this.detectBrowserDialogs(newState)) {
        analysis.type = DOMChangeType.BLOCKING;
        analysis.description = 'Browser dialog detected (alert/confirm/prompt)';
        analysis.recommendations.push('Handle browser dialog before continuing');
        return analysis;
      }
    } catch (error) {
      logger.warning('Failed to detect browser dialogs:', error);
    }

    // Check for modal/overlay (with error handling)
    try {
      const modalElements = await this.detectModals(newState);
      if (modalElements.length > 0) {
        analysis.type = DOMChangeType.BLOCKING;
        analysis.description = `Modal or overlay detected: ${modalElements.join(', ')}`;
        analysis.newElements.push(...modalElements);
        analysis.recommendations.push('Close modal or interact with it before continuing');
        return analysis;
      }
    } catch (error) {
      logger.warning('Failed to detect modals:', error);
    }

    // Check for autocomplete/dropdown (with error handling)
    try {
      const dropdownElements = await this.detectDropdowns(newState, lastAction);
      if (dropdownElements.length > 0) {
        analysis.type = DOMChangeType.INTERACTIVE;
        analysis.description = `Dropdown or autocomplete detected: ${dropdownElements.join(', ')}`;
        analysis.newElements.push(...dropdownElements);
        analysis.recommendations.push('Select from dropdown or wait for it to close');
        return analysis;
      }
    } catch (error) {
      logger.warning('Failed to detect dropdowns:', error);
    }

    // Check for loading indicators
    const loadingElements = await this.detectLoadingIndicators(newState);
    if (loadingElements.length > 0) {
      analysis.type = DOMChangeType.MINOR;
      analysis.description = `Loading indicators detected: ${loadingElements.join(', ')}`;
      analysis.newElements.push(...loadingElements);
      analysis.recommendations.push('Wait for loading to complete');
      return analysis;
    }

    // Check for validation errors
    const errorElements = await this.detectValidationErrors(newState);
    if (errorElements.length > 0) {
      analysis.type = DOMChangeType.INTERACTIVE;
      analysis.description = `Validation errors detected: ${errorElements.join(', ')}`;
      analysis.newElements.push(...errorElements);
      analysis.recommendations.push('Fix validation errors before continuing');
      return analysis;
    }

    // Check for major navigation
    if (oldState.url !== newState.url) {
      analysis.type = DOMChangeType.NAVIGATION;
      analysis.description = `Navigation detected: ${oldState.url} → ${newState.url}`;
      analysis.recommendations.push('Re-analyze page and create new plan');
      return analysis;
    }

    // Enhanced state comparison for better change detection
    const stateComparison = this.compareStates(oldState, newState);
    
    // If we have new elements but couldn't classify them
    if (stateComparison.elementsAdded > 0 || stateComparison.elementsChanged > 0) {
      if (stateComparison.significantChange) {
        analysis.type = DOMChangeType.INTERACTIVE;
        analysis.description = `Significant DOM changes: +${stateComparison.elementsAdded} elements, ~${stateComparison.elementsChanged} modified`;
        analysis.recommendations.push('Re-analyze page structure due to significant changes');
      } else {
        analysis.type = DOMChangeType.MINOR;
        analysis.description = `Minor DOM changes: +${stateComparison.elementsAdded} elements, ~${stateComparison.elementsChanged} modified`;
        analysis.recommendations.push('Continue with current plan, changes appear minor');
      }
    }

    return analysis;
    
    } catch (error) {
      logger.error('DOM change analysis failed:', error);
      // Return safe fallback
      return {
        type: DOMChangeType.MINOR,
        description: 'DOM analysis failed, assuming minor changes',
        newElements: [],
        recommendations: ['Continue with current plan']
      };
    }
  }

  /**
   * Detect browser dialogs (alert, confirm, prompt)
   */
  private static async detectBrowserDialogs(state: BrowserState): Promise<boolean> {
    // Check for common dialog indicators in the DOM
    // Note: Real browser dialogs pause JS execution, so we might need to handle this differently
    const dialogSelectors = [
      '[role="alertdialog"]',
      '.sweet-alert', // SweetAlert
      '.swal2-container', // SweetAlert2
      '.bootbox', // Bootbox
      '[data-notify="container"]' // Bootstrap notify
    ];

    if (!state.selectorMap) return false;

    for (const selector of dialogSelectors) {
      try {
        let foundElements = 0;
        state.selectorMap.forEach((element) => {
          if (this.elementMatchesSelector(element, selector)) {
            foundElements++;
          }
        });
        
        if (foundElements > 0) {
          return true;
        }
      } catch (e) {
        // Continue with other selectors
        logger.warning(`Failed to check dialog selector ${selector}:`, e);
      }
    }

    return false;
  }

  /**
   * Detect modal overlays
   */
  private static async detectModals(state: BrowserState): Promise<string[]> {
    const modalIndicators: string[] = [];
    
    if (!state.selectorMap) return modalIndicators;

    // Check for common modal patterns
    const modalSelectors = [
      '[role="dialog"][aria-modal="true"]',
      '[role="dialog"]:not([aria-hidden="true"])',
      '.modal.show', // Bootstrap
      '.modal.in', // Bootstrap 3
      '.modal-open', // Body class
      '[data-modal-open]',
      '.MuiDialog-root', // Material-UI
      '.ant-modal-wrap', // Ant Design
      '[class*="modal"][class*="open"]',
      '[class*="modal"][class*="visible"]',
      '.overlay:not([style*="display: none"])',
      '.popup:not([style*="display: none"])'
    ];

    // Iterate through the selectorMap (which is a Map) to check elements
    for (const selector of modalSelectors) {
      try {
        let foundElements = 0;
        state.selectorMap.forEach((element, index) => {
          if (this.elementMatchesSelector(element, selector)) {
            foundElements++;
          }
        });
        
        if (foundElements > 0) {
          modalIndicators.push(`${selector} (${foundElements} found)`);
        }
      } catch (e) {
        // Some selectors might fail, continue with others
        logger.warning(`Failed to check selector ${selector}:`, e);
      }
    }

    // Also check for high z-index elements that might be overlays
    state.selectorMap.forEach((element, index) => {
      const zIndex = element.attributes?.style?.match(/z-index:\s*(\d+)/)?.[1];
      if (zIndex && parseInt(zIndex) > 1000) {
        modalIndicators.push(`High z-index element at index ${index}`);
      }
    });

    return modalIndicators;
  }

  /**
   * Detect dropdowns and autocomplete
   */
  private static async detectDropdowns(state: BrowserState, lastAction?: Record<string, unknown>): Promise<string[]> {
    const dropdownIndicators: string[] = [];
    
    if (!state.selectorMap) return dropdownIndicators;

    // Check if last action was input_text (likely to trigger autocomplete)
    const wasTextInput = lastAction && Object.keys(lastAction)[0] === 'input_text';

    // Common dropdown selectors
    const dropdownSelectors = [
      '[role="listbox"]:not([aria-hidden="true"])',
      '[role="combobox"][aria-expanded="true"]',
      '[aria-autocomplete]',
      '.ui-autocomplete:visible', // jQuery UI
      '.autocomplete-suggestions', // Common class
      '[class*="dropdown"][class*="open"]',
      '[class*="dropdown"][class*="show"]',
      '.select2-dropdown', // Select2
      '.choices__list--dropdown', // Choices.js
      'ul[id*="autocomplete"]',
      'div[id*="suggestions"]',
      '.tt-menu', // Typeahead
      '.pac-container', // Google Places Autocomplete
      'input[list] + datalist' // HTML5 datalist
    ];

    for (const selector of dropdownSelectors) {
      try {
        let foundElements = 0;
        state.selectorMap.forEach((element, index) => {
          if (this.elementMatchesSelector(element, selector)) {
            foundElements++;
          }
        });
        
        if (foundElements > 0) {
          dropdownIndicators.push(`${selector} (${foundElements} found)`);
        }
      } catch (e) {
        // Continue with other selectors
        logger.warning(`Failed to check dropdown selector ${selector}:`, e);
      }
    }

    // If text was just input, check for any new list-like elements
    if (wasTextInput) {
      const listSelectors = ['ul', 'ol', '[role="list"]'];
      for (const selector of listSelectors) {
        let foundLists = 0;
        state.selectorMap.forEach((element, index) => {
          if (this.elementMatchesSelector(element, selector)) {
            // Check if list has multiple children and is visible
            const childCount = element.children?.length || 0;
            const isVisible = !element.attributes?.style?.includes('display: none');
            if (childCount > 1 && isVisible) {
              foundLists++;
            }
          }
        });
        
        if (foundLists > 0) {
          dropdownIndicators.push(`${selector} lists with multiple items (${foundLists} found)`);
        }
      }
    }

    return dropdownIndicators;
  }

  /**
   * Detect loading indicators
   */
  private static async detectLoadingIndicators(state: BrowserState): Promise<string[]> {
    const loadingIndicators: string[] = [];
    
    if (!state.selectorMap) return loadingIndicators;

    const loadingSelectors = [
      '[class*="loading"]:not([style*="display: none"])',
      '[class*="spinner"]:not([style*="display: none"])',
      '[class*="loader"]:not([style*="display: none"])',
      '.progress-bar',
      '[role="progressbar"]',
      '[aria-busy="true"]',
      '.shimmer', // Skeleton screens
      '.skeleton'
    ];

    for (const selector of loadingSelectors) {
      try {
        let foundElements = 0;
        state.selectorMap.forEach((element, index) => {
          if (this.elementMatchesSelector(element, selector)) {
            foundElements++;
          }
        });
        
        if (foundElements > 0) {
          loadingIndicators.push(`${selector} (${foundElements} found)`);
        }
      } catch (e) {
        // Continue
        logger.warning(`Failed to check loading selector ${selector}:`, e);
      }
    }

    return loadingIndicators;
  }

  /**
   * Detect validation errors
   */
  private static async detectValidationErrors(state: BrowserState): Promise<string[]> {
    const errorIndicators: string[] = [];
    
    if (!state.selectorMap) return errorIndicators;

    const errorSelectors = [
      '[class*="error"]:not([style*="display: none"])',
      '[class*="invalid"]:not([style*="display: none"])',
      '[role="alert"]',
      '[aria-invalid="true"]',
      '.help-block', // Bootstrap
      '.invalid-feedback', // Bootstrap 4
      '.form-error',
      'input:invalid',
      '[data-error]'
    ];

    for (const selector of errorSelectors) {
      try {
        state.selectorMap.forEach((element, index) => {
          if (this.elementMatchesSelector(element, selector)) {
            // Try to extract error text
            const errorText = element.text?.trim() || element.textContent?.trim();
            if (errorText && errorText.length > 0) {
              errorIndicators.push(`${selector}: "${errorText}"`);
            } else {
              errorIndicators.push(`${selector} at index ${index}`);
            }
          }
        });
      } catch (e) {
        // Continue
        logger.warning(`Failed to check error selector ${selector}:`, e);
      }
    }

    return errorIndicators;
  }

  /**
   * Check if we should switch from batch to single-step mode
   */
  static shouldSwitchToSingleStep(analysis: DOMChangeAnalysis): boolean {
    return [DOMChangeType.INTERACTIVE, DOMChangeType.BLOCKING].includes(analysis.type);
  }

  /**
   * Check if we need full re-planning
   */
  static needsFullReplanning(analysis: DOMChangeAnalysis): boolean {
    return analysis.type === DOMChangeType.NAVIGATION;
  }

  /**
   * Helper method to check if an element matches a CSS selector
   * This is a simplified implementation - in a real browser context,
   * we would use the actual element.matches() method
   */
  private static elementMatchesSelector(element: any, selector: string): boolean {
    if (!element) return false;

    try {
      // Handle basic selector patterns
      if (selector.startsWith('[') && selector.endsWith(']')) {
        // Attribute selector like [role="dialog"]
        const attrMatch = selector.match(/\[([^\]]+)\]/);
        if (attrMatch) {
          const attrQuery = attrMatch[1];
          if (attrQuery.includes('=')) {
            const [attr, value] = attrQuery.split('=');
            const cleanValue = value.replace(/["']/g, '');
            return element.attributes?.[attr] === cleanValue;
          } else {
            // Just check if attribute exists
            return element.attributes?.[attrQuery] !== undefined;
          }
        }
      }

      // Class selector
      if (selector.startsWith('.')) {
        const className = selector.substring(1);
        const elementClasses = element.attributes?.class || element.className || '';
        return elementClasses.includes(className);
      }

      // ID selector
      if (selector.startsWith('#')) {
        const id = selector.substring(1);
        return element.attributes?.id === id;
      }

      // Tag selector
      if (/^[a-zA-Z]+$/.test(selector)) {
        return (element.tagName || element.tag)?.toLowerCase() === selector.toLowerCase();
      }

      // Complex selectors with multiple parts
      if (selector.includes('[class*=')) {
        const classMatch = selector.match(/\[class\*="([^"]+)"\]/);
        if (classMatch) {
          const partialClass = classMatch[1];
          const elementClasses = element.attributes?.class || element.className || '';
          return elementClasses.includes(partialClass);
        }
      }

      // Pseudo-selectors like :not() - simplified handling
      if (selector.includes(':not(')) {
        const notMatch = selector.match(/(.+):not\((.+)\)/);
        if (notMatch) {
          const baseSelector = notMatch[1];
          const notSelector = notMatch[2];
          return this.elementMatchesSelector(element, baseSelector) && 
                 !this.elementMatchesSelector(element, notSelector);
        }
      }

      // For complex selectors we can't handle, return false
      return false;
    } catch (e) {
      logger.warning(`Error matching selector ${selector}:`, e);
      return false;
    }
  }

  /**
   * Enhanced DOM state comparison with better change detection
   */
  static compareStates(oldState: BrowserState, newState: BrowserState): {
    elementsAdded: number;
    elementsRemoved: number;
    elementsChanged: number;
    significantChange: boolean;
  } {
    const oldCount = oldState.selectorMap?.size || 0;
    const newCount = newState.selectorMap?.size || 0;
    
    const elementsAdded = Math.max(0, newCount - oldCount);
    const elementsRemoved = Math.max(0, oldCount - newCount);
    
    // Count changed elements by comparing common elements
    let elementsChanged = 0;
    if (oldState.selectorMap && newState.selectorMap) {
      const commonSize = Math.min(oldState.selectorMap.size, newState.selectorMap.size);
      for (let i = 0; i < commonSize; i++) {
        const oldEl = oldState.selectorMap.get(i);
        const newEl = newState.selectorMap.get(i);
        if (oldEl && newEl) {
          // Simple comparison - could be enhanced
          if (oldEl.text !== newEl.text || 
              JSON.stringify(oldEl.attributes) !== JSON.stringify(newEl.attributes)) {
            elementsChanged++;
          }
        }
      }
    }
    
    // Determine if this is a significant change
    const significantChange = elementsAdded > 5 || elementsRemoved > 5 || elementsChanged > 10;
    
    return {
      elementsAdded,
      elementsRemoved, 
      elementsChanged,
      significantChange
    };
  }

  /**
   * Detect semantic changes based on element roles, aria attributes, and common patterns
   */
  private static detectSemanticChanges(
    oldState: BrowserState,
    newState: BrowserState,
    lastAction?: Record<string, unknown>
  ): {
    detected: boolean;
    type: DOMChangeType;
    description: string;
    elements: string[];
    recommendations: string[];
  } {
    const result = {
      detected: false,
      type: DOMChangeType.NONE,
      description: '',
      elements: [] as string[],
      recommendations: [] as string[]
    };

    if (!oldState.selectorMap || !newState.selectorMap) {
      return result;
    }

    // Check for new interactive elements that appeared after specific actions
    const actionType = lastAction ? Object.keys(lastAction)[0] : '';
    
    if (actionType === 'input_text') {
      // Look for autocomplete/suggestion patterns
      const newInteractiveElements = this.findNewInteractiveElements(oldState.selectorMap, newState.selectorMap);
      
      if (newInteractiveElements.length > 0) {
        result.detected = true;
        result.type = DOMChangeType.INTERACTIVE;
        result.description = `Text input triggered interactive elements: ${newInteractiveElements.join(', ')}`;
        result.elements = newInteractiveElements;
        result.recommendations = [
          'Determine if autocomplete should be used or dismissed',
          'Check if selection is required before continuing'
        ];
        return result;
      }
    }

    if (actionType === 'click_element') {
      // Look for modal/overlay patterns
      const newModalElements = this.findNewModalElements(oldState.selectorMap, newState.selectorMap);
      
      if (newModalElements.length > 0) {
        result.detected = true;
        result.type = DOMChangeType.BLOCKING;
        result.description = `Click triggered modal/overlay elements: ${newModalElements.join(', ')}`;
        result.elements = newModalElements;
        result.recommendations = [
          'Handle modal by interacting with it or closing it',
          'Do not continue until modal is resolved'
        ];
        return result;
      }
    }

    return result;
  }

  /**
   * Find new interactive elements that suggest autocomplete or dropdowns
   */
  private static findNewInteractiveElements(oldMap: Map<any, any>, newMap: Map<any, any>): string[] {
    const newInteractive: string[] = [];
    const oldSize = oldMap.size;
    
    // Check elements that were added
    for (let i = oldSize; i < newMap.size; i++) {
      const element = newMap.get(i);
      if (element) {
        // Check for interactive patterns
        const role = element.attributes?.role;
        const ariaExpanded = element.attributes?.['aria-expanded'];
        const classList = element.attributes?.class || '';
        
        if (role === 'listbox' || role === 'combobox' || role === 'option') {
          newInteractive.push(`${role} element`);
        } else if (ariaExpanded === 'true') {
          newInteractive.push('expanded element');
        } else if (classList.includes('dropdown') || classList.includes('autocomplete') || classList.includes('suggestion')) {
          newInteractive.push(`${classList} element`);
        } else if (element.tag === 'ul' || element.tag === 'ol') {
          // Check if this is a list with multiple items (likely dropdown)
          const childCount = element.children?.length || 0;
          if (childCount > 1) {
            newInteractive.push(`${element.tag} with ${childCount} items`);
          }
        }
      }
    }
    
    return newInteractive;
  }

  /**
   * Find new modal/overlay elements
   */
  private static findNewModalElements(oldMap: Map<any, any>, newMap: Map<any, any>): string[] {
    const newModals: string[] = [];
    const oldSize = oldMap.size;
    
    // Check elements that were added
    for (let i = oldSize; i < newMap.size; i++) {
      const element = newMap.get(i);
      if (element) {
        const role = element.attributes?.role;
        const ariaModal = element.attributes?.['aria-modal'];
        const classList = element.attributes?.class || '';
        const zIndex = element.attributes?.style?.match(/z-index:\s*(\d+)/)?.[1];
        
        if (role === 'dialog' || ariaModal === 'true') {
          newModals.push('dialog element');
        } else if (classList.includes('modal') || classList.includes('overlay') || classList.includes('popup')) {
          newModals.push(`${classList} element`);
        } else if (zIndex && parseInt(zIndex) > 1000) {
          newModals.push('high z-index overlay');
        }
      }
    }
    
    return newModals;
  }
}