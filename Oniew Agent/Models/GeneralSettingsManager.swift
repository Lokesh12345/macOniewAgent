import Foundation
import Combine

struct GeneralSettingsConfig: Codable {
    var maxSteps: Int = 50
    var maxActionsPerStep: Int = 10
    var maxFailures: Int = 3
    var useVision: Bool = false
    var displayHighlights: Bool = true
    var planningInterval: Int = 5
    var minWaitPageLoad: Int = 1000
    var replayHistoricalTasks: Bool = false
}

class GeneralSettingsManager: ObservableObject {
    static let shared = GeneralSettingsManager()
    
    @Published var maxSteps: Int = 50 {
        didSet { saveSettings() }
    }
    
    @Published var maxActionsPerStep: Int = 10 {
        didSet { saveSettings() }
    }
    
    @Published var maxFailures: Int = 3 {
        didSet { saveSettings() }
    }
    
    @Published var useVision: Bool = false {
        didSet { 
            // When useVision is disabled, also disable displayHighlights
            if !useVision {
                displayHighlights = false
            }
            saveSettings() 
        }
    }
    
    @Published var displayHighlights: Bool = true {
        didSet { saveSettings() }
    }
    
    @Published var planningInterval: Int = 5 {
        didSet { saveSettings() }
    }
    
    @Published var minWaitPageLoad: Int = 1000 {
        didSet { saveSettings() }
    }
    
    @Published var replayHistoricalTasks: Bool = false {
        didSet { saveSettings() }
    }
    
    private var webSocketServer: WebSocketServer?
    private let userDefaults = UserDefaults.standard
    
    private init() {
        loadSettings()
    }
    
    func setWebSocketServer(_ server: WebSocketServer) {
        self.webSocketServer = server
    }
    
    private func loadSettings() {
        if let data = userDefaults.data(forKey: "general_settings"),
           let config = try? JSONDecoder().decode(GeneralSettingsConfig.self, from: data) {
            maxSteps = config.maxSteps
            maxActionsPerStep = config.maxActionsPerStep
            maxFailures = config.maxFailures
            useVision = config.useVision
            displayHighlights = config.displayHighlights
            planningInterval = config.planningInterval
            minWaitPageLoad = config.minWaitPageLoad
            replayHistoricalTasks = config.replayHistoricalTasks
        }
    }
    
    private func saveSettings() {
        let config = GeneralSettingsConfig(
            maxSteps: maxSteps,
            maxActionsPerStep: maxActionsPerStep,
            maxFailures: maxFailures,
            useVision: useVision,
            displayHighlights: displayHighlights,
            planningInterval: planningInterval,
            minWaitPageLoad: minWaitPageLoad,
            replayHistoricalTasks: replayHistoricalTasks
        )
        
        if let encoded = try? JSONEncoder().encode(config) {
            userDefaults.set(encoded, forKey: "general_settings")
        }
        
        // Sync with Chrome extension
        syncWithExtension()
    }
    
    private func syncWithExtension() {
        let settingsUpdate: [String: Any] = [
            "type": "general_settings_update",
            "data": [
                "maxSteps": maxSteps,
                "maxActionsPerStep": maxActionsPerStep,
                "maxFailures": maxFailures,
                "useVision": useVision,
                "displayHighlights": displayHighlights,
                "planningInterval": planningInterval,
                "minWaitPageLoad": minWaitPageLoad,
                "replayHistoricalTasks": replayHistoricalTasks
            ]
        ]
        
        webSocketServer?.sendMessage(settingsUpdate)
    }
    
    func resetToDefaults() {
        maxSteps = 50
        maxActionsPerStep = 10
        maxFailures = 3
        useVision = false
        displayHighlights = true
        planningInterval = 5
        minWaitPageLoad = 1000
        replayHistoricalTasks = false
    }
}