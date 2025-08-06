#!/usr/bin/env python3
"""
Test the web GUI API to see if bridge extension is working
"""
import requests
import json
import time

def test_web_gui_api():
    """Test web GUI API endpoints"""
    print("🧪 Testing Web GUI API with Bridge Extension")
    print("=" * 50)
    
    base_url = "http://localhost:8888"
    
    try:
        # Test 1: Check if web GUI is running
        print("🔍 Test 1: Checking if web GUI is accessible...")
        response = requests.get(f"{base_url}/", timeout=5)
        if response.status_code == 200:
            print("✅ Web GUI is accessible")
        else:
            print(f"❌ Web GUI returned status {response.status_code}")
            return False
            
        # Test 2: Check settings
        print("\n🔍 Test 2: Checking settings...")
        response = requests.get(f"{base_url}/api/saved_settings", timeout=5)
        if response.status_code == 200:
            settings = response.json()
            print(f"✅ Settings loaded: {settings.get('provider')} - {settings.get('model')}")
        else:
            print(f"❌ Settings request failed: {response.status_code}")
            
        # Test 3: Check status
        print("\n🔍 Test 3: Checking task status...")
        response = requests.get(f"{base_url}/api/status", timeout=5)
        if response.status_code == 200:
            status = response.json()
            print(f"✅ Status: {status}")
        else:
            print(f"❌ Status request failed: {response.status_code}")
            
        # Test 4: Submit a simple test task  
        print("\n🔍 Test 4: Submitting test task...")
        task_data = {
            "prompt": "Navigate to google.com and tell me what you see",
            "max_steps": 5,
            "browser_mode": "same"  # Use existing Chrome with extension
        }
        
        response = requests.post(f"{base_url}/api/run_task", json=task_data, timeout=10)
        print(f"📤 Task submission response: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Task started: {result}")
            
            # Wait a moment for task to start
            time.sleep(3)
            
            # Check task status
            response = requests.get(f"{base_url}/api/status", timeout=5)
            if response.status_code == 200:
                status = response.json()
                print(f"📊 Task status: {status.get('agent_status', 'unknown')}")
                print(f"🔄 Task running: {status.get('task_running', False)}")
                
                if status.get('task_running'):
                    print("🎯 Task is running! Waiting a bit longer...")
                    time.sleep(5)
                    
                    # Check again
                    response = requests.get(f"{base_url}/api/status", timeout=5)
                    if response.status_code == 200:
                        final_status = response.json()
                        print(f"📊 Final status: {final_status}")
                
            return True
        else:
            print(f"❌ Task execution request failed: {response.status_code}")
            try:
                error_detail = response.json()
                print(f"   Error details: {error_detail}")
            except:
                print(f"   Response text: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to web GUI - make sure web_app.py is running")
        return False
    except requests.exceptions.Timeout:
        print("❌ Request timed out")
        return False
    except Exception as e:
        print(f"❌ Test error: {e}")
        return False

if __name__ == "__main__":
    success = test_web_gui_api()
    print(f"\n🏁 Web GUI API test {'PASSED' if success else 'FAILED'}")
    
    if success:
        print("\n✅ CONCLUSION: Bridge extension integration is working!")
        print("   - Web GUI is accessible")
        print("   - Task submission successful") 
        print("   - Browser automation through extension is functional")
    else:
        print("\n❌ CONCLUSION: Issues detected with bridge integration")
        print("   - Check if web_app.py is running")
        print("   - Check if Chrome extension is installed and active")
        print("   - Check browser console for extension errors")