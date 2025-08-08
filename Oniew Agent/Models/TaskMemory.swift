import Foundation

// MARK: - Task Memory Models

struct TaskStep: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let type: TaskStepType
    let description: String
    let screenshot: String? // Base64 screenshot data
    let actions: [TaskAction]
    let result: TaskStepResult
    let notes: String?
    
    init(timestamp: Date, type: TaskStepType, description: String, screenshot: String? = nil, actions: [TaskAction] = [], result: TaskStepResult, notes: String? = nil) {
        self.id = UUID()
        self.timestamp = timestamp
        self.type = type
        self.description = description
        self.screenshot = screenshot
        self.actions = actions
        self.result = result
        self.notes = notes
    }
    
    enum TaskStepType: String, Codable {
        case screenshot = "screenshot"
        case analysis = "analysis"
        case action = "action"
        case validation = "validation"
        case navigation = "navigation"
        case completion = "completion"
    }
    
    enum TaskStepResult: String, Codable {
        case success = "success"
        case failure = "failure"
        case partial = "partial"
        case pending = "pending"
    }
}

struct TaskAction: Identifiable, Codable {
    let id: UUID
    let type: ActionType
    let target: String // CSS selector, coordinates, or URL
    let value: String? // Text to input or other values
    let executed: Bool
    let success: Bool
    
    init(type: ActionType, target: String, value: String? = nil, executed: Bool = false, success: Bool = false) {
        self.id = UUID()
        self.type = type
        self.target = target
        self.value = value
        self.executed = executed
        self.success = success
    }
    
    enum ActionType: String, Codable, CaseIterable {
        case click = "click"
        case type = "type"
        case scroll = "scroll"
        case navigate = "navigate"
        case wait = "wait"
        case hover = "hover"
        case select = "select"
        case screenshot = "screenshot"
    }
}

struct TaskSession: Identifiable, Codable {
    let id: UUID
    let startTime: Date
    var endTime: Date?
    let originalTask: String
    var currentContext: String
    var steps: [TaskStep]
    var status: TaskStatus
    let website: String?
    var learnings: [String] // Key insights from this session
    
    init(startTime: Date, originalTask: String, website: String? = nil) {
        self.id = UUID()
        self.startTime = startTime
        self.endTime = nil
        self.originalTask = originalTask
        self.currentContext = originalTask
        self.steps = []
        self.status = .active
        self.website = website
        self.learnings = []
    }
    
    // Custom Codable implementation
    private enum CodingKeys: String, CodingKey {
        case id, startTime, endTime, originalTask, currentContext, steps, status, website, learnings
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(UUID.self, forKey: .id)
        self.startTime = try container.decode(Date.self, forKey: .startTime)
        self.endTime = try container.decodeIfPresent(Date.self, forKey: .endTime)
        self.originalTask = try container.decode(String.self, forKey: .originalTask)
        self.currentContext = try container.decode(String.self, forKey: .currentContext)
        self.steps = try container.decode([TaskStep].self, forKey: .steps)
        self.status = try container.decode(TaskStatus.self, forKey: .status)
        self.website = try container.decodeIfPresent(String.self, forKey: .website)
        self.learnings = try container.decode([String].self, forKey: .learnings)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(startTime, forKey: .startTime)
        try container.encodeIfPresent(endTime, forKey: .endTime)
        try container.encode(originalTask, forKey: .originalTask)
        try container.encode(currentContext, forKey: .currentContext)
        try container.encode(steps, forKey: .steps)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(website, forKey: .website)
        try container.encode(learnings, forKey: .learnings)
    }
    
    enum TaskStatus: String, Codable {
        case active = "active"
        case completed = "completed"
        case failed = "failed"
        case paused = "paused"
    }
    
    var duration: TimeInterval? {
        guard let endTime = endTime else { return nil }
        return endTime.timeIntervalSince(startTime)
    }
    
    var successfulActions: [TaskAction] {
        steps.flatMap { $0.actions }.filter { $0.success }
    }
    
    var lastScreenshot: String? {
        steps.last?.screenshot
    }
    
    mutating func addStep(_ step: TaskStep) {
        steps.append(step)
        
        // Update context based on step
        if step.type == .analysis && !step.description.isEmpty {
            currentContext = step.description
        }
        
        // Auto-complete if certain completion patterns are detected
        if step.type == .completion || 
           (step.type == .validation && step.result == .success && step.description.lowercased().contains("task completed")) {
            status = .completed
            endTime = Date()
        }
    }
    
    mutating func addLearning(_ learning: String) {
        if !learnings.contains(learning) {
            learnings.append(learning)
        }
    }
    
    func getMemoryContext() -> String {
        var context = "=== TASK MEMORY CONTEXT ===\n"
        context += "Original Task: \(originalTask)\n"
        context += "Current Status: \(status.rawValue)\n"
        context += "Steps Completed: \(steps.count)\n"
        
        if let website = website {
            context += "Website: \(website)\n"
        }
        
        if !currentContext.isEmpty {
            context += "Current Context: \(currentContext)\n"
        }
        
        context += "\n=== RECENT STEPS ===\n"
        let recentSteps = steps.suffix(5) // Last 5 steps
        for (index, step) in recentSteps.enumerated() {
            context += "\(index + 1). [\(step.type.rawValue.uppercased())] \(step.description)\n"
            if !step.actions.isEmpty {
                context += "   Actions: \(step.actions.map { "\($0.type.rawValue)(\($0.target))" }.joined(separator: ", "))\n"
            }
            context += "   Result: \(step.result.rawValue)\n"
        }
        
        if !learnings.isEmpty {
            context += "\n=== LEARNINGS ===\n"
            for learning in learnings {
                context += "• \(learning)\n"
            }
        }
        
        let successfulActionPatterns = successfulActions.map { "\($0.type.rawValue):\($0.target)" }
        if !successfulActionPatterns.isEmpty {
            context += "\n=== SUCCESSFUL PATTERNS ===\n"
            let uniquePatterns = Array(Set(successfulActionPatterns)).prefix(10)
            for pattern in uniquePatterns {
                context += "• \(pattern)\n"
            }
        }
        
        context += "\n=========================="
        return context
    }
}

// MARK: - Memory Configuration
struct MemoryConfig: Codable {
    var maxSessionsInMemory: Int = 10
    var maxStepsPerSession: Int = 50
    var contextWindowSize: Int = 5 // Number of recent steps to include in context
    var enableLearning: Bool = true
    var persistMemory: Bool = true
    var autoCompleteOnSuccess: Bool = true
    
    static let `default` = MemoryConfig()
}