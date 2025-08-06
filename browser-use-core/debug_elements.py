#!/usr/bin/env python3
"""
Debug script to see what elements our bridge extension is finding
"""
import asyncio
import json
import websockets

async def debug_elements():
    print("🔍 Debugging Bridge Extension Element Detection")
    print("=" * 60)
    
    try:
        # Connect to bridge server
        uri = 'ws://localhost:9898'
        async with websockets.connect(uri) as ws:
            print("✅ Connected to bridge server")
            
            # Wait for welcome
            welcome = await ws.recv()
            print(f"📥 Welcome: {json.loads(welcome)}")
            
            # Send get_dom command
            dom_command = {
                'type': 'command',
                'id': 'debug-dom',
                'command': {
                    'method': 'get_dom',
                    'params': {}
                }
            }
            
            await ws.send(json.dumps(dom_command))
            print("📤 Sent DOM request")
            
            # Get response
            response = await ws.recv()
            response_data = json.loads(response)
            
            if response_data.get('result', {}).get('success'):
                dom_result = response_data['result']['result']
                elements = dom_result.get('elements', [])
                
                print(f"\n🎯 Found {len(elements)} interactive elements:")
                print("=" * 60)
                
                for i, element in enumerate(elements[:15]):  # Show first 15
                    tag = element.get('tagName', 'unknown')
                    text = element.get('text', '').strip()[:50]
                    attrs = element.get('attributes', {})
                    xpath = element.get('xpath', '')[:50]
                    
                    # Check if it's likely a search button
                    is_search_btn = (
                        'search' in text.lower() or 
                        'search' in str(attrs).lower() or
                        (tag == 'input' and attrs.get('type') == 'submit') or
                        (tag == 'button' and 'search' in str(attrs).lower())
                    )
                    
                    status = "🎯 SEARCH BUTTON?" if is_search_btn else ""
                    
                    print(f"[{element.get('index', i)}] {tag.upper()} {status}")
                    print(f"    Text: '{text}'")
                    print(f"    Attrs: {dict(list(attrs.items())[:3])}")  # First 3 attrs
                    print(f"    XPath: {xpath}...")
                    print()
                
                # Look specifically for search-related elements
                search_elements = [
                    el for el in elements 
                    if 'search' in el.get('text', '').lower() or
                       'search' in str(el.get('attributes', {})).lower() or
                       el.get('attributes', {}).get('name') == 'btnK'  # Google search button
                ]
                
                if search_elements:
                    print("🔍 LIKELY SEARCH ELEMENTS:")
                    for el in search_elements:
                        print(f"  Index {el.get('index')}: {el.get('tagName')} - '{el.get('text', '')}'")
                else:
                    print("❌ No obvious search elements found!")
                    
            else:
                print(f"❌ DOM request failed: {response_data}")
                
    except Exception as e:
        print(f"❌ Debug failed: {e}")

if __name__ == "__main__":
    asyncio.run(debug_elements())