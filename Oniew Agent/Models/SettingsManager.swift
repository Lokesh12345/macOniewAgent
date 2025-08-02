import Foundation
import Combine

// Mirror the types from the Chrome extension
enum ProviderTypeEnum: String, CaseIterable {
    case openai = "openai"
    case anthropic = "anthropic"
    case deepseek = "deepseek"
    case gemini = "gemini"
    case grok = "grok"
    case ollama = "ollama"
    case azureOpenAI = "azure_openai"
    case openRouter = "openrouter"
    case groq = "groq"
    case cerebras = "cerebras"
    case llama = "llama"
    case customOpenAI = "custom_openai"
}

enum AgentNameEnum: String, CaseIterable {
    case planner = "planner"
    case navigator = "navigator"
    case validator = "validator"
}

struct ProviderConfig: Codable {
    var name: String?
    var type: ProviderTypeEnum?
    var apiKey: String
    var baseUrl: String?
    var modelNames: [String]?
    var createdAt: TimeInterval?
    var azureDeploymentNames: [String]?
    var azureApiVersion: String?
    
    enum CodingKeys: String, CodingKey {
        case name, type, apiKey, baseUrl, modelNames, createdAt, azureDeploymentNames, azureApiVersion
    }
    
    init(name: String? = nil, type: ProviderTypeEnum? = nil, apiKey: String, baseUrl: String? = nil, modelNames: [String]? = nil, createdAt: TimeInterval? = nil, azureDeploymentNames: [String]? = nil, azureApiVersion: String? = nil) {
        self.name = name
        self.type = type
        self.apiKey = apiKey
        self.baseUrl = baseUrl
        self.modelNames = modelNames
        self.createdAt = createdAt
        self.azureDeploymentNames = azureDeploymentNames
        self.azureApiVersion = azureApiVersion
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        if let typeString = try container.decodeIfPresent(String.self, forKey: .type) {
            type = ProviderTypeEnum(rawValue: typeString)
        }
        apiKey = try container.decode(String.self, forKey: .apiKey)
        baseUrl = try container.decodeIfPresent(String.self, forKey: .baseUrl)
        modelNames = try container.decodeIfPresent([String].self, forKey: .modelNames)
        createdAt = try container.decodeIfPresent(TimeInterval.self, forKey: .createdAt)
        azureDeploymentNames = try container.decodeIfPresent([String].self, forKey: .azureDeploymentNames)
        azureApiVersion = try container.decodeIfPresent(String.self, forKey: .azureApiVersion)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(type?.rawValue, forKey: .type)
        try container.encode(apiKey, forKey: .apiKey)
        try container.encodeIfPresent(baseUrl, forKey: .baseUrl)
        try container.encodeIfPresent(modelNames, forKey: .modelNames)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(azureDeploymentNames, forKey: .azureDeploymentNames)
        try container.encodeIfPresent(azureApiVersion, forKey: .azureApiVersion)
    }
}

struct AgentModelConfig: Codable {
    let provider: String
    let modelName: String
    let parameters: ModelParameters?
    let reasoningEffort: String?
}

struct ModelParameters: Codable {
    let temperature: Double
    let topP: Double
}

class SettingsManager: ObservableObject {
    static let shared = SettingsManager()
    
    @Published var providers: [String: ProviderConfig] = [:]
    @Published var agentModels: [AgentNameEnum: AgentModelConfig] = [:]
    
    private var webSocketServer: WebSocketServer?
    private let userDefaults = UserDefaults.standard
    
    // Default model names for each provider
    private let defaultModelNames: [ProviderTypeEnum: [String]] = [
        .openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini", "o3"],
        .anthropic: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
        .deepseek: ["deepseek-chat", "deepseek-reasoner"],
        .gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
        .grok: ["grok-3", "grok-3-fast", "grok-3-mini", "grok-3-mini-fast"],
        .ollama: ["qwen3:14b", "falcon3:10b", "qwen2.5-coder:14b", "mistral-small:24b"],
        .groq: ["llama-3.3-70b-versatile"],
        .cerebras: ["llama-3.3-70b"],
        .llama: ["Llama-3.3-70B-Instruct", "Llama-3.3-8B-Instruct", "Llama-4-Maverick-17B-128E-Instruct-FP8", "Llama-4-Scout-17B-16E-Instruct-FP8"]
    ]
    
    private init() {
        loadSettings()
    }
    
    func setWebSocketServer(_ server: WebSocketServer) {
        self.webSocketServer = server
    }
    
    private func loadSettings() {
        // Load providers from UserDefaults
        if let data = userDefaults.data(forKey: "llm_providers"),
           let decoded = try? JSONDecoder().decode([String: ProviderConfig].self, from: data) {
            self.providers = decoded
        }
        
        // Load agent models from UserDefaults
        if let data = userDefaults.data(forKey: "agent_models"),
           let decoded = try? JSONDecoder().decode([String: AgentModelConfig].self, from: data) {
            self.agentModels = decoded.compactMapKeys { AgentNameEnum(rawValue: $0) }
        }
    }
    
    func saveSettings() {
        // Save providers
        if let encoded = try? JSONEncoder().encode(providers) {
            userDefaults.set(encoded, forKey: "llm_providers")
        }
        
        // Save agent models
        let agentModelsDict = Dictionary(uniqueKeysWithValues: agentModels.map { ($0.key.rawValue, $0.value) })
        if let encoded = try? JSONEncoder().encode(agentModelsDict) {
            userDefaults.set(encoded, forKey: "agent_models")
        }
        
        // Sync with Chrome extension
        syncWithExtension()
    }
    
    private func saveSettingsInternal() {
        saveSettings()
    }
    
    func addProvider(type: ProviderTypeEnum) {
        let providerId = type.rawValue
        let defaultModels = defaultModelNames[type]
        print("🔍 Debug: Adding provider \(providerId) with default models: \(defaultModels ?? [])")
        
        let config = ProviderConfig(
            name: getDisplayName(for: type),
            type: type,
            apiKey: type == .ollama ? "local" : "", // Set "local" for Ollama to indicate no API key needed
            baseUrl: type == .ollama ? "http://localhost:11434" : nil,
            modelNames: defaultModels,
            createdAt: Date().timeIntervalSince1970
        )
        
        providers[providerId] = config
        print("🔍 Debug: Provider added. Current providers: \(providers.keys)")
        saveSettings()
        
        // Fetch Ollama models if it's an Ollama provider
        if type == .ollama {
            fetchOllamaModels(for: providerId)
        }
    }
    
    func fetchOllamaModels(for providerId: String) {
        Task {
            do {
                let models = try await getOllamaModels()
                await MainActor.run {
                    if var provider = providers[providerId] {
                        provider.modelNames = models.isEmpty ? defaultModelNames[.ollama] : models
                        providers[providerId] = provider
                        saveSettings()
                    }
                }
            } catch {
                print("Failed to fetch Ollama models: \(error)")
                // Keep default models on error
            }
        }
    }
    
    private func getOllamaModels() async throws -> [String] {
        let process = Process()
        
        // Try common Ollama installation paths
        let possiblePaths = [
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            "/usr/bin/ollama",
            "/Applications/Ollama.app/Contents/Resources/ollama"
        ]
        
        var ollamaPath: String?
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path) {
                ollamaPath = path
                break
            }
        }
        
        guard let validPath = ollamaPath else {
            throw NSError(domain: "OllamaError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Ollama not found"])
        }
        
        process.executableURL = URL(fileURLWithPath: validPath)
        process.arguments = ["list"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        try process.run()
        process.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""
        
        guard process.terminationStatus == 0 else {
            throw NSError(domain: "OllamaError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to list Ollama models"])
        }
        
        return parseOllamaModels(from: output)
    }
    
    private func parseOllamaModels(from output: String) -> [String] {
        let lines = output.components(separatedBy: .newlines)
        var models: [String] = []
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty && !trimmed.starts(with: "NAME") {
                // Extract model name (first column before whitespace)
                let components = trimmed.components(separatedBy: .whitespaces)
                if let modelName = components.first, !modelName.isEmpty {
                    models.append(modelName)
                }
            }
        }
        
        return models
    }
    
    func updateProviderModels(_ providerId: String, selectedModels: [String]) {
        if var provider = providers[providerId] {
            provider.modelNames = selectedModels
            providers[providerId] = provider
            saveSettings()
        }
    }
    
    func getSelectedModelsForAgents() -> [(providerId: String, modelName: String, displayName: String)] {
        var models: [(String, String, String)] = []
        
        for (providerId, provider) in providers {
            // For cloud providers, check API key. For local providers (Ollama), skip API key check
            let needsApiKey = provider.type != .ollama
            guard !needsApiKey || (!provider.apiKey.isEmpty && provider.apiKey != "") else { continue }
            
            // Only include models that have been selected/configured for this provider
            if let modelNames = provider.modelNames, !modelNames.isEmpty {
                for model in modelNames {
                    let displayName = "\(provider.name ?? providerId) > \(model)"
                    models.append((providerId, model, displayName))
                }
            }
        }
        
        return models.sorted(by: { $0.2 < $1.2 })
    }
    
    func updateProvider(_ providerId: String, config: ProviderConfig) {
        providers[providerId] = config
        saveSettings()
    }
    
    func removeProvider(_ providerId: String) {
        providers.removeValue(forKey: providerId)
        
        // Remove any agent models using this provider
        for (agent, config) in agentModels {
            if config.provider == providerId {
                agentModels.removeValue(forKey: agent)
            }
        }
        
        saveSettings()
    }
    
    func setAgentModel(_ agent: AgentNameEnum, provider: String, modelName: String) {
        let parameters = getDefaultParameters(for: provider, agent: agent)
        let config = AgentModelConfig(
            provider: provider,
            modelName: modelName,
            parameters: parameters,
            reasoningEffort: nil
        )
        
        agentModels[agent] = config
        saveSettings()
    }
    
    private func getDisplayName(for type: ProviderTypeEnum) -> String {
        switch type {
        case .openai: return "OpenAI"
        case .anthropic: return "Anthropic"
        case .deepseek: return "DeepSeek"
        case .gemini: return "Gemini"
        case .grok: return "Grok"
        case .ollama: return "Ollama"
        case .azureOpenAI: return "Azure OpenAI"
        case .openRouter: return "OpenRouter"
        case .groq: return "Groq"
        case .cerebras: return "Cerebras"
        case .llama: return "Llama"
        case .customOpenAI: return "Custom OpenAI"
        }
    }
    
    private func getDefaultParameters(for provider: String, agent: AgentNameEnum) -> ModelParameters {
        // Default parameters based on provider and agent type
        switch agent {
        case .planner:
            return ModelParameters(temperature: 0.7, topP: 0.9)
        case .navigator:
            return ModelParameters(temperature: 0.3, topP: 0.85)
        case .validator:
            return ModelParameters(temperature: 0.1, topP: 0.8)
        }
    }
    
    private func syncWithExtension() {
        // Send settings update to Chrome extension via WebSocket
        print("🔄 SettingsManager: Syncing \(agentModels.count) agent models with extension")
        for (agent, config) in agentModels {
            print("   Agent \(agent.rawValue): \(config.provider) > \(config.modelName) (temp: \(config.parameters?.temperature ?? 0), topP: \(config.parameters?.topP ?? 0))")
        }
        
        let settingsUpdate: [String: Any] = [
            "type": "settings_update",
            "data": [
                "providers": providers.mapValues { provider in
                    var dict: [String: Any] = [
                        "apiKey": provider.apiKey
                    ]
                    if let name = provider.name { dict["name"] = name }
                    if let type = provider.type { dict["type"] = type.rawValue }
                    if let baseUrl = provider.baseUrl { dict["baseUrl"] = baseUrl }
                    if let modelNames = provider.modelNames { dict["modelNames"] = modelNames }
                    if let createdAt = provider.createdAt { dict["createdAt"] = createdAt }
                    return dict
                },
                "agentModels": agentModels.mapValues { config in
                    var dict: [String: Any] = [
                        "provider": config.provider,
                        "modelName": config.modelName
                    ]
                    if let params = config.parameters {
                        dict["parameters"] = [
                            "temperature": params.temperature,
                            "topP": params.topP
                        ]
                    }
                    if let reasoningEffort = config.reasoningEffort {
                        dict["reasoningEffort"] = reasoningEffort
                    }
                    return dict
                }.mapKeys { $0.rawValue }
            ]
        ]
        
        webSocketServer?.sendMessage(settingsUpdate)
    }
}

// Helper extension to map dictionary keys
extension Dictionary {
    func mapKeys<T: Hashable>(_ transform: (Key) throws -> T) rethrows -> Dictionary<T, Value> {
        try Dictionary<T, Value>(uniqueKeysWithValues: map { (try transform($0.key), $0.value) })
    }
    
    func compactMapKeys<T: Hashable>(_ transform: (Key) throws -> T?) rethrows -> Dictionary<T, Value> {
        try Dictionary<T, Value>(uniqueKeysWithValues: compactMap { element in
            if let key = try transform(element.key) {
                return (key, element.value)
            }
            return nil
        })
    }
}