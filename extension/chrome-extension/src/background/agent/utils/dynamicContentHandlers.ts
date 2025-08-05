import { createLogger } from '@src/background/log';
import type { BrowserContext } from '@src/background/browser/context';
import { ActionResult } from '../types';
import { IntelligentWaiting } from '../actions/intelligentWaiting';

const logger = createLogger('DynamicContentHandlers');

export class DynamicContentHandlers {
  /**
   * Handle browser alerts, confirms, and prompts
   */
  static async handleBrowserDialog(
    browserContext: BrowserContext,
    dialogType: 'alert' | 'confirm' | 'prompt',
    expectedText?: string,
    responseText?: string
  ): Promise<ActionResult> {
    try {
      // Inject dialog handler into the page
      const script = `
        (function() {
          // Store original methods
          window.__originalAlert = window.alert;
          window.__originalConfirm = window.confirm;
          window.__originalPrompt = window.prompt;
          
          // Track last dialog
          window.__lastDialog = null;
          
          // Override methods
          window.alert = function(message) {
            window.__lastDialog = { type: 'alert', message: message };
            console.log('Alert intercepted:', message);
            // Auto-dismiss after a short delay
            setTimeout(() => {
              window.__lastDialog = null;
            }, 100);
            return undefined;
          };
          
          window.confirm = function(message) {
            window.__lastDialog = { type: 'confirm', message: message };
            console.log('Confirm intercepted:', message);
            // Auto-accept confirms
            return true;
          };
          
          window.prompt = function(message, defaultValue) {
            window.__lastDialog = { type: 'prompt', message: message, defaultValue: defaultValue };
            console.log('Prompt intercepted:', message);
            // Return the response text or default
            return '${responseText || ''}' || defaultValue || '';
          };
          
          // Return last dialog info
          return window.__lastDialog;
        })();
      `;

      const result = await browserContext.page.evaluate(script);
      
      if (result) {
        logger.info(`Handled ${result.type} dialog: "${result.message}"`);
        return new ActionResult({
          extractedContent: `Handled ${result.type} dialog: "${result.message}"`,
          includeInMemory: true
        });
      }

      return new ActionResult({
        extractedContent: 'Dialog handlers installed',
        includeInMemory: false
      });
    } catch (error) {
      logger.error('Failed to handle browser dialog:', error);
      return new ActionResult({
        error: `Failed to handle dialog: ${error}`,
        includeInMemory: true
      });
    }
  }

  /**
   * Handle autocomplete dropdowns
   */
  static async handleAutocomplete(
    browserContext: BrowserContext,
    inputSelector: string,
    selectedValue?: string,
    waitForClose: boolean = true
  ): Promise<ActionResult> {
    try {
      logger.info('Handling autocomplete for:', inputSelector);

      // Wait for autocomplete to appear
      const waitResult = await IntelligentWaiting.waitFor(browserContext, {
        condition: `
          // Check for common autocomplete patterns
          document.querySelector('[role="listbox"]:not([aria-hidden="true"])') ||
          document.querySelector('.ui-autocomplete:visible') ||
          document.querySelector('[class*="autocomplete"][class*="show"]') ||
          document.querySelector('ul[id*="autocomplete"]') ||
          document.querySelector('.pac-container') // Google Places
        `,
        maxWait: 2000,
        description: 'autocomplete dropdown'
      });

      if (!waitResult.success) {
        return new ActionResult({
          extractedContent: 'No autocomplete dropdown appeared',
          includeInMemory: false
        });
      }

      // If a value is specified, try to select it
      if (selectedValue) {
        const selectScript = `
          (function() {
            // Find autocomplete options
            const options = Array.from(
              document.querySelectorAll(
                '[role="option"], ' +
                '.ui-menu-item, ' +
                '[class*="autocomplete"] li, ' +
                '[class*="suggestion"], ' +
                '.pac-item'
              )
            );
            
            // Find matching option
            const match = options.find(opt => 
              opt.textContent.toLowerCase().includes('${selectedValue.toLowerCase()}')
            );
            
            if (match) {
              // Click the option
              match.click();
              return { success: true, text: match.textContent };
            }
            
            // If no match, click first option
            if (options.length > 0) {
              options[0].click();
              return { success: true, text: options[0].textContent, wasFirst: true };
            }
            
            return { success: false };
          })();
        `;

        const selectResult = await browserContext.page.evaluate(selectScript);
        
        if (selectResult.success) {
          const message = selectResult.wasFirst 
            ? `Selected first option: "${selectResult.text}"` 
            : `Selected: "${selectResult.text}"`;
          
          logger.info(message);
          
          // Wait for dropdown to close
          if (waitForClose) {
            await IntelligentWaiting.waitFor(browserContext, {
              condition: `!document.querySelector('[role="listbox"]:not([aria-hidden="true"])')`,
              maxWait: 1000,
              description: 'autocomplete to close'
            });
          }
          
          return new ActionResult({
            extractedContent: message,
            includeInMemory: true
          });
        }
      }

      // Just wait for user to select or dropdown to close
      if (waitForClose) {
        await IntelligentWaiting.waitFor(browserContext, {
          preset: 'stable',
          maxWait: 5000
        });
      }

      return new ActionResult({
        extractedContent: 'Waited for autocomplete interaction',
        includeInMemory: false
      });
    } catch (error) {
      logger.error('Failed to handle autocomplete:', error);
      return new ActionResult({
        error: `Failed to handle autocomplete: ${error}`,
        includeInMemory: true
      });
    }
  }

  /**
   * Handle modal dialogs
   */
  static async handleModal(
    browserContext: BrowserContext,
    action: 'close' | 'accept' | 'cancel' = 'close'
  ): Promise<ActionResult> {
    try {
      logger.info(`Attempting to ${action} modal`);

      const modalScript = `
        (function() {
          // Find modal elements
          const modals = Array.from(document.querySelectorAll(
            '[role="dialog"]:not([aria-hidden="true"]), ' +
            '.modal.show, ' +
            '.modal.in, ' +
            '[class*="modal"][class*="open"], ' +
            '.MuiDialog-root, ' +
            '.ant-modal-wrap'
          ));
          
          if (modals.length === 0) {
            return { found: false };
          }
          
          const modal = modals[0];
          const actions = {
            close: ['[aria-label="Close"]', '.close', '[class*="close"]', 'button:has-text("Close")', 'button:has-text("×")'],
            accept: ['button:has-text("OK")', 'button:has-text("Accept")', 'button:has-text("Yes")', '[class*="primary"]'],
            cancel: ['button:has-text("Cancel")', 'button:has-text("No")', '[class*="cancel"]']
          };
          
          // Try to find and click the appropriate button
          for (const selector of actions['${action}']) {
            const button = modal.querySelector(selector) || document.querySelector(selector);
            if (button && button.offsetParent !== null) { // Check if visible
              button.click();
              return { found: true, clicked: selector };
            }
          }
          
          // Try Escape key for close
          if ('${action}' === 'close') {
            const escEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 });
            document.dispatchEvent(escEvent);
            return { found: true, clicked: 'Escape key' };
          }
          
          return { found: true, clicked: null };
        })();
      `;

      const result = await browserContext.page.evaluate(modalScript);
      
      if (!result.found) {
        return new ActionResult({
          extractedContent: 'No modal found',
          includeInMemory: false
        });
      }

      if (result.clicked) {
        logger.info(`Successfully clicked: ${result.clicked}`);
        
        // Wait for modal to disappear
        await IntelligentWaiting.waitFor(browserContext, {
          condition: `!document.querySelector('[role="dialog"]:not([aria-hidden="true"])')`,
          maxWait: 2000,
          description: 'modal to close'
        });
        
        return new ActionResult({
          extractedContent: `Modal ${action} successful using ${result.clicked}`,
          includeInMemory: true
        });
      }

      return new ActionResult({
        error: `Could not ${action} modal - no suitable button found`,
        includeInMemory: true
      });
    } catch (error) {
      logger.error(`Failed to ${action} modal:`, error);
      return new ActionResult({
        error: `Failed to ${action} modal: ${error}`,
        includeInMemory: true
      });
    }
  }

  /**
   * Handle date pickers
   */
  static async handleDatePicker(
    browserContext: BrowserContext,
    dateValue: string
  ): Promise<ActionResult> {
    try {
      logger.info('Handling date picker with value:', dateValue);

      // Try to set date directly on input
      const setDateScript = `
        (function() {
          // Find date input
          const dateInputs = Array.from(document.querySelectorAll(
            'input[type="date"], ' +
            'input[type="datetime-local"], ' +
            'input[class*="date"], ' +
            'input[id*="date"], ' +
            'input[name*="date"]'
          )).filter(input => input.offsetParent !== null);
          
          if (dateInputs.length > 0) {
            const input = dateInputs[0];
            
            // Try to set value directly
            input.value = '${dateValue}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, method: 'direct' };
          }
          
          // Check for custom date picker
          const customPickers = document.querySelectorAll(
            '.datepicker, ' +
            '.react-datepicker, ' +
            '.MuiPickersDay-root, ' +
            '.ant-calendar'
          );
          
          if (customPickers.length > 0) {
            return { success: false, hasCustomPicker: true };
          }
          
          return { success: false };
        })();
      `;

      const result = await browserContext.page.evaluate(setDateScript);
      
      if (result.success) {
        return new ActionResult({
          extractedContent: `Set date to ${dateValue} using ${result.method} method`,
          includeInMemory: true
        });
      }

      if (result.hasCustomPicker) {
        logger.warning('Custom date picker detected - may need manual interaction');
        return new ActionResult({
          extractedContent: 'Custom date picker detected - requires manual interaction',
          includeInMemory: true
        });
      }

      return new ActionResult({
        error: 'No date input found',
        includeInMemory: true
      });
    } catch (error) {
      logger.error('Failed to handle date picker:', error);
      return new ActionResult({
        error: `Failed to handle date picker: ${error}`,
        includeInMemory: true
      });
    }
  }

  /**
   * Install global handlers for dynamic content
   */
  static async installGlobalHandlers(browserContext: BrowserContext): Promise<void> {
    try {
      const installScript = `
        (function() {
          // Already installed check
          if (window.__dynamicHandlersInstalled) return;
          window.__dynamicHandlersInstalled = true;
          
          // Mutation observer for dynamic content
          const observer = new MutationObserver((mutations) => {
            // Check for new modals, dropdowns, etc.
            const hasNewModal = mutations.some(m => 
              Array.from(m.addedNodes).some(node => 
                node.nodeType === 1 && (
                  node.matches?.('[role="dialog"]') ||
                  node.querySelector?.('[role="dialog"]')
                )
              )
            );
            
            if (hasNewModal) {
              console.log('New modal detected via MutationObserver');
              window.__lastDynamicContent = { type: 'modal', timestamp: Date.now() };
            }
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          console.log('Dynamic content handlers installed');
        })();
      `;

      await browserContext.page.evaluate(installScript);
      logger.info('Global dynamic content handlers installed');
    } catch (error) {
      logger.error('Failed to install global handlers:', error);
    }
  }
}