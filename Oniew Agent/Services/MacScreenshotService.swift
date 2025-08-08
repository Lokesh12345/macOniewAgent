import Foundation
import AppKit
import ScreenCaptureKit
import CoreGraphics

@available(macOS 12.3, *)
class MacScreenshotService: ObservableObject {
    
    struct ChromeWindow {
        let windowID: CGWindowID
        let windowNumber: Int
        let title: String
        let bounds: CGRect
        let processID: pid_t
    }
    
    // MARK: - Main Screenshot Methods
    
    /// Take screenshot of active Chrome window using modern ScreenCaptureKit (macOS 12.3+)
    func captureActiveChromeWindow() async throws -> NSImage {
        if #available(macOS 14.0, *) {
            return try await captureWithScreenshotAPI()
        } else {
            return try await captureWithScreenCaptureKit()
        }
    }
    
    /// Fallback method using legacy CGWindowListCreateImage (only for very old macOS)
    func captureActiveChromeWindowLegacy() throws -> NSImage {
        let chromeWindows = getChromeWindows()
        
        guard let activeWindow = chromeWindows.first else {
            throw ScreenshotError.noChromeWindowFound
        }
        
        return try captureWindowLegacy(windowID: activeWindow.windowID)
    }
    
    // MARK: - Modern ScreenCaptureKit Implementation (macOS 12.3+)
    
    @available(macOS 14.0, *)
    private func captureWithScreenshotAPI() async throws -> NSImage {
        // Get available content
        let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        
        // Find Chrome windows
        let chromeWindows = availableContent.windows.filter { window in
            window.owningApplication?.bundleIdentifier == "com.google.Chrome" ||
            window.owningApplication?.applicationName == "Google Chrome"
        }
        
        guard let targetWindow = chromeWindows.first else {
            throw ScreenshotError.noChromeWindowFound
        }
        
        // Create filter for the specific window
        let filter = SCContentFilter(desktopIndependentWindow: targetWindow)
        
        // Configure screenshot settings
        let configuration = SCStreamConfiguration()
        configuration.width = Int(targetWindow.frame.width)
        configuration.height = Int(targetWindow.frame.height)
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = false
        
        // Take screenshot
        let screenshot = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        
        // Convert CGImage to NSImage
        return NSImage(cgImage: screenshot, size: NSSize(width: screenshot.width, height: screenshot.height))
    }
    
    @available(macOS 12.3, *)
    private func captureWithScreenCaptureKit() async throws -> NSImage {
        // Get available content
        let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        
        // Find Chrome windows
        let chromeWindows = availableContent.windows.filter { window in
            window.owningApplication?.bundleIdentifier == "com.google.Chrome" ||
            window.owningApplication?.applicationName == "Google Chrome"
        }
        
        guard let targetWindow = chromeWindows.first else {
            throw ScreenshotError.noChromeWindowFound
        }
        
        // For older macOS versions, use legacy capture as fallback
        return try captureWindowLegacy(windowID: CGWindowID(targetWindow.windowID))
    }
    
    // MARK: - Legacy Implementation (For very old macOS versions - use screencapture tool instead)
    
    private func captureWindowLegacy(windowID: CGWindowID) throws -> NSImage {
        // Use system screencapture command instead of deprecated API
        return try captureUsingScreencaptureCommand(windowID: windowID)
    }
    
    private func captureUsingScreencaptureCommand(windowID: CGWindowID) throws -> NSImage {
        let tempPath = NSTemporaryDirectory() + "window_capture_\(windowID).png"
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-l\(windowID)", "-x", tempPath]
        
        do {
            try process.run()
            process.waitUntilExit()
            
            guard process.terminationStatus == 0 else {
                throw ScreenshotError.captureFailure
            }
            
            let imageData = try Data(contentsOf: URL(fileURLWithPath: tempPath))
            guard let nsImage = NSImage(data: imageData) else {
                throw ScreenshotError.imageConversionFailure
            }
            
            // Clean up temp file
            try? FileManager.default.removeItem(atPath: tempPath)
            
            return nsImage
        } catch {
            // Clean up temp file on error
            try? FileManager.default.removeItem(atPath: tempPath)
            throw ScreenshotError.captureFailure
        }
    }
    
    // MARK: - Chrome Window Detection
    
    private func getChromeWindows() -> [ChromeWindow] {
        guard let windowList = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
            return []
        }
        
        var chromeWindows: [ChromeWindow] = []
        
        for windowInfo in windowList {
            // Extract window information
            guard let windowNumber = windowInfo[kCGWindowNumber as String] as? Int,
                  let processID = windowInfo[kCGWindowOwnerPID as String] as? pid_t,
                  let boundsDict = windowInfo[kCGWindowBounds as String] as? [String: Any],
                  let windowName = windowInfo[kCGWindowName as String] as? String else {
                continue
            }
            
            // Check if this is a Chrome process
            if isChromeProcess(processID: processID) {
                let bounds = CGRect(
                    x: boundsDict["X"] as? CGFloat ?? 0,
                    y: boundsDict["Y"] as? CGFloat ?? 0,
                    width: boundsDict["Width"] as? CGFloat ?? 0,
                    height: boundsDict["Height"] as? CGFloat ?? 0
                )
                
                // Only include windows with reasonable size (filter out invisible windows)
                if bounds.width > 100 && bounds.height > 100 {
                    let chromeWindow = ChromeWindow(
                        windowID: CGWindowID(windowNumber),
                        windowNumber: windowNumber,
                        title: windowName,
                        bounds: bounds,
                        processID: processID
                    )
                    chromeWindows.append(chromeWindow)
                }
            }
        }
        
        // Sort by window title to prioritize actual web pages over empty/utility windows
        return chromeWindows.sorted { window1, window2 in
            // Prioritize windows with meaningful titles
            let hasContent1 = !window1.title.isEmpty && window1.title != "Google Chrome"
            let hasContent2 = !window2.title.isEmpty && window2.title != "Google Chrome"
            
            if hasContent1 && !hasContent2 { return true }
            if !hasContent1 && hasContent2 { return false }
            
            // If both have content or both don't, sort by size (larger first)
            return window1.bounds.width * window1.bounds.height > window2.bounds.width * window2.bounds.height
        }
    }
    
    private func isChromeProcess(processID: pid_t) -> Bool {
        let runningApps = NSWorkspace.shared.runningApplications
        
        for app in runningApps {
            if app.processIdentifier == processID {
                return app.bundleIdentifier == "com.google.Chrome" ||
                       app.localizedName == "Google Chrome"
            }
        }
        return false
    }
    
    // MARK: - Public Helper Methods
    
    /// Get list of available Chrome windows for UI display
    func getAvailableChromeWindows() -> [ChromeWindow] {
        return getChromeWindows()
    }
    
    /// Check if Chrome is running and has visible windows
    func isChromeAvailable() -> Bool {
        return !getChromeWindows().isEmpty
    }
    
    /// Take screenshot and save to temp folder, return file path
    func captureAndSaveScreenshot() async throws -> String {
        let screenshot = try await captureActiveChromeWindow()
        return try saveScreenshotToTemp(screenshot)
    }
    
    func saveScreenshotToTemp(_ image: NSImage) throws -> String {
        // Create temp directory
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("visual-agent-screenshots")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        
        // Generate filename with timestamp
        let timestamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let filename = "screenshot-\(timestamp).png"
        let filepath = tempDir.appendingPathComponent(filename)
        
        // Convert NSImage to PNG data
        guard let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: .png, properties: [:]) else {
            throw ScreenshotError.imageConversionFailure
        }
        
        // Save to file
        try pngData.write(to: filepath)
        
        return filepath.path
    }
}

// MARK: - Error Types

enum ScreenshotError: Error, LocalizedError {
    case noChromeWindowFound
    case captureFailure
    case imageConversionFailure
    case saveFailure
    
    var errorDescription: String? {
        switch self {
        case .noChromeWindowFound:
            return "No Chrome browser windows found"
        case .captureFailure:
            return "Failed to capture screenshot"
        case .imageConversionFailure:
            return "Failed to convert image to PNG"
        case .saveFailure:
            return "Failed to save screenshot to file"
        }
    }
}