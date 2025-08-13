import Foundation
import Network
import Combine

class ExtensionConnectionManager: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var connectionStatus: String = "Starting WebSocket server..."
    @Published var lastError: String?
    
    private var webSocketServer: SimpleWebSocketServer?
    private var messageHandlers: [String: (Any) -> Void] = [:]
    private let serverPort: UInt16 = 41899
    private var pingCount = 0
    
    static let shared = ExtensionConnectionManager()
    
    private init() {
        print("🏗️ ExtensionConnectionManager initialized")
        // Delay initialization to prevent race conditions during app startup
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.startWebSocketServerOnce()
        }
    }
    
    private var hasStartedServer = false
    
    private func startWebSocketServerOnce() {
        // Ensure we only start the server once
        guard !hasStartedServer else {
            print("⚠️ WebSocket server initialization already attempted")
            return
        }
        hasStartedServer = true
        print("🚀 Starting WebSocket server for the first time on port \(serverPort)")
        startWebSocketServer()
    }
    
    private func killExistingProcessOnPort() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/lsof")
        task.arguments = ["-ti:\(serverPort)"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                let pids = output.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n")
                for pid in pids {
                    if !pid.isEmpty {
                        print("🔪 Killing existing process \(pid) on port \(serverPort)")
                        let killTask = Process()
                        killTask.executableURL = URL(fileURLWithPath: "/bin/kill")
                        killTask.arguments = ["-9", pid]
                        try? killTask.run()
                        killTask.waitUntilExit()
                    }
                }
            }
        } catch {
            // Ignore errors - process might not exist
        }
    }
    
    private func startWebSocketServer() {
        // Prevent multiple server instances
        guard webSocketServer == nil else {
            print("⚠️ WebSocket server already exists")
            return
        }
        
        // Create shared temp directory for screenshots
        createScreenshotTempDirectory()
        
        // Kill any existing process on the port
        killExistingProcessOnPort()
        
        webSocketServer = SimpleWebSocketServer(port: serverPort)
        
        webSocketServer?.onConnectionChanged = { [weak self] connected in
            DispatchQueue.main.async {
                self?.isConnected = connected
                self?.connectionStatus = connected ? "Extension Connected" : "Waiting for extension..."
                self?.lastError = nil
                
                if connected {
                    print("✅ Extension connected successfully")
                } else {
                    print("🔌 Extension disconnected, server still running")
                }
            }
        }
        
        webSocketServer?.onMessage = { [weak self] message in
            self?.handleExtensionMessage(message)
        }
        
        webSocketServer?.onError = { [weak self] error in
            DispatchQueue.main.async {
                self?.lastError = error
                self?.connectionStatus = "Server Error: \(error)"
                
                // Only set to disconnected if it's a real connection error, not startup error
                if !error.contains("Address already in use") {
                    self?.isConnected = false
                }
            }
        }
        
        webSocketServer?.start()
        
        // TODO: Connect SettingsManager to WebSocket server
        // Note: SimpleWebSocketServer doesn't need external settings connection
        // Settings are handled internally via sendSettingsToExtension methods
        
        DispatchQueue.main.async {
            if self.lastError?.contains("Address already in use") != true {
                self.connectionStatus = "WebSocket server running on port \(self.serverPort)"
            }
        }
    }
    
    private func handleExtensionMessage(_ message: [String: Any]) {
        print("🎯 Mac app received message from extension: \(message)")
        DispatchQueue.main.async { [weak self] in
            guard let messageType = message["type"] as? String else { 
                print("❌ No message type found in: \(message)")
                return 
            }
            
            print("🔍 Processing message type: \(messageType)")
            
            switch messageType {
            case "ping":
                // Reduce ping/pong noise - only log every 10 pings
                self?.pingCount += 1
                if (self?.pingCount ?? 0) % 10 == 1 {
                    print("🏓 Heartbeat active (ping #\(self?.pingCount ?? 0))")
                }
                self?.sendMessage(type: "pong", data: [:])
                
            case "executor_event":
                print("⚡ Received executor event")
                if let data = message["data"] as? [String: Any],
                   let event = data["event"] as? [String: Any] {
                    self?.handleExecutorEvent(event)
                }
                
            case "task_analysis":
                print("📊 Received task analysis")
                if let data = message["data"] as? [String: Any] {
                    self?.handleTaskAnalysis(data)
                }
                
            case "llm_thinking":
                print("🧠 Received LLM thinking")
                if let data = message["data"] as? [String: Any] {
                    self?.handleLLMThinking(data)
                }
                
            case "step_progress":
                print("👣 Received step progress")
                if let data = message["data"] as? [String: Any] {
                    self?.handleStepProgress(data)
                }
                
            case "task_completion":
                print("🎯 Received task completion")
                if let data = message["data"] as? [String: Any] {
                    self?.handleTaskCompletion(data)
                }
                
            case "user_input_needed":
                print("❓ Received user input request")
                if let data = message["data"] as? [String: Any] {
                    self?.handleUserInputRequest(data)
                }
                
            case "screenshot_ready":
                print("🎯 SCREENSHOT READY!")
                if let data = message["data"] as? [String: Any],
                   let screenshotId = data["screenshotId"] as? String {
                    // Request screenshot directly
                    self?.sendMessage(type: "get_screenshot", data: ["screenshotId": screenshotId])
                } else {
                    print("❌ Screenshot ready message missing screenshotId")
                }
                
            case "screenshot_image":
                print("🎯 SCREENSHOT IMAGE RECEIVED!")
                if let imageData = message["data"] as? String {
                    print("📸 Image data length: \(imageData.count) characters")
                    // Create format expected by VL model
                    let screenshotData: [String: Any] = [
                        "screenshot": imageData,
                        "timestamp": Date().timeIntervalSince1970 * 1000
                    ]
                    NotificationCenter.default.post(
                        name: Notification.Name("ScreenshotReceived"),
                        object: nil,
                        userInfo: screenshotData
                    )
                } else {
                    print("❌ Screenshot image missing data")
                }
                
            case "screenshot_file_ready":
                print("🎯 SCREENSHOT FILE READY!")
                if let data = message["data"] as? [String: Any],
                   let filename = data["filename"] as? String {
                    print("📁 Reading file: \(filename)")
                    self?.readScreenshotFromTempFile(filename)
                } else {
                    print("❌ Screenshot file ready message missing filename")
                }
                
            case "screenshot":
                print("🎯 SCREENSHOT RECEIVED FROM EXTENSION!")
                if let data = message["data"] as? [String: Any] {
                    self?.handleScreenshotMessage(data)
                } else {
                    print("❌ Screenshot message missing data")
                }
                
            case "screenshot_error":
                print("❌ Received screenshot error from extension")
                if let data = message["data"] as? [String: Any] {
                    self?.handleScreenshotError(data)
                } else {
                    print("❌ Screenshot error message missing data")
                }
                
            case "screenshot_saved":
                print("📁 Screenshot saved by extension")
                if let data = message["data"] as? [String: Any] {
                    self?.handleScreenshotSaved(data)
                } else {
                    print("❌ Screenshot saved message missing data")
                }
                
            case "action_result":
                print("⚡ Received action result from extension")
                if let data = message["data"] as? [String: Any] {
                    self?.handleActionResult(data)
                } else {
                    print("❌ Action result message missing data")
                }
                
            case "connection_status":
                print("🔗 Extension connection status updated")
                // Just acknowledge, no specific handling needed
                
            case "dom_visualization_complete":
                print("👁️ DOM visualization completed successfully")
                if let data = message["data"] as? [String: Any] {
                    self?.handleDOMVisualizationResponse(data, success: true)
                }
                
            case "dom_visualization_error":
                print("❌ DOM visualization failed")
                if let data = message["data"] as? [String: Any] {
                    self?.handleDOMVisualizationResponse(data, success: false)
                }
                
            case "browser_action_complete":
                print("⚡ Browser action completed successfully")
                if let data = message["data"] as? [String: Any] {
                    self?.handleBrowserActionResponse(data, success: true)
                }
                
            case "browser_action_error":
                print("❌ Browser action failed")
                if let data = message["data"] as? [String: Any] {
                    self?.handleBrowserActionResponse(data, success: false)
                }
                
            case "browser_action_reanalysis_needed":
                print("🔄 Browser action requires DOM reanalysis")
                if let data = message["data"] as? [String: Any] {
                    self?.handleBrowserActionReanalysis(data)
                }
                
            case "page_navigation":
                print("🔄 Page navigation detected")
                if let data = message["data"] as? [String: Any] {
                    self?.handlePageNavigation(data)
                }
                
            case "navigation_complete":
                print("🏁 Navigation completed")
                if let data = message["data"] as? [String: Any] {
                    self?.handleNavigationComplete(data)
                }
                
            case "spa_navigation":
                print("📜 SPA navigation detected")
                if let data = message["data"] as? [String: Any] {
                    self?.handleSPANavigation(data)
                }
                
            case "page_ready":
                print("✅ Page ready")
                if let data = message["data"] as? [String: Any] {
                    self?.handlePageReady(data)
                }
                
            case "scroll_dom_changed":
                print("📜 Scroll-based DOM changes detected")
                if let data = message["data"] as? [String: Any] {
                    self?.handleScrollDOMChanged(data)
                }
                
            case "spa_content_loaded":
                print("🎯 SPA content loaded detected")
                if let data = message["data"] as? [String: Any] {
                    self?.handleSPAContentLoaded(data)
                }
                
            default:
                // Check for registered handlers
                if let handler = self?.messageHandlers[messageType] {
                    print("🎪 Found handler for message type: \(messageType)")
                    handler(message["data"] ?? [:])
                } else {
                    print("⚠️ No handler found for message type: \(messageType)")
                }
            }
        }
    }
    
    private func handleExecutorEvent(_ event: [String: Any]) {
        if let state = event["state"] as? String {
            print("Executor state: \(state)")
            
            // Update UI based on executor state
            NotificationCenter.default.post(
                name: Notification.Name("ExecutorStateChanged"),
                object: nil,
                userInfo: event
            )
        }
    }
    
    private func handleTaskAnalysis(_ data: [String: Any]) {
        let task = data["task"] as? String ?? "Unknown task"
        let phase = data["phase"] as? String ?? "unknown"
        let details = data["details"] as? [String: Any] ?? [:]
        let message = details["message"] as? String ?? "Processing..."
        
        print("📊 Task Analysis - \(phase): \(message)")
        
        // Post notification to update UI
        NotificationCenter.default.post(
            name: Notification.Name("TaskAnalysisUpdate"),
            object: nil,
            userInfo: [
                "task": task,
                "phase": phase,
                "message": message,
                "details": details
            ]
        )
    }
    
    private func handleLLMThinking(_ data: [String: Any]) {
        let phase = data["phase"] as? String ?? "thinking"
        let reasoning = data["reasoning"] as? String ?? "Processing..."
        let prompt = data["prompt"] as? String ?? ""
        
        print("🧠 LLM Thinking - \(phase): \(reasoning)")
        
        // Post notification to update UI
        NotificationCenter.default.post(
            name: Notification.Name("LLMThinkingUpdate"),
            object: nil,
            userInfo: [
                "phase": phase,
                "reasoning": reasoning,
                "prompt": prompt
            ]
        )
    }
    
    private func handleStepProgress(_ data: [String: Any]) {
        let step = data["step"] as? Int ?? 0
        let action = data["action"] as? String ?? "Unknown action"
        let status = data["status"] as? String ?? "unknown"
        let details = data["details"] as? [String: Any] ?? [:]
        
        print("👣 Step Progress - Step \(step): \(action) (\(status))")
        
        // Post notification to update UI
        NotificationCenter.default.post(
            name: Notification.Name("StepProgressUpdate"),
            object: nil,
            userInfo: [
                "step": step,
                "action": action,
                "status": status,
                "details": details
            ]
        )
    }
    
    private func handleTaskCompletion(_ data: [String: Any]) {
        let success = data["success"] as? Bool ?? false
        let result = data["result"] as? String ?? ""
        let error = data["error"] as? String ?? ""
        
        print("🎯 Task Completion - Success: \(success)")
        if !result.isEmpty {
            print("   Result: \(result)")
        }
        if !error.isEmpty {
            print("   Error: \(error)")
        }
        
        // Post notification to update UI
        NotificationCenter.default.post(
            name: Notification.Name("TaskCompletionUpdate"),
            object: nil,
            userInfo: [
                "success": success,
                "result": result,
                "error": error
            ]
        )
    }
    
    private func handleUserInputRequest(_ data: [String: Any]) {
        let inputId = data["inputId"] as? String ?? ""
        let prompt = data["prompt"] as? String ?? "Input needed"
        let inputType = data["inputType"] as? String ?? "text"
        let options = data["options"] as? [String: Any] ?? [:]
        
        print("❓ User Input Needed: \(prompt)")
        
        // Post notification to update UI
        NotificationCenter.default.post(
            name: Notification.Name("UserInputNeeded"),
            object: nil,
            userInfo: [
                "inputId": inputId,
                "prompt": prompt,
                "inputType": inputType,
                "options": options
            ]
        )
    }
    
    private func handleScreenshotMessage(_ data: [String: Any]) {
        print("📸 Processing screenshot message")
        
        guard let screenshot = data["screenshot"] as? String else {
            print("❌ Screenshot message missing screenshot data")
            return
        }
        
        print("📸 Screenshot data length: \(screenshot.count) characters")
        
        // Post notification for VisualAgentManager to handle
        NotificationCenter.default.post(
            name: Notification.Name("ScreenshotReceived"),
            object: nil,
            userInfo: data
        )
        
        print("📸 Posted ScreenshotReceived notification")
    }
    
    // MARK: - File-based Screenshot Methods
    
    private func createScreenshotTempDirectory() {
        let tempDir = getScreenshotTempDir()
        do {
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true, attributes: nil)
            print("📁 Created temp directory: \(tempDir)")
            
            // Set permissions so extension can write
            let attributes = [FileAttributeKey.posixPermissions: NSNumber(value: 0o777)]
            try FileManager.default.setAttributes(attributes, ofItemAtPath: tempDir)
        } catch {
            print("❌ Failed to create temp directory: \(error)")
        }
    }
    
    private func getScreenshotTempDir() -> String {
        return "/tmp/oniew-screenshots"
    }
    
    private func readScreenshotFromTempFile(_ filename: String) {
        // Look in Downloads folder where Chrome saves files
        let downloadsPath = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first!
        let filepath = downloadsPath.appendingPathComponent(filename)
        
        do {
            if filename.hasSuffix(".png") {
                // Read PNG file directly
                let imageData = try Data(contentsOf: filepath)
                
                // Convert to base64 for VL model (same format as before)
                let base64String = imageData.base64EncodedString()
                let dataUrl = "data:image/png;base64,\(base64String)"
                
                print("📸 Read PNG screenshot: \(filename) (\(imageData.count) bytes)")
                
                // Create same format as before for compatibility
                let screenshotData: [String: Any] = [
                    "screenshot": dataUrl,
                    "url": "Unknown", // Will be passed separately
                    "title": "Screenshot",
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ]
                
                // Post notification for VisualAgentManager
                NotificationCenter.default.post(
                    name: Notification.Name("ScreenshotReceived"),
                    object: nil,
                    userInfo: screenshotData
                )
                
                // Clean up file
                try FileManager.default.removeItem(at: filepath)
                print("📸 Cleaned up PNG file")
            }
        } catch {
            print("❌ Failed to read PNG file: \(error)")
        }
    }
    
    private func handleScreenshotError(_ data: [String: Any]) {
        let error = data["error"] as? String ?? "Unknown screenshot error"
        print("❌ Screenshot Error: \\(error)")
        
        // Post notification for error handling
        NotificationCenter.default.post(
            name: Notification.Name("ScreenshotError"),
            object: nil,
            userInfo: data
        )
    }
    
    private func handleScreenshotSaved(_ data: [String: Any]) {
        print("📁 Processing screenshot_saved message")
        
        // Extract file path information
        let filename = data["filename"] as? String ?? ""
        let fullPath = data["fullPath"] as? String ?? ""
        let url = data["url"] as? String ?? "Unknown"
        let title = data["title"] as? String ?? "Screenshot"
        
        print("📁 Screenshot saved - filename: \(filename), fullPath: \(fullPath)")
        
        if !fullPath.isEmpty {
            // Load image from full path
            loadScreenshotFromPath(fullPath, url: url, title: title)
        } else if !filename.isEmpty {
            // Fallback to reading from Downloads folder
            readScreenshotFromTempFile(filename)
        } else {
            print("❌ No valid path information in screenshot_saved message")
        }
    }
    
    private func loadScreenshotFromPath(_ fullPath: String, url: String, title: String) {
        do {
            let imageData = try Data(contentsOf: URL(fileURLWithPath: fullPath))
            
            // Convert to base64 for VL model (same format as before)
            let base64String = imageData.base64EncodedString()
            let dataUrl = "data:image/png;base64,\(base64String)"
            
            print("📸 Loaded screenshot from path: \(fullPath) (\(imageData.count) bytes)")
            
            // Create same format as before for compatibility
            let screenshotData: [String: Any] = [
                "screenshot": dataUrl,
                "url": url,
                "title": title,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
            
            // Post notification for VisualAgentManager
            NotificationCenter.default.post(
                name: Notification.Name("ScreenshotReceived"),
                object: nil,
                userInfo: screenshotData
            )
            
            print("📸 Posted ScreenshotReceived notification with full path data")
        } catch {
            print("❌ Failed to load screenshot from path: \(fullPath) - \(error)")
        }
    }
    
    private func handleActionResult(_ data: [String: Any]) {
        let success = data["success"] as? Bool ?? false
        let actionType = (data["action"] as? [String: Any])?["type"] as? String ?? "unknown"
        
        print("⚡ Action Result: \\(actionType) - Success: \\(success)")
        
        if let error = data["error"] as? String {
            print("   Error: \\(error)")
        }
        
        // Post notification for action result handling
        NotificationCenter.default.post(
            name: Notification.Name("ActionResultReceived"),
            object: nil,
            userInfo: data
        )
    }
    
    private func handleDOMVisualizationResponse(_ data: [String: Any], success: Bool) {
        print("👁️ Processing DOM visualization response - Success: \(success)")
        
        var responseData = data
        responseData["success"] = success
        
        // Post notification for DOM visualization response
        NotificationCenter.default.post(
            name: Notification.Name("DOMVisualizationResponse"),
            object: nil,
            userInfo: responseData
        )
    }
    
    private func handleBrowserActionResponse(_ data: [String: Any], success: Bool) {
        print("⚡ Processing browser action response - Success: \(success)")
        
        var responseData = data
        responseData["success"] = success
        
        // Post notification for browser action response
        NotificationCenter.default.post(
            name: Notification.Name("BrowserActionResponse"),
            object: nil,
            userInfo: responseData
        )
    }
    
    private func handleBrowserActionReanalysis(_ data: [String: Any]) {
        print("🔄 Processing DOM reanalysis request")
        print("📊 Reanalysis reason: \(data["error"] ?? "Unknown")")
        
        var reanalysisData = data
        reanalysisData["reanalysisNeeded"] = true
        
        // Post notification for reanalysis needed
        NotificationCenter.default.post(
            name: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            userInfo: reanalysisData
        )
        
        // Also send to browser action response for UI display
        NotificationCenter.default.post(
            name: Notification.Name("BrowserActionResponse"),
            object: nil,
            userInfo: reanalysisData
        )
    }
    
    private func handlePageNavigation(_ data: [String: Any]) {
        print("🔄 Processing page navigation")
        print("📍 New URL: \(data["url"] ?? "Unknown")")
        
        var navigationData = data
        navigationData["reanalysisNeeded"] = true
        navigationData["reason"] = "page_navigation"
        
        // Post notification for navigation event
        NotificationCenter.default.post(
            name: Notification.Name("PageNavigationDetected"),
            object: nil,
            userInfo: navigationData
        )
        
        // Also trigger reanalysis
        NotificationCenter.default.post(
            name: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            userInfo: navigationData
        )
    }
    
    private func handleNavigationComplete(_ data: [String: Any]) {
        print("🏁 Processing navigation complete")
        print("📍 Final URL: \(data["url"] ?? "Unknown")")
        
        var completeData = data
        completeData["reanalysisNeeded"] = true
        completeData["reason"] = "navigation_complete"
        
        // Post notification for navigation complete
        NotificationCenter.default.post(
            name: Notification.Name("NavigationCompleted"),
            object: nil,
            userInfo: completeData
        )
    }
    
    private func handleSPANavigation(_ data: [String: Any]) {
        print("📜 Processing SPA navigation")
        print("📍 SPA URL: \(data["url"] ?? "Unknown")")
        
        var spaData = data
        spaData["reanalysisNeeded"] = true
        spaData["reason"] = "spa_navigation"
        
        // Post notification for SPA navigation
        NotificationCenter.default.post(
            name: Notification.Name("SPANavigationDetected"),
            object: nil,
            userInfo: spaData
        )
        
        // Also trigger reanalysis for SPA changes
        NotificationCenter.default.post(
            name: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            userInfo: spaData
        )
    }
    
    private func handlePageReady(_ data: [String: Any]) {
        print("✅ Processing page ready")
        print("📍 Ready URL: \(data["url"] ?? "Unknown")")
        
        // Post notification for page ready
        NotificationCenter.default.post(
            name: Notification.Name("PageReadyDetected"),
            object: nil,
            userInfo: data
        )
    }
    
    private func handleScrollDOMChanged(_ data: [String: Any]) {
        print("📜 Processing scroll-based DOM changes")
        print("📊 Element delta: \(data["elementDelta"] ?? 0)")
        print("📊 Scroll delta: \(data["scrollDelta"] ?? 0)px")
        print("📊 Height delta: \(data["heightDelta"] ?? 0)px")
        
        var scrollData = data
        scrollData["reanalysisNeeded"] = true
        scrollData["reason"] = "scroll_dom_changed"
        
        // Post notification for scroll-based DOM changes
        NotificationCenter.default.post(
            name: Notification.Name("ScrollDOMChangesDetected"),
            object: nil,
            userInfo: scrollData
        )
        
        // Also trigger reanalysis as new elements appeared
        NotificationCenter.default.post(
            name: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            userInfo: scrollData
        )
    }
    
    private func handleSPAContentLoaded(_ data: [String: Any]) {
        print("🎯 Processing SPA content loaded")
        print("📊 Stability signals: DOM mutations \(data["domMutationCount"] ?? 0), network requests \(data["networkRequestCount"] ?? 0)")
        print("📊 Elements added: \(data["elementsAdded"] ?? 0)")
        
        var spaContentData = data
        spaContentData["reanalysisNeeded"] = true
        spaContentData["reason"] = "spa_content_loaded"
        
        // Post notification for SPA content loaded
        NotificationCenter.default.post(
            name: Notification.Name("SPAContentLoadedDetected"),
            object: nil,
            userInfo: spaContentData
        )
        
        // Also trigger reanalysis as new content has loaded
        NotificationCenter.default.post(
            name: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            userInfo: spaContentData
        )
    }
    
    func sendMessage(type: String, data: [String: Any]) {
        let message = [
            "type": type,
            "data": data,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ] as [String: Any]
        
        print("📨 ExtensionConnectionManager.sendMessage called")
        print("   Type: \(type)")
        print("   WebSocket server exists: \(webSocketServer != nil)")
        print("   Server running: \(webSocketServer?.isRunning ?? false)")
        print("   Has connection: \(webSocketServer?.hasActiveConnection ?? false)")
        
        if let server = webSocketServer {
            server.sendMessage(message)
            print("✅ Message sent to WebSocket server")
        } else {
            print("❌ WebSocket server is nil!")
        }
    }
    
    func executeVisualTask(_ task: String) {
        print("👁️ Executing visual task: \(task)")
        
        // First request screenshot
        print("📸 REQUESTING SCREENSHOT FROM EXTENSION...")
        sendMessage(type: "take_screenshot", data: [:])
        
        // Set a timeout to detect if extension doesn't respond
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            print("⏰ Screenshot timeout check - Extension should have responded by now")
            print("💡 If no screenshot received, check:")
            print("   1. Extension console logs (chrome://extensions -> Visual Agent -> service worker)")
            print("   2. Active tab exists in Chrome")
            print("   3. Extension permissions granted")
        }
    }
    
    func executeAction(_ action: [String: Any]) {
        print("⚡ Executing browser action: \(action)")
        
        sendMessage(type: "execute_action", data: action)
    }
    
    func executeVideoControl(action: String, time: String? = nil, amount: Int? = nil) {
        print("🎬 Executing video control: \(action)")
        if let time = time {
            print("   Time parameter: \(time)")
        }
        if let amount = amount {
            print("   Amount parameter: \(amount)")
        }
        
        var videoData: [String: Any] = [
            "action": action  // This will be params.action in the video handler
        ]

        if let time = time {
            videoData["time"] = time
        }
        
        if let amount = amount {
            videoData["amount"] = amount
        }
        
        var browserAction: [String: Any] = [
            "action": "videoControl"
        ]
        
        // Merge video data into browser action
        for (key, value) in videoData {
            browserAction[key] = value
        }
        
        sendMessage(type: "execute_browser_action", data: browserAction)
    }
    
    func executeVideoCaptionControl(action: String, language: String? = nil) {
        print("📝 Executing video caption control: \(action)")
        if let language = language {
            print("   Language parameter: \(language)")
        }
        
        var captionData: [String: Any] = [
            "action": action  // getCaptions, enableCaption, disableCaptions, getCurrentCaption
        ]
        
        if let language = language {
            captionData["time"] = language  // Reuse time parameter for language code
        }
        
        var browserAction: [String: Any] = [
            "action": "videoControl"
        ]
        
        // Merge caption data into browser action
        for (key, value) in captionData {
            browserAction[key] = value
        }
        
        sendMessage(type: "execute_browser_action", data: browserAction)
    }
    
    func executeTask(_ task: String, tabId: Int? = nil) {
        let taskId = UUID().uuidString
        print("🚀 Mac app executing task: '\(task)' with ID: \(taskId)")
        
        var data: [String: Any] = [
            "task": task,
            "taskId": taskId
        ]
        
        // Only include tabId if it's explicitly provided and valid
        if let tabId = tabId, tabId > 0 {
            data["tabId"] = tabId
        }
        
        sendMessage(type: "execute_task", data: data)
    }
    
    func sendUserInputResponse(inputId: String, value: String) {
        print("📨 Sending user input response for ID: \(inputId)")
        sendMessage(type: "user_input_response", data: [
            "inputId": inputId,
            "value": value
        ])
    }
    
    func abortCurrentTask(reason: String = "user_canceled") {
        print("🛑 Aborting current task: \(reason)")
        sendMessage(type: "abort_task", data: [
            "reason": reason
        ])
    }
    
    func registerHandler(for type: String, handler: @escaping (Any) -> Void) {
        messageHandlers[type] = handler
    }
    
    func getServerInfo() -> String {
        return "WebSocket server running on ws://localhost:\(serverPort)"
    }
    
    func restartServer() {
        print("🔄 Restarting WebSocket server...")
        webSocketServer?.stop()
        webSocketServer = nil
        hasStartedServer = false
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.startWebSocketServerOnce()
        }
    }
    
    func isServerRunning() -> Bool {
        return webSocketServer?.isRunning ?? false
    }
    
    func hasActiveConnection() -> Bool {
        return webSocketServer?.hasActiveConnection ?? false
    }
    
    func getDetailedStatus() -> String {
        guard let server = webSocketServer else {
            return "Server not initialized"
        }
        
        if server.hasActiveConnection {
            return "Connected to extension"
        } else if server.isRunning {
            return "Server running, waiting for extension..."
        } else {
            return "Server stopped"
        }
    }
    
    deinit {
        print("🧹 ExtensionConnectionManager deinit - stopping server")
        webSocketServer?.stop()
        webSocketServer = nil
    }
}