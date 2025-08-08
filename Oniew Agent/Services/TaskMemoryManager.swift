import Foundation
import SwiftUI

class TaskMemoryManager: ObservableObject {
    @Published var currentSession: TaskSession?
    @Published var recentSessions: [TaskSession] = []
    @Published var memoryConfig = MemoryConfig.default
    
    private let userDefaults = UserDefaults.standard
    private let memoryKey = "VL_TaskMemory"
    private let configKey = "VL_MemoryConfig"
    
    init() {
        loadMemoryConfig()
        loadRecentSessions()
    }
    
    // MARK: - Session Management
    
    func startNewSession(task: String, website: String? = nil) {
        // End current session if active
        if var session = currentSession, session.status == .active {
            session.status = .paused
            session.endTime = Date()
            saveSession(session)
        }
        
        // Create new session
        let newSession = TaskSession(
            startTime: Date(),
            originalTask: task,
            website: website
        )
        
        currentSession = newSession
        print("🧠 Started new task session: \(task)")
    }
    
    func addStep(_ step: TaskStep) {
        guard var session = currentSession else {
            print("⚠️ No active session to add step to")
            return
        }
        
        session.addStep(step)
        currentSession = session
        
        // Auto-save session
        if memoryConfig.persistMemory {
            saveSession(session)
        }
        
        // Trim steps if too many
        if session.steps.count > memoryConfig.maxStepsPerSession {
            session.steps = Array(session.steps.suffix(memoryConfig.maxStepsPerSession))
            currentSession = session
        }
        
        print("🧠 Added step to memory: \(step.type.rawValue) - \(step.description)")
    }
    
    func addLearning(_ learning: String) {
        guard var session = currentSession else { return }
        session.addLearning(learning)
        currentSession = session
        
        if memoryConfig.persistMemory {
            saveSession(session)
        }
        
        print("🎓 Added learning: \(learning)")
    }
    
    func completeCurrentSession(success: Bool = true) {
        guard var session = currentSession else { return }
        
        session.status = success ? .completed : .failed
        session.endTime = Date()
        
        // Add completion step
        let completionStep = TaskStep(
            timestamp: Date(),
            type: .completion,
            description: success ? "Task completed successfully" : "Task failed",
            screenshot: session.lastScreenshot,
            actions: [],
            result: success ? .success : .failure,
            notes: nil
        )
        session.addStep(completionStep)
        
        saveSession(session)
        currentSession = nil
        
        print("🧠 Completed session: \(session.originalTask) - Success: \(success)")
    }
    
    func pauseCurrentSession() {
        guard var session = currentSession else { return }
        session.status = .paused
        session.endTime = Date()
        saveSession(session)
        currentSession = nil
        
        print("⏸️ Paused session: \(session.originalTask)")
    }
    
    // MARK: - Memory Context
    
    func getMemoryContext() -> String? {
        guard let session = currentSession else { return nil }
        return session.getMemoryContext()
    }
    
    func getContextForPrompt() -> String {
        guard let session = currentSession else { return "" }
        
        var prompt = "\n\n=== TASK MEMORY ===\n"
        prompt += "You are continuing a task. Here's what has happened so far:\n\n"
        prompt += session.getMemoryContext()
        prompt += "\n\nUse this context to make informed decisions. Don't repeat failed actions and build on successful ones.\n"
        prompt += "========================\n\n"
        
        return prompt
    }
    
    // MARK: - Persistence
    
    private func saveSession(_ session: TaskSession) {
        // Add to recent sessions
        if let index = recentSessions.firstIndex(where: { $0.id == session.id }) {
            recentSessions[index] = session
        } else {
            recentSessions.insert(session, at: 0)
        }
        
        // Trim recent sessions
        if recentSessions.count > memoryConfig.maxSessionsInMemory {
            recentSessions = Array(recentSessions.prefix(memoryConfig.maxSessionsInMemory))
        }
        
        // Save to UserDefaults
        if memoryConfig.persistMemory {
            saveRecentSessions()
        }
    }
    
    private func saveRecentSessions() {
        do {
            let data = try JSONEncoder().encode(recentSessions)
            userDefaults.set(data, forKey: memoryKey)
            print("💾 Saved \(recentSessions.count) sessions to memory")
        } catch {
            print("❌ Failed to save sessions: \(error)")
        }
    }
    
    private func loadRecentSessions() {
        guard let data = userDefaults.data(forKey: memoryKey) else { return }
        
        do {
            recentSessions = try JSONDecoder().decode([TaskSession].self, from: data)
            print("📚 Loaded \(recentSessions.count) sessions from memory")
        } catch {
            print("❌ Failed to load sessions: \(error)")
            recentSessions = []
        }
    }
    
    private func saveMemoryConfig() {
        do {
            let data = try JSONEncoder().encode(memoryConfig)
            userDefaults.set(data, forKey: configKey)
        } catch {
            print("❌ Failed to save memory config: \(error)")
        }
    }
    
    private func loadMemoryConfig() {
        guard let data = userDefaults.data(forKey: configKey) else { return }
        
        do {
            memoryConfig = try JSONDecoder().decode(MemoryConfig.self, from: data)
        } catch {
            print("❌ Failed to load memory config: \(error)")
            memoryConfig = MemoryConfig.default
        }
    }
    
    // MARK: - Analytics
    
    func getSessionStats() -> (total: Int, completed: Int, failed: Int, avgDuration: TimeInterval?) {
        let total = recentSessions.count
        let completed = recentSessions.filter { $0.status == .completed }.count
        let failed = recentSessions.filter { $0.status == .failed }.count
        
        let completedSessions = recentSessions.filter { $0.status == .completed && $0.duration != nil }
        let avgDuration = completedSessions.isEmpty ? nil : 
            completedSessions.compactMap { $0.duration }.reduce(0, +) / Double(completedSessions.count)
        
        return (total, completed, failed, avgDuration)
    }
    
    func getMostSuccessfulActions() -> [TaskAction.ActionType: Int] {
        var actionCounts: [TaskAction.ActionType: Int] = [:]
        
        for session in recentSessions where session.status == .completed {
            for action in session.successfulActions {
                actionCounts[action.type, default: 0] += 1
            }
        }
        
        return actionCounts
    }
    
    func getCommonFailurePatterns() -> [String] {
        let failedSessions = recentSessions.filter { $0.status == .failed }
        var patterns: [String] = []
        
        for session in failedSessions {
            let failedSteps = session.steps.filter { $0.result == .failure }
            for step in failedSteps {
                patterns.append(step.description)
            }
        }
        
        // Return unique patterns
        return Array(Set(patterns)).sorted()
    }
    
    // MARK: - Memory Management
    
    func clearAllMemory() {
        recentSessions.removeAll()
        currentSession = nil
        userDefaults.removeObject(forKey: memoryKey)
        print("🗑️ Cleared all task memory")
    }
    
    func clearSession(_ sessionId: UUID) {
        recentSessions.removeAll { $0.id == sessionId }
        if currentSession?.id == sessionId {
            currentSession = nil
        }
        saveRecentSessions()
    }
    
    func updateConfig(_ config: MemoryConfig) {
        memoryConfig = config
        saveMemoryConfig()
        
        // Apply config changes
        if recentSessions.count > config.maxSessionsInMemory {
            recentSessions = Array(recentSessions.prefix(config.maxSessionsInMemory))
            saveRecentSessions()
        }
    }
    
    // MARK: - Helper Methods
    
    func createScreenshotStep(screenshot: String, analysis: String) -> TaskStep {
        return TaskStep(
            timestamp: Date(),
            type: .screenshot,
            description: "Captured screenshot for analysis",
            screenshot: screenshot,
            actions: [],
            result: .success,
            notes: analysis.isEmpty ? nil : analysis
        )
    }
    
    func createAnalysisStep(analysis: String, actions: [TaskAction]) -> TaskStep {
        return TaskStep(
            timestamp: Date(),
            type: .analysis,
            description: analysis,
            screenshot: nil,
            actions: actions,
            result: actions.isEmpty ? .failure : .pending,
            notes: nil
        )
    }
    
    func createActionStep(description: String, actions: [TaskAction], success: Bool) -> TaskStep {
        return TaskStep(
            timestamp: Date(),
            type: .action,
            description: description,
            screenshot: nil,
            actions: actions,
            result: success ? .success : .failure,
            notes: nil
        )
    }
}