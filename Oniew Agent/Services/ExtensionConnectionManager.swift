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
        startWebSocketServer()
    }
    
    private func startWebSocketServer() {
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
                self?.isConnected = false
            }
        }
        
        webSocketServer?.start()
        
        DispatchQueue.main.async {
            self.connectionStatus = "WebSocket server running on port \(self.serverPort)"
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
    
    func registerHandler(for type: String, handler: @escaping (Any) -> Void) {
        messageHandlers[type] = handler
    }
    
    func getServerInfo() -> String {
        return "WebSocket server running on ws://localhost:\(serverPort)"
    }
    
    deinit {
        webSocketServer?.stop()
    }
}