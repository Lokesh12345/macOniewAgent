#!/usr/bin/env python3
"""
Bridge Extension Diagnostic Test
Comprehensive test to verify browser-use <-> extension communication
"""

import asyncio
import json
import websockets
import sys
from datetime import datetime

class BridgeTestSuite:
    def __init__(self):
        self.ws_uri = 'ws://localhost:9898'
        self.test_results = {}
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        symbols = {
            "INFO": "🔍",
            "SUCCESS": "✅", 
            "ERROR": "❌",
            "WARNING": "⚠️"
        }
        print(f"[{timestamp}] {symbols.get(status, '🔍')} {message}")
        
    async def test_connection(self):
        """Test 1: WebSocket Connection"""
        self.log("Testing WebSocket connection...")
        try:
            async with websockets.connect(self.ws_uri) as ws:
                self.log("WebSocket connection established", "SUCCESS")
                
                # Wait for welcome message
                welcome = await asyncio.wait_for(ws.recv(), timeout=3)
                welcome_data = json.loads(welcome)
                
                if welcome_data.get('type') == 'welcome':
                    self.log(f"Received welcome: {welcome_data.get('message')}", "SUCCESS")
                    self.test_results['connection'] = True
                    return ws
                else:
                    self.log(f"Unexpected welcome message: {welcome_data}", "WARNING")
                    self.test_results['connection'] = False
                    return None
                    
        except Exception as e:
            self.log(f"Connection failed: {e}", "ERROR")
            self.test_results['connection'] = False
            return None
    
    async def test_navigation(self, ws):
        """Test 2: Navigation Command"""
        self.log("Testing navigation command...")
        
        nav_command = {
            'type': 'command',
            'id': 'test-nav',
            'command': {
                'method': 'navigate',
                'params': {'url': 'https://www.google.com'}
            }
        }
        
        try:
            await ws.send(json.dumps(nav_command))
            self.log("Navigation command sent")
            
            response = await asyncio.wait_for(ws.recv(), timeout=15)
            response_data = json.loads(response)
            
            self.log(f"Navigation response: {response_data}")
            
            if response_data.get('result', {}).get('success'):
                self.log("Navigation successful", "SUCCESS")
                self.test_results['navigation'] = True
                return True
            else:
                self.log(f"Navigation failed: {response_data}", "ERROR")
                self.test_results['navigation'] = False
                return False
                
        except Exception as e:
            self.log(f"Navigation test failed: {e}", "ERROR")
            self.test_results['navigation'] = False
            return False
    
    async def test_dom_extraction(self, ws):
        """Test 3: DOM Extraction"""
        self.log("Testing DOM extraction...")
        
        # Wait a moment for page to load
        await asyncio.sleep(3)
        
        dom_command = {
            'type': 'command',
            'id': 'test-dom',
            'command': {
                'method': 'get_dom',
                'params': {}
            }
        }
        
        try:
            await ws.send(json.dumps(dom_command))
            self.log("DOM extraction command sent")
            
            response = await asyncio.wait_for(ws.recv(), timeout=15)
            response_data = json.loads(response)
            
            if response_data.get('result', {}).get('success'):
                dom_result = response_data['result']['result']
                elements = dom_result.get('elements', [])
                url = dom_result.get('url', 'unknown')
                title = dom_result.get('title', 'unknown')
                
                self.log(f"DOM extraction successful:", "SUCCESS")
                self.log(f"  URL: {url}")
                self.log(f"  Title: {title}")
                self.log(f"  Interactive elements: {len(elements)}")
                
                if len(elements) > 0:
                    self.log(f"  First element: {elements[0]}")
                    
                self.test_results['dom_extraction'] = {
                    'success': True,
                    'elements_count': len(elements),
                    'url': url,
                    'title': title
                }
                return elements
            else:
                self.log(f"DOM extraction failed: {response_data}", "ERROR")
                self.test_results['dom_extraction'] = {'success': False}
                return []
                
        except Exception as e:
            self.log(f"DOM extraction test failed: {e}", "ERROR")
            self.test_results['dom_extraction'] = {'success': False}
            return []
    
    async def test_click_action(self, ws, elements):
        """Test 4: Click Action"""
        if not elements:
            self.log("Skipping click test - no elements found", "WARNING")
            self.test_results['click'] = {'success': False, 'reason': 'no_elements'}
            return False
            
        self.log("Testing click action...")
        
        # Try to click the first interactive element
        target_element = elements[0]
        click_index = target_element.get('index', 0)
        
        click_command = {
            'type': 'command',
            'id': 'test-click',
            'command': {
                'method': 'click',
                'params': {'index': click_index}
            }
        }
        
        try:
            self.log(f"Attempting to click element {click_index}: {target_element.get('tagName', 'unknown')}")
            
            await ws.send(json.dumps(click_command))
            self.log("Click command sent")
            
            response = await asyncio.wait_for(ws.recv(), timeout=10)
            response_data = json.loads(response)
            
            self.log(f"Click response: {response_data}")
            
            click_result = response_data.get('result', {})
            if click_result.get('success') and click_result.get('clicked'):
                self.log("Click action successful", "SUCCESS")
                self.test_results['click'] = {'success': True, 'element': target_element}
                return True
            else:
                self.log(f"Click action failed: {click_result.get('error', 'unknown')}", "ERROR")
                self.test_results['click'] = {'success': False, 'error': click_result.get('error')}
                return False
                
        except Exception as e:
            self.log(f"Click test failed: {e}", "ERROR")
            self.test_results['click'] = {'success': False, 'error': str(e)}
            return False
    
    async def test_type_action(self, ws):
        """Test 5: Type Action"""
        self.log("Testing type action...")
        
        type_command = {
            'type': 'command',
            'id': 'test-type',
            'command': {
                'method': 'type',
                'params': {'text': 'test query'}
            }
        }
        
        try:
            await ws.send(json.dumps(type_command))
            self.log("Type command sent")
            
            response = await asyncio.wait_for(ws.recv(), timeout=10)
            response_data = json.loads(response)
            
            self.log(f"Type response: {response_data}")
            
            type_result = response_data.get('result', {})
            if type_result.get('success') and type_result.get('typed'):
                self.log("Type action successful", "SUCCESS")
                self.test_results['type'] = {'success': True}
                return True
            else:
                self.log(f"Type action failed: {type_result.get('error', 'unknown')}", "ERROR")
                self.test_results['type'] = {'success': False, 'error': type_result.get('error')}
                return False
                
        except Exception as e:
            self.log(f"Type test failed: {e}", "ERROR")
            self.test_results['type'] = {'success': False, 'error': str(e)}
            return False
    
    def print_summary(self):
        """Print test summary"""
        self.log("=" * 60)
        self.log("BRIDGE EXTENSION DIAGNOSTIC SUMMARY")
        self.log("=" * 60)
        
        total_tests = 0
        passed_tests = 0
        
        tests = [
            ('WebSocket Connection', 'connection'),
            ('Navigation Command', 'navigation'), 
            ('DOM Extraction', 'dom_extraction'),
            ('Click Action', 'click'),
            ('Type Action', 'type')
        ]
        
        for test_name, key in tests:
            total_tests += 1
            result = self.test_results.get(key, {'success': False})
            
            if isinstance(result, bool):
                success = result
            else:
                success = result.get('success', False)
                
            if success:
                self.log(f"{test_name}: PASS", "SUCCESS")
                passed_tests += 1
            else:
                error = result.get('error', 'unknown') if isinstance(result, dict) else 'failed'
                self.log(f"{test_name}: FAIL ({error})", "ERROR")
        
        self.log("=" * 60)
        self.log(f"OVERALL: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            self.log("🎉 All tests passed! Bridge extension is working correctly.", "SUCCESS")
        elif passed_tests >= 3:
            self.log("⚠️ Partial functionality - some features may not work properly.", "WARNING")
        else:
            self.log("🚨 Major issues detected - bridge extension not working properly.", "ERROR")
            
        return passed_tests, total_tests
    
    async def run_full_diagnostic(self):
        """Run complete diagnostic test suite"""
        self.log("🧪 Starting Bridge Extension Diagnostic Test Suite")
        self.log("=" * 60)
        
        # Test 1: Connection
        ws = await self.test_connection()
        if not ws:
            self.log("Cannot continue without WebSocket connection", "ERROR")
            self.print_summary()
            return
        
        try:
            # Test 2: Navigation
            nav_success = await self.test_navigation(ws)
            
            # Test 3: DOM Extraction
            elements = await self.test_dom_extraction(ws)
            
            # Test 4: Click Action
            await self.test_click_action(ws, elements)
            
            # Test 5: Type Action  
            await self.test_type_action(ws)
            
        except Exception as e:
            self.log(f"Test suite failed: {e}", "ERROR")
        
        finally:
            await ws.close()
            
        # Print summary
        passed, total = self.print_summary()
        
        # Return results for programmatic use
        return passed == total

async def main():
    """Main diagnostic function"""
    print("🔧 Browser-Use Bridge Extension Diagnostic Tool")
    print("=" * 60)
    
    # Check if bridge server is running
    try:
        test_suite = BridgeTestSuite()
        success = await test_suite.run_full_diagnostic()
        
        if success:
            print("\n✅ All systems operational!")
            sys.exit(0)
        else:
            print("\n❌ Issues detected - check logs above")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n🚨 Diagnostic tool error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())