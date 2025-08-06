"""
Enhanced browser actions with autocomplete detection and memory management.
Incorporates innovations from Oniew Agent into browser-use framework.
"""

import asyncio
import logging
from typing import Optional

from browser_use.agent.views import ActionResult
from browser_use.browser import BrowserSession  
from browser_use.browser.types import Page
from browser_use.browser.views import BrowserError
from browser_use.controller.views import InputTextAction, ClickElementAction
from browser_use.dom.views import DOMElementNode
from browser_use.controller.registry.service import Registry

logger = logging.getLogger(__name__)


class EnhancedActions:
    """Enhanced browser actions with autocomplete detection and memory management"""
    
    def __init__(self, registry: Registry):
        self.registry = registry
        self._setup_enhanced_actions()
    
    def _setup_enhanced_actions(self):
        """Register enhanced actions with autocomplete detection"""
        
        @self.registry.action(
            'Enhanced input text with autocomplete detection and sequence breaking',
            param_model=InputTextAction,
        )
        async def enhanced_input_text(
            params: InputTextAction, 
            browser_session: BrowserSession, 
            has_sensitive_data: bool = False
        ):
            """Enhanced input_text with autocomplete detection from Oniew Agent"""
            
            element_node = await browser_session.get_dom_element_by_index(params.index)
            if element_node is None:
                raise Exception(f'Element index {params.index} does not exist - retry or use alternative actions')

            try:
                # Pre-input DOM state capture
                page = await browser_session.get_current_page()
                pre_input_state = await self._capture_dom_state(page)
                
                # Perform the input
                await browser_session._input_text_element_node(element_node, params.text)
                
                # Wait a moment for DOM to update
                await asyncio.sleep(0.5)
                
                # Post-input DOM state capture  
                post_input_state = await self._capture_dom_state(page)
                
                # Detect autocomplete
                autocomplete_detected = await self._detect_autocomplete(
                    element_node, pre_input_state, post_input_state, page
                )
                
                # Prepare result
                if not has_sensitive_data:
                    msg = f'⌨️  Enhanced input {params.text} into index {params.index}'
                else:
                    msg = f'⌨️  Enhanced input sensitive data into index {params.index}'
                
                # Add autocomplete information
                if autocomplete_detected:
                    msg += " 🎯 AUTOCOMPLETE DETECTED - Sequence should break for user selection"
                    extracted_content = f"{msg}. Autocomplete appeared after text input. User should select from dropdown before continuing with remaining actions."
                else:
                    extracted_content = msg
                
                logger.info(msg)
                logger.debug(f'Element xpath: {element_node.xpath}')
                logger.debug(f'Autocomplete detected: {autocomplete_detected}')
                
                return ActionResult(
                    extracted_content=extracted_content,
                    include_in_memory=True,
                    long_term_memory=f"Enhanced input '{params.text}' into element {params.index}. Autocomplete: {autocomplete_detected}",
                )
                
            except Exception as e:
                msg = f'Failed to input text into element {params.index}: {str(e)}'
                raise BrowserError(msg)

        @self.registry.action(
            'Smart click with element type validation and autocomplete awareness',
            param_model=ClickElementAction,
        )
        async def enhanced_click_element(params: ClickElementAction, browser_session: BrowserSession):
            """Enhanced click with element validation and DOM change detection"""
            
            element_node = await browser_session.get_dom_element_by_index(params.index)
            if element_node is None:
                raise Exception(f'Element index {params.index} does not exist - retry or use alternative actions')

            try:
                # Capture pre-click state
                page = await browser_session.get_current_page()
                pre_click_state = await self._capture_dom_state(page)
                
                # Perform the click
                await browser_session._click_element_node(element_node)
                
                # Wait for DOM to potentially update
                await asyncio.sleep(0.3)
                
                # Capture post-click state
                post_click_state = await self._capture_dom_state(page)
                
                # Check if DOM changed significantly
                dom_changed = await self._detect_dom_changes(pre_click_state, post_click_state)
                
                msg = f'🖱️  Enhanced click on index {params.index}'
                if dom_changed:
                    msg += " 🔄 DOM CHANGED - May need re-analysis"
                    extracted_content = f"{msg}. Click caused significant DOM changes. Consider re-analyzing the page state before next actions."
                else:
                    extracted_content = msg
                
                logger.info(msg)
                logger.debug(f'Element xpath: {element_node.xpath}')
                logger.debug(f'DOM changed: {dom_changed}')
                
                return ActionResult(
                    extracted_content=extracted_content,
                    include_in_memory=True,
                    long_term_memory=f"Enhanced click on element {params.index}. DOM changed: {dom_changed}",
                )
                
            except Exception as e:
                msg = f'Failed to click element {params.index}: {str(e)}'
                raise BrowserError(msg)

    async def _capture_dom_state(self, page: Page) -> dict:
        """Capture relevant DOM state for comparison"""
        try:
            # Get all elements with potential autocomplete indicators
            state = await page.evaluate("""() => {
                const elements = [];
                // Look for elements that could indicate autocomplete
                const selectors = [
                    '[role="listbox"]',
                    '[role="option"]', 
                    '[aria-expanded="true"]',
                    '.autocomplete',
                    '.dropdown',
                    '.suggestions',
                    '[data-testid*="suggestion"]',
                    '[class*="suggestion"]',
                    '[class*="dropdown"]',
                    '[class*="autocomplete"]'
                ];
                
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el.offsetParent !== null) { // Only visible elements
                            elements.push({
                                selector: selector,
                                text: el.textContent?.trim() || '',
                                visible: true,
                                role: el.getAttribute('role'),
                                ariaExpanded: el.getAttribute('aria-expanded')
                            });
                        }
                    });
                });
                
                return {
                    autocompleteElements: elements,
                    timestamp: Date.now()
                };
            }""")
            return state
        except Exception as e:
            logger.debug(f"Failed to capture DOM state: {e}")
            return {"autocompleteElements": [], "timestamp": 0}

    async def _detect_autocomplete(
        self, 
        element_node: DOMElementNode, 
        pre_state: dict, 
        post_state: dict,
        page: Page
    ) -> bool:
        """Detect if autocomplete appeared after input - core innovation from Oniew Agent"""
        
        try:
            # Check if element is input-like and has combobox role (Gmail pattern)
            if (element_node.tag == 'input' and 
                element_node.attributes and 
                element_node.attributes.get('role') == 'combobox'):
                
                # Check for new autocomplete elements
                pre_elements = len(pre_state.get('autocompleteElements', []))
                post_elements = len(post_state.get('autocompleteElements', []))
                
                if post_elements > pre_elements:
                    # New autocomplete elements appeared
                    logger.info(f"🎯 Autocomplete detected: {post_elements - pre_elements} new elements")
                    return True
                
                # Check for specific autocomplete patterns
                for element in post_state.get('autocompleteElements', []):
                    if (element.get('role') == 'listbox' or 
                        element.get('role') == 'option' or
                        element.get('ariaExpanded') == 'true'):
                        logger.info(f"🎯 Autocomplete detected: {element.get('role')} element found")
                        return True
                        
                # Additional check - look for Gmail-specific autocomplete
                gmail_autocomplete = await page.evaluate("""() => {
                    // Gmail autocomplete usually appears as a dropdown with suggestions
                    const suggestions = document.querySelectorAll('[role="option"][data-hovercard-id]');
                    const dropdowns = document.querySelectorAll('[role="listbox"]');
                    return suggestions.length > 0 || dropdowns.length > 0;
                }""")
                
                if gmail_autocomplete:
                    logger.info("🎯 Gmail-specific autocomplete pattern detected")
                    return True
                
        except Exception as e:
            logger.debug(f"Error in autocomplete detection: {e}")
            
        return False

    async def _detect_dom_changes(self, pre_state: dict, post_state: dict) -> bool:
        """Detect significant DOM changes that might require re-analysis"""
        
        # Simple heuristic: if autocomplete elements changed significantly
        pre_count = len(pre_state.get('autocompleteElements', []))
        post_count = len(post_state.get('autocompleteElements', []))
        
        # Consider it a significant change if autocomplete elements appeared/disappeared
        return abs(post_count - pre_count) > 0


class MemoryManager:
    """Enhanced memory management for browser automation tasks"""
    
    def __init__(self):
        self.task_memory = {}
        self.autocomplete_history = []
        self.action_sequence = []
    
    def update_task_memory(self, task_id: str, key: str, value: any):
        """Update task-specific memory"""
        if task_id not in self.task_memory:
            self.task_memory[task_id] = {}
        self.task_memory[task_id][key] = value
    
    def get_task_memory(self, task_id: str, key: str = None):
        """Retrieve task-specific memory"""
        if task_id not in self.task_memory:
            return None if key else {}
        
        if key:
            return self.task_memory[task_id].get(key)
        return self.task_memory[task_id]
    
    def record_autocomplete_event(self, element_index: int, text: str, detected: bool):
        """Record autocomplete detection events"""
        self.autocomplete_history.append({
            "timestamp": asyncio.get_event_loop().time(),
            "element_index": element_index,
            "text": text,
            "detected": detected
        })
        
        # Keep only last 50 events
        if len(self.autocomplete_history) > 50:
            self.autocomplete_history = self.autocomplete_history[-50:]
    
    def should_break_sequence(self) -> bool:
        """Determine if action sequence should break based on recent autocomplete"""
        if not self.autocomplete_history:
            return False
            
        # Check if autocomplete was detected in last action
        recent = self.autocomplete_history[-1]
        current_time = asyncio.get_event_loop().time()
        
        # If autocomplete detected within last 2 seconds, break sequence
        return (recent["detected"] and 
                (current_time - recent["timestamp"]) < 2.0)