# Install Browser-Use Bridge Extension

## Quick Installation Steps:

### 1. Open Chrome Extensions Page
- Open Chrome browser
- Go to `chrome://extensions/`
- Enable "Developer mode" (toggle in top-right corner)

### 2. Load the Extension
- Click "Load unpacked" button
- Navigate to and select the folder: `/Users/lokesh/Desktop/projects/mac/Oniew Agent/browser-use-core/bridge-extension/`
- Click "Select Folder"

### 3. Verify Installation  
- You should see "Browser-Use Bridge" extension in your extensions list
- The extension icon should appear in Chrome toolbar
- Click the icon - it should show "Disconnected" status

### 4. Test Connection
- Start browser-use: `cd "/Users/lokesh/Desktop/projects/mac/Oniew Agent/browser-use-core" && python3 web_app.py`
- Click the extension icon - it should now show "Connected" 
- In browser-use GUI, select "Same Browser" mode
- Try running a task like "open gmail"

## Troubleshooting:

**Extension shows "Disconnected":**
- Make sure browser-use web_app.py is running
- Bridge server should be listening on ws://localhost:9898
- Click "Connect" button in extension popup

**Task fails with bridge errors:**
- Check Chrome console (F12) for extension errors
- Verify extension has debugger permissions
- Try refreshing the page and running task again

**No interactive elements detected:**
- Make sure you're on a page with buttons/links
- Extension analyzes DOM for clickable elements automatically
- Some dynamic pages may need a moment to load

## What the Extension Does:

✅ **Connects to browser-use Python backend**  
✅ **Analyzes page DOM for interactive elements**  
✅ **Executes clicks, typing, navigation commands**  
✅ **Takes screenshots and runs JavaScript**  
✅ **Works with user's existing browser session**  

The extension acts as a bridge - browser-use Python does all the AI thinking, the extension just executes the commands in your real Chrome browser.