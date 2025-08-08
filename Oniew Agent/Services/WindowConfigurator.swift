import AppKit

class WindowConfigurator {
    
    // Apply screen sharing hiding (stealth mode)
    static func configureScreenSharingHiding(_ window: NSWindow) {
        window.sharingType = .none
        
        // Handle different window types
        if isMenuOrPopoverWindow(window) {
            // Special handling for menu/popover windows
            configureMenuScreenSharingHiding(window)
        } else {
            // Regular window configuration
            if #available(macOS 14.0, *) {
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .auxiliary]
            } else {
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            }
            
            window.canHide = false
            window.hidesOnDeactivate = false
        }
    }
    
    // Special configuration for menu/popover windows
    static func configureMenuScreenSharingHiding(_ window: NSWindow) {
        window.sharingType = .none
        
        // Menu windows need different collection behavior
        if #available(macOS 14.0, *) {
            window.collectionBehavior = [.auxiliary, .ignoresCycle]
        } else {
            window.collectionBehavior = [.ignoresCycle]
        }
    }
    
    // Remove screen sharing hiding (make window visible in screen shares)
    static func removeScreenSharingHiding(_ window: NSWindow) {
        window.sharingType = .readOnly
        
        // Handle different window types
        if isMenuOrPopoverWindow(window) {
            // Special handling for menu/popover windows
            removeMenuScreenSharingHiding(window)
        } else {
            // Regular window configuration - preserve essential floating window behaviors
            if #available(macOS 14.0, *) {
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .auxiliary]
            } else {
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            }
            
            // Keep these as false to maintain floating window behavior
            window.canHide = false
            window.hidesOnDeactivate = false
        }
    }
    
    // Remove hiding for menu/popover windows
    static func removeMenuScreenSharingHiding(_ window: NSWindow) {
        window.sharingType = .readOnly
        
        // Restore normal menu behavior
        if #available(macOS 14.0, *) {
            window.collectionBehavior = []  // Default behavior for menus
        } else {
            window.collectionBehavior = []
        }
    }
    
    // Update existing window's screen sharing settings
    static func updateScreenSharingSettings(_ window: NSWindow, hideFromScreenShare: Bool) {
        if hideFromScreenShare {
            configureScreenSharingHiding(window)
        } else {
            removeScreenSharingHiding(window)
        }
        
        // Ensure window remains visible and at correct level (except for menus)
        if !isMenuOrPopoverWindow(window) {
            window.level = .floating
            window.orderFront(nil)
        }
    }
    
    // Detect if window is a menu or popover
    static func isMenuOrPopoverWindow(_ window: NSWindow) -> Bool {
        let className = window.className.lowercased()
        
        // Check class name patterns
        if className.contains("menu") ||
           className.contains("popover") ||
           className.contains("popup") {
            return true
        }
        
        // Check window level
        if window.level == .popUpMenu ||
           window.level == .modalPanel ||
           window.level == .floating + 100 {  // Some menus use higher floating levels
            return true
        }
        
        // Check window properties
        if window.styleMask.contains(.utilityWindow) ||
           window.styleMask.contains(.docModalWindow) {
            return true
        }
        
        return false
    }
    
    // Apply stealth mode to all current app windows
    static func enableStealthMode() {
        print("🥷 Enabling stealth mode - hiding from screen capture")
        for window in NSApplication.shared.windows {
            configureScreenSharingHiding(window)
        }
    }
    
    // Disable stealth mode for all current app windows
    static func disableStealthMode() {
        print("👁️ Disabling stealth mode - showing in screen capture")
        for window in NSApplication.shared.windows {
            removeScreenSharingHiding(window)
        }
    }
}