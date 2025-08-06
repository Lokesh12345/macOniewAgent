# Browser-Use Bridge Extension

A minimal Chrome extension that acts as a bridge between browser-use Python agent and your existing Chrome browser.

## Features

- **Simple UI**: Just shows connection status and connect button
- **CDP Communication**: Uses Chrome DevTools Protocol for browser control
- **WebSocket Bridge**: Connects to browser-use on `ws://localhost:9898`
- **Minimal Footprint**: No AI logic, just executes commands from Python

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this folder
4. The extension icon will appear in your toolbar

## Usage

1. **Start browser-use web GUI** - It automatically starts the bridge server on port 9898
2. **Click extension icon** - Shows connection status
3. **Click Connect** (if needed) - Extension auto-connects on startup
4. **Select "Same Browser" mode** in browser-use GUI
5. **Run tasks** - They'll execute in your current Chrome browser

## How It Works

```
Browser-Use (Python) → WebSocket → Bridge Extension → Chrome CDP → Your Browser
```

## Supported Commands

- `navigate` - Navigate to URL
- `click` - Click at coordinates  
- `type` - Type text into focused element
- `evaluate` - Run JavaScript
- `screenshot` - Take page screenshot

## Permissions

- **debugger**: Required for Chrome DevTools Protocol access
- **tabs**: Required to create/manage tabs
- **activeTab**: Required to interact with current tab
- **host_permissions**: Required to access all websites

## Status Indicators

- **Connected** ✅ - Ready to receive commands
- **Disconnected** ❌ - Click Connect to establish connection