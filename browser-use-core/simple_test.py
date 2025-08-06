#!/usr/bin/env python3
"""
Simple test to check if bridge extension connects
"""
import asyncio
import websockets
import json

async def test_extension_connection():
    print("🔍 Testing if Chrome bridge extension is active...")
    
    try:
        # Wait for extension to connect
        print("📡 Listening for bridge extension connection on ws://localhost:9898...")
        
        async def handle_connection(websocket):
            print(f"✅ Bridge extension connected from {websocket.remote_address}")
            
            # Send welcome
            welcome = {'type': 'welcome', 'message': 'Test server ready'}
            await websocket.send(json.dumps(welcome))
            
            try:
                async for message in websocket:
                    data = json.loads(message)
                    print(f"📨 Received from extension: {data}")
                    
                    # Keep connection alive
                    if data.get('type') == 'ready':
                        print("✅ Extension is ready and connected!")
                        
                        # Test a simple command
                        test_cmd = {
                            'type': 'command', 
                            'id': 'test-123',
                            'command': {
                                'method': 'evaluate',
                                'params': {'expression': 'window.location.href'}
                            }
                        }
                        await websocket.send(json.dumps(test_cmd))
                        
            except websockets.exceptions.ConnectionClosed:
                print("🔌 Extension disconnected")
        
        # Start server
        server = await websockets.serve(handle_connection, "localhost", 9898)
        print("🌐 Server started, waiting for extension...")
        
        # Wait for connections
        await asyncio.sleep(30)  # Wait 30 seconds for connection
        
        server.close()
        await server.wait_closed()
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_extension_connection())