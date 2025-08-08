# Stealth Mode Implementation - App Hidden During Screenshots

## What is Stealth Mode?

Stealth mode ensures that the Visual Agent app is **completely invisible** during screenshot capture, including:
- ❌ **Not visible in screenshots**
- ❌ **Not visible in screen recordings** 
- ❌ **Not visible in screen sharing** (Zoom, Teams, etc.)
- ❌ **Not visible to other screen capture tools**

This is perfect for taking clean screenshots without the app UI appearing in the captured image.

## Implementation Details

### 1. **Created WindowConfigurator.swift**
Copied the exact stealth mode system from OniewApp:

```swift
// Key stealth function
static func configureScreenSharingHiding(_ window: NSWindow) {
    window.sharingType = .none  // This is the magic line!
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .auxiliary]
}

// Stealth mode for all app windows
static func enableStealthMode() {
    for window in NSApplication.shared.windows {
        configureScreenSharingHiding(window)
    }
}
```

### 2. **Updated VisualAgentManager.swift**
Added stealth mode workflow during screenshot capture:

```swift
private func requestScreenshotNatively() {
    // 1. ENABLE stealth mode before screenshot
    WindowConfigurator.enableStealthMode()
    addLog("🥷 Stealth mode enabled - app hidden from capture")
    
    // 2. Wait for stealth mode to take effect
    try await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
    
    // 3. Take screenshot (app is now invisible)
    let cgImage = try await SCScreenshotManager.captureImage(...)
    
    // 4. DISABLE stealth mode after screenshot
    WindowConfigurator.disableStealthMode()
    addLog("👁️ Stealth mode disabled - app visible again")
}
```

### 3. **Updated Oniew_AgentApp.swift**
App window is hidden from screen sharing by default:

```swift
private func configureWindow() {
    // Configure stealth mode (hide from screen sharing by default)
    WindowConfigurator.configureScreenSharingHiding(window)
}
```

## Stealth Mode Flow

| Step | Action | App Visibility |
|------|--------|----------------|
| **1. App Launch** | `configureScreenSharingHiding()` | 🥷 **Hidden from screen sharing** |
| **2. Normal Use** | App functions normally | 👁️ **Visible to user** |
| **3. Screenshot Start** | `enableStealthMode()` | 🥷 **Hidden from ALL capture** |
| **4. Screenshot Taken** | `SCScreenshotManager.captureImage()` | 🥷 **App not in screenshot** |
| **5. Screenshot Complete** | `disableStealthMode()` | 👁️ **App visible again** |

## Key Technologies Used

### **NSWindow.sharingType**
- `.none` = Hidden from all screen capture
- `.readOnly` = Visible in screen capture

### **NSWindow.collectionBehavior**
- `.auxiliary` = Window behaves as utility/helper
- `.ignoresCycle` = Skip in window cycling
- `.canJoinAllSpaces` = Appears on all virtual desktops

## Testing Instructions

1. **Build and run** the Visual Agent app
2. **Start screen recording** (QuickTime, OBS, etc.) or screen sharing (Zoom)
3. **Trigger a visual task** to take screenshot
4. **Check recording** - app should be completely invisible during capture
5. **Look for console logs**:
   - 🥷 "Stealth mode enabled - app hidden from capture"
   - 📸 "Screenshot captured successfully"
   - 👁️ "Stealth mode disabled - app visible again"

## Benefits of Stealth Mode

✅ **Clean Screenshots** - No app UI cluttering the captured screen  
✅ **Privacy Protection** - App content not visible in screen shares  
✅ **Professional Demos** - Take screenshots without showing the tool  
✅ **Screen Recording** - App won't appear in video recordings  
✅ **Universal Invisibility** - Hidden from ALL screen capture methods  

## Comparison with OniewApp

| Feature | OniewApp | Visual Agent |
|---------|----------|--------------|
| **Stealth API** | `window.sharingType = .none` | ✅ Same exact API |
| **Window Detection** | `isMenuOrPopoverWindow()` | ✅ Same detection logic |
| **Enable/Disable** | Settings toggle | ✅ Automatic during screenshot |
| **Error Handling** | Basic | ✅ Enhanced with cleanup |
| **Timing** | Manual control | ✅ Automatic with delays |

## Advanced Features

### **Automatic Error Recovery**
If screenshot fails, stealth mode is automatically disabled:
```swift
} catch {
    // Ensure stealth mode is disabled even on error
    WindowConfigurator.disableStealthMode()
    addLog("👁️ Stealth mode disabled after error")
}
```

### **Proper Timing**
Small delay ensures stealth mode takes effect before capture:
```swift
try await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
```

### **Different Window Types**
Handles regular windows and menu/popover windows differently for optimal invisibility.

The Visual Agent now has **complete stealth capabilities** just like OniewApp! 🥷📸