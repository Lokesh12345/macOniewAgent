#!/usr/bin/env python3

import base64
import requests
import json

# Use a valid test image (10x10 white PNG)
test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAFklEQVR4nGP8//8/A27AhEeOYeRKAwCl4wMRx3ocVQAAAABJRU5ErkJggg=="

print("🧪 Testing Qwen2.5VL with image...")
print(f"📸 Test image size: {len(test_image_b64)} chars")

# Test with Ollama API
url = "http://localhost:11434/api/chat"

payload = {
    "model": "qwen2.5vl:7b",
    "messages": [
        {
            "role": "user", 
            "content": "What do you see in this image? Just describe it briefly.",
            "images": [test_image_b64]
        }
    ],
    "stream": False,
    "options": {
        "temperature": 0.1
    }
}

try:
    print("📤 Sending request to Ollama...")
    response = requests.post(url, json=payload, timeout=120)
    
    print(f"📊 Response status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Success!")
        content = data.get('message', {}).get('content', '')
        print(f"📝 Response: {content}")
    else:
        print("❌ Failed!")
        print(f"📝 Error: {response.text}")
        
except Exception as e:
    print(f"❌ Request failed: {e}")