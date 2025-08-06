#!/usr/bin/env python3
"""
Live test of bridge extension with browser-use integration
"""
import asyncio
from browser_use.bridge_controller import BridgeController, BridgeSession
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_bridge_integration():
    """Test complete bridge integration"""
    print("🧪 Testing Bridge Extension Integration")
    print("=" * 50)
    
    # Connect to existing bridge server (should be running on port 9898)
    bridge = BridgeController(port=9898)
    
    # Don't start server - connect to existing one running from web_app.py
    print("🔗 Connecting to existing bridge server...")
    
    # Wait a moment for connection
    await asyncio.sleep(2)
    
    if not bridge.is_connected():
        # Try to connect to the server started by web_app.py
        try:
            import websockets
            ws = await websockets.connect("ws://localhost:9898")
            bridge.ws = ws
            bridge.connected = True
            print("✅ Connected to bridge server")
        except Exception as e:
            print(f"❌ Failed to connect to bridge server: {e}")
            print("❌ Make sure web_app.py is running in another terminal")
            return False
    
    # Create bridge session
    print("🎯 Creating bridge session...")
    session = BridgeSession(bridge)
    
    try:
        # Test 1: Get browser state
        print("\n🔍 Test 1: Getting browser state...")
        state = await session.get_browser_state_with_recovery()
        
        print(f"✅ Browser state retrieved:")
        print(f"   URL: {state.url}")
        print(f"   Title: {state.title}")
        print(f"   Interactive elements: {len(state.selector_map)}")
        print(f"   Viewport: {state.page_info.viewport_width}x{state.page_info.viewport_height}")
        
        # Test 2: Navigation
        print("\n🌐 Test 2: Testing navigation...")
        nav_result = await session.navigate("https://www.google.com")
        print(f"Navigation result: {nav_result}")
        
        # Wait for page load
        await asyncio.sleep(3)
        
        # Get state after navigation
        print("🔍 Getting state after navigation...")
        state = await session.get_browser_state_with_recovery()
        print(f"✅ New state:")
        print(f"   URL: {state.url}")
        print(f"   Title: {state.title}")
        print(f"   Interactive elements: {len(state.selector_map)}")
        
        # Test 3: Show some interactive elements
        print("\n🎯 Test 3: Interactive elements found:")
        for i, (index, element) in enumerate(state.selector_map.items()):
            if i >= 5:  # Show first 5 elements
                break
            print(f"   [{index}] {element.tag_name} - {element.xpath[:50]}...")
            
        print(f"\n✅ Bridge integration test completed successfully!")
        print(f"📊 Summary: Found {len(state.selector_map)} interactive elements on {state.url}")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await session.close()

if __name__ == "__main__":
    success = asyncio.run(test_bridge_integration())
    print(f"\n🏁 Test {'PASSED' if success else 'FAILED'}")