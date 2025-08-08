import Foundation
import SwiftUI
import ScreenCaptureKit

class VisualAgentManager: ObservableObject {
    @Published var isProcessing = false
    @Published var currentTask = ""
    @Published var taskStatus: TaskStatus = .idle
    @Published var logs: [String] = []
    @Published var currentScreenshot: NSImage?
    @Published var currentWebsiteInfo: WebsiteInfo?
    
    private let vlModelService = VLModelService()
    private let memoryManager = TaskMemoryManager()
    private var macScreenshotService: MacScreenshotService? = {
        if #available(macOS 12.3, *) {
            return MacScreenshotService()
        } else {
            return nil
        }
    }()
    
    struct WebsiteInfo {
        let url: String
        let title: String
        let timestamp: Date
    }
    
    enum TaskStatus {
        case idle
        case takingScreenshot
        case analyzing
        case executing
        case completed
        case failed
    }
    
    init() {
        // Initialize visual agent manager
    }
    
    func executeTask(_ task: String, using connectionManager: ExtensionConnectionManager) {
        guard !task.isEmpty else { return }
        
        currentTask = task
        taskStatus = .takingScreenshot
        isProcessing = true
        addLog("🎯 Task: \(task)")
        
        // Start new memory session
        let website = getCurrentWebsite(from: connectionManager)
        memoryManager.startNewSession(task: task, website: website)
        
        // Take screenshot using Mac native capture (if available), otherwise use extension
        addLog("🔍 Checking screenshot availability...")
        addLog("🔍 macScreenshotService: \(macScreenshotService != nil ? "available" : "nil")")
        
        if #available(macOS 12.3, *) {
            addLog("✅ macOS 12.3+ detected - using native capture")
            requestScreenshotNatively()
        } else {
            // Fallback to extension-based screenshots for older macOS versions
            addLog("📸 Using extension-based screenshots (macOS < 12.3)")
            requestScreenshot(using: connectionManager)
        }
    }
    
    private func requestScreenshotNatively() {
        print("📤 VisualAgentManager: Taking screenshot using Mac native capture")
        addLog("📸 Taking screenshot...")
        
        Task {
            do {
                // Enable stealth mode before screenshot (hide app from capture)
                await MainActor.run {
                    WindowConfigurator.enableStealthMode()
                    addLog("🥷 Stealth mode enabled - app hidden from capture")
                }
                
                // Wait a moment for stealth mode to take effect
                try await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                
                // Simple screenshot capture like OniewApp - no saving, just capture and display
                if #available(macOS 12.3, *) {
                    // Get available screen content
                    let content = try await SCShareableContent.current
                    guard let display = content.displays.first else {
                        throw ScreenshotError.captureFailure
                    }
                    
                    // Create filter for entire display (silent capture)
                    let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
                    
                    // Configure screenshot settings
                    let config = SCStreamConfiguration()
                    config.width = Int(display.width)
                    config.height = Int(display.height)
                    config.pixelFormat = kCVPixelFormatType_32BGRA
                    config.showsCursor = false
                    
                    // Capture the screenshot silently
                    let cgImage = try await SCScreenshotManager.captureImage(
                        contentFilter: filter,
                        configuration: config
                    )
                    
                    let screenshotImage = NSImage(cgImage: cgImage, size: CGSize(width: cgImage.width, height: cgImage.height))
                    
                    // Convert to base64 for VL model compatibility
                    guard let imageData = screenshotImage.tiffRepresentation,
                          let bitmap = NSBitmapImageRep(data: imageData),
                          let pngData = bitmap.representation(using: .png, properties: [:]) else {
                        throw ScreenshotError.imageConversionFailure
                    }
                    
                    let base64String = pngData.base64EncodedString()
                    let dataUrl = "data:image/png;base64,\(base64String)"
                    
                    await MainActor.run {
                        // Update UI immediately - same pattern as OniewApp
                        print("🔄 Setting currentScreenshot to: \(screenshotImage.size)")
                        currentScreenshot = screenshotImage
                        currentWebsiteInfo = WebsiteInfo(
                            url: "Screen Capture",
                            title: "Screenshot", 
                            timestamp: Date()
                        )
                        
                        addLog("📸 Screenshot captured successfully - Size: \(Int(screenshotImage.size.width))x\(Int(screenshotImage.size.height))")
                        taskStatus = .analyzing
                        
                        print("✅ Screenshot set! currentScreenshot = \(currentScreenshot?.size ?? CGSize.zero)")
                        print("✅ isProcessing = \(isProcessing)")
                        
                        // Disable stealth mode after screenshot
                        WindowConfigurator.disableStealthMode()
                        addLog("👁️ Stealth mode disabled - app visible again")
                        
                        // Continue with VL analysis
                        analyzeScreenshotWithVL(dataUrl)
                    }
                    
                } else {
                    throw ScreenshotError.captureFailure
                }
                
            } catch {
                await MainActor.run {
                    addLog("❌ Screenshot capture failed: \(error.localizedDescription)")
                    taskStatus = .failed
                    isProcessing = false
                    memoryManager.completeCurrentSession(success: false)
                    
                    // Ensure stealth mode is disabled even on error
                    WindowConfigurator.disableStealthMode()
                    addLog("👁️ Stealth mode disabled after error")
                }
            }
        }
    }
    
    // Legacy extension-based screenshot (keep as fallback)
    private func requestScreenshot(using connectionManager: ExtensionConnectionManager) {
        print("📤 VisualAgentManager: Requesting screenshot from extension (fallback)")
        connectionManager.sendMessage(type: "take_screenshot", data: [:])
        addLog("📸 Requesting screenshot from extension...")
        print("📤 VisualAgentManager: Screenshot request sent")
    }
    
    private func analyzeScreenshotWithVL(_ screenshotData: String) {
        // Create screenshot step for memory
        let screenshotStep = memoryManager.createScreenshotStep(screenshot: screenshotData, analysis: "")
        memoryManager.addStep(screenshotStep)
        
        // Get memory context for analysis
        let memoryContext = memoryManager.getContextForPrompt()
        
        // Analyze screenshot with VL model including memory context
        vlModelService.analyzeScreenshot(screenshotData, task: currentTask, memoryContext: memoryContext) { [weak self] result in
            DispatchQueue.main.async {
                self?.handleVLAnalysis(result)
            }
        }
    }
    
    func handleScreenshot(_ data: [String: Any]) {
        print("📥 VisualAgentManager: Received screenshot data with keys: \\(data.keys.joined(separator: ", "))")
        
        guard let screenshot = data["screenshot"] as? String else {
            print("❌ VisualAgentManager: No screenshot data in message")
            addLog("❌ No screenshot data received")
            taskStatus = .failed
            isProcessing = false
            memoryManager.completeCurrentSession(success: false)
            return
        }
        
        print("📥 VisualAgentManager: Screenshot data length: \\(screenshot.count) characters")
        
        // Convert base64 screenshot to NSImage for display
        if let imageData = convertBase64ToImageData(screenshot) {
            currentScreenshot = NSImage(data: imageData)
        }
        
        // Store website information
        if let url = data["url"] as? String,
           let title = data["title"] as? String {
            currentWebsiteInfo = WebsiteInfo(
                url: url,
                title: title,
                timestamp: Date()
            )
        }
        
        addLog("📸 Screenshot received, analyzing with VL model...")
        taskStatus = .analyzing
        
        // Add screenshot step to memory
        let screenshotStep = memoryManager.createScreenshotStep(screenshot: screenshot, analysis: "")
        memoryManager.addStep(screenshotStep)
        
        // Get memory context for analysis
        let memoryContext = memoryManager.getContextForPrompt()
        
        // Analyze screenshot with VL model including memory context
        vlModelService.analyzeScreenshot(screenshot, task: currentTask, memoryContext: memoryContext) { [weak self] result in
            DispatchQueue.main.async {
                self?.handleVLAnalysis(result)
            }
        }
    }
    
    private func handleVLAnalysis(_ result: VLAnalysisResult) {
        switch result {
        case .success(let analysis, let actions):
            addLog("🧠 Analysis complete: \(actions.count) actions planned")
            taskStatus = .executing
            
            // Add analysis step to memory
            let taskActions = actions.map { convertToTaskAction($0) }
            let analysisStep = memoryManager.createAnalysisStep(analysis: analysis, actions: taskActions)
            memoryManager.addStep(analysisStep)
            
            // Send actions to extension for execution
            executeActions(actions)
            
        case .failure(let error):
            addLog("❌ Analysis failed: \(error)")
            taskStatus = .failed
            isProcessing = false
            
            // Add failure step to memory
            let failureStep = TaskStep(
                timestamp: Date(),
                type: .analysis,
                description: "Analysis failed: \(error)",
                screenshot: nil,
                actions: [],
                result: .failure,
                notes: error
            )
            memoryManager.addStep(failureStep)
            memoryManager.completeCurrentSession(success: false)
        }
    }
    
    private func executeActions(_ actions: [BrowserAction]) {
        guard let connectionManager = ExtensionConnectionManager.shared as ExtensionConnectionManager? else {
            addLog("❌ Connection manager not available")
            taskStatus = .failed
            isProcessing = false
            memoryManager.completeCurrentSession(success: false)
            return
        }
        
        for (index, action) in actions.enumerated() {
            let delay = Double(index) * 1.0 // 1 second delay between actions
            
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                self.executeAction(action, using: connectionManager)
                
                // Mark as completed after last action
                if index == actions.count - 1 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        self.taskStatus = .completed
                        self.isProcessing = false
                        self.addLog("✅ Task completed")
                        
                        // Complete memory session
                        self.memoryManager.completeCurrentSession(success: true)
                        self.memoryManager.addLearning("Successfully completed task: \(self.currentTask)")
                    }
                }
            }
        }
    }
    
    private func executeAction(_ action: BrowserAction, using connectionManager: ExtensionConnectionManager) {
        connectionManager.sendMessage(type: "execute_action", data: action.toDictionary())
        addLog("⚡ Executing: \(action.description)")
        
        // Add action step to memory
        let taskAction = convertToTaskAction(action)
        let actionStep = memoryManager.createActionStep(
            description: "Executing: \(action.description)",
            actions: [taskAction],
            success: true // We'll update this based on actual results later
        )
        memoryManager.addStep(actionStep)
    }
    
    private func addLog(_ message: String) {
        DispatchQueue.main.async {
            self.logs.append(message)
            // Keep only last 50 logs
            if self.logs.count > 50 {
                self.logs.removeFirst()
            }
        }
    }
    
    func reset() {
        taskStatus = .idle
        isProcessing = false
        currentTask = ""
        logs.removeAll()
        currentScreenshot = nil
        currentWebsiteInfo = nil
        
        // Pause current memory session if active
        memoryManager.pauseCurrentSession()
    }
    
    func clearScreenshotAfterDelay() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            if self.taskStatus == .completed {
                self.currentScreenshot = nil
                self.currentWebsiteInfo = nil
            }
        }
    }
    
    // MARK: - Memory Access
    
    func getMemoryManager() -> TaskMemoryManager {
        return memoryManager
    }
    
    // MARK: - Helper Methods
    
    private func getCurrentWebsite(from connectionManager: ExtensionConnectionManager) -> String? {
        // This would need to be implemented to get current URL from extension
        // For now, return nil
        return nil
    }
    
    private func convertToTaskAction(_ browserAction: BrowserAction) -> TaskAction {
        let actionType: TaskAction.ActionType
        var target = ""
        
        switch browserAction.type {
        case .click:
            actionType = .click
            if let coordinates = browserAction.coordinates {
                target = "(\(coordinates.x), \(coordinates.y))"
            } else if let selector = browserAction.selector {
                target = selector
            }
        case .type:
            actionType = .type
            target = browserAction.selector ?? ""
        case .scroll:
            actionType = .scroll
            target = "\(browserAction.direction ?? "") \(browserAction.amount ?? 0)px"
        }
        
        return TaskAction(
            type: actionType,
            target: target,
            value: browserAction.text,
            executed: false,
            success: false
        )
    }
    
    private func convertBase64ToImageData(_ base64String: String) -> Data? {
        // Remove data URL prefix if present
        let cleanBase64 = base64String
            .replacingOccurrences(of: "data:image/png;base64,", with: "")
            .replacingOccurrences(of: "data:image/jpeg;base64,", with: "")
            .replacingOccurrences(of: "data:image/webp;base64,", with: "")
        
        return Data(base64Encoded: cleanBase64)
    }
}

// Move these types to a shared file or keep here for now
enum VLAnalysisResult {
    case success(String, [BrowserAction]) // analysis text + actions
    case failure(String)
}

struct BrowserAction {
    enum ActionType {
        case click
        case type
        case scroll
    }
    
    let type: ActionType
    let selector: String?
    let coordinates: CGPoint?
    let text: String?
    let direction: String?
    let amount: Int?
    
    var description: String {
        switch type {
        case .click:
            return coordinates != nil ? "Click at (\(coordinates!.x), \(coordinates!.y))" : "Click \(selector ?? "")"
        case .type:
            return "Type '\(text ?? "")' into \(selector ?? "")"
        case .scroll:
            return "Scroll \(direction ?? "") by \(amount ?? 0)px"
        }
    }
    
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = ["type": typeString]
        
        if let selector = selector { dict["selector"] = selector }
        if let coordinates = coordinates {
            dict["coordinates"] = ["x": coordinates.x, "y": coordinates.y]
        }
        if let text = text { dict["text"] = text }
        if let direction = direction { dict["direction"] = direction }
        if let amount = amount { dict["amount"] = amount }
        
        return dict
    }
    
    private var typeString: String {
        switch type {
        case .click: return "click"
        case .type: return "type"
        case .scroll: return "scroll"
        }
    }
}