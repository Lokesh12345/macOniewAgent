import SwiftUI
import Foundation
import AppKit

struct AgentPanel: View {
    @State private var isHovering: Bool = false
    @State private var selectedQuestion: Question? = nil
    @State private var isAnalyzing = false
    @State private var showingSettings = false
    @State private var questions: [Question] = []
    @State private var agentLogs: [AgentLog] = []
    @State private var chatText: String = ""
    @FocusState private var isChatFocused: Bool
    
    // Connection status
    @StateObject private var connectionManager = ExtensionConnectionManager.shared
    
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                questionsHeader
                
                if showingSettings {
                    SettingsPanel()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    questionsContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        if let window = NSApplication.shared.windows.first {
                            let currentLocation = window.frame.origin
                            let newLocation = NSPoint(
                                x: currentLocation.x + value.translation.width,
                                y: currentLocation.y - value.translation.height
                            )
                            window.setFrameOrigin(newLocation)
                        }
                    }
            )
            
            // Chat footer (only show for Agent panel, not Settings)
            if !showingSettings {
                chatFooter
            }
        }
        .padding(8)
        .background(panelBackground)
        .onHover { hovering in
            isHovering = hovering
        }
        .onAppear {
            setupExecutorEventListener()
        }
    }
    
    private var questionsHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                HStack(spacing: 2) {
                    Button(action: {
                        showingSettings = false
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "questionmark.bubble.fill")
                                .font(.system(size: 10))
                            
                            Text("Agent")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(showingSettings ? .primary.opacity(0.5) : .primary.opacity(0.8))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(showingSettings ? Color.clear : Color.blue.opacity(0.1))
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: {
                        showingSettings = true
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape")
                                .font(.system(size: 10))
                            
                            Text("Settings")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(showingSettings ? .primary.opacity(0.8) : .primary.opacity(0.5))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(showingSettings ? Color.blue.opacity(0.1) : Color.clear)
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                
                Spacer()
                
                if isAnalyzing {
                    ProgressView()
                        .scaleEffect(0.6)
                }
                
                // Connection status indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(connectionManager.isConnected ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    
                    Text(connectionManager.isConnected ? "Connected" : "Disconnected")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(connectionManager.isConnected ? .green : .red)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill((connectionManager.isConnected ? Color.green : Color.red).opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke((connectionManager.isConnected ? Color.green : Color.red).opacity(0.3), lineWidth: 0.5)
                        )
                )
                .help(connectionManager.connectionStatus) // Show detailed status on hover
                
                // Exit button
                Button(action: {
                    exitApp()
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.primary.opacity(0.7))
                        .padding(4)
                        .background(
                            Circle()
                                .fill(Color.red.opacity(0.1))
                        )
                }
                .buttonStyle(PlainButtonStyle())
                .onHover { hovering in
                    // Could add hover effect here if needed
                }
                
                if questions.count > 1 {
                    Button(action: {
                        clearAllButLastQuestion()
                    }) {
                        HStack(spacing: 2) {
                            Image(systemName: "trash.fill")
                                .font(.system(size: 8))
                            Text("Clear")
                                .font(.system(size: 8, weight: .medium))
                        }
                        .foregroundColor(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.orange.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.orange.opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            
            HStack(spacing: 4) {
                if showingSettings {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 4, height: 4)
                    
                    Text("Settings Configuration")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    Text("Ready")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                } else {
                    Circle()
                        .fill(questions.isEmpty ? Color.gray : Color.blue)
                        .frame(width: 4, height: 4)
                    
                    Text("\(questions.count) tasks")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    
    private var questionsContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if questions.isEmpty {
                    questionsEmptyState
                } else {
                    ForEach(questions.reversed()) { question in
                        QuestionCard(
                            question: question,
                            onQuestionTapped: { selectedQuestion in
                                self.selectedQuestion = selectedQuestion
                            },
                            onRetryTapped: { question in
                                retryQuestion(question)
                            }
                        )
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .top)),
                            removal: .opacity.combined(with: .move(edge: .trailing))
                        ))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(.easeInOut(duration: 0.3), value: questions.count)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // This is no longer used since we moved to SettingsPanel component
    // Keeping for backward compatibility but can be removed
    
    private var agentLogsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 10))
                    .foregroundColor(.blue)
                
                Text("Agent Server Logs")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.primary)
                
                Spacer()
                
                Text("\(agentLogs.count) logs")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                ForEach(agentLogs.reversed()) { log in
                    AgentLogRow(log: log)
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.blue.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.blue.opacity(0.3), lineWidth: 0.5)
                )
        )
    }
    
    private var agentEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 24))
                .foregroundColor(.primary.opacity(0.4))
            
            Text("No Agent Activity")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary.opacity(0.6))
            
            Text("Agent logs will appear here")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }
    
    private var questionsEmptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Hey , hi there! , what do you want me to do?")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.primary.opacity(0.8))
            
            Text("Just mention me in the chat and I will start working on it.")
                .font(.system(size: 9))
                .foregroundColor(.secondary)
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(8)
    }
    
    private var chatFooter: some View {
        VStack(spacing: 8) {
            // Separator line
            Rectangle()
                .fill(Color.primary.opacity(0.1))
                .frame(height: 0.5)
            
            // Chat input area
            HStack(spacing: 8) {
                // Text input
                TextEditor(text: $chatText)
                    .font(.system(size: 11))
                    .foregroundColor(.primary)
                    .scrollContentBackground(.hidden)
                    .focused($isChatFocused)
                    .frame(minHeight: 60, maxHeight: 100)
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.primary.opacity(0.05))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isChatFocused ? Color.blue.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 1)
                            )
                    )
                    .overlay(alignment: .topLeading) {
                        if chatText.isEmpty {
                            Text("What do you want me to do...")
                                .font(.system(size: 11))
                                .foregroundColor(.primary.opacity(0.5))
                                .padding(12)
                                .allowsHitTesting(false)
                        }
                    }
                    .onTapGesture {
                        isChatFocused = true
                    }
                    .onSubmit {
                        sendMessage()
                    }
                
                // Start button
                Button(action: {
                    sendMessage()
                }) {
                    Image(systemName: chatText.isEmpty ? "paperplane" : "paperplane.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(chatText.isEmpty ? .primary.opacity(0.4) : .white)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(chatText.isEmpty ? Color.primary.opacity(0.1) : Color.blue)
                        )
                }
                .buttonStyle(PlainButtonStyle())
                .disabled(chatText.isEmpty)
                .animation(.easeInOut(duration: 0.2), value: chatText.isEmpty)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }
    
    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(Color.primary.opacity(0.05))
            .background(.regularMaterial.opacity(min(0.8, 0.6 * 1.2)))
            .blur(radius: 1.0, opaque: false)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.primary.opacity(0.6), lineWidth: 0.5)
            )
            .shadow(
                color: .black.opacity(0.15),
                radius: 8,
                x: 0,
                y: 4
            )
    }
    
    private func clearAllButLastQuestion() {
        if questions.count > 1 {
            let lastQuestion = questions.last
            questions = lastQuestion.map { [$0] } ?? []
        }
    }
    
    private func retryQuestion(_ question: Question) {
        print("Retrying question: \(question.text)")
    }
    
    private func exitApp() {
        NSApplication.shared.terminate(nil)
    }
    
    private func setupExecutorEventListener() {
        // Listen for executor events from the extension
        NotificationCenter.default.addObserver(
            forName: Notification.Name("ExecutorStateChanged"),
            object: nil,
            queue: .main
        ) { notification in
            if let event = notification.userInfo as? [String: Any] {
                handleExecutorEvent(event)
            }
        }
    }
    
    private func handleExecutorEvent(_ event: [String: Any]) {
        guard let state = event["state"] as? String else { return }
        
        // Find the most recent question (current task)
        guard let lastIndex = questions.indices.last else { return }
        
        switch state {
        case "TASK_START":
            questions[lastIndex].isExecuting = true
            questions[lastIndex].executionSteps.removeAll()
            
        case "STEP_START":
            if let step = event["step"] as? Int {
                questions[lastIndex].currentStep = step
            }
            if let maxSteps = event["maxSteps"] as? Int {
                questions[lastIndex].totalSteps = maxSteps
            }
            
        case "PLANNER_OUTPUT":
            if let data = event["data"] as? [String: Any] {
                let observation = data["observation"] as? String ?? "Planning..."
                let reasoning = data["reasoning"] as? String ?? ""
                let nextSteps = data["next_steps"] as? String ?? ""
                
                let step = ExecutionStep(
                    stepNumber: questions[lastIndex].currentStep,
                    timestamp: Date(),
                    type: .planning,
                    title: "🧠 Planning Phase",
                    details: "Observation: \(observation)\n\nReasoning: \(reasoning)\n\nNext Steps: \(nextSteps)",
                    status: .completed
                )
                questions[lastIndex].executionSteps.append(step)
            }
            
        case "NAVIGATOR_ACTION":
            if let data = event["data"] as? [String: Any] {
                let actionType = data["action"] as? String ?? "Unknown Action"
                let details = data["details"] as? String ?? ""
                
                let step = ExecutionStep(
                    stepNumber: questions[lastIndex].currentStep,
                    timestamp: Date(),
                    type: .navigation,
                    title: "🎯 Navigation Action",
                    details: "Action: \(actionType)\n\nDetails: \(details)",
                    status: .running
                )
                questions[lastIndex].executionSteps.append(step)
            }
            
        case "VALIDATOR_OUTPUT":
            if let data = event["data"] as? [String: Any] {
                let isValid = data["is_valid"] as? Bool ?? false
                let reason = data["reason"] as? String ?? ""
                let answer = data["answer"] as? String ?? ""
                
                let step = ExecutionStep(
                    stepNumber: questions[lastIndex].currentStep,
                    timestamp: Date(),
                    type: .validation,
                    title: isValid ? "✅ Validation Passed" : "❌ Validation Failed",
                    details: "Result: \(isValid ? "Valid" : "Invalid")\n\nReason: \(reason)\n\nAnswer: \(answer)",
                    status: isValid ? .completed : .error
                )
                questions[lastIndex].executionSteps.append(step)
            }
            
        case "TASK_OK", "TASK_COMPLETE":
            questions[lastIndex].isExecuting = false
            let completionStep = ExecutionStep(
                stepNumber: questions[lastIndex].currentStep,
                timestamp: Date(),
                type: .completed,
                title: "🎉 Task Completed Successfully",
                details: "Task completed successfully!",
                status: .completed
            )
            questions[lastIndex].executionSteps.append(completionStep)
            
        case "TASK_FAIL":
            questions[lastIndex].isExecuting = false
            let error = event["error"] as? String ?? "Unknown error"
            let errorStep = ExecutionStep(
                stepNumber: questions[lastIndex].currentStep,
                timestamp: Date(),
                type: .error,
                title: "❌ Task Failed",
                details: "Error: \(error)",
                status: .error
            )
            questions[lastIndex].executionSteps.append(errorStep)
            
        case "TASK_CANCEL":
            questions[lastIndex].isExecuting = false
            
        default:
            break
        }
    }
    
    private func sendMessage() {
        guard !chatText.isEmpty else { return }
        
        print("Sending message: \(chatText)")
        
        // Add to questions 
        if !showingSettings {
            let newQuestion = Question(
                text: chatText,
                category: "User Input",
                confidence: 1.0,
                answer: "Processing your request...",
                needsRetry: false
            )
            questions.append(newQuestion)
            
            // Send task to extension if connected and notify monitor
            if connectionManager.isConnected {
                connectionManager.executeTask(chatText)
                
                // Notify TaskMonitorPanel about the new task
                NotificationCenter.default.post(
                    name: Notification.Name("TaskStarted"),
                    object: nil,
                    userInfo: [
                        "task": chatText,
                        "taskId": UUID().uuidString
                    ]
                )
            }
        }
        
        // Clear input
        chatText = ""
        isChatFocused = false
    }
    
}

struct QuestionCard: View {
    let question: Question  
    let onQuestionTapped: (Question) -> Void
    let onRetryTapped: (Question) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with task info
            taskHeader
            
            // Task text
            Text(question.text)
                .font(.system(size: 9))
                .foregroundColor(.primary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
            
            // Progress indicator (if executing)
            if question.isExecuting && question.totalSteps > 0 {
                progressView
            }
            
            // Real-time execution steps
            if !question.executionSteps.isEmpty {
                executionStepsView
            }
            
            // Answer section (if not executing and has answer)
            if !question.isExecuting && !question.answer.isEmpty {
                answerView
            }
            
            // Action buttons
            actionButtons
        }
        .padding(8)
        .background(cardBackground)
    }
    
    private var taskHeader: some View {
        HStack(spacing: 4) {
            Image(systemName: question.isExecuting ? "gearshape.2" : "brain.head.profile")
                .font(.system(size: 8))
                .foregroundColor(question.isExecuting ? .blue : .primary.opacity(0.8))
                .rotationEffect(.degrees(question.isExecuting ? 360 : 0))
                .animation(question.isExecuting ? .linear(duration: 2).repeatForever(autoreverses: false) : .default, value: question.isExecuting)
            
            Text(question.isExecuting ? "Executing..." : question.category)
                .font(.system(size: 8))
                .foregroundColor(.secondary)
            
            Spacer()
            
            if question.isExecuting {
                Text("Step \(question.currentStep)/\(question.totalSteps)")
                    .font(.system(size: 7, weight: .medium))
                    .foregroundColor(.blue)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.blue.opacity(0.1))
                    )
            } else {
                Text("\(Int(question.confidence * 100))%")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.primary.opacity(0.8))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.blue.opacity(0.1))
                    )
            }
        }
    }
    
    private var progressView: some View {
        VStack(spacing: 4) {
            HStack {
                Text("Progress")
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(question.currentStep) / \(question.totalSteps)")
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
            }
            
            ProgressView(value: Double(question.currentStep), total: Double(question.totalSteps))
                .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                .scaleEffect(y: 0.5)
        }
    }
    
    private var executionStepsView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Execution Steps")
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(.secondary)
            
            ForEach(question.executionSteps.suffix(3)) { step in
                executionStepRow(step)
            }
            
            if question.executionSteps.count > 3 {
                Text("... and \(question.executionSteps.count - 3) more steps")
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
                    .italic()
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.blue.opacity(0.05))
        )
    }
    
    private func executionStepRow(_ step: ExecutionStep) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: step.type.icon)
                .font(.system(size: 8))
                .foregroundColor(step.type.color)
                .frame(width: 12, height: 12)
            
            VStack(alignment: .leading, spacing: 1) {
                Text(step.title)
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.primary)
                
                if !step.details.isEmpty {
                    Text(step.details.prefix(100) + (step.details.count > 100 ? "..." : ""))
                        .font(.system(size: 7))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }
            
            Spacer()
            
            Text(DateFormatter.executionTimeFormatter.string(from: step.timestamp))
                .font(.system(size: 6))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }
    
    private var answerView: some View {
        Text(String(question.answer.prefix(60)) + "...")
            .font(.system(size: 8))
            .foregroundColor(.secondary)
            .lineLimit(2)
            .padding(.top, 2)
    }
    
    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button(action: {
                onQuestionTapped(question)
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 8))
                    
                    Text("View Details")
                        .font(.system(size: 8, weight: .medium))
                }
                .foregroundColor(.primary.opacity(0.8))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.blue.opacity(0.1))
                )
            }
            .buttonStyle(PlainButtonStyle())
            
            if question.needsRetry {
                Button(action: {
                    onRetryTapped(question)
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 8))
                        
                        Text("Retry")
                            .font(.system(size: 8, weight: .medium))
                    }
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.orange.opacity(0.1))
                    )
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
    }
    
    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(question.isExecuting ? Color.blue.opacity(0.3) : Color.primary.opacity(0.1), lineWidth: question.isExecuting ? 1.0 : 0.5)
            )
    }
}

struct AgentLogRow: View {
    let log: AgentLog
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(formatTime(log.timestamp))
                .font(.system(size: 8).monospaced())
                .foregroundColor(.primary.opacity(0.5))
                .frame(width: 45, alignment: .leading)
            
            Circle()
                .fill(logColor)
                .frame(width: 4, height: 4)
                .padding(.top, 4)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(log.message)
                    .font(.system(size: 10))
                    .foregroundColor(.primary.opacity(0.9))
                    .textSelection(.enabled)
            }
            
            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.blue.opacity(0.05))
        )
    }
    
    private var logColor: Color {
        if log.message.contains("SUCCESS") || log.message.contains("✅") {
            return .green
        } else if log.message.contains("ERROR") || log.message.contains("❌") {
            return .red
        } else {
            return .blue
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}

extension DateFormatter {
    static let executionTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

struct Question: Identifiable {
    let id = UUID()
    let text: String
    let category: String
    let confidence: Double
    let answer: String
    let needsRetry: Bool
    let timestamp: Date
    var executionSteps: [ExecutionStep] = []
    var isExecuting: Bool = false
    var currentStep: Int = 0
    var totalSteps: Int = 0
    
    init(text: String, category: String = "General", confidence: Double = 0.8, answer: String = "", needsRetry: Bool = false) {
        self.text = text
        self.category = category
        self.confidence = confidence
        self.answer = answer
        self.needsRetry = needsRetry
        self.timestamp = Date()
    }
}

struct ExecutionStep: Identifiable {
    let id = UUID()
    let stepNumber: Int
    let timestamp: Date
    let type: StepType
    let title: String
    let details: String
    let status: StepStatus
    
    enum StepType {
        case planning, navigation, validation, completed, error
        
        var icon: String {
            switch self {
            case .planning: return "brain.head.profile"
            case .navigation: return "location.circle"
            case .validation: return "checkmark.circle"
            case .completed: return "checkmark.circle.fill"
            case .error: return "exclamationmark.triangle.fill"
            }
        }
        
        var color: Color {
            switch self {
            case .planning: return .blue
            case .navigation: return .orange
            case .validation: return .purple
            case .completed: return .green 
            case .error: return .red
            }
        }
    }
    
    enum StepStatus {
        case running, completed, error
    }
}

struct AgentLog: Identifiable {
    let id = UUID()
    let message: String
    let timestamp: Date
    
    init(message: String) {
        self.message = message
        self.timestamp = Date()
    }
}