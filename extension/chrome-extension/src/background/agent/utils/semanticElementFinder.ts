import { createLogger } from '@src/background/log';
import type { BrowserState } from '@src/background/browser/views';
import type { DOMElement } from '@src/background/browser/dom/types';

const logger = createLogger('SemanticElementFinder');

export interface ElementMatch {
  element: DOMElement;
  index: number;
  confidence: number;
  matchReason: string;
}

export interface SemanticSearchCriteria {
  // Primary identifiers (highest confidence)
  id?: string;
  name?: string;
  
  // Semantic attributes (high confidence)
  ariaLabel?: string;
  placeholder?: string;
  value?: string;
  
  // Text content (medium confidence)
  text?: string;
  altText?: string;
  title?: string;
  
  // Structure (lower confidence)
  tagName?: string;
  type?: string;
  role?: string;
  
  // Relative position
  nearText?: string;
  afterText?: string;
  beforeText?: string;
  
  // Original index (fallback)
  originalIndex?: number;
}

export class SemanticElementFinder {
  /**
   * Find element using semantic attributes instead of index
   */
  static async findElement(
    criteria: SemanticSearchCriteria,
    state: BrowserState
  ): Promise<ElementMatch | null> {
    if (!state.selectorMap) {
      logger.error('No selector map available');
      return null;
    }

    const candidates: ElementMatch[] = [];

    // Search through all elements
    state.selectorMap.forEach((element, index) => {
      const match = this.evaluateElement(element, index, criteria);
      if (match.confidence > 0) {
        candidates.push(match);
      }
    });

    // Sort by confidence and return best match
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    if (candidates.length > 0) {
      const bestMatch = candidates[0];
      logger.info(`Found element with ${bestMatch.confidence}% confidence: ${bestMatch.matchReason}`);
      
      // Log other candidates for debugging
      if (candidates.length > 1) {
        logger.debug('Other candidates:', candidates.slice(1, 4).map(c => 
          `${c.confidence}% - ${c.matchReason}`
        ));
      }
      
      return bestMatch;
    }

    // Fallback to original index if provided
    if (criteria.originalIndex !== undefined && state.selectorMap.has(criteria.originalIndex)) {
      const element = state.selectorMap.get(criteria.originalIndex)!;
      return {
        element,
        index: criteria.originalIndex,
        confidence: 10,
        matchReason: 'Fallback to original index'
      };
    }

    logger.warn('No matching element found for criteria:', criteria);
    return null;
  }

  /**
   * Evaluate how well an element matches the criteria
   */
  private static evaluateElement(
    element: DOMElement,
    index: number,
    criteria: SemanticSearchCriteria
  ): ElementMatch {
    let confidence = 0;
    const matchReasons: string[] = [];

    // ID match (highest confidence)
    if (criteria.id && element.attributes?.id === criteria.id) {
      confidence += 100;
      matchReasons.push(`id="${criteria.id}"`);
    }

    // Name match (very high confidence for form elements)
    if (criteria.name && element.attributes?.name === criteria.name) {
      confidence += 90;
      matchReasons.push(`name="${criteria.name}"`);
    }

    // Aria-label match (high confidence)
    if (criteria.ariaLabel && element.attributes?.['aria-label'] === criteria.ariaLabel) {
      confidence += 80;
      matchReasons.push(`aria-label="${criteria.ariaLabel}"`);
    }

    // Placeholder match (high confidence for inputs)
    if (criteria.placeholder && element.attributes?.placeholder === criteria.placeholder) {
      confidence += 80;
      matchReasons.push(`placeholder="${criteria.placeholder}"`);
    }

    // Value match (medium-high confidence)
    if (criteria.value && element.attributes?.value === criteria.value) {
      confidence += 60;
      matchReasons.push(`value="${criteria.value}"`);
    }

    // Text content match
    if (criteria.text && element.text) {
      const elementText = element.text.trim().toLowerCase();
      const searchText = criteria.text.trim().toLowerCase();
      
      if (elementText === searchText) {
        confidence += 70;
        matchReasons.push(`exact text="${criteria.text}"`);
      } else if (elementText.includes(searchText)) {
        confidence += 40;
        matchReasons.push(`contains text="${criteria.text}"`);
      }
    }

    // Alt text match (for images)
    if (criteria.altText && element.attributes?.alt === criteria.altText) {
      confidence += 60;
      matchReasons.push(`alt="${criteria.altText}"`);
    }

    // Title match
    if (criteria.title && element.attributes?.title === criteria.title) {
      confidence += 50;
      matchReasons.push(`title="${criteria.title}"`);
    }

    // Structural matches (lower confidence)
    if (criteria.tagName && element.tagName?.toLowerCase() === criteria.tagName.toLowerCase()) {
      confidence += 20;
      matchReasons.push(`tag=${criteria.tagName}`);
    }

    if (criteria.type && element.attributes?.type === criteria.type) {
      confidence += 30;
      matchReasons.push(`type="${criteria.type}"`);
    }

    if (criteria.role && element.attributes?.role === criteria.role) {
      confidence += 40;
      matchReasons.push(`role="${criteria.role}"`);
    }

    // Proximity matches (bonus confidence)
    if (criteria.nearText) {
      const nearby = this.hasTextNearby(element, criteria.nearText, state.selectorMap);
      if (nearby) {
        confidence += 30;
        matchReasons.push(`near text="${criteria.nearText}"`);
      }
    }

    return {
      element,
      index,
      confidence: Math.min(confidence, 100),
      matchReason: matchReasons.join(', ') || 'No match'
    };
  }

  /**
   * Check if element has specific text nearby
   */
  private static hasTextNearby(
    element: DOMElement,
    searchText: string,
    selectorMap: Map<number, DOMElement>
  ): boolean {
    const searchLower = searchText.toLowerCase();
    
    // Check siblings and parent elements
    // This is a simplified version - could be enhanced with proper DOM traversal
    for (const [_, nearbyElement] of selectorMap) {
      if (nearbyElement.text?.toLowerCase().includes(searchLower)) {
        // Simple proximity check - could be enhanced with actual position calculation
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract semantic criteria from an action
   */
  static extractCriteriaFromAction(
    action: Record<string, unknown>,
    element?: DOMElement
  ): SemanticSearchCriteria {
    const actionName = Object.keys(action)[0];
    const actionArgs = action[actionName] as Record<string, unknown>;
    
    const criteria: SemanticSearchCriteria = {};

    // Extract from action arguments
    if (actionArgs.aria) criteria.ariaLabel = String(actionArgs.aria);
    if (actionArgs.placeholder) criteria.placeholder = String(actionArgs.placeholder);
    if (actionArgs.text) criteria.text = String(actionArgs.text);
    if (actionArgs.name) criteria.name = String(actionArgs.name);
    if (actionArgs.id) criteria.id = String(actionArgs.id);
    if (actionArgs.value) criteria.value = String(actionArgs.value);
    if (actionArgs.index !== undefined) criteria.originalIndex = Number(actionArgs.index);

    // Extract from element if provided
    if (element) {
      if (element.attributes?.id) criteria.id = element.attributes.id;
      if (element.attributes?.name) criteria.name = element.attributes.name;
      if (element.attributes?.['aria-label']) criteria.ariaLabel = element.attributes['aria-label'];
      if (element.attributes?.placeholder) criteria.placeholder = element.attributes.placeholder;
      if (element.text) criteria.text = element.text;
      if (element.tagName) criteria.tagName = element.tagName;
      if (element.attributes?.type) criteria.type = element.attributes.type;
      if (element.attributes?.role) criteria.role = element.attributes.role;
    }

    return criteria;
  }

  /**
   * Update action with new element index
   */
  static updateActionWithNewIndex(
    action: Record<string, unknown>,
    newIndex: number
  ): Record<string, unknown> {
    const actionName = Object.keys(action)[0];
    const actionArgs = { ...(action[actionName] as Record<string, unknown>) };
    
    // Update index
    actionArgs.index = newIndex;
    
    return { [actionName]: actionArgs };
  }
}