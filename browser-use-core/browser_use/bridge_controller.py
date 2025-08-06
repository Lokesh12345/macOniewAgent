"""
Bridge Controller for Browser-Use
Handles communication with the bridge extension for controlling user's Chrome browser
"""

import asyncio
import json
import websockets
import logging
from typing import Optional, Dict, Any
from asyncio import Queue
import uuid

from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.views import BrowserStateSummary, PageInfo, TabInfo
from browser_use.dom.views import SelectorMap

logger = logging.getLogger(__name__)


class BridgeController:
    """Controller for communicating with browser bridge extension"""
    
    def __init__(self, port: int = 9898):
        self.port = port
        self.ws = None
        self.connected = False
        self.response_queue = Queue()
        self.pending_commands = {}
        self.ws_server = None
        
    async def start_server(self):
        """Start WebSocket server to accept connections from extension"""
        async def handler(websocket):
            try:
                logger.info(f"🔌 New WebSocket connection attempt from {websocket.remote_address}")
                self.ws = websocket
                self.connected = True
                logger.info(f"✅ Bridge extension connected from {websocket.remote_address}")
                
                # Send welcome message
                welcome = {'type': 'welcome', 'message': 'Connected to browser-use bridge server'}
                await websocket.send(json.dumps(welcome))
                
                # Handle incoming messages
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        logger.info(f"📥 Received message: {data.get('type', 'unknown')}")
                        await self._handle_message(data)
                    except json.JSONDecodeError:
                        logger.error(f"❌ Invalid JSON received: {message}")
                    except Exception as e:
                        logger.error(f"❌ Error handling message: {e}")
                        
            except websockets.exceptions.ConnectionClosed:
                logger.info("🔌 Bridge extension disconnected")
            except Exception as e:
                logger.error(f"❌ WebSocket handler error: {e}")
            finally:
                self.ws = None
                self.connected = False
                logger.info("🔌 Connection cleanup completed")
                
        # Start WebSocket server
        try:
            self.ws_server = await websockets.serve(handler, "localhost", self.port)
            logger.info(f"🌉 Bridge server started on ws://localhost:{self.port}")
            logger.info("🔗 Waiting for bridge extension to connect...")
        except Exception as e:
            logger.error(f"❌ Failed to start bridge server: {e}")
            raise
        
    async def stop_server(self):
        """Stop the WebSocket server"""
        if self.ws_server:
            self.ws_server.close()
            await self.ws_server.wait_closed()
            logger.info("Bridge server stopped")
            
    async def _handle_message(self, data: Dict[str, Any]):
        """Handle incoming messages from extension"""
        msg_type = data.get('type')
        
        if msg_type == 'ready':
            logger.info("Bridge extension is ready")
        elif msg_type == 'response':
            # Handle command response
            cmd_id = data.get('id')
            if cmd_id in self.pending_commands:
                self.pending_commands[cmd_id]['result'] = data.get('result')
                self.pending_commands[cmd_id]['event'].set()
        elif msg_type == 'error':
            logger.error(f"Bridge error: {data.get('error')}")
            
    async def send_command(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send command to extension and wait for response"""
        if not self.connected or not self.ws:
            logger.error(f"❌ Bridge not connected")
            raise Exception("Bridge extension not connected")
            
        cmd_id = str(uuid.uuid4())
        command = {
            'type': 'command',
            'id': cmd_id,
            'command': {
                'method': method,
                'params': params
            }
        }
        
        # Reduced WebSocket logging
        event = asyncio.Event()
        self.pending_commands[cmd_id] = {'event': event, 'result': None}
        
        try:
            # Send command
            await self.ws.send(json.dumps(command))
            
            # Wait for response (with timeout)
            await asyncio.wait_for(event.wait(), timeout=30.0)
            
            # Get result
            result = self.pending_commands[cmd_id]['result']
            del self.pending_commands[cmd_id]
            
            return result
            
        except asyncio.TimeoutError:
            logger.error(f"⏰ Command timeout for {method}")
            del self.pending_commands[cmd_id]
            raise Exception("Command timeout")
        except Exception as e:
            logger.error(f"❌ Command {method} failed: {e}")
            if cmd_id in self.pending_commands:
                del self.pending_commands[cmd_id]
            raise e
            
    async def navigate(self, url: str) -> Dict[str, Any]:
        """Navigate to URL"""
        return await self.send_command('navigate', {'url': url})
        
    async def click(self, x: int = None, y: int = None, index: int = None) -> Dict[str, Any]:
        """Click at coordinates or by element index"""
        if index is not None:
            return await self.send_command('click', {'index': index})
        else:
            return await self.send_command('click', {'x': x, 'y': y})
        
    async def type_text(self, text: str) -> Dict[str, Any]:
        """Type text into focused element"""
        return await self.send_command('type', {'text': text})
        
    async def evaluate(self, expression: str) -> Dict[str, Any]:
        """Evaluate JavaScript expression"""
        return await self.send_command('evaluate', {'expression': expression})
        
    async def screenshot(self) -> Dict[str, Any]:
        """Take screenshot"""
        return await self.send_command('screenshot', {})
        
    async def get_dom(self) -> Dict[str, Any]:
        """Get DOM content and interactive elements"""
        return await self.send_command('get_dom', {})
        
    def is_connected(self) -> bool:
        """Check if bridge is connected"""
        return self.connected and self.ws is not None


class BridgeSession(BrowserSession):
    """Browser session that uses the bridge extension instead of Playwright"""
    
    def __init__(self, bridge_controller: BridgeController, **kwargs):
        # Create a minimal browser profile for the session
        profile = BrowserProfile()
        
        # Initialize the parent BrowserSession with minimal required fields
        super().__init__(
            browser_profile=profile,
            **kwargs
        )
        
        # Set bridge-specific attributes
        self.bridge = bridge_controller
        self.current_url = None
        self._owns_browser_resources = False  # Don't manage browser lifecycle
        self._tab_infos = []  # Store tab information from bridge
        
        # Mock required browser attributes that Agent expects
        self.browser = self._create_mock_browser()
        self.browser_context = self._create_mock_context() 
        self.agent_current_page = self._create_mock_page()
        
    def _create_mock_browser(self):
        """Create a mock browser object"""
        class MockBrowser:
            def __init__(self):
                self.pid = None
                
        return MockBrowser()
        
    def _create_mock_context(self):
        """Create a mock browser context"""
        class MockContext:
            def __init__(self):
                pass
                
        return MockContext()
        
    def _create_mock_page(self):
        """Create a mock page object that matches browser-use expectations"""
        bridge = self.bridge
        
        class MockPage:
            def __init__(self):
                self.url = "about:blank"  # Default URL
                self._title = ""
                
            @property
            def title(self):
                return self._title
                
            @title.setter 
            def title(self, value):
                self._title = value or ""
                
            def __setattr__(self, name, value):
                # Allow setting attributes dynamically
                object.__setattr__(self, name, value)
                
            def __getattr__(self, name):
                # Provide default values for missing attributes
                if name == 'url':
                    return getattr(self, '_url', 'about:blank')
                elif name == 'title':
                    return getattr(self, '_title', '')
                else:
                    # Return None for other missing attributes
                    return None
                
            async def screenshot(self, **kwargs):
                result = await bridge.screenshot()
                if result.get('success'):
                    import base64
                    return base64.b64decode(result.get('data', ''))
                return b''
                
            async def evaluate(self, script):
                result = await bridge.evaluate(script)
                if result.get('success'):
                    return result.get('result')
                return None
                
        return MockPage()
        
    async def get_current_page(self):
        """Get current page (returns mock page)"""
        return self.agent_current_page
        
    async def navigate(self, url: str):
        """Navigate to URL"""
        result = await self.bridge.navigate(url)
        if result.get('success'):
            self.current_url = url
            # Safely update mock page
            if self.agent_current_page:
                self.agent_current_page.url = url
            else:
                self.agent_current_page = self._create_mock_page()
                self.agent_current_page.url = url
            return True
        return False
        
    async def get_browser_state_with_recovery(self, **kwargs) -> BrowserStateSummary:
        """Get browser state for Agent"""
        
        # Check if bridge is connected
        if not self.bridge.is_connected():
            logger.error("❌ Bridge extension not connected!")
            raise Exception("Bridge extension not connected. Please install and connect the extension.")
        
        # If we don't have a current URL, start with Google (common starting point)
        if not self.current_url or self.current_url == "about:blank":
            logger.info("🌐 No current URL, navigating to Google...")
            nav_result = await self.bridge.navigate("https://www.google.com")
            if nav_result.get('success'):
                self.current_url = "https://www.google.com"
                logger.info("✅ Successfully navigated to Google")
            else:
                logger.error("❌ Failed to navigate to Google")
        
        # Get DOM content and interactive elements
        dom_result = await self.bridge.get_dom()
        
        if dom_result.get('success'):
            dom_data = dom_result.get('result', {})
            logger.info(f"✅ DOM: {len(dom_data.get('elements', []))} elements")
            
            # Store tab information from extension
            self._tab_infos = dom_data.get('tabs', [])
            
            # Extract viewport, page, and pixel data
            viewport = dom_data.get('viewport', {})
            page = dom_data.get('page', {})
            pixels = dom_data.get('pixels', {})
            
            # Create page info using actual browser dimensions from DOM data
            # Use real browser dimensions, with sensible fallbacks only if data is missing
            actual_viewport_width = viewport.get('width') or 1920
            actual_viewport_height = viewport.get('height') or 1080  
            actual_page_width = page.get('width') or actual_viewport_width
            actual_page_height = page.get('height') or actual_viewport_height
            
            
            page_info = PageInfo(
                # Use actual browser viewport dimensions
                viewport_width=actual_viewport_width,
                viewport_height=actual_viewport_height,
                # Use actual page dimensions (full document size)
                page_width=actual_page_width, 
                page_height=actual_page_height,
                scroll_x=viewport.get('scrollX', 0),
                scroll_y=viewport.get('scrollY', 0),
                pixels_above=pixels.get('above', 0),
                pixels_below=pixels.get('below', 0),
                pixels_left=pixels.get('left', 0),
                pixels_right=pixels.get('right', 0)
            )
            
            # Update current URL from DOM data
            current_url = dom_data.get('url', self.current_url or "about:blank")
            current_title = dom_data.get('title', "")
            self.current_url = current_url
            
            # Update mock page attributes safely
            if self.agent_current_page:
                self.agent_current_page.url = current_url
                self.agent_current_page.title = current_title
            else:
                logger.warning("❌ agent_current_page is None, creating new mock page")
                self.agent_current_page = self._create_mock_page()
                self.agent_current_page.url = current_url
                self.agent_current_page.title = current_title
            
            # Create selector map from interactive elements with complete data
            selector_map = SelectorMap()
            elements = dom_data.get('elements', [])
            
            for element in elements:
                # Create DOMElementNode with all required fields from bridge element data
                from browser_use.dom.views import DOMElementNode
                from browser_use.dom.history_tree_processor.view import CoordinateSet, ViewportInfo
                
                # Create coordinate sets if available (matching Pydantic schema)
                viewport_coords = None
                page_coords = None
                
                if element.get('viewportCoordinates'):
                    from browser_use.dom.history_tree_processor.view import Coordinates
                    vc = element['viewportCoordinates']
                    viewport_coords = CoordinateSet(
                        top_left=Coordinates(x=vc['top_left']['x'], y=vc['top_left']['y']),
                        top_right=Coordinates(x=vc['top_right']['x'], y=vc['top_right']['y']),
                        bottom_left=Coordinates(x=vc['bottom_left']['x'], y=vc['bottom_left']['y']),
                        bottom_right=Coordinates(x=vc['bottom_right']['x'], y=vc['bottom_right']['y']),
                        center=Coordinates(x=vc['center']['x'], y=vc['center']['y']),
                        width=vc['width'],
                        height=vc['height']
                    )
                
                if element.get('pageCoordinates'):
                    from browser_use.dom.history_tree_processor.view import Coordinates
                    pc = element['pageCoordinates']
                    page_coords = CoordinateSet(
                        top_left=Coordinates(x=pc['top_left']['x'], y=pc['top_left']['y']),
                        top_right=Coordinates(x=pc['top_right']['x'], y=pc['top_right']['y']),
                        bottom_left=Coordinates(x=pc['bottom_left']['x'], y=pc['bottom_left']['y']),
                        bottom_right=Coordinates(x=pc['bottom_right']['x'], y=pc['bottom_right']['y']),
                        center=Coordinates(x=pc['center']['x'], y=pc['center']['y']),
                        width=pc['width'],
                        height=pc['height']
                    )
                
                # Create viewport info
                viewport_info = ViewportInfo(
                    scrollX=viewport.get('scrollX', 0),
                    scrollY=viewport.get('scrollY', 0),
                    width=viewport.get('width', 1920),
                    height=viewport.get('height', 1080)
                )
                
                dom_element = DOMElementNode(
                    tag_name=element.get('tagName', 'div'),
                    xpath=element.get('xpath', ''),
                    attributes=element.get('attributes', {}),
                    children=[],  # Simplified for now, could reconstruct full tree
                    is_visible=element.get('isVisible', True),
                    is_interactive=element.get('isInteractive', False),
                    is_top_element=element.get('isTopElement', False),
                    is_in_viewport=element.get('isInViewport', False),
                    shadow_root=element.get('shadowRoot', False),
                    highlight_index=element.get('index'),  # Critical: Use the highlight index from extension
                    viewport_coordinates=viewport_coords,
                    page_coordinates=page_coords,
                    viewport_info=viewport_info,
                    parent=None  # Set later if needed
                )
                
                selector_map[element.get('index', 0)] = dom_element
            
            
            # Create TabInfo for the current page
            tab_info = TabInfo(
                page_id=1,
                url=current_url,
                title=current_title
            )
            
            # Create a proper root element tree structure (like original extension)
            from browser_use.dom.views import DOMElementNode
            from browser_use.dom.history_tree_processor.view import ViewportInfo
            
            viewport_info = ViewportInfo(
                scrollX=viewport.get('scrollX', 0),
                scrollY=viewport.get('scrollY', 0),
                width=actual_viewport_width,
                height=actual_viewport_height
            )
            
            # Create root element that contains all interactive elements as children
            interactive_children = list(selector_map.values()) if selector_map else []
            
            # Set parent relationship for all children
            for child in interactive_children:
                child.parent = None  # Will be set to root_element below
            
            root_element = DOMElementNode(
                tag_name='root',  # Match original extension
                xpath='',
                attributes={},
                children=interactive_children,
                is_visible=True,
                is_interactive=False,
                is_top_element=True,
                is_in_viewport=True,
                shadow_root=False,
                highlight_index=None,
                viewport_coordinates=None,
                page_coordinates=None,
                viewport_info=viewport_info,
                parent=None
            )
            
            # Set parent relationship
            for child in interactive_children:
                child.parent = root_element
            
            return BrowserStateSummary(
                element_tree=root_element,  # Always provide a root element
                selector_map=selector_map,
                url=current_url,
                title=current_title,
                tabs=[tab_info],
                page_info=page_info,
                pixels_above=pixels.get('above', 0),
                pixels_below=pixels.get('below', 0)
            )
        else:
            error_msg = dom_result.get('error', 'Unknown error')
            logger.error(f"❌ Failed to get DOM data: {error_msg}")
            
            # Still return a valid state but with error info
            error_url = self.current_url or "about:blank"
            error_title = f"Bridge Error: {error_msg}"
            
            # For error case, try to get dimensions from JavaScript evaluation as fallback
            try:
                dimension_result = await self.bridge.evaluate('''
                    ({
                        viewport: {
                            width: window.visualViewport?.width || window.innerWidth,
                            height: window.visualViewport?.height || window.innerHeight
                        },
                        page: {
                            width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
                            height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
                        }
                    })
                ''')
                
                if dimension_result.get('success') and dimension_result.get('result'):
                    dim_data = dimension_result['result']
                    error_viewport_width = dim_data.get('viewport', {}).get('width', 1920)
                    error_viewport_height = dim_data.get('viewport', {}).get('height', 1080)
                    error_page_width = dim_data.get('page', {}).get('width', error_viewport_width)
                    error_page_height = dim_data.get('page', {}).get('height', error_viewport_height)
                else:
                    # Final fallback to common desktop resolution
                    error_viewport_width = 1920
                    error_viewport_height = 1080
                    error_page_width = 1920
                    error_page_height = 1080
                    
            except Exception:
                # If JavaScript evaluation fails, use fallback dimensions
                error_viewport_width = 1920
                error_viewport_height = 1080
                error_page_width = 1920
                error_page_height = 1080
            
            page_info = PageInfo(
                viewport_width=error_viewport_width,
                viewport_height=error_viewport_height,
                page_width=error_page_width,
                page_height=error_page_height,
                scroll_x=0,
                scroll_y=0,
                pixels_above=0,
                pixels_below=0,
                pixels_left=0,
                pixels_right=0
            )
            
            tab_info = TabInfo(
                page_id=1,
                url=error_url,
                title=error_title
            )
            
            return BrowserStateSummary(
                element_tree=None,
                selector_map=SelectorMap(),
                url=error_url,
                title=error_title,
                tabs=[tab_info],
                page_info=page_info,
                pixels_above=0,
                pixels_below=0
            )
        
    async def get_selector_map(self) -> SelectorMap:
        """Get selector map from DOM analysis"""
        # Get current browser state which includes selector map
        state = await self.get_browser_state_with_recovery()
        return state.selector_map
        
    async def close(self):
        """Close session (no-op for bridge mode)"""
        # Bridge stays connected for other tasks
        pass
        
    async def stop(self):
        """Stop session (no-op for bridge mode)"""
        # Don't close the user's browser
        pass
        
    @property
    def downloaded_files(self):
        """Get downloaded files (empty for bridge mode)"""
        return []
        
    @property
    def tabs(self):
        """Get list of Page-compatible objects representing browser tabs"""
        # Create Page-compatible objects for each tab
        bridge = self.bridge
        tabs_list = []
        
        for tab_info in self._tab_infos:
            # Create a Page-compatible object with all required methods
            class BridgePageProxy:
                def __init__(self, tab_id, url, title):
                    self.id = tab_id
                    self.url = url
                    self._title = title
                    self._closed = False
                    
                async def title(self):
                    return self._title
                    
                def is_closed(self):
                    return self._closed
                    
                async def close(self):
                    """Close this tab via bridge"""
                    try:
                        await bridge.send_command('close_tab', {'tabId': self.id})
                        self._closed = True
                    except Exception as e:
                        logger.error(f"Failed to close tab {self.id}: {e}")
                        
                async def goto(self, url):
                    """Navigate this tab to URL via bridge"""
                    await bridge.send_command('navigate_tab', {'tabId': self.id, 'url': url})
                    self.url = url
                    
                def __eq__(self, other):
                    """Enable comparison for .index() calls"""
                    if hasattr(other, 'id'):
                        return self.id == other.id
                    if hasattr(other, 'url'):
                        return self.url == other.url
                    return False
                    
            tab_proxy = BridgePageProxy(tab_info.get('id'), tab_info.get('url', ''), tab_info.get('title', ''))
            tabs_list.append(tab_proxy)
        
        # If no tabs info yet, return list with current page proxy
        if not tabs_list and self.agent_current_page:
            # Create proxy for current page
            class CurrentPageProxy:
                def __init__(self, page):
                    self.url = page.url
                    self._title = getattr(page, 'title', '')
                    self.id = 1
                    self._closed = False
                    
                async def title(self):
                    return self._title
                    
                def is_closed(self):
                    return self._closed
                    
                async def close(self):
                    self._closed = True
                    
                async def goto(self, url):
                    await bridge.navigate(url)
                    self.url = url
                    
                def __eq__(self, other):
                    if hasattr(other, 'url'):
                        return self.url == other.url
                    return False
                    
            return [CurrentPageProxy(self.agent_current_page)]
            
        return tabs_list
        
    async def get_dom_element_by_index(self, index: int):
        """Get DOM element by index (compatible with browser-use actions)"""
        # Get current selector map which contains the elements
        selector_map = await self.get_selector_map()
        return selector_map.get(index)
        
    async def _click_element_node(self, element_node) -> str | None:
        """Click element by node (browser-use compatibility) - returns download path or None"""
        # Extract index from element node and use bridge to click
        if hasattr(element_node, 'highlight_index') and element_node.highlight_index is not None:
            try:
                result = await self.bridge.click(index=element_node.highlight_index)
                success = result.get('success', False) and result.get('clicked', False)
                
                if success:
                    logger.info(f"✅ Clicked element {element_node.highlight_index}")
                    return None
                else:
                    error_msg = f"Click failed for element {element_node.highlight_index}: {result.get('error', 'unknown error')}"
                    logger.error(f"❌ {error_msg}")
                    raise Exception(error_msg)
                    
            except Exception as e:
                logger.error(f"❌ Click error for element {element_node.highlight_index}: {e}")
                raise
        else:
            error_msg = f"Element missing highlight_index: {element_node}"
            logger.error(f"❌ {error_msg}")
            raise Exception(error_msg)
        
    async def _input_text_element_node(self, element_node, text: str):
        """Input text to element by node (browser-use compatibility)"""
        # For input fields, focus by clicking first, then type
        if hasattr(element_node, 'highlight_index') and element_node.highlight_index is not None:
            # First click to focus the element
            click_result = await self.bridge.click(index=element_node.highlight_index)
            if click_result.get('success', False):
                # Then type the text
                type_result = await self.bridge.type_text(text)
                success = type_result.get('success', False) and type_result.get('typed', False)
                if success:
                    logger.info(f"✅ Successfully typed '{text}' into element {element_node.highlight_index}")
                else:
                    logger.error(f"❌ Type failed for element {element_node.highlight_index}: {type_result.get('error', 'unknown error')}")
                return success
            else:
                logger.error(f"❌ Failed to focus element {element_node.highlight_index} before typing")
        else:
            logger.error(f"❌ Element has no highlight_index: {element_node}")
        return False