# WebSocket Connection Debugging Guide

## How to See Live Logs

### 1. Mac App Logs (Xcode Console)
When running the Mac app from Xcode, you'll see logs like:
```
🔗 New WebSocket connection from: 127.0.0.1:xxxxx
✅ WebSocket client connected and ready
📨 Received WebSocket message: {"type":"ping","data":{"source":"extension"}}
🚀 Mac app executing task: 'open google and type apple' with ID: 12345-67890
📤 Sending WebSocket message: {"type":"execute_task","data":{"task":"open google...
```

### 2. Chrome Extension Logs (Developer Tools)
1. Go to `chrome://extensions/`
2. Find your Nanobrowser extension
3. Click "Inspect views: service worker" (or "background page")
4. In the console, you'll see logs like:
```
[webSocketClient] Attempting to connect to Mac app: ws://localhost:41899
[webSocketClient] Connected to Mac app WebSocket server
[background] Received WebSocket task event: {type: "new_task", task: "open google..."}
[background] Processing WebSocket task: open google and type apple
```

## Testing Steps

### Step 1: Check WebSocket Server
1. **Build and run Mac app** in Xcode
2. **Look for**: `WebSocket server listening on port 41899`
3. **If you see error**: Check if port 41899 is already in use

### Step 2: Check Extension Connection
1. **Reload the Chrome extension** (chrome://extensions/)
2. **Open extension console** (Inspect views: service worker)  
3. **Look for**: `Connected to Mac app WebSocket server`
4. **If connection fails**: Check WebSocket errors in console

### Step 3: Test Message Flow
1. **Type command** in Mac app: "open google and type apple"
2. **Mac app should log**: `🚀 Mac app executing task: 'open google and type apple'`
3. **Extension should log**: `Received WebSocket task event`
4. **Extension should log**: `Processing WebSocket task: open google and type apple`

## Common Issues & Solutions

### Issue: "Connection Drops"
**Symptoms**: Shows connected briefly, then disconnects
**Debug**: Look for these logs:
- Mac: `❌ WebSocket client connection failed`
- Extension: `WebSocket connection closed: 1006`

**Solutions**:
1. Check firewall blocking port 41899
2. Restart both Mac app and Chrome
3. Check if another app is using port 41899

### Issue: "Task Not Executing"
**Symptoms**: Connection works, but browser doesn't respond to commands
**Debug**: Look for these logs:
- Extension: `Failed to process WebSocket task: Please configure API keys`
- Extension: `No valid tab ID found for WebSocket task`

**Solutions**:
1. Configure API keys in extension settings
2. Make sure you have an active browser tab
3. Check if extension has necessary permissions

### Issue: "No Logs Appearing"
**Symptoms**: Extension console is empty
**Solutions**:
1. Make sure you're looking at the **service worker** console, not a tab console
2. Reload the extension completely
3. Check if extension loaded properly

## Manual WebSocket Test

You can test the Mac app WebSocket server manually:
```bash
# Install wscat if needed
npm install -g wscat

# Connect to the server
wscat -c ws://localhost:41899

# Send test message
{"type":"ping","data":{"test":true}}

# You should receive a pong response
```

## Log Format Guide

### Mac App Logs:
- 🔗 = New connection
- ✅ = Connection ready  
- 📨 = Received message
- 📤 = Sending message
- 🚀 = Executing task
- ❌ = Error
- 🏓 = Ping/pong

### Extension Logs:
- `[webSocketClient]` = WebSocket connection logs
- `[background]` = Main extension logic
- `Received WebSocket task event` = Got task from Mac app
- `Processing WebSocket task` = Executing the task