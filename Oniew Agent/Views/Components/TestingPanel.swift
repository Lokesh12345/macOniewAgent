import SwiftUI
import Foundation

struct TestingPanel: View {
    @StateObject private var connectionManager = ExtensionConnectionManager.shared
    @State private var isVisualizing = false
    @State private var testResults: String = ""
    @State private var lastVisualizationTime: Date?
    
    // Input fields for actions
    @State private var elementIndex: String = "0"
    @State private var inputText: String = ""
    @State private var searchText: String = ""
    @State private var keysText: String = ""
    @State private var waitSeconds: String = "3"
    @State private var scrollPercent: String = "50"
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
            // Header
            VStack(alignment: .leading, spacing: 8) {
                Text("DOM Visualization Testing")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                
                Text("Test the DOM analyzer functionality with visual highlights")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            
            // Connection Status
            HStack(spacing: 8) {
                Circle()
                    .fill(connectionManager.hasActiveConnection() ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                
                Text(connectionManager.hasActiveConnection() ? "Extension Connected" : "Extension Disconnected")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(connectionManager.hasActiveConnection() ? .green : .red)
                
                Spacer()
                
                if let lastTime = lastVisualizationTime {
                    Text("Last run: \(DateFormatter.testingTimeFormatter.string(from: lastTime))")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.primary.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(connectionManager.hasActiveConnection() ? Color.green.opacity(0.3) : Color.red.opacity(0.3), lineWidth: 1)
                    )
            )
            
            // Visualize Button
            Button(action: {
                startVisualization()
            }) {
                HStack(spacing: 8) {
                    if isVisualizing {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "eye.circle.fill")
                            .font(.system(size: 16))
                    }
                    
                    Text(isVisualizing ? "Visualizing DOM..." : "Visualize")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isVisualizing ? Color.orange : (connectionManager.hasActiveConnection() ? Color.blue : Color.gray))
                )
            }
            .buttonStyle(PlainButtonStyle())
            .disabled(!connectionManager.hasActiveConnection() || isVisualizing)
            
            // Action Buttons Section with Input Fields
            if !testResults.isEmpty && connectionManager.hasActiveConnection() {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Browser Actions")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    // Element Actions (require index)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Element Actions:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                        
                        // Element Index Input
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Element Index:")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            TextField("0", text: $elementIndex)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .font(.system(size: 10))
                                .frame(height: 22)
                        }
                        
                        HStack(spacing: 8) {
                            ActionButton(title: "Click", icon: "hand.tap") {
                                executeAction("clickElement", index: Int(elementIndex) ?? 0)
                            }
                            ActionButton(title: "Get Options", icon: "list.bullet") {
                                executeAction("getDropdownOptions", index: Int(elementIndex) ?? 0)
                            }
                        }
                        
                        // Input Text Action
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Input Text:")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            TextField("Enter text to type", text: $inputText)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .font(.system(size: 10))
                                .frame(height: 22)
                            
                            ActionButton(title: "Type Text", icon: "keyboard") {
                                guard !inputText.isEmpty else { return }
                                executeAction("inputText", index: Int(elementIndex) ?? 0, text: inputText)
                            }
                        }
                    }
                    
                    // Scroll Actions
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Scroll Actions:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                        
                        HStack(spacing: 8) {
                            ActionButton(title: "Top", icon: "arrow.up") {
                                executeAction("scrollToTop")
                            }
                            ActionButton(title: "Bottom", icon: "arrow.down") {
                                executeAction("scrollToBottom")
                            }
                        }
                        
                        // Scroll to Text
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Scroll to Text:")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            HStack(spacing: 4) {
                                TextField("Search text", text: $searchText)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .font(.system(size: 10))
                                    .frame(height: 22)
                                
                                ActionButton(title: "Scroll", icon: "magnifyingglass") {
                                    guard !searchText.isEmpty else { return }
                                    executeAction("scrollToText", text: searchText)
                                }
                            }
                        }
                        
                        // Scroll to Percent
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Scroll to Percent:")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            HStack(spacing: 4) {
                                TextField("50", text: $scrollPercent)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .font(.system(size: 10))
                                    .frame(height: 22)
                                
                                ActionButton(title: "Scroll %", icon: "percent") {
                                    executeAction("scrollToPercent", percent: Int(scrollPercent) ?? 50)
                                }
                            }
                        }
                    }
                    
                    // Navigation Actions
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Navigation Actions:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                        
                        HStack(spacing: 8) {
                            ActionButton(title: "Back", icon: "arrow.backward") {
                                executeAction("goBack")
                            }
                        }
                        
                        // Wait Action
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Wait (seconds):")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            HStack(spacing: 4) {
                                TextField("3", text: $waitSeconds)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .font(.system(size: 10))
                                    .frame(height: 22)
                                
                                ActionButton(title: "Wait", icon: "clock") {
                                    executeAction("wait", seconds: Int(waitSeconds) ?? 3)
                                }
                            }
                        }
                        
                        // Send Keys Action
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Send Keys:")
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                            
                            HStack(spacing: 4) {
                                TextField("Enter", text: $keysText)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .font(.system(size: 10))
                                    .frame(height: 22)
                                
                                ActionButton(title: "Send", icon: "command") {
                                    guard !keysText.isEmpty else { return }
                                    executeAction("sendKeys", keys: keysText)
                                }
                            }
                        }
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.primary.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                        )
                )
            }
            
            // Test Results
            if !testResults.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Test Results")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    ScrollView {
                        Text(testResults)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(.primary)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(8)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Color.primary.opacity(0.05))
                            )
                    }
                    .frame(maxHeight: 200)
                }
            }
            
            Spacer()
            
            // Instructions
            VStack(alignment: .leading, spacing: 4) {
                Text("Instructions:")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.primary)
                
                Text("• Make sure the Chrome extension is loaded and connected")
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                
                Text("• Navigate to any web page in the browser")
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                
                Text("• Click 'Visualize' to highlight interactive elements with numbers")
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                
                Text("• Check the current tab for visual highlights and borders")
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.blue.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.blue.opacity(0.2), lineWidth: 1)
                    )
            )
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            setupVisualizationListener()
        }
    }
    
    private func startVisualization() {
        // Check server status first
        if !connectionManager.isServerRunning() {
            testResults = "❌ ERROR: WebSocket server is not running\n"
            testResults += "Please restart the app\n"
            return
        }
        
        if !connectionManager.hasActiveConnection() {
            testResults = "⚠️ WARNING: No active extension connection\n"
            testResults += "But attempting to send command anyway...\n"
            // Continue anyway - don't return
        }
        
        isVisualizing = true
        testResults = "🔄 Starting DOM visualization...\n"
        testResults += "Server running: \(connectionManager.isServerRunning())\n"
        testResults += "Has connection: \(connectionManager.hasActiveConnection())\n"
        lastVisualizationTime = Date()
        
        // Send DOM visualization command to extension
        print("📤 TestingPanel: Sending dom_visualize message")
        connectionManager.sendMessage(type: "dom_visualize", data: [
            "action": "start_visualization",
            "timestamp": Date().timeIntervalSince1970
        ])
        print("📤 TestingPanel: Message sent")
        
        // Set up result handling
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            testResults += "📡 Sent visualization command to extension\n"
            testResults += "👁️ DOM analyzer should be running...\n"
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            if isVisualizing { // Only auto-complete if no response received
                isVisualizing = false
                testResults += "⏱️ No response received within timeout\n"
                testResults += "🔍 Check your browser for numbered highlights on interactive elements\n"
                testResults += "📊 Elements should be outlined with colored borders and number labels\n"
            }
        }
    }
    
    private func setupVisualizationListener() {
        // Listen for DOM visualization responses
        NotificationCenter.default.addObserver(
            forName: Notification.Name("DOMVisualizationResponse"),
            object: nil,
            queue: .main
        ) { notification in
            if let data = notification.userInfo as? [String: Any] {
                self.handleVisualizationResponse(data)
            }
        }
        
        // Listen for browser action responses
        NotificationCenter.default.addObserver(
            forName: Notification.Name("BrowserActionResponse"),
            object: nil,
            queue: .main
        ) { notification in
            if let data = notification.userInfo as? [String: Any] {
                self.handleBrowserActionResponse(data)
            }
        }
        
        // Listen for DOM reanalysis needed
        NotificationCenter.default.addObserver(
            forName: Notification.Name("DOMReanalysisNeeded"),
            object: nil,
            queue: .main
        ) { notification in
            if let data = notification.userInfo as? [String: Any] {
                self.handleReanalysisNeeded(data)
            }
        }
    }
    
    private func handleVisualizationResponse(_ data: [String: Any]) {
        isVisualizing = false
        
        if let success = data["success"] as? Bool, success {
            testResults += "✅ DOM visualization successful!\n"
            
            if let result = data["result"] as? [String: Any],
               let totalElements = result["totalElements"] as? Int {
                testResults += "📊 Found \(totalElements) interactive elements\n"
                testResults += "🔍 Check your browser for numbered highlights\n"
            }
            
            if let tabInfo = data["tabInfo"] as? [String: Any],
               let url = tabInfo["url"] as? String {
                testResults += "🌐 Visualized page: \(url)\n"
            }
        } else {
            testResults += "❌ DOM visualization failed\n"
            
            if let error = data["error"] as? String {
                testResults += "💥 Error: \(error)\n"
            }
        }
        
        testResults += "⏰ Response received at: \(DateFormatter.testingTimeFormatter.string(from: Date()))\n"
    }
    
    private func executeAction(_ action: String, index: Int? = nil, text: String? = nil, seconds: Int? = nil, percent: Int? = nil, keys: String? = nil) {
        guard connectionManager.hasActiveConnection() else {
            testResults += "❌ ERROR: No active connection\n"
            return
        }
        
        var actionData: [String: Any] = ["action": action]
        
        if let index = index {
            actionData["index"] = index
            testResults += "🎯 Target: Element index \(index)\n"
        }
        
        if let text = text {
            actionData["text"] = text
            testResults += "📝 Text: '\(text)'\n"
        }
        
        if let seconds = seconds {
            actionData["seconds"] = seconds
            testResults += "⏱️ Duration: \(seconds) seconds\n"
        }
        
        if let percent = percent {
            actionData["yPercent"] = percent
            testResults += "📊 Scroll: \(percent)%\n"
        }
        
        if let keys = keys {
            actionData["keys"] = keys
            testResults += "⌨️ Keys: '\(keys)'\n"
        }
        
        testResults += "⚡ Executing: \(action)\n"
        
        connectionManager.sendMessage(type: "execute_browser_action", data: actionData)
    }
    
    private func handleBrowserActionResponse(_ data: [String: Any]) {
        // Check for reanalysis needed first
        if let reanalysisNeeded = data["reanalysisNeeded"] as? Bool, reanalysisNeeded {
            handleReanalysisNeeded(data)
            return
        }
        
        if let success = data["success"] as? Bool, success {
            testResults += "✅ Browser action successful!\n"
            
            if let action = data["action"] as? String {
                testResults += "🎯 Action: \(action)\n"
            }
            
            if let result = data["result"] as? [String: Any],
               let message = result["message"] as? String {
                testResults += "📋 Result: \(message)\n"
            }
            
            if let tabInfo = data["tabInfo"] as? [String: Any],
               let url = tabInfo["url"] as? String {
                testResults += "🌐 Page: \(url)\n"
            }
        } else {
            testResults += "❌ Browser action failed\n"
            
            if let error = data["error"] as? String {
                testResults += "💥 Error: \(error)\n"
                
                // Check if this is a reanalysis-related error
                if error.contains("re-analyze needed") || error.contains("Autocomplete appeared") || error.contains("DOM changed") {
                    testResults += "🔄 Triggering automatic reanalysis...\n"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        self.startVisualization()
                    }
                }
            }
            
            if let action = data["action"] as? String {
                testResults += "🎯 Failed action: \(action)\n"
            }
        }
        
        testResults += "⏰ Response received at: \(DateFormatter.testingTimeFormatter.string(from: Date()))\n"
    }
    
    private func handleReanalysisNeeded(_ data: [String: Any]) {
        testResults += "🔄 DOM REANALYSIS NEEDED\n"
        
        if let error = data["error"] as? String {
            testResults += "📊 Reason: \(error)\n"
        }
        
        if let action = data["action"] as? String {
            testResults += "⚡ Failed action: \(action)\n"
        }
        
        // Automatically re-run visualization
        testResults += "🔄 Auto-rerunning DOM visualization...\n"
        
        // Small delay before re-visualization
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.startVisualization()
        }
    }
}

// Action Button Component
struct ActionButton: View {
    let title: String
    let icon: String
    let callback: () -> Void
    
    var body: some View {
        Button(action: callback) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                
                Text(title)
                    .font(.system(size: 8, weight: .medium))
            }
            .foregroundColor(.primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(minHeight: 40)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.blue.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

extension DateFormatter {
    static let testingTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}