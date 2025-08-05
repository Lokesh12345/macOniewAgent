import { createLogger } from '@src/background/log';
import { DOMChangeType } from '../types/executionContext';
import type { BrowserState } from '@src/background/browser/views';

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

    // Check for alerts/confirms/prompts
    if (await this.detectBrowserDialogs(newState)) {
      analysis.type = DOMChangeType.BLOCKING;
      analysis.description = 'Browser dialog detected (alert/confirm/prompt)';
      analysis.recommendations.push('Handle browser dialog before continuing');
      return analysis;
    }

    // Check for modal/overlay
    const modalElements = await this.detectModals(newState);
    if (modalElements.length > 0) {
      analysis.type = DOMChangeType.BLOCKING;
      analysis.description = `Modal or overlay detected: ${modalElements.join(', ')}`;
      analysis.newElements.push(...modalElements);
      analysis.recommendations.push('Close modal or interact with it before continuing');
      return analysis;
    }

    // Check for autocomplete/dropdown
    const dropdownElements = await this.detectDropdowns(newState, lastAction);
    if (dropdownElements.length > 0) {
      analysis.type = DOMChangeType.INTERACTIVE;
      analysis.description = `Dropdown or autocomplete detected: ${dropdownElements.join(', ')}`;
      analysis.newElements.push(...dropdownElements);
      analysis.recommendations.push('Select from dropdown or wait for it to close');
      return analysis;
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

    // If we have new elements but couldn't classify them
    if (newElements.length > 0) {
      analysis.type = DOMChangeType.MINOR;
      analysis.description = `${newElements.length} new elements appeared`;
    }

    return analysis;
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

    for (const selector of dialogSelectors) {
      const elements = state.elementTree?.querySelectorAll(selector);
      if (elements && elements.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect modal overlays
   */
  private static async detectModals(state: BrowserState): Promise<string[]> {
    const modalIndicators: string[] = [];
    
    if (!state.elementTree) return modalIndicators;

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

    for (const selector of modalSelectors) {
      try {
        const elements = state.selectorMap?.querySelectorAll?.(selector);
        if (elements && elements.length > 0) {
          modalIndicators.push(selector);
        }
      } catch (e) {
        // Some selectors might fail, continue with others
      }
    }

    // Also check for high z-index elements that might be overlays
    state.selectorMap?.forEach((element, index) => {
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
    
    if (!state.elementTree) return dropdownIndicators;

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
        const elements = state.selectorMap?.querySelectorAll?.(selector);
        if (elements && elements.length > 0) {
          dropdownIndicators.push(selector);
        }
      } catch (e) {
        // Continue with other selectors
      }
    }

    // If text was just input, check for any new list-like elements
    if (wasTextInput) {
      const listSelectors = ['ul', 'ol', '[role="list"]'];
      for (const selector of listSelectors) {
        const lists = state.selectorMap?.querySelectorAll?.(selector);
        lists?.forEach((list, index) => {
          // Check if list has multiple items and is visible
          const items = list.querySelectorAll?.('li, [role="option"]');
          if (items && items.length > 1) {
            const isVisible = list.attributes?.style?.includes('display: none') === false;
            if (isVisible) {
              dropdownIndicators.push(`New list with ${items.length} items`);
            }
          }
        });
      }
    }

    return dropdownIndicators;
  }

  /**
   * Detect loading indicators
   */
  private static async detectLoadingIndicators(state: BrowserState): Promise<string[]> {
    const loadingIndicators: string[] = [];
    
    if (!state.elementTree) return loadingIndicators;

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
        const elements = state.selectorMap?.querySelectorAll?.(selector);
        if (elements && elements.length > 0) {
          loadingIndicators.push(selector);
        }
      } catch (e) {
        // Continue
      }
    }

    return loadingIndicators;
  }

  /**
   * Detect validation errors
   */
  private static async detectValidationErrors(state: BrowserState): Promise<string[]> {
    const errorIndicators: string[] = [];
    
    if (!state.elementTree) return errorIndicators;

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
        const elements = state.selectorMap?.querySelectorAll?.(selector);
        if (elements && elements.length > 0) {
          // Try to extract error text
          elements.forEach(el => {
            const errorText = el.textContent?.trim();
            if (errorText && errorText.length > 0) {
              errorIndicators.push(`${selector}: "${errorText}"`);
            } else {
              errorIndicators.push(selector);
            }
          });
        }
      } catch (e) {
        // Continue
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
}