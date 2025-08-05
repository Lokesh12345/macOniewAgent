import type { DOMElementNode } from '../../browser/dom/views';
import type { BrowserState } from '../../browser/views';
import { createLogger } from '../../log';

const logger = createLogger('EnhancedElementFinder');

export interface TargetingStrategy {
  index?: number;
  xpath?: string | null;
  selector?: string;
  text?: string;
  aria?: string;
  placeholder?: string;
  attributes?: Record<string, string>;
}

export interface MatchResult {
  element: DOMElementNode;
  strategy: string;
  confidence: number;
}

/**
 * Enhanced Element Finder Service
 * Provides multiple strategies for finding elements with fallback mechanisms
 */
export class EnhancedElementFinder {
  /**
   * Find element using multiple targeting strategies
   * INDEX-FIRST priority order with semantic fallback
   */
  static async findElement(
    strategy: TargetingStrategy,
    browserState: BrowserState,
  ): Promise<MatchResult | null> {
    const attempts: { strategy: string; result: MatchResult | null }[] = [];

    logger.info(`🔍 ENHANCED ELEMENT FINDER: Starting search with strategy:`, strategy);

    // PRIORITY 1: Index matching (PRIMARY - best for stable DOM)
    if (strategy.index !== undefined) {
      const result = this.findByIndex(strategy.index, browserState);
      attempts.push({ strategy: 'index', result });
      if (result) {
        logger.info(`✅ FOUND via INDEX (PRIMARY): ${strategy.index} → ${result.element.tagName}[${result.element.highlightIndex}]`);
        
        // Simple validation: Basic element type checking
        const hasSemanticAttributes = strategy.aria || strategy.placeholder;
        if (hasSemanticAttributes) {
          // LLM provided semantic info - validate the index match makes sense
          const validated = this.validateIndexMatch(result, strategy);
          if (validated) {
            logger.info(`✅ INDEX VALIDATED: Element passes semantic validation`);
            return result;
          } else {
            logger.warning(`⚠️ INDEX VALIDATION FAILED: Continuing to semantic fallback strategies`);
            // Don't return - continue to semantic fallback
          }
        } else {
          // LLM only provided index - trust it (backward compatibility for e-commerce)
          logger.info(`📋 INDEX ONLY: Direct index targeting (e-commerce mode)`);
          return result;
        }
      } else {
        logger.warning(`❌ INDEX search failed: ${strategy.index} not found - falling back to semantic strategies`);
      }
    }

    // SEMANTIC FALLBACK STRATEGIES (only when index fails or is invalid)
    logger.info(`🔄 SEMANTIC FALLBACK: Index unavailable/failed, trying semantic strategies...`);

    // PRIORITY 2: Aria label matching (SEMANTIC - most reliable)
    if (strategy.aria) {
      try {
        const result = this.findByAria(strategy.aria, browserState);
        attempts.push({ strategy: 'aria', result });
        if (result) {
          logger.info(`✅ FOUND via ARIA: "${strategy.aria}" → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
          const validated = this.validateSemanticMatch(result, strategy);
          if (validated) return validated;
        } else {
          logger.info(`❌ ARIA search failed: "${strategy.aria}" not found`);
        }
      } catch (error) {
        logger.info(`❌ ARIA search error: ${error}`);
      }
    }

    // PRIORITY 3: Placeholder matching (SEMANTIC - form field specific)
    if (strategy.placeholder) {
      try {
        const result = this.findByPlaceholder(strategy.placeholder, browserState);
        attempts.push({ strategy: 'placeholder', result });
        if (result) {
          logger.info(`✅ FOUND via PLACEHOLDER: "${strategy.placeholder}" → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
          const validated = this.validateSemanticMatch(result, strategy);
          if (validated) return validated;
        } else {
          logger.info(`❌ PLACEHOLDER search failed: "${strategy.placeholder}" not found`);
        }
      } catch (error) {
        logger.info(`❌ PLACEHOLDER search error: ${error}`);
      }
    }

    // PRIORITY 4: Attribute matching (SEMANTIC - specific attributes)
    if (strategy.attributes && Object.keys(strategy.attributes).length > 0) {
      const result = this.findByAttributes(strategy.attributes, browserState);
      attempts.push({ strategy: 'attributes', result });
      if (result) {
        logger.info(`✅ FOUND via ATTRIBUTES: ${JSON.stringify(strategy.attributes)} → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
        const validated = this.validateSemanticMatch(result, strategy);
        if (validated) return validated;
      } else {
        logger.warning(`❌ ATTRIBUTES search failed: ${JSON.stringify(strategy.attributes)} not found`);
      }
    }

    // PRIORITY 5: Text content matching (CONTENT-BASED)
    if (strategy.text) {
      const result = this.findByText(strategy.text, browserState);
      attempts.push({ strategy: 'text', result });
      if (result) {
        logger.info(`✅ FOUND via TEXT: "${strategy.text}" → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
        return result;
      } else {
        logger.warning(`❌ TEXT search failed: "${strategy.text}" not found`);
      }
    }

    // PRIORITY 6: CSS Selector (STRUCTURAL - more stable than XPath)
    if (strategy.selector) {
      const result = this.findBySelector(strategy.selector, browserState);
      attempts.push({ strategy: 'selector', result });
      if (result) {
        logger.info(`✅ FOUND via SELECTOR: "${strategy.selector}" → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
        return result;
      } else {
        logger.warning(`❌ SELECTOR search failed: "${strategy.selector}" not found`);
      }
    }

    // PRIORITY 7: XPath (STRUCTURAL - can break with DOM changes)
    if (strategy.xpath) {
      const result = this.findByXPath(strategy.xpath, browserState);
      attempts.push({ strategy: 'xpath', result });
      if (result) {
        logger.info(`⚠️ FOUND via XPATH: "${strategy.xpath}" → ${result.element.tagName}[${result.element.highlightIndex}] (confidence: ${result.confidence})`);
        return result;
      } else {
        logger.warning(`❌ XPATH search failed: "${strategy.xpath}" not found`);
      }
    }

    // All strategies failed
    logger.error(`🚫 ALL STRATEGIES FAILED:`, attempts.map(a => `${a.strategy}:${a.result ? 'found' : 'failed'}`).join(', '));
    return null;
  }

  /**
   * Find element by index (existing behavior - maintain exact compatibility)
   */
  private static findByIndex(index: number, browserState: BrowserState): MatchResult | null {
    const element = browserState.selectorMap.get(index);
    if (element) {
      return {
        element,
        strategy: 'index',
        confidence: 1.0, // Highest confidence for primary method
      };
    }
    return null;
  }

  /**
   * Find element by XPath (existing behavior - maintain exact compatibility)
   */
  private static findByXPath(xpath: string, browserState: BrowserState): MatchResult | null {
    // Note: XPath matching would need to be implemented in the DOM service
    // For now, we'll skip this and rely on other strategies
    // This maintains backward compatibility while preparing for future enhancement
    logger.debug('XPath matching not yet implemented in enhanced finder');
    return null;
  }

  /**
   * Find element by CSS selector
   */
  private static findBySelector(selector: string, browserState: BrowserState): MatchResult | null {
    for (const entry of Array.from(browserState.selectorMap.entries())) {
      const [index, element] = entry;
      if (this.elementMatchesSelector(element, selector)) {
        return {
          element,
          strategy: 'selector',
          confidence: 0.9,
        };
      }
    }
    return null;
  }

  /**
   * Find element by text content
   */
  private static findByText(text: string, browserState: BrowserState): MatchResult | null {
    const normalizedText = text.toLowerCase().trim();
    
    for (const entry of Array.from(browserState.selectorMap.entries())) {
      const [index, element] = entry;
      const elementText = element.getAllTextTillNextClickableElement(2).toLowerCase().trim();
      
      // Exact match has highest confidence
      if (elementText === normalizedText) {
        return {
          element,
          strategy: 'text',
          confidence: 0.95,
        };
      }
      
      // Partial match has lower confidence
      if (elementText.includes(normalizedText) || normalizedText.includes(elementText)) {
        return {
          element,
          strategy: 'text',
          confidence: 0.8,
        };
      }
    }
    return null;
  }

  /**
   * Find element by aria-label or accessible name
   */
  private static findByAria(aria: string, browserState: BrowserState): MatchResult | null {
    const normalizedAria = aria.toLowerCase().trim();
    
    for (const entry of Array.from(browserState.selectorMap.entries())) {
      const [index, element] = entry;
      const ariaLabel = element.attributes['aria-label']?.toLowerCase().trim();
      const ariaLabelledBy = element.attributes['aria-labelledby']?.toLowerCase().trim();
      const title = element.attributes['title']?.toLowerCase().trim();
      
      if (ariaLabel === normalizedAria || 
          ariaLabelledBy === normalizedAria || 
          title === normalizedAria) {
        return {
          element,
          strategy: 'aria',
          confidence: 0.9,
        };
      }
    }
    return null;
  }

  /**
   * Find element by placeholder text (for input elements)
   */
  private static findByPlaceholder(placeholder: string, browserState: BrowserState): MatchResult | null {
    const normalizedPlaceholder = placeholder.toLowerCase().trim();
    
    for (const entry of Array.from(browserState.selectorMap.entries())) {
      const [index, element] = entry;
      const elementPlaceholder = element.attributes['placeholder']?.toLowerCase().trim();
      
      if (elementPlaceholder === normalizedPlaceholder) {
        return {
          element,
          strategy: 'placeholder',
          confidence: 0.9,
        };
      }
    }
    return null;
  }

  /**
   * Find element by attribute matching
   */
  private static findByAttributes(attributes: Record<string, string>, browserState: BrowserState): MatchResult | null {
    for (const entry of Array.from(browserState.selectorMap.entries())) {
      const [index, element] = entry;
      let matchCount = 0;
      let totalAttributes = Object.keys(attributes).length;
      
      for (const [key, value] of Object.entries(attributes)) {
        const elementValue = element.attributes[key];
        if (elementValue === value) {
          matchCount++;
        }
      }
      
      // Require all attributes to match
      if (matchCount === totalAttributes) {
        return {
          element,
          strategy: 'attributes',
          confidence: 0.85,
        };
      }
    }
    return null;
  }

  /**
   * Check if element matches CSS selector (simplified version)
   * This is a basic implementation - could be enhanced with a proper CSS selector engine
   */
  private static elementMatchesSelector(element: DOMElementNode, selector: string): boolean {
    // Simple class selector matching
    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      const elementClasses = element.attributes['class']?.split(' ') || [];
      return elementClasses.includes(className);
    }
    
    // Simple ID selector matching
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      return element.attributes['id'] === id;
    }
    
    // Simple tag selector matching
    if (element.tagName?.toLowerCase() === selector.toLowerCase()) {
      return true;
    }
    
    // Simple attribute selector matching [attr="value"]
    const attributeMatch = selector.match(/^\[(.+?)="(.+?)"\]$/);
    if (attributeMatch) {
      const [, attrName, attrValue] = attributeMatch;
      return element.attributes[attrName] === attrValue;
    }
    
    return false;
  }

  /**
   * Validate that semantic match actually matches the intent
   */
  private static validateSemanticMatch(result: MatchResult, strategy: TargetingStrategy): MatchResult | null {
    logger.info(`🔍 SEMANTIC VALIDATION: Checking if element matches intent`);
    
    // Enhanced validation: Check if aria-label search failed but we found element by fallback
    if (strategy.aria && result.strategy !== 'aria') {
      logger.info(`⚠️ ARIA FALLBACK DETECTED: Looking for "${strategy.aria}" but found via ${result.strategy}`);
      
      // For form fields, check if the fallback element has contradictory semantic info
      const element = result.element;
      const isFormField = element.tagName?.toLowerCase() === 'input' || 
                         element.tagName?.toLowerCase() === 'textarea' ||
                         element.attributes['contenteditable'] === 'true';
      
      if (isFormField) {
        // Get actual semantic attributes of the found element
        const elementAria = element.attributes['aria-label'] || '';
        const elementPlaceholder = element.attributes['placeholder'] || '';
        const elementName = element.attributes['name'] || '';
        const elementId = element.attributes['id'] || '';
        
        const targetAria = strategy.aria.toLowerCase();
        logger.info(`🔍 FIELD COMPARISON: Want="${targetAria}", Found aria="${elementAria}", placeholder="${elementPlaceholder}", name="${elementName}", id="${elementId}"`);
        
        // Simple non-hardcoded check: if element has clear semantic info that contradicts our target
        const elementSemantics = [elementAria, elementPlaceholder, elementName, elementId]
          .filter(attr => attr.length > 0)
          .map(attr => attr.toLowerCase());
        
        if (elementSemantics.length > 0) {
          // Check if ANY of the element's semantic attributes contain words from our target
          const targetWords = targetAria.split(/\s+/).filter(word => word.length > 2);
          const hasMatchingWords = targetWords.some(targetWord => 
            elementSemantics.some(semantic => semantic.includes(targetWord))
          );
          
          if (!hasMatchingWords) {
            logger.warning(`❌ SEMANTIC MISMATCH: Element has semantic info "${elementSemantics.join(', ')}" but we want "${targetAria}"`);
            logger.warning(`   - Rejecting fallback element as it appears to be for different purpose`);
            return null; // Reject this match
          } else {
            logger.info(`✅ SEMANTIC COMPATIBLE: Found some matching words between target and element semantics`);
          }
        } else {
          logger.info(`ℹ️ NO SEMANTIC INFO: Element has no semantic attributes to validate against`);
        }
      }
    }
    
    logger.info(`✅ SEMANTIC MATCH VALIDATED: ${result.strategy} strategy found element`);
    return result;
  }

  /**
   * Validate that index match actually makes sense semantically
   * VERY PERMISSIVE: Only reject obvious mismatches
   */
  private static validateIndexMatch(result: MatchResult, strategy: TargetingStrategy): boolean {
    logger.info(`🔍 INDEX VALIDATION: Checking if index ${strategy.index} element makes semantic sense`);
    
    const element = result.element;
    const attrs = element.attributes || {};
    
    // Check element type
    const isFormField = element.tagName?.toLowerCase() === 'input' || 
                       element.tagName?.toLowerCase() === 'textarea' ||
                       attrs['contenteditable'] === 'true';
    
    const isClickable = element.tagName?.toLowerCase() === 'button' ||
                       element.tagName?.toLowerCase() === 'a' ||
                       attrs['role'] === 'button' ||
                       attrs['onclick'] ||
                       element.isInteractive;
    
    const hasSemanticAttributes = attrs['aria-label'] || attrs['placeholder'] || 
                                 attrs['name'] || attrs['id'] || attrs['title'] ||
                                 attrs['role'] || attrs['data-action'];
    
    logger.info(`📊 INDEX ELEMENT ANALYSIS: tagName=${element.tagName}, isFormField=${isFormField}, isClickable=${isClickable}, hasSemanticAttributes=${hasSemanticAttributes}`);
    
    // VERY PERMISSIVE VALIDATION: Optimized for e-commerce sites
    
    // Only reject if we find a CLEAR semantic mismatch (e.g., "To" field but element is for "Subject")
    if (strategy.aria && attrs['aria-label']) {
      const targetAria = strategy.aria.toLowerCase();
      const elementAria = attrs['aria-label'].toLowerCase();
      
      // Only reject if they're clearly different field types
      const targetIsEmail = targetAria.includes('to') || targetAria.includes('recipient');
      const elementIsSubject = elementAria.includes('subject');
      const targetIsSubject = targetAria.includes('subject');
      const elementIsEmail = elementAria.includes('to') || elementAria.includes('recipient');
      
      if ((targetIsEmail && elementIsSubject) || (targetIsSubject && elementIsEmail)) {
        logger.warning(`❌ CLEAR SEMANTIC MISMATCH: Want "${targetAria}" but element is "${elementAria}"`);
        return false;
      }
    }
    
    // Otherwise, accept the element (e-commerce sites depend on index)
    logger.info(`✅ INDEX VALIDATION PASSED: Element accepted for interaction`);
    return true;
  }


  /**
   * Get debug information about element targeting attempt
   */
  static getDebugInfo(strategy: TargetingStrategy, browserState: BrowserState): string {
    const info: string[] = [];
    
    info.push(`Targeting strategies available:`);
    if (strategy.index !== undefined) info.push(`- Index: ${strategy.index}`);
    if (strategy.xpath) info.push(`- XPath: ${strategy.xpath}`);
    if (strategy.selector) info.push(`- Selector: ${strategy.selector}`);
    if (strategy.text) info.push(`- Text: "${strategy.text}"`);
    if (strategy.aria) info.push(`- Aria: "${strategy.aria}"`);
    if (strategy.placeholder) info.push(`- Placeholder: "${strategy.placeholder}"`);
    if (strategy.attributes) info.push(`- Attributes: ${JSON.stringify(strategy.attributes)}`);
    
    info.push(`Total interactive elements on page: ${browserState.selectorMap.size}`);
    
    return info.join('\n');
  }
}