# WebSocket Connection Setup

## Simple Setup (No Native Messaging Required!)

### 1. Install/Update Chrome Extension
1. Open Chrome and go to `chrome://extensions/`
2. If the extension is already loaded, click "Reload" 
3. If not loaded: Click "Load unpacked" and select `/Users/lokesh/Desktop/projects/mac/Oniew Agent/nanobrowser-master/dist`

### 2. Build and Run Mac App
1. Open Xcode and build the project (⌘+B)
2. Run the app (⌘+R)
3. The app will start a WebSocket server on port 41899

### 3. Test Connection
1. Check the connection status indicator in the Mac app header
2. It should show "Extension Connected" when both are running
3. If it shows "Waiting for extension...", reload the Chrome extension

## How It Works

- **Mac App**: Runs a WebSocket server on `ws://localhost:41899`
- **Chrome Extension**: Automatically connects when the server is available
- **Real-time Communication**: Bidirectional messaging for commands and status updates
- **Auto-Reconnection**: Extension automatically reconnects if connection is lost

## Benefits Over Native Messaging

✅ **No Setup Required**: Just run both apps  
✅ **No Browser Restarts**: Works immediately  
✅ **Easy Debugging**: Can test with WebSocket tools  
✅ **Cross-Browser**: Works with any browser  
✅ **Real-time**: Instant bidirectional communication  

## Troubleshooting

### Extension Shows "Disconnected"
1. Make sure Mac app is running
2. Check that port 41899 is not blocked by firewall
3. Reload the Chrome extension
4. Check browser console for WebSocket errors

### Port Already in Use
The app will automatically fail to start if port 41899 is in use. Check what's using it:
```bash
lsof -i :41899
```

### Testing WebSocket Connection
You can test the server manually:
```bash
# Install wscat if needed: npm install -g wscat
wscat -c ws://localhost:41899

# Send test message:
{"type":"ping","data":{"test":true}}
```

## Next Steps

Once connected, you can:
1. Type commands in the Mac app and they'll be sent to the extension
2. See real-time execution status in the Mac app
3. Monitor browser automation tasks through the connection status