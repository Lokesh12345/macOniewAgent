# Visual Agent Extension Installation Guide

## Quick Installation Steps

1. **Open Chrome Extensions Page**
   - Open Chrome browser
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right corner)

2. **Load the Extension**
   - Click **"Load unpacked"**
   - Navigate to and select: `/Users/lokesh/Desktop/projects/mac/Oniew Agent/visual-agent/extension/`
   - The extension should now appear in your extensions list

3. **Verify Installation**
   - You should see "Visual Agent" extension with a brain icon 🧠
   - Click on the extension icon to open the popup
   - The popup should show connection status

## Testing the Extension

1. **Start Your Mac App**
   - Make sure your Mac app is running
   - The WebSocket server should be active on port 41899

2. **Check Connection**
   - Open the Visual Agent popup (click the brain icon)
   - It should show "🟢 Connected to Mac App" if working correctly
   - If disconnected, check your Mac app logs

3. **Test Screenshot Functionality**
   - Open any website (e.g., google.com)
   - In your Mac app, enter task: "what do you see?"
   - The extension should capture and send the screenshot

## Extension Features

- **Automatic WebSocket Connection**: Connects to Mac app on localhost:41899
- **Screenshot Capture**: Takes screenshots of active browser tab
- **Action Execution**: Can click, type, and scroll on web pages
- **Heartbeat System**: Maintains connection with 30-second pings
- **Visual Status**: Popup shows connection and task status

## Troubleshooting

### Extension Not Connecting
1. Check if Mac app is running
2. Verify port 41899 is not blocked
3. Check browser console (F12) for error messages

### Screenshot Not Working
1. Ensure extension has proper permissions
2. Check if there's an active tab open
3. Look for permission prompts in Chrome

### Console Logs to Look For
- `🚀 Visual Agent background script starting...`
- `🔗 Visual Agent connected to Mac App`
- `📸 Extension: Screenshot captured...`
- `💓 Sending heartbeat ping`

## Permissions Required

The extension requires these permissions:
- `activeTab`: To capture screenshots and interact with pages
- `tabs`: To query active tab information
- `storage`: For local data storage
- `scripting`: To execute actions on web pages
- `<all_urls>`: To work on any website

## Files Structure

```
visual-agent/extension/
├── manifest.json          # Extension configuration
└── src/
    ├── background.js       # Main extension logic
    ├── content.js          # Page interaction functions
    ├── popup.html          # Extension popup UI
    └── popup.js            # Popup functionality
```

## Next Steps After Installation

1. Test with simple tasks like "what do you see?"
2. Try action-based tasks like "click the search button"
3. Monitor both Mac app and browser console logs
4. If issues occur, disable other extensions that might conflict