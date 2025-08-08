# 🐛 Screenshot Debug Guide

## Current Status
- ✅ WebSocket connection working (ping/pong every 30s)
- ✅ Mac app sends `take_screenshot` request
- ❌ Extension never responds with screenshot

## Debug Steps

### 1. Check Chrome Extension Console
1. Open Chrome → More tools → Extensions
2. Find "Visual Agent" extension
3. Click "service worker" (or "background page")
4. Look for these messages:
   - `📨 Extension received message: take_screenshot`
   - `📸 Extension: Starting screenshot capture...`
   - `📸 Extension: Screenshot sent to Mac app`

### 2. Check Active Tab
- Make sure you have an active website open in Chrome
- The extension can only screenshot the active tab

### 3. Check Extension Permissions
- Extension needs `activeTab` and `tabs` permissions
- Chrome should have prompted for these

### 4. Manual Test
Run this in Chrome console (F12):
```javascript
chrome.runtime.sendMessage({type: 'get_status'}, console.log);
```

## Expected Flow
1. Mac app: `take_screenshot` →
2. Extension: Captures active tab →  
3. Extension: `screenshot` message with base64 data →
4. Mac app: Sends to OpenAI →
5. Mac app: Shows analysis

## Next Steps
1. Check extension console logs
2. Verify active tab exists
3. Test extension permissions