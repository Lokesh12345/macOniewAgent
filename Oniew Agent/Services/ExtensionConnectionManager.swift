import Foundation
import Network
import Combine

class ExtensionConnectionManager: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var connectionStatus: String = "Starting WebSocket server..."
    @Published var lastError: String?
    
    private var webSocketServer: WebSocketServer?
    private var messageHandlers: [String: (Any) -> Void] = [:]
    private let serverPort: UInt16 = 41899
    
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
        
        // Kill any existing process on the port
        killExistingProcessOnPort()
        
        webSocketServer = WebSocketServer(port: serverPort)
        
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
        
        // Connect SettingsManager to WebSocket server
        if let server = webSocketServer {
            SettingsManager.shared.setWebSocketServer(server)
            GeneralSettingsManager.shared.setWebSocketServer(server)
            FirewallSettingsManager.shared.setWebSocketServer(server)
        }
        
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
                print("🏓 Received ping, sending pong")
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
    
    func sendMessage(type: String, data: [String: Any]) {
        let message = [
            "type": type,
            "data": data,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ] as [String: Any]
        
        webSocketServer?.sendMessage(message)
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