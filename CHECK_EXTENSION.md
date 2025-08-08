# 🚨 Extension Not Responding - Quick Fix Guide

## The Problem
Your Mac app is sending `take_screenshot` requests but the extension never responds. The extension IS connected (ping/pong works) but doesn't process screenshot requests.

## Immediate Solution

### Step 1: Check Which Extension You Have Loaded
1. Open Chrome
2. Go to `chrome://extensions/`
3. Look for the extension name - it should be **"Visual Agent"** (NOT "Oniew Agent" or similar)

### Step 2: Remove Wrong Extension (if needed)
If you see the wrong extension:
1. Click "Remove" on the old extension
2. Continue to Step 3

### Step 3: Load the Correct Extension
1. In Chrome, go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Navigate to: `/Users/lokesh/Desktop/projects/mac/Oniew Agent/visual-agent/extension/`
5. Click "Select"

### Step 4: Verify Extension is Working
1. Click the extension icon (brain 🧠)
2. Should show "🟢 Connected to Mac App"

### Step 5: Check Extension Console
1. In `chrome://extensions/`, find "Visual Agent"
2. Click "service worker" or "background page"
3. Look for these messages:
   - `🚀 Visual Agent background script starting...`
   - `🔗 Visual Agent connected to Mac app`

### Step 6: Test Screenshot
1. Open any website (google.com)
2. In your Mac app, enter: "what do you see?"
3. Check extension console for:
   - `📨 Extension received message: take_screenshot`
   - `📸 Extension: Processing take_screenshot request`

## If Still Not Working

### Option A: Reload Everything
```bash
# 1. Restart Mac app
# 2. In Chrome: Reload extension (click reload button in chrome://extensions/)
# 3. Open a new tab with a website
# 4. Try again
```

### Option B: Check Console Errors
In the extension's service worker console, look for:
- Red error messages
- Permission errors
- Network errors

### Option C: Test Manually
In Chrome console (F12) on any website:
```javascript
// This tests if extension can capture screenshots
chrome.tabs.captureVisibleTab((dataUrl) => {
  if (chrome.runtime.lastError) {
    console.log('ERROR:', chrome.runtime.lastError.message);
  } else {
    console.log('SUCCESS: Screenshot captured!');
  }
});
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Wrong extension loaded | Remove and load `/visual-agent/extension/` |
| Extension crashed | Click reload in chrome://extensions/ |
| No active tab | Open a real website (not chrome:// pages) |
| Permission denied | Remove and re-add extension |
| WebSocket blocked | Check firewall/antivirus |

## Expected Logs When Working

**Mac App:**
```
📤 Sending WebSocket message: take_screenshot
🎯 SCREENSHOT RECEIVED FROM EXTENSION!
📸 Screenshot data length: 45000 characters
🔍 VL Model Analysis Starting...
```

**Extension Console:**
```
📨 Extension received message: take_screenshot
📸 Extension: Processing take_screenshot request
📸 Extension: Screenshot captured, size: 45000 characters
📸 Extension: Screenshot message sent successfully
```

The most likely issue is you have the wrong extension loaded. Please check and load the `/visual-agent/extension/` one!