import { createLogger } from '@src/background/log';

const logger = createLogger('ElementHandles');

/**
 * Execute actions directly on DOM elements using preserved handles
 */
export async function executeElementAction(
  tabId: number,
  nodeData: any,
  action: 'click' | 'focus' | 'setValue' | 'scroll',
  value?: string
): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (nodeData, action, value) => {
        // Use the global function injected by buildDomTree.js
        return window.performElementAction(nodeData, action, value);
      },
      args: [nodeData, action, value],
    });

    const success = results[0]?.result;
    if (success) {
      logger.info(`✅ Direct ${action} action succeeded on element`);
    } else {
      logger.warn(`❌ Direct ${action} action failed on element`);
    }
    
    return success || false;
  } catch (error) {
    logger.error(`Failed to execute ${action} action:`, error);
    return false;
  }
}

/**
 * Get element handle for a node (for validation/debugging)
 */
export async function getElementHandle(tabId: number, nodeData: any): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (nodeData) => {
        const element = window.getElementHandle(nodeData);
        return element !== undefined;
      },
      args: [nodeData],
    });

    return results[0]?.result || false;
  } catch (error) {
    logger.error('Failed to get element handle:', error);
    return false;
  }
}

/**
 * Enhanced click action that tries direct handle first, falls back to selector
 */
export async function enhancedClick(
  tabId: number,
  nodeData: any,
  fallbackAction: () => Promise<boolean>
): Promise<boolean> {
  // Try direct handle click first
  const directSuccess = await executeElementAction(tabId, nodeData, 'click');
  
  if (directSuccess) {
    logger.info('✅ Used direct element handle for click');
    return true;
  }
  
  // Fallback to selector-based approach
  logger.info('⚠️ Direct handle failed, falling back to selector');
  return await fallbackAction();
}

/**
 * Enhanced form input that tries direct handle first
 */
export async function enhancedSetValue(
  tabId: number,
  nodeData: any,
  value: string,
  fallbackAction: () => Promise<boolean>
): Promise<boolean> {
  // Try direct handle setValue first
  const directSuccess = await executeElementAction(tabId, nodeData, 'setValue', value);
  
  if (directSuccess) {
    logger.info('✅ Used direct element handle for setValue');
    return true;
  }
  
  // Fallback to selector-based approach
  logger.info('⚠️ Direct handle failed, falling back to selector');
  return await fallbackAction();
}