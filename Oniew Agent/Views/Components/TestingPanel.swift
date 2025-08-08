import SwiftUI
import Foundation

struct TestingPanel: View {
    @StateObject private var connectionManager = ExtensionConnectionManager.shared
    @State private var isVisualizing = false
    @State private var testResults: String = ""
    @State private var lastVisualizationTime: Date?
    
    var body: some View {
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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
}

extension DateFormatter {
    static let testingTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}