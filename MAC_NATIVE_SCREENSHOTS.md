# Mac Native Screenshot Implementation

## Problem Solved
Chrome extension `chrome.downloads.download()` with `saveAs: false` still shows save dialogs due to Chrome's global setting "Ask where to save each file before downloading" overriding the extension preference. This prevents automatic screenshot saving.

## Solution: Mac Native Screen Capture

Instead of relying on the Chrome extension to capture and save screenshots, the Mac app now captures Chrome browser windows directly using macOS native APIs.

## Implementation

### New Files Created

1. **`MacScreenshotService.swift`** - Core screenshot service
   - Modern ScreenCaptureKit API (macOS 14+) 
   - ScreenCaptureKit streaming (macOS 12.3+)
   - Legacy CGWindowListCreateImage fallback
   - Chrome window detection and targeting
   - Automatic temp file saving

2. **`MAC_NATIVE_SCREENSHOTS.md`** - This documentation

### Modified Files

1. **`VisualAgentManager.swift`**
   - Integrated MacScreenshotService
   - Maintains compatibility with extension-based screenshots for older macOS
   - Automatic fallback behavior

2. **`visual-agent/extension/src/background.js`**
   - Kept extension screenshot as fallback
   - Added user guidance for Chrome settings
   - Enhanced error handling

## Features

### ✅ Multi-API Support
- **macOS 14+**: Uses new `SCScreenshotManager.captureImage()` API
- **macOS 12.3+**: Uses ScreenCaptureKit with streaming
- **Older macOS**: Falls back to extension-based screenshots

### ✅ Chrome Window Detection
- Identifies Chrome processes via bundle ID and app name
- Filters out utility windows (DevTools, etc.)
- Prioritizes content windows over empty browser windows
- Handles multiple Chrome windows intelligently

### ✅ Automatic File Management
- Saves to temp directory: `/tmp/visual-agent-screenshots/`
- Timestamp-based filename generation
- PNG format with high quality
- Automatic cleanup and organization

### ✅ Perfect Integration
- Same screenshot format as before (base64 for VL model)
- Compatible with existing ScreenshotView UI
- Seamless fallback to extension method
- No breaking changes to existing workflow

## Permissions

The app already has the required entitlement:
```xml
<key>com.apple.security.device.screen-capture</key>
<true/>
```

## Usage Flow

1. **User triggers task** → Mac app receives task request
2. **Check macOS version** → Use native capture if macOS 12.3+, otherwise extension
3. **Detect Chrome windows** → Find active Chrome browser windows
4. **Capture screenshot** → Use appropriate macOS API
5. **Save to temp folder** → PNG file with timestamp
6. **Display in UI** → Screenshot appears in ScreenshotView component
7. **Continue processing** → VL model analyzes screenshot for task execution

## Benefits

### 🚀 **Instant Screenshots**
- No Chrome download dialog prompts
- No user interaction required
- Automatic temp file organization

### 🎯 **Better Targeting** 
- Captures exactly what user sees
- No dependency on Chrome extension permissions
- Can capture any Chrome window/tab

### 🔧 **Robust Compatibility**
- Modern APIs for best performance
- Graceful degradation to older methods
- Extension fallback for compatibility

### 📁 **Clean File Management**
- Organized temp directory structure
- No cluttering Downloads folder
- Automatic filename generation

## API Reference

### MacScreenshotService Methods

```swift
// Main screenshot capture (async)
func captureActiveChromeWindow() async throws -> NSImage

// Legacy capture (sync)  
func captureActiveChromeWindowLegacy() throws -> NSImage

// Capture and save in one step
func captureAndSaveScreenshot() async throws -> String

// Save screenshot to temp folder
func saveScreenshotToTemp(_ image: NSImage) throws -> String

// Chrome window detection
func getAvailableChromeWindows() -> [ChromeWindow]
func isChromeAvailable() -> Bool
```

### Error Types
- `ScreenshotError.noChromeWindowFound` - No Chrome windows detected
- `ScreenshotError.captureFailure` - Screenshot capture failed  
- `ScreenshotError.imageConversionFailure` - PNG conversion failed
- `ScreenshotError.saveFailure` - File save failed

## Testing

1. **Open Chrome** with some web pages
2. **Run Mac app** and trigger a visual task
3. **Check console logs** for "Taking screenshot using Mac native capture"
4. **Verify temp folder** contains PNG files: `/tmp/visual-agent-screenshots/`
5. **Check UI** shows screenshot in ScreenshotView component

## Fallback Behavior

If native screenshot fails or macOS version < 12.3:
- Automatically falls back to Chrome extension method
- User sees guidance about Chrome download settings
- Extension-based screenshots still work (with manual save dialog)

This ensures the app works on all supported macOS versions with the best possible experience on newer systems.