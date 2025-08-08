# Visual Agent Setup Troubleshooting

## Common Issues and Solutions

### 1. Extension Not Loading
**Problem:** Chrome extension won't load or shows errors
**Solutions:**
- Check that all files exist in the extension folder
- Verify manifest.json syntax
- Check Chrome extension console for errors
- Try reloading the extension

### 2. Connection Issues
**Problem:** Extension shows "🔴 Disconnected"
**Solutions:**
- Make sure Mac app is running
- Check that WebSocket server started (look for port 41899 in Mac app logs)
- Verify no firewall blocking localhost:41899
- Check Console.app for WebSocket errors

### 3. Mac App Build Errors
**Problem:** Xcode shows compilation errors
**Solutions:**
- Clean build folder (⌘+Shift+K)
- Check that all Swift files are properly added to target
- Verify Xcode version compatibility (macOS 12.0+ required)
- Check for missing import statements

### 4. Memory System Not Working
**Problem:** AI doesn't seem to remember previous actions
**Solutions:**
- Check that VLSettingsManager has valid API keys
- Verify TaskMemoryManager is initialized in VisualAgentManager
- Check Console.app for memory-related error messages
- Ensure UserDefaults permissions are working

### 5. Screenshot Issues
**Problem:** Screenshots not being captured
**Solutions:**
- Grant Chrome permission to capture screen
- Check that active tab exists and is not a Chrome internal page
- Try refreshing the webpage
- Check Chrome extension console for capture errors

### 6. Action Execution Fails
**Problem:** Actions planned but not executed on webpage
**Solutions:**
- Check that content script is injected
- Verify webpage allows script execution
- Try with a simpler webpage (like Google)
- Check Chrome DevTools console for JavaScript errors

## Debug Commands

### Check WebSocket Server
```bash
lsof -i :41899
```

### Test WebSocket Connection
```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" -H "Sec-WebSocket-Version: 13" http://localhost:41899
```

### Chrome Extension Console
1. Go to `chrome://extensions/`
2. Find Visual Agent extension
3. Click "Inspect views: service worker"
4. Check console for errors

### Mac App Logs
1. Open Console.app
2. Search for "Oniew" or "Visual Agent"
3. Look for WebSocket and memory-related messages

## System Requirements

- **macOS:** 12.0 or later
- **Chrome:** Version 88+ (Manifest V3 support)
- **Xcode:** 13.0 or later
- **Internet:** Required for cloud AI models (OpenAI, Claude, Gemini)
- **Ollama:** Optional, for local models

## File Locations

- **Mac App:** `/Users/lokesh/Desktop/projects/mac/Oniew Agent/`
- **Extension:** `/Users/lokesh/Desktop/projects/mac/Oniew Agent/visual-agent/extension/`
- **Memory Models:** `Oniew Agent/Models/TaskMemory.swift`
- **Memory Manager:** `Oniew Agent/Services/TaskMemoryManager.swift`
- **Visual Agent:** `Oniew Agent/Services/VisualAgentManager.swift`

## Success Indicators

### Extension Working:
- Green connection status in popup
- Console shows WebSocket connection messages
- Screenshot requests appear in background console

### Mac App Working:
- Floating panel appears on screen
- Connection status shows green
- Memory indicator shows active sessions
- Console shows WebSocket server messages

### Memory System Working:
- Previous task context appears in VL model prompts
- UI shows session count in memory indicator
- Failed actions are not repeated
- Task history persists between app restarts

### AI Integration Working:
- Screenshots are analyzed successfully
- Actions are planned and returned
- Model responses include both analysis and actions
- API errors are handled gracefully

## Getting Help

If issues persist:
1. Check all file permissions
2. Restart both Mac app and Chrome
3. Clear Chrome extension data
4. Try with a fresh Chrome profile
5. Check system logs for security restrictions