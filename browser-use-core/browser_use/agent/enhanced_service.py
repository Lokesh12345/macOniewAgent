"""
Enhanced Agent with memory management and autocomplete awareness.
Integrates Oniew Agent innovations into browser-use framework.
"""

import asyncio
import logging
from typing import Optional

from browser_use.agent.service import Agent
from browser_use.agent.views import AgentHistoryList, AgentOutput
from browser_use.browser import BrowserSession
from browser_use.controller.enhanced_actions import EnhancedActions, MemoryManager
from browser_use.controller.service import Controller
from browser_use.llm.base import BaseChatModel

logger = logging.getLogger(__name__)


class EnhancedAgent(Agent):
    """Enhanced Agent with autocomplete detection and advanced memory management"""
    
    def __init__(
        self,
        task: str,
        llm: BaseChatModel,
        browser_session: Optional[BrowserSession] = None,
        controller: Optional[Controller] = None,
        memory_manager: Optional[MemoryManager] = None,
        **kwargs
    ):
        # Initialize memory manager
        self.memory_manager = memory_manager or MemoryManager()
        
        # Use default controller for now to avoid initialization issues
        if controller is None:
            controller = Controller()
        
        # Initialize base agent with explicit parameters
        super().__init__(
            task=task,
            llm=llm,
            browser_session=browser_session,
            controller=controller
        )
        
        # Add enhanced actions after initialization
        try:
            self.enhanced_actions = EnhancedActions(controller.registry)
        except Exception as e:
            logger.warning(f"Could not initialize enhanced actions: {e}")
            self.enhanced_actions = None
        
        # Task ID for memory management
        self.task_id = f"task_{id(self)}"
        
        # Initialize task memory
        self.memory_manager.update_task_memory(self.task_id, "original_task", task)
        self.memory_manager.update_task_memory(self.task_id, "current_goal", task)
        self.memory_manager.update_task_memory(self.task_id, "actions_taken", [])
    
    async def run(self, max_steps: int = 100) -> AgentHistoryList:
        """Enhanced run method with memory management and sequence breaking"""
        
        logger.info(f"🚀 Starting enhanced agent execution for: {self.task}")
        
        # Update memory
        self.memory_manager.update_task_memory(self.task_id, "start_time", asyncio.get_event_loop().time())
        
        step_count = 0
        history = AgentHistoryList([])
        
        try:
            while step_count < max_steps:
                step_count += 1
                
                logger.info(f"🔄 Enhanced Step {step_count} / {max_steps}")
                
                # Check if we should break sequence due to autocomplete
                if self.memory_manager.should_break_sequence():
                    logger.info("🎯 SEQUENCE BREAK: Autocomplete detected, pausing for user selection")
                    
                    # Add memory about sequence break
                    self.memory_manager.update_task_memory(
                        self.task_id, 
                        "sequence_break_reason", 
                        "Autocomplete detected - user selection required"
                    )
                    
                    # Create enhanced context prompt
                    enhanced_context = self._create_enhanced_context()
                    
                    # Continue with enhanced context
                    result = await self._execute_step_with_context(enhanced_context)
                else:
                    # Normal execution
                    result = await self._execute_single_step()
                
                if result is None:
                    break
                    
                history.extend(result)
                
                # Update action memory
                actions_taken = self.memory_manager.get_task_memory(self.task_id, "actions_taken") or []
                actions_taken.append({
                    "step": step_count,
                    "timestamp": asyncio.get_event_loop().time(),
                    "result": result.model_dump() if hasattr(result, 'model_dump') else str(result)
                })
                self.memory_manager.update_task_memory(self.task_id, "actions_taken", actions_taken)
                
                # Check if task is complete
                if self._is_task_complete(result):
                    logger.info("✅ Enhanced agent task completed successfully")
                    break
                    
        except Exception as e:
            logger.error(f"❌ Enhanced agent execution failed: {e}")
            self.memory_manager.update_task_memory(self.task_id, "error", str(e))
            raise
        
        # Final memory update
        self.memory_manager.update_task_memory(self.task_id, "end_time", asyncio.get_event_loop().time())
        self.memory_manager.update_task_memory(self.task_id, "total_steps", step_count)
        
        return history
    
    def _create_enhanced_context(self) -> str:
        """Create enhanced context with memory and autocomplete awareness"""
        
        memory = self.memory_manager.get_task_memory(self.task_id)
        
        context = f"""
ENHANCED CONTEXT WITH MEMORY:

Original Task: {memory.get('original_task', 'Unknown')}
Current Goal: {memory.get('current_goal', 'Unknown')}

Recent Actions Taken:
"""
        
        actions_taken = memory.get('actions_taken', [])
        for action in actions_taken[-3:]:  # Last 3 actions
            context += f"- Step {action['step']}: {action.get('result', 'No result')}\n"
        
        # Add autocomplete awareness
        if self.memory_manager.should_break_sequence():
            context += """
🎯 IMPORTANT: Autocomplete was just detected in the previous action.
- The user likely needs to select from a dropdown/suggestion list
- Do NOT continue with more text input or form filling
- Wait for user selection or suggest clicking on an autocomplete option
- Be aware that DOM elements may have changed due to autocomplete appearing
"""
        
        # Add recent autocomplete history
        if self.memory_manager.autocomplete_history:
            context += "\nRecent Autocomplete Events:\n"
            for event in self.memory_manager.autocomplete_history[-3:]:
                context += f"- Element {event['element_index']}: '{event['text']}' -> {'DETECTED' if event['detected'] else 'NONE'}\n"
        
        return context
    
    async def _execute_step_with_context(self, context: str) -> Optional[AgentHistoryList]:
        """Execute a step with enhanced context"""
        
        # This would integrate with the base Agent's step execution
        # For now, return normal execution
        return await self._execute_single_step()
    
    async def _execute_single_step(self) -> Optional[AgentHistoryList]:
        """Execute a single step using base agent logic"""
        
        # Use the parent class step execution
        # This is a placeholder - would need to access base agent's step method
        try:
            # For now, delegate to parent implementation
            return await super().run(max_steps=1)
        except Exception as e:
            logger.error(f"Step execution failed: {e}")
            return None
    
    def _is_task_complete(self, result) -> bool:
        """Check if the task is complete based on result"""
        
        # Simple completion check - would be enhanced based on result content
        if hasattr(result, 'extracted_content'):
            content = str(result.extracted_content).lower()
            return any(word in content for word in ['completed', 'done', 'finished', 'success'])
        
        return False
    
    def get_memory_summary(self) -> dict:
        """Get a summary of the agent's memory"""
        return {
            "task_memory": self.memory_manager.get_task_memory(self.task_id),
            "autocomplete_history": self.memory_manager.autocomplete_history[-5:],  # Last 5 events
            "should_break": self.memory_manager.should_break_sequence()
        }


# Enhanced system prompts with autocomplete awareness
ENHANCED_SYSTEM_PROMPT = """
You are an advanced browser automation agent with enhanced autocomplete detection and memory management capabilities.

CORE ENHANCEMENTS:
1. **Autocomplete Detection**: You can detect when autocomplete/dropdown suggestions appear after text input
2. **Sequence Breaking**: You will pause action sequences when autocomplete is detected to allow user selection
3. **Memory Management**: You maintain context about tasks, actions taken, and system state
4. **DOM Change Awareness**: You understand when DOM changes require re-analysis

AUTOCOMPLETE HANDLING RULES:
- When typing in email fields, address fields, or search boxes, watch for autocomplete
- If autocomplete appears, STOP the action sequence and suggest user selection
- Do not continue typing or clicking until autocomplete is resolved
- Specifically watch for Gmail email suggestions, Google search suggestions, etc.

MEMORY CONTEXT:
- Remember what actions you've taken and their outcomes
- Track which elements had autocomplete behavior
- Maintain awareness of task progress and next goals
- Use context to make better decisions about when to pause/continue

ACTION SEQUENCE GUIDELINES:
- Use enhanced_input_text instead of input_text for better autocomplete detection
- Use enhanced_click_element for DOM change awareness  
- Break sequences when autocomplete is detected
- Re-analyze DOM state after significant changes

Your goal is to complete browser automation tasks reliably while handling dynamic content and user interaction requirements.
"""