#!/usr/bin/env python3
"""
Quick test script to verify bridge extension functionality
"""

import asyncio
import json
import websockets

async def test_bridge_detailed():
    """Test bridge extension step by step"""
    try:
        print("🔌 Attempting to connect to bridge extension...")
        uri = 'ws://localhost:9898'
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to bridge WebSocket server")
            
            # Wait for welcome message
            try:
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=2)
                print(f"📥 Welcome message: {welcome_msg}")
            except asyncio.TimeoutError:
                print("⚠️ No welcome message received")
            
            # Test 1: Navigate to Google
            print("\n🧪 Test 1: Navigation")
            nav_command = {
                'type': 'command',
                'id': 'nav-test',
                'command': {
                    'method': 'navigate',
                    'params': {'url': 'https://www.google.com'}
                }
            }
            
            await websocket.send(json.dumps(nav_command))
            print("📤 Sent navigate command")
            
            nav_response = await asyncio.wait_for(websocket.recv(), timeout=10)
            nav_data = json.loads(nav_response)
            print(f"📥 Navigation response: {nav_data}")
            
            if nav_data.get('result', {}).get('success'):
                print("✅ Navigation successful")
                await asyncio.sleep(3)  # Wait for page load
                
                # Test 2: Get DOM data
                print("\n🧪 Test 2: DOM Extraction")
                dom_command = {
                    'type': 'command',
                    'id': 'dom-test',
                    'command': {
                        'method': 'get_dom',
                        'params': {}
                    }
                }
                
                await websocket.send(json.dumps(dom_command))
                print("📤 Sent get_dom command")
                
                dom_response = await asyncio.wait_for(websocket.recv(), timeout=15)
                dom_data = json.loads(dom_response)
                print(f"📥 DOM response type: {dom_data.get('type')}")
                
                if dom_data.get('result', {}).get('success'):
                    result = dom_data['result']['result']
                    print(f"✅ DOM extraction successful!")
                    print(f"   URL: {result.get('url', 'N/A')}")
                    print(f"   Title: {result.get('title', 'N/A')}")
                    print(f"   Elements found: {len(result.get('elements', []))}")
                    print(f"   Viewport: {result.get('viewport', {})}")
                    print(f"   Page size: {result.get('page', {})}")
                    
                    if len(result.get('elements', [])) > 0:
                        print(f"   First element: {result['elements'][0]}")
                    else:
                        print("   ⚠️ No interactive elements found")
                else:
                    print(f"❌ DOM extraction failed: {dom_data.get('result', {}).get('error', 'Unknown error')}")
            else:
                print(f"❌ Navigation failed: {nav_data.get('result', {}).get('error', 'Unknown error')}")
                
    except websockets.exceptions.ConnectionRefused:
        print("❌ Connection refused - Bridge server not running")
        print("   Start with: python3 web_app.py")
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🧪 Testing Bridge Extension Connectivity")
    print("=" * 50)
    asyncio.run(test_bridge_detailed())