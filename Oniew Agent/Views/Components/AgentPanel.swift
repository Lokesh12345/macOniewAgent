import SwiftUI
import Foundation
import AppKit

struct AgentPanel: View {
    @State private var isHovering: Bool = false
    @State private var selectedQuestion: Question? = nil
    @State private var isAnalyzing = false
    @State private var showingSettings = false
    @State private var settingsLoading = false
    @State private var questions: [Question] = []
    @State private var agentLogs: [AgentLog] = []
    @State private var chatText: String = ""
    @FocusState private var isChatFocused: Bool
    @State private var taskTimer: Timer? = nil
    @State private var elapsedTime: TimeInterval = 0
    
    // Connection status
    @StateObject private var connectionManager = ExtensionConnectionManager.shared
    
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                questionsHeader
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
                
                if showingSettings {
                    if settingsLoading {
                        VStack(spacing: 16) {
                            ProgressView()
                                .scaleEffect(1.2)
                            
                            Text("Loading Settings...")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        SettingsPanel()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                } else {
                    questionsContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            
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
                                .font(.system(size: 11))
                            
                            Text("Agent")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(showingSettings ? .primary.opacity(0.5) : .primary.opacity(0.8))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(minWidth: 50, minHeight: 28)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(showingSettings ? Color.clear : Color.blue.opacity(0.15))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(showingSettings ? Color.clear : Color.blue.opacity(0.3), lineWidth: 1)
                                )
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .contentShape(Rectangle())
                    
                    Button(action: {
                        if !showingSettings {
                            settingsLoading = true
                            showingSettings = true
                            
                            // Show loading for a brief moment, then show settings
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    settingsLoading = false
                                }
                            }
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape")
                                .font(.system(size: 11))
                            
                            Text("Settings")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(showingSettings ? .primary.opacity(0.8) : .primary.opacity(0.5))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(minWidth: 50, minHeight: 28)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(showingSettings ? Color.blue.opacity(0.15) : Color.clear)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(showingSettings ? Color.blue.opacity(0.3) : Color.clear, lineWidth: 1)
                                )
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .contentShape(Rectangle())
                }
                
                Spacer()
                
                if isAnalyzing {
                    ProgressView()
                        .scaleEffect(0.6)
                }
                
                // Enhanced Connection status indicator
                HStack(spacing: 4) {
                    let isConnected = connectionManager.hasActiveConnection()
                    let isServerRunning = connectionManager.isServerRunning()
                    let detailedStatus = connectionManager.getDetailedStatus()
                    
                    // More accurate status indicator  
                    Circle()
                        .fill(isConnected ? Color.green : (isServerRunning ? Color.yellow : Color.red))
                        .frame(width: 6, height: 6)
                    
                    Text(isConnected ? "Connected" : (isServerRunning ? "Waiting..." : "Disconnected"))
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(isConnected ? .green : (isServerRunning ? .yellow : .red))
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill((connectionManager.hasActiveConnection() ? Color.green : (connectionManager.isServerRunning() ? Color.yellow : Color.red)).opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke((connectionManager.hasActiveConnection() ? Color.green : (connectionManager.isServerRunning() ? Color.yellow : Color.red)).opacity(0.3), lineWidth: 0.5)
                        )
                )
                .help(connectionManager.getDetailedStatus()) // Show detailed status on hover
                
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
        VStack(spacing: 0) {
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
                                },
                                onAbortTapped: { question in
                                    abortCurrentTask(for: question)
                                },
                                getTimerText: { question in
                                    return formatElapsedTime(elapsedTime)
                                },
                                getDurationText: { startTime, endTime in
                                    return formatDuration(startTime, endTime)
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
        VStack(spacing: 16) {
            Spacer()
            
            VStack(spacing: 12) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 32))
                    .foregroundColor(.blue.opacity(0.6))
                
                Text("Hey, hi there!")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary.opacity(0.8))
                
                Text("What do you want me to do?")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.primary.opacity(0.7))
                
                Text("Just type your request below and I'll start working on it with real-time progress updates.")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.1), lineWidth: 1)
                    )
            )
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(16)
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
        
        // Listen for task analysis updates
        NotificationCenter.default.addObserver(
            forName: Notification.Name("TaskAnalysisUpdate"),
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo {
                handleTaskAnalysisUpdate(userInfo)
            }
        }
        
        // Listen for LLM thinking updates
        NotificationCenter.default.addObserver(
            forName: Notification.Name("LLMThinkingUpdate"),
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo {
                handleLLMThinkingUpdate(userInfo)
            }
        }
        
        // Listen for step progress updates
        NotificationCenter.default.addObserver(
            forName: Notification.Name("StepProgressUpdate"),
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo {
                handleStepProgressUpdate(userInfo)
            }
        }
        
        // Listen for task completion updates
        NotificationCenter.default.addObserver(
            forName: Notification.Name("TaskCompletionUpdate"),
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo {
                handleTaskCompletionUpdate(userInfo)
            }
        }
        
        // Listen for user input requests
        NotificationCenter.default.addObserver(
            forName: Notification.Name("UserInputNeeded"),
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo {
                handleUserInputRequest(userInfo)
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
            questions[lastIndex].stepIds.removeAll()
            questions[lastIndex].taskStartTime = Date()
            questions[lastIndex].taskEndTime = nil
            
            // Start timer
            startTaskTimer()
            
            // Add simplified task analysis steps with 2-second delays
            addTaskAnalysisSteps(to: lastIndex)
            
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
                let webTask = data["web_task"] as? String ?? ""
                let done = data["done"] as? Bool ?? false
                
                // Create detailed planning information
                var planningDetails = ""
                if !observation.isEmpty {
                    planningDetails += "📋 **Current Situation:**\n\(observation)\n\n"
                }
                if !reasoning.isEmpty {
                    planningDetails += "🤔 **Analysis & Reasoning:**\n\(reasoning)\n\n"
                }
                if !webTask.isEmpty {
                    planningDetails += "🌐 **Web Task Identified:**\n\(webTask)\n\n"
                }
                if !nextSteps.isEmpty {
                    // Check if this contains the answer for direct questions
                    let isDirectAnswer = done && nextSteps.contains("won") || nextSteps.contains("answer") || nextSteps.contains("result")
                    if isDirectAnswer {
                        planningDetails += "💡 **Answer Found:**\n\(nextSteps)\n\n"
                    } else {
                        planningDetails += "📝 **Planned Steps:**\n\(nextSteps)\n\n"
                    }
                }
                planningDetails += "✅ **Planning Status:** \(done ? "Task ready for completion" : "Continuing with execution")"
                
                let stepId = "planner_\(observation.hashValue)_\(reasoning.hashValue)"
                guard !questions[lastIndex].stepIds.contains(stepId) else { return }
                
                let step = ExecutionStep(
                    stepNumber: questions[lastIndex].currentStep,
                    timestamp: Date(),
                    type: .planning,
                    title: done ? "🎯 Answer Found" : "🧠 Strategic Planning Complete",
                    details: planningDetails,
                    status: .completed
                )
                
                questions[lastIndex].stepIds.insert(stepId)
                addStepWithAnimation(step, to: lastIndex)
                
                // If task is done with a direct answer, also update the question's answer
                if done && !nextSteps.isEmpty {
                    questions[lastIndex].answer = nextSteps
                }
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
            questions[lastIndex].taskEndTime = Date()
            stopTaskTimer()
            
            let stepId = "task_complete_\(Date().timeIntervalSince1970)"
            guard !questions[lastIndex].stepIds.contains(stepId) else { return }
            
            let completionStep = ExecutionStep(
                stepNumber: questions[lastIndex].currentStep + 1,
                timestamp: Date(),
                type: .completed,
                title: "🎉 Task Completed Successfully",
                details: "All objectives achieved! The task has been completed successfully.",
                status: .completed
            )
            
            questions[lastIndex].stepIds.insert(stepId)
            addStepWithAnimation(completionStep, to: lastIndex)
            
            // Clear any active step when task completes
            questions[lastIndex].activeStepId = nil
            
        case "TASK_FAIL":
            questions[lastIndex].isExecuting = false
            questions[lastIndex].taskEndTime = Date()
            stopTaskTimer()
            
            let error = event["error"] as? String ?? "Unknown error"
            let stepId = "task_fail_\(error.hashValue)"
            guard !questions[lastIndex].stepIds.contains(stepId) else { return }
            
            let errorStep = ExecutionStep(
                stepNumber: questions[lastIndex].currentStep + 1,
                timestamp: Date(),
                type: .error,
                title: "❌ Task Failed",
                details: "❌ **Error Details:**\n\(error)\n\n🔄 **Suggestion:** Try rephrasing your request or check if the target website is accessible.",
                status: .error
            )
            
            questions[lastIndex].stepIds.insert(stepId)
            addStepWithAnimation(errorStep, to: lastIndex)
            
            // Clear any active step when task fails
            questions[lastIndex].activeStepId = nil
            
        case "TASK_CANCEL":
            questions[lastIndex].isExecuting = false
            
        default:
            break
        }
    }
    
    private func handleTaskAnalysisUpdate(_ userInfo: [AnyHashable: Any]) {
        guard let _ = userInfo["task"] as? String,
              let phase = userInfo["phase"] as? String,
              let message = userInfo["message"] as? String,
              let lastIndex = questions.indices.last else { return }
        
        let stepId = "analysis_\(phase)_\(message.hashValue)"
        
        // Check for duplicates
        guard !questions[lastIndex].stepIds.contains(stepId) else { return }
        
        let step = ExecutionStep(
            stepNumber: 0,
            timestamp: Date(),
            type: .analysis,
            title: "📊 Task Analysis - \(phase.capitalized)",
            details: message,
            status: .running
        )
        
        questions[lastIndex].stepIds.insert(stepId)
        addStepWithAnimation(step, to: lastIndex)
    }
    
    private func handleLLMThinkingUpdate(_ userInfo: [AnyHashable: Any]) {
        guard let phase = userInfo["phase"] as? String,
              let reasoning = userInfo["reasoning"] as? String,
              let lastIndex = questions.indices.last else { return }
        
        let prompt = userInfo["prompt"] as? String ?? ""
        let stepId = "thinking_\(phase)_\(reasoning.hashValue)"
        
        // Check for duplicates
        guard !questions[lastIndex].stepIds.contains(stepId) else { return }
        
        let details = prompt.isEmpty ? reasoning : "\(reasoning)\n\nPrompt: \(prompt)"
        
        let step = ExecutionStep(
            stepNumber: 0,
            timestamp: Date(),
            type: .thinking,
            title: "🧠 LLM Thinking - \(phase.capitalized)",
            details: details,
            status: .running
        )
        
        questions[lastIndex].stepIds.insert(stepId)
        addStepWithAnimation(step, to: lastIndex)
    }
    
    private func handleStepProgressUpdate(_ userInfo: [AnyHashable: Any]) {
        guard let step = userInfo["step"] as? Int,
              let action = userInfo["action"] as? String,
              let status = userInfo["status"] as? String,
              let lastIndex = questions.indices.last else { return }
        
        let details = userInfo["details"] as? [String: Any] ?? [:]
        let stepId = "step_\(step)_\(action.hashValue)_\(status)"
        
        // Check for duplicates
        guard !questions[lastIndex].stepIds.contains(stepId) else { return }
        
        let stepStatus: ExecutionStep.StepStatus = {
            switch status {
            case "starting": return .running
            case "in_progress": return .running
            case "completed": return .completed
            case "failed": return .error
            default: return .running
            }
        }()
        
        let stepType: ExecutionStep.StepType = {
            switch status {
            case "completed": return .completed
            case "failed": return .error
            default: return .progress
            }
        }()
        
        let executionStep = ExecutionStep(
            stepNumber: step,
            timestamp: Date(),
            type: stepType,
            title: "👣 Step \(step): \(action)",
            details: formatStepDetails(details),
            status: stepStatus
        )
        
        questions[lastIndex].stepIds.insert(stepId)
        addStepWithAnimation(executionStep, to: lastIndex)
        
        // If this step is completed, clear it as active after animation
        if stepStatus == .completed {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                completeStep(executionStep.id.uuidString, questionIndex: lastIndex)
            }
        }
        
        // Update current step
        questions[lastIndex].currentStep = step
        if let totalSteps = details["totalSteps"] as? Int {
            questions[lastIndex].totalSteps = totalSteps
        }
    }
    
    private func handleTaskCompletionUpdate(_ userInfo: [AnyHashable: Any]) {
        guard let success = userInfo["success"] as? Bool,
              let lastIndex = questions.indices.last else { return }
        
        let result = userInfo["result"] as? String ?? ""
        let error = userInfo["error"] as? String ?? ""
        let stepId = "completion_\(success)_\((success ? result : error).hashValue)"
        
        // Check for duplicates
        guard !questions[lastIndex].stepIds.contains(stepId) else { return }
        
        questions[lastIndex].isExecuting = false
        
        let completionStep = ExecutionStep(
            stepNumber: questions[lastIndex].currentStep + 1,
            timestamp: Date(),
            type: success ? .completed : .error,
            title: success ? "🎉 Task Completed Successfully" : "❌ Task Failed",
            details: success ? result : error,
            status: success ? .completed : .error
        )
        
        questions[lastIndex].stepIds.insert(stepId)
        addStepWithAnimation(completionStep, to: lastIndex)
        
        // Clear any active step when task completes
        questions[lastIndex].activeStepId = nil
    }
    
    private func handleUserInputRequest(_ userInfo: [AnyHashable: Any]) {
        guard let inputId = userInfo["inputId"] as? String,
              let prompt = userInfo["prompt"] as? String,
              let inputType = userInfo["inputType"] as? String,
              let lastIndex = questions.indices.last else { return }
        
        let step = ExecutionStep(
            stepNumber: questions[lastIndex].currentStep,
            timestamp: Date(),
            type: .userInput,
            title: "❓ User Input Required",
            details: "\(prompt)\n\nType: \(inputType)",
            status: .running
        )
        questions[lastIndex].executionSteps.append(step)
        
        // Show an alert or input dialog (simplified for now)
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText = "Input Required"
            alert.informativeText = prompt
            alert.addButton(withTitle: "Submit")
            alert.addButton(withTitle: "Cancel")
            
            if let window = NSApplication.shared.windows.first {
                alert.beginSheetModal(for: window) { response in
                    if response == .alertFirstButtonReturn {
                        // For now, send a default response
                        connectionManager.sendUserInputResponse(inputId: inputId, value: "User confirmed")
                    }
                }
            }
        }
    }
    
    private func formatStepDetails(_ details: [String: Any]) -> String {
        var result = ""
        
        if let totalSteps = details["totalSteps"] as? Int,
           let currentNSteps = details["currentNSteps"] as? Int {
            result += "Total Steps: \(totalSteps), Current: \(currentNSteps)\n"
        }
        
        if let actionTaken = details["actionTaken"] as? String {
            result += "Action: \(actionTaken)\n"
        }
        
        if let actionResult = details["actionResult"] as? String {
            result += "Result: \(actionResult)\n"
        }
        
        if let error = details["error"] as? String {
            result += "Error: \(error)\n"
        }
        
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    // MARK: - Animated Step Loading
    private func addStepWithAnimation(_ step: ExecutionStep, to questionIndex: Int) {
        // Show loading state
        questions[questionIndex].isLoadingSteps = true
        
        // If this is a running step, mark it as active (clear previous active step)
        if step.status == .running {
            questions[questionIndex].activeStepId = step.id.uuidString
        }
        
        // Different delays for different step types
        var delay: Double
        switch step.type {
        case .analysis, .thinking:
            delay = Double(questions[questionIndex].executionSteps.count) * 0.5 // 500ms for initial steps
        default:
            delay = Double(questions[questionIndex].executionSteps.count) * 0.2 // 200ms for execution steps
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.easeInOut(duration: 0.4)) {
                questions[questionIndex].executionSteps.append(step)
            }
            
            // Hide loading after a brief moment
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                questions[questionIndex].isLoadingSteps = false
            }
        }
    }
    
    // Mark step as completed and move active indicator
    private func completeStep(_ stepId: String, questionIndex: Int) {
        if questions[questionIndex].activeStepId == stepId {
            questions[questionIndex].activeStepId = nil
        }
    }
    
    // MARK: - Timer Functions
    private func startTaskTimer() {
        stopTaskTimer() // Stop any existing timer
        elapsedTime = 0
        
        taskTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            elapsedTime += 1
        }
    }
    
    private func stopTaskTimer() {
        taskTimer?.invalidate()
        taskTimer = nil
    }
    
    private func formatElapsedTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let remainingSeconds = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
    
    private func formatDuration(_ startTime: Date, _ endTime: Date) -> String {
        let duration = endTime.timeIntervalSince(startTime)
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d min", minutes, seconds)
    }
    
    // MARK: - Simplified Task Analysis Steps
    private func addTaskAnalysisSteps(to questionIndex: Int) {
        let analysisSteps = [
            ("Starting", "Task received, analyzing requirements..."),
            ("Tab_Analysis", "Finding active browser tab..."),
            ("Tab_Ready", "Browser tab prepared for execution..."),
            ("Setup", "Setting up AI agents and browser context...")
        ]
        
        for (index, (phase, message)) in analysisSteps.enumerated() {
            let delay = Double(index) * 2.0 // 2-second gaps
            
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let stepId = "analysis_\(phase)_\(index)"
                guard !questions[questionIndex].stepIds.contains(stepId) else { return }
                
                let step = ExecutionStep(
                    stepNumber: index,
                    timestamp: Date(),
                    type: .analysis,
                    title: "📊 Task Analysis - \(phase)",
                    details: message,
                    status: .running
                )
                
                questions[questionIndex].stepIds.insert(stepId)
                questions[questionIndex].activeStepId = step.id.uuidString
                
                withAnimation(.easeInOut(duration: 0.4)) {
                    questions[questionIndex].executionSteps.append(step)
                }
                
                // Auto-complete after 1.5 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    if questions[questionIndex].activeStepId == step.id.uuidString {
                        questions[questionIndex].activeStepId = nil
                    }
                }
            }
        }
    }
    
    // MARK: - Abort Task
    private func abortCurrentTask(for question: Question) {
        print("🛑 Aborting task: \(question.text)")
        
        // Stop timer
        stopTaskTimer()
        
        // Send abort signal to extension
        if connectionManager.isConnected {
            connectionManager.abortCurrentTask(reason: "user_canceled")
        }
        
        // Update UI
        if let index = questions.firstIndex(where: { $0.id == question.id }) {
            questions[index].isExecuting = false
            questions[index].taskEndTime = Date()
            questions[index].activeStepId = nil
            
            // Add abort step
            let abortStep = ExecutionStep(
                stepNumber: questions[index].currentStep + 1,
                timestamp: Date(),
                type: .error,
                title: "🛑 Task Aborted",
                details: "Task was cancelled by user request.",
                status: .error
            )
            
            withAnimation(.easeInOut(duration: 0.4)) {
                questions[index].executionSteps.append(abortStep)
            }
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
                // Set loading state and start timer immediately
                let questionIndex = questions.count - 1
                questions[questionIndex].isLoadingSteps = true
                questions[questionIndex].isExecuting = true
                questions[questionIndex].taskStartTime = Date()
                
                // Start timer
                startTaskTimer()
                
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
    let onAbortTapped: (Question) -> Void
    let getTimerText: (Question) -> String
    let getDurationText: (Date, Date) -> String
    
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
            
            // Remove the old progress view since it's now integrated into taskHeader
            
            // Real-time execution steps
            if !question.executionSteps.isEmpty {
                executionStepsView
            }
            
            // Answer section (if not executing and has answer)
            if !question.isExecuting && !question.answer.isEmpty && question.answer != "Processing your request..." {
                answerView
            }
            
            // Remove action buttons section
        }
        .padding(8)
        .background(cardBackground)
    }
    
    private var taskHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                // Enhanced status icon
                ZStack {
                    Circle()
                        .fill(question.isExecuting ? Color.blue.opacity(0.15) : Color.gray.opacity(0.15))
                        .frame(width: 20, height: 20)
                    
                    Image(systemName: question.isExecuting ? "cpu" : "brain.head.profile")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(question.isExecuting ? .blue : .primary.opacity(0.8))
                        .rotationEffect(.degrees(question.isExecuting ? 360 : 0))
                        .animation(question.isExecuting ? .linear(duration: 3).repeatForever(autoreverses: false) : .default, value: question.isExecuting)
                }
                
                VStack(alignment: .leading, spacing: 1) {
                    if question.isExecuting {
                        Text("AI Agent Executing")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.primary)
                    } else {
                        Text("Task Completed")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.green)
                    }
                    
                    // Show timer or completion time
                    if question.isExecuting {
                        Text(getTimerText(question))
                            .font(.system(size: 7, weight: .medium))
                            .foregroundColor(.blue)
                    } else if let startTime = question.taskStartTime, let endTime = question.taskEndTime {
                        Text("in \(getDurationText(startTime, endTime))")
                            .font(.system(size: 7))
                            .foregroundColor(.secondary)
                    } else {
                        Text(question.category)
                            .font(.system(size: 7))
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    if question.isExecuting {
                        // Abort button instead of step counter
                        Button(action: {
                            onAbortTapped(question)
                        }) {
                            HStack(spacing: 3) {
                                Image(systemName: "stop.fill")
                                    .font(.system(size: 6))
                                Text("ABORT")
                                    .font(.system(size: 6, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.red)
                            )
                        }
                        .buttonStyle(PlainButtonStyle())
                        
                        // Live execution indicator
                        HStack(spacing: 2) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 4, height: 4)
                                .scaleEffect(1.2)
                                .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: question.isExecuting)
                            
                            Text("LIVE")
                                .font(.system(size: 6, weight: .bold))
                                .foregroundColor(.green)
                        }
                    } else {
                        Text("✓ DONE")
                            .font(.system(size: 8, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.green)
                            )
                    }
                }
            }
            
            // Enhanced progress indicator for executing tasks
            if question.isExecuting && question.totalSteps > 0 {
                VStack(spacing: 3) {
                    HStack {
                        Text("Overall Progress")
                            .font(.system(size: 7, weight: .medium))
                            .foregroundColor(.secondary)
                        
                        Spacer()
                        
                        Text("\(Int((Double(question.currentStep) / Double(question.totalSteps)) * 100))%")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundColor(.blue)
                    }
                    
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.blue.opacity(0.1))
                            .frame(height: 4)
                        
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.blue)
                            .frame(width: max(0, CGFloat(question.currentStep) / CGFloat(question.totalSteps) * 200), height: 4)
                            .animation(.easeInOut(duration: 0.3), value: question.currentStep)
                    }
                    .frame(maxWidth: 200)
                }
                .padding(.top, 2)
            }
        }
    }
    
    // Removed progressView - now integrated into taskHeader
    
    private var executionStepsView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Real-time Execution")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.secondary)
                
                Spacer()
                
                if question.isExecuting {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                            .scaleEffect(1.2)
                            .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: question.isExecuting)
                        
                        Text("Live")
                            .font(.system(size: 7, weight: .semibold))
                            .foregroundColor(.green)
                    }
                }
            }
            
            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    // Show loading indicator at top when adding new steps
                    if question.isLoadingSteps {
                        HStack(spacing: 8) {
                            ProgressView()
                                .scaleEffect(0.6)
                            
                            Text("Loading next step...")
                                .font(.system(size: 8, weight: .medium))
                                .foregroundColor(.blue)
                        }
                        .padding(.vertical, 4)
                        .transition(.opacity)
                    }
                    
                    ForEach(question.executionSteps.reversed()) { step in
                        executionStepRow(step)
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .top)),
                                removal: .opacity
                            ))
                    }
                }
            }
            .frame(maxHeight: .infinity)
            
            // Show total count for all steps
            if !question.executionSteps.isEmpty {
                HStack {
                    Spacer()
                    
                    Text("Total Steps: \(question.executionSteps.count)")
                        .font(.system(size: 7, weight: .medium))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.blue.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 3)
                                        .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                                )
                        )
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(question.isExecuting ? Color.blue.opacity(0.08) : Color.primary.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(question.isExecuting ? Color.blue.opacity(0.2) : Color.primary.opacity(0.1), lineWidth: 0.5)
                )
        )
        .animation(.easeInOut(duration: 0.3), value: question.executionSteps.count)
    }
    
    private func executionStepRow(_ step: ExecutionStep) -> some View {
        HStack(alignment: .top, spacing: 8) {
            // Enhanced status indicator
            ZStack {
                Circle()
                    .fill(step.type.color.opacity(0.15))
                    .frame(width: 16, height: 16)
                
                // Show spinner only for the currently active step
                if question.activeStepId == step.id.uuidString {
                    ProgressView()
                        .scaleEffect(0.5)
                        .foregroundColor(step.type.color)
                } else {
                    Image(systemName: step.type.icon)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(step.type.color)
                }
                
                // Pulsing animation for running steps
                if step.status == .running {
                    Circle()
                        .stroke(step.type.color, lineWidth: 1)
                        .frame(width: 16, height: 16)
                        .scaleEffect(1.3)
                        .opacity(0.6)
                        .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: step.status == .running)
                }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(step.title)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    // Status badge
                    HStack(spacing: 2) {
                        Circle()
                            .fill(statusColor(step.status))
                            .frame(width: 4, height: 4)
                        
                        Text(statusText(step.status))
                            .font(.system(size: 6, weight: .medium))
                            .foregroundColor(statusColor(step.status))
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(
                        RoundedRectangle(cornerRadius: 2)
                            .fill(statusColor(step.status).opacity(0.1))
                    )
                }
                
                if !step.details.isEmpty {
                    Text(step.details)
                        .font(.system(size: 7))
                        .foregroundColor(.secondary)
                        .lineLimit(step.type == .thinking ? nil : 3) // No line limit for LLM thinking steps
                        .textSelection(.enabled)
                }
                
                // Timestamp
                Text(DateFormatter.executionTimeFormatter.string(from: step.timestamp))
                    .font(.system(size: 6).monospaced())
                    .foregroundColor(.secondary.opacity(0.7))
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(step.type.color.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(step.type.color.opacity(0.1), lineWidth: 0.5)
                )
        )
    }
    
    private func statusColor(_ status: ExecutionStep.StepStatus) -> Color {
        switch status {
        case .running: return .blue
        case .completed: return .green
        case .error: return .red
        }
    }
    
    private func statusText(_ status: ExecutionStep.StepStatus) -> String {
        switch status {
        case .running: return "RUNNING"
        case .completed: return "DONE"
        case .error: return "ERROR"
        }
    }
    
    private var answerView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("💡 Answer:")
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.green)
            
            Text(question.answer)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.primary)
                .textSelection(.enabled)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.green.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.green.opacity(0.2), lineWidth: 0.5)
                        )
                )
        }
        .padding(.top, 4)
    }
    
    // Removed actionButtons view - no longer needed
    
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
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}

struct Question: Identifiable {
    let id = UUID()
    let text: String
    let category: String
    let confidence: Double
    var answer: String // Changed to var so it can be updated
    let needsRetry: Bool
    let timestamp: Date
    var executionSteps: [ExecutionStep] = []
    var isExecuting: Bool = false
    var currentStep: Int = 0
    var totalSteps: Int = 0
    var stepIds: Set<String> = [] // Track step IDs to prevent duplicates
    var isLoadingSteps: Bool = false // Show loading indicator
    var activeStepId: String? = nil // Track which step is currently active
    var taskStartTime: Date? = nil // Track when task started
    var taskEndTime: Date? = nil // Track when task ended
    
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
        case planning, navigation, validation, completed, error, analysis, thinking, progress, userInput
        
        var icon: String {
            switch self {
            case .planning: return "brain.head.profile"
            case .navigation: return "location.circle"
            case .validation: return "checkmark.circle"
            case .completed: return "checkmark.circle.fill"
            case .error: return "exclamationmark.triangle.fill"
            case .analysis: return "chart.bar.doc.horizontal"
            case .thinking: return "brain"
            case .progress: return "arrow.right.circle"
            case .userInput: return "person.crop.circle.badge.questionmark"
            }
        }
        
        var color: Color {
            switch self {
            case .planning: return .blue
            case .navigation: return .orange
            case .validation: return .purple
            case .completed: return .green 
            case .error: return .red
            case .analysis: return .cyan
            case .thinking: return .indigo
            case .progress: return .blue
            case .userInput: return .yellow
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