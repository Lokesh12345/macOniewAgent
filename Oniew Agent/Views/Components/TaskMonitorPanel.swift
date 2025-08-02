import SwiftUI

struct TaskExecutionStep: Identifiable {
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
            case .error: return "exclamationmark.triangle"
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

struct TaskMonitorPanel: View {
    @State private var currentTask: String = ""
    @State private var taskId: String = ""
    @State private var executionSteps: [TaskExecutionStep] = []
    @State private var isTaskRunning: Bool = false
    @State private var taskStartTime: Date?
    @State private var realtimeLogs: [String] = []
    @State private var currentStep: Int = 0
    @State private var totalSteps: Int = 100
    
    var body: some View {
        VStack(spacing: 0) {
            // Header with current task info
            TaskHeaderView(
                task: currentTask,
                isRunning: isTaskRunning,
                currentStep: currentStep,
                totalSteps: totalSteps,
                startTime: taskStartTime
            )
            
            ScrollView {
                LazyVStack(spacing: 12) {
                    // Execution Steps
                    ForEach(executionSteps) { step in
                        TaskStepView(step: step)
                    }
                    
                    // Real-time logs section
                    if !realtimeLogs.isEmpty {
                        LogsSection(logs: realtimeLogs)
                    }
                }
                .padding()
            }
        }
        .onAppear {
            setupEventListeners()
        }
    }
    
    private func setupEventListeners() {
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
        
        // Listen for new tasks
        NotificationCenter.default.addObserver(
            forName: Notification.Name("TaskStarted"),
            object: nil,
            queue: .main
        ) { notification in
            if let taskInfo = notification.userInfo as? [String: Any] {
                startNewTask(taskInfo)
            }
        }
    }
    
    private func handleExecutorEvent(_ event: [String: Any]) {
        print("🎬 TaskMonitor received executor event: \(event)")
        
        guard let state = event["state"] as? String else { return }
        
        switch state {
        case "TASK_START":
            handleTaskStart(event)
        case "STEP_START":
            handleStepStart(event)
        case "PLANNER_OUTPUT":
            handlePlannerOutput(event)
        case "NAVIGATOR_ACTION":
            handleNavigatorAction(event)
        case "VALIDATOR_OUTPUT":
            handleValidatorOutput(event)
        case "STEP_COMPLETE":
            handleStepComplete(event)
        case "TASK_OK", "TASK_COMPLETE":
            handleTaskComplete(event)
        case "TASK_FAIL":
            handleTaskFailed(event)
        case "TASK_CANCEL":
            handleTaskCanceled(event)
        default:
            addRealtimeLog("Unknown executor state: \(state)")
        }
    }
    
    private func startNewTask(_ taskInfo: [String: Any]) {
        currentTask = taskInfo["task"] as? String ?? "Unknown Task"
        taskId = taskInfo["taskId"] as? String ?? ""
        executionSteps.removeAll()
        realtimeLogs.removeAll()
        isTaskRunning = true
        taskStartTime = Date()
        currentStep = 0
        
        addRealtimeLog("🚀 Started task: \(currentTask)")
    }
    
    private func handleTaskStart(_ event: [String: Any]) {
        if let task = event["task"] as? String {
            currentTask = task
        }
        if let id = event["taskId"] as? String {
            taskId = id
        }
        
        isTaskRunning = true
        taskStartTime = Date()
        executionSteps.removeAll()
        realtimeLogs.removeAll()
        
        addRealtimeLog("🚀 Task execution started")
    }
    
    private func handleStepStart(_ event: [String: Any]) {
        if let step = event["step"] as? Int {
            currentStep = step
            addRealtimeLog("📍 Step \(step) started")
        }
        
        if let maxSteps = event["maxSteps"] as? Int {
            totalSteps = maxSteps
        }
    }
    
    private func handlePlannerOutput(_ event: [String: Any]) {
        guard let data = event["data"] as? [String: Any] else { return }
        
        let observation = data["observation"] as? String ?? "Planning..."
        let reasoning = data["reasoning"] as? String ?? ""
        let nextSteps = data["next_steps"] as? String ?? ""
        
        let step = TaskExecutionStep(
            stepNumber: currentStep,
            timestamp: Date(),
            type: .planning,
            title: "🧠 Planning Phase",
            details: "Observation: \(observation)\n\nReasoning: \(reasoning)\n\nNext Steps: \(nextSteps)",
            status: .completed
        )
        
        executionSteps.append(step)
        addRealtimeLog("🧠 Planner: \(observation)")
    }
    
    private func handleNavigatorAction(_ event: [String: Any]) {
        guard let data = event["data"] as? [String: Any] else { return }
        
        let actionType = data["action"] as? String ?? "Unknown Action"
        let details = data["details"] as? String ?? ""
        
        let step = TaskExecutionStep(
            stepNumber: currentStep,
            timestamp: Date(),
            type: .navigation,
            title: "🎯 Navigation Action",
            details: "Action: \(actionType)\n\nDetails: \(details)",
            status: .running
        )
        
        executionSteps.append(step)
        addRealtimeLog("🎯 Action: \(actionType)")
    }
    
    private func handleValidatorOutput(_ event: [String: Any]) {
        guard let data = event["data"] as? [String: Any] else { return }
        
        let isValid = data["is_valid"] as? Bool ?? false
        let reason = data["reason"] as? String ?? ""
        let answer = data["answer"] as? String ?? ""
        
        let step = TaskExecutionStep(
            stepNumber: currentStep,
            timestamp: Date(),
            type: .validation,
            title: isValid ? "✅ Validation Passed" : "❌ Validation Failed",
            details: "Result: \(isValid ? "Valid" : "Invalid")\n\nReason: \(reason)\n\nAnswer: \(answer)",
            status: isValid ? .completed : .error
        )
        
        executionSteps.append(step)
        addRealtimeLog("✅ Validation: \(reason)")
    }
    
    private func handleStepComplete(_ event: [String: Any]) {
        // Mark the last step as completed
        if let lastIndex = executionSteps.indices.last {
            executionSteps[lastIndex] = TaskExecutionStep(
                stepNumber: executionSteps[lastIndex].stepNumber,
                timestamp: executionSteps[lastIndex].timestamp,
                type: executionSteps[lastIndex].type,
                title: executionSteps[lastIndex].title,
                details: executionSteps[lastIndex].details,
                status: .completed
            )
        }
        
        addRealtimeLog("✅ Step \(currentStep) completed")
    }
    
    private func handleTaskComplete(_ event: [String: Any]) {
        isTaskRunning = false
        
        let completionStep = TaskExecutionStep(
            stepNumber: currentStep,
            timestamp: Date(),
            type: .completed,
            title: "🎉 Task Completed Successfully",
            details: "Task '\(currentTask)' has been completed successfully!",
            status: .completed
        )
        
        executionSteps.append(completionStep)
        addRealtimeLog("🎉 Task completed successfully!")
    }
    
    private func handleTaskFailed(_ event: [String: Any]) {
        isTaskRunning = false
        
        let error = event["error"] as? String ?? "Unknown error"
        
        let errorStep = TaskExecutionStep(
            stepNumber: currentStep,
            timestamp: Date(),
            type: .error,
            title: "❌ Task Failed",
            details: "Error: \\(error)",
            status: .error
        )
        
        executionSteps.append(errorStep)
        addRealtimeLog("❌ Task failed: \(error)")
    }
    
    private func handleTaskCanceled(_ event: [String: Any]) {
        isTaskRunning = false
        addRealtimeLog("⏹️ Task was canceled")
    }
    
    private func addRealtimeLog(_ message: String) {
        let timestamp = DateFormatter.timeFormatter.string(from: Date())
        realtimeLogs.append("[\(timestamp)] \(message)")
        
        // Keep only last 50 logs
        if realtimeLogs.count > 50 {
            realtimeLogs.removeFirst()
        }
    }
}

struct TaskHeaderView: View {
    let task: String
    let isRunning: Bool
    let currentStep: Int
    let totalSteps: Int
    let startTime: Date?
    
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current Task")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(task.isEmpty ? "No active task" : task)
                        .font(.headline)
                        .foregroundColor(.primary)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(isRunning ? Color.green : Color.gray)
                            .frame(width: 6, height: 6)
                        Text(isRunning ? "Running" : "Idle")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    if let startTime = startTime {
                        Text("Started: \(DateFormatter.timeFormatter.string(from: startTime))")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            if isRunning && totalSteps > 0 {
                VStack(spacing: 4) {
                    HStack {
                        Text("Progress")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("\(currentStep) / \(totalSteps)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    ProgressView(value: Double(currentStep), total: Double(totalSteps))
                        .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                }
            }
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(NSColor.separatorColor)),
            alignment: .bottom
        )
    }
}

struct TaskStepView: View {
    let step: TaskExecutionStep
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Step indicator
            VStack {
                Image(systemName: step.type.icon)
                    .foregroundColor(step.type.color)
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 24, height: 24)
                    .background(
                        Circle()
                            .fill(step.type.color.opacity(0.1))
                            .frame(width: 32, height: 32)
                    )
                
                if step.status == .running {
                    Rectangle()
                        .fill(step.type.color.opacity(0.3))
                        .frame(width: 2, height: 20)
                }
            }
            
            // Step content
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(step.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Text(DateFormatter.timeFormatter.string(from: step.timestamp))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                
                if !step.details.isEmpty {
                    Text(step.details)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 4)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(NSColor.controlBackgroundColor).opacity(0.5))
        )
    }
}

struct LogsSection: View {
    let logs: [String]
    
    private var recentLogs: [String] {
        Array(logs.suffix(20))
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            logsHeader
            logsContent
        }
        .padding(.top)
    }
    
    private var logsHeader: some View {
        Text("Real-time Logs")
            .font(.headline)
            .foregroundColor(.primary)
    }
    
    private var logsContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(recentLogs.indices, id: \.self) { index in
                    logRow(recentLogs[index])
                }
            }
            .padding(8)
        }
        .frame(maxHeight: 200)
        .background(logsBackground)
    }
    
    private func logRow(_ log: String) -> some View {
        Text(log)
            .font(.system(size: 10).monospaced())
            .foregroundColor(.secondary)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
    }
    
    private var logsBackground: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Color.black.opacity(0.05))
    }
}

extension DateFormatter {
    static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}