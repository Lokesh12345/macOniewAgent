import Foundation
import SwiftUI

enum VLModelProvider: String, CaseIterable, Codable {
    case openai = "openai"
    case anthropic = "anthropic" 
    case google = "google"
    case ollama = "ollama"
    
    var displayName: String {
        switch self {
        case .openai: return "OpenAI"
        case .anthropic: return "Anthropic"
        case .google: return "Google"
        case .ollama: return "Ollama"
        }
    }
    
    var requiresApiKey: Bool {
        switch self {
        case .ollama: return false
        default: return true
        }
    }
    
    var baseURL: String {
        switch self {
        case .openai: return "https://api.openai.com/v1/chat/completions"
        case .anthropic: return "https://api.anthropic.com/v1/messages"
        case .google: return "https://generativelanguage.googleapis.com/v1beta/models"
        case .ollama: return "http://localhost:11434/api/chat"
        }
    }
}

struct VLModel: Identifiable, Codable, Hashable {
    let id: UUID
    let name: String
    let displayName: String
    let provider: VLModelProvider
    let supportsVision: Bool
    let isLocal: Bool
    
    init(name: String, displayName: String, provider: VLModelProvider, supportsVision: Bool = true, isLocal: Bool = false) {
        self.id = UUID()
        self.name = name
        self.displayName = displayName
        self.provider = provider
        self.supportsVision = supportsVision
        self.isLocal = isLocal
    }
    
    // Custom coding keys and implementations for Codable
    private enum CodingKeys: String, CodingKey {
        case id, name, displayName, provider, supportsVision, isLocal
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(UUID.self, forKey: .id)
        self.name = try container.decode(String.self, forKey: .name)
        self.displayName = try container.decode(String.self, forKey: .displayName)
        self.provider = try container.decode(VLModelProvider.self, forKey: .provider)
        self.supportsVision = try container.decode(Bool.self, forKey: .supportsVision)
        self.isLocal = try container.decode(Bool.self, forKey: .isLocal)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(displayName, forKey: .displayName)
        try container.encode(provider, forKey: .provider)
        try container.encode(supportsVision, forKey: .supportsVision)
        try container.encode(isLocal, forKey: .isLocal)
    }
    
    static let defaultModels: [VLModel] = [
        // OpenAI Models
        VLModel(name: "gpt-4o", displayName: "GPT-4o (Vision)", provider: .openai),
        VLModel(name: "gpt-4o-mini", displayName: "GPT-4o Mini (Vision)", provider: .openai),
        VLModel(name: "gpt-4-vision-preview", displayName: "GPT-4 Vision Preview", provider: .openai),
        
        // Anthropic Models
        VLModel(name: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet", provider: .anthropic),
        VLModel(name: "claude-3-opus-20240229", displayName: "Claude 3 Opus", provider: .anthropic),
        VLModel(name: "claude-3-haiku-20240307", displayName: "Claude 3 Haiku", provider: .anthropic),
        
        // Google Models
        VLModel(name: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", provider: .google),
        VLModel(name: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", provider: .google),
        VLModel(name: "gemini-pro-vision", displayName: "Gemini Pro Vision", provider: .google),
    ]
}

class VLSettingsManager: ObservableObject {
    @Published var selectedModel: VLModel
    @Published var availableModels: [VLModel]
    @Published var ollamaModels: [VLModel] = []
    
    // API Keys
    @Published var openaiApiKey: String = ""
    @Published var anthropicApiKey: String = ""
    @Published var googleApiKey: String = ""
    
    // Settings
    @Published var temperature: Double = 0.1
    @Published var maxTokens: Int = 1000
    
    private let userDefaults = UserDefaults.standard
    
    init() {
        // Initialize all stored properties first
        self.availableModels = VLModel.defaultModels
        self.openaiApiKey = userDefaults.string(forKey: "VL_OpenAI_API_Key") ?? ""
        self.anthropicApiKey = userDefaults.string(forKey: "VL_Anthropic_API_Key") ?? ""
        self.googleApiKey = userDefaults.string(forKey: "VL_Google_API_Key") ?? ""
        self.temperature = userDefaults.object(forKey: "VL_Temperature") as? Double ?? 0.3
        self.maxTokens = userDefaults.object(forKey: "VL_MaxTokens") as? Int ?? 1500
        
        // Load saved selected model (after all properties are initialized)
        if let data = userDefaults.data(forKey: "VL_SelectedModel"),
           let model = try? JSONDecoder().decode(VLModel.self, from: data) {
            self.selectedModel = model
        } else {
            // Default to GPT-4o Mini - more cost-effective and reliable
            let defaultModel = VLModel.defaultModels.first { $0.name == "gpt-4o-mini" } ??
                              VLModel(name: "gpt-4o-mini", displayName: "GPT-4o Mini (Vision)", provider: .openai)
            self.selectedModel = defaultModel
        }
        
        // Load Ollama models after initialization
        loadOllamaModels()
    }
    
    // Removed loadSelectedModel() - logic moved to init()
    
    func saveSettings() {
        // Save selected model
        if let data = try? JSONEncoder().encode(selectedModel) {
            userDefaults.set(data, forKey: "VL_SelectedModel")
        }
        
        // Save API keys
        userDefaults.set(openaiApiKey, forKey: "VL_OpenAI_API_Key")
        userDefaults.set(anthropicApiKey, forKey: "VL_Anthropic_API_Key")
        userDefaults.set(googleApiKey, forKey: "VL_Google_API_Key")
        
        // Save other settings
        userDefaults.set(temperature, forKey: "VL_Temperature")
        userDefaults.set(maxTokens, forKey: "VL_MaxTokens")
    }
    
    func selectModel(_ model: VLModel) {
        selectedModel = model
        saveSettings()
    }
    
    func updateApiKey(for provider: VLModelProvider, key: String) {
        switch provider {
        case .openai:
            openaiApiKey = key
        case .anthropic:
            anthropicApiKey = key
        case .google:
            googleApiKey = key
        case .ollama:
            break // Ollama doesn't need API key
        }
        saveSettings()
    }
    
    func getApiKey(for provider: VLModelProvider) -> String {
        switch provider {
        case .openai: return openaiApiKey
        case .anthropic: return anthropicApiKey
        case .google: return googleApiKey
        case .ollama: return ""
        }
    }
    
    func loadOllamaModels() {
        print("🔄 Refreshing Ollama models...")
        Task {
            await fetchOllamaModels()
        }
    }
    
    @MainActor
    private func fetchOllamaModels() async {
        do {
            let url = URL(string: "http://localhost:11434/api/tags")!
            var request = URLRequest(url: url)
            request.timeoutInterval = 5.0 // 5 second timeout
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            // Check HTTP response
            if let httpResponse = response as? HTTPURLResponse {
                print("🦙 Ollama API response status: \(httpResponse.statusCode)")
                guard httpResponse.statusCode == 200 else {
                    print("❌ Ollama API returned status: \(httpResponse.statusCode)")
                    return
                }
            }
            
            // Parse response
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("❌ Failed to parse Ollama response as JSON")
                return
            }
            
            print("🦙 Ollama API response: \(json)")
            
            guard let models = json["models"] as? [[String: Any]] else {
                print("❌ No models array found in Ollama response")
                return
            }
            
            let ollamaModels = models.compactMap { modelDict -> VLModel? in
                guard let name = modelDict["name"] as? String else {
                    print("⚠️ Skipping model with no name: \(modelDict)")
                    return nil
                }
                
                // Check if model supports vision - be more inclusive
                let nameLower = name.lowercased()
                let supportsVision = nameLower.contains("vision") || 
                                   nameLower.contains("llava") ||
                                   nameLower.contains("bakllava") ||
                                   nameLower.contains("moondream") ||
                                   nameLower.contains("cogvlm") ||
                                   nameLower.contains("internvl") ||
                                   nameLower.contains("qwen2.5vl") ||
                                   nameLower.contains("qwen25vl") ||
                                   nameLower.contains("2.5vl") ||
                                   nameLower.contains("25vl") ||
                                   name.lowercased().contains("vl:") ||  // For qwen2.5vl:7b pattern
                                   nameLower.hasSuffix("vl") ||
                                   (nameLower.contains("qwen") && nameLower.contains("vl"))
                
                let displayName = name.replacingOccurrences(of: ":latest", with: "")
                                     .replacingOccurrences(of: "_", with: " ")
                                     .capitalized
                
                print("🔍 Found model: \(name) - Vision: \(supportsVision)")
                
                return VLModel(
                    name: name,
                    displayName: displayName,
                    provider: .ollama,
                    supportsVision: supportsVision,
                    isLocal: true
                )
            }
            
            // Include ALL models, not just vision ones, so user can see what's available
            self.ollamaModels = ollamaModels
            self.availableModels = VLModel.defaultModels + self.ollamaModels
            
            let visionCount = ollamaModels.filter { $0.supportsVision }.count
            print("🦙 Found \(ollamaModels.count) total Ollama models, \(visionCount) with vision support")
            
        } catch {
            print("❌ Failed to load Ollama models: \(error)")
            print("💡 Make sure Ollama is running: 'ollama serve'")
            // Don't clear existing models, just log the error
        }
    }
    
    var isCurrentModelValid: Bool {
        if selectedModel.provider.requiresApiKey {
            return !getApiKey(for: selectedModel.provider).isEmpty
        }
        return true
    }
}