import SwiftUI

struct SettingsPanel: View {
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var selectedTab = "models"
    @State private var isLoading = true
    @State private var tabSwitchLoading = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Tab Header
            HStack(spacing: 8) { // Reduce spacing between tabs since they're bigger now
                TabButton(title: "Models", isSelected: selectedTab == "models") {
                    if selectedTab != "models" {
                        tabSwitchLoading = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            selectedTab = "models"
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    tabSwitchLoading = false
                                }
                            }
                        }
                    }
                }
                
                TabButton(title: "General", isSelected: selectedTab == "general") {
                    if selectedTab != "general" {
                        tabSwitchLoading = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            selectedTab = "general"
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    tabSwitchLoading = false
                                }
                            }
                        }
                    }
                }
                
                TabButton(title: "Firewall", isSelected: selectedTab == "firewall") {
                    if selectedTab != "firewall" {
                        tabSwitchLoading = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            selectedTab = "firewall"
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    tabSwitchLoading = false
                                }
                            }
                        }
                    }
                }
                
                Spacer()
            }
            .padding(.horizontal, 12) // More padding around the whole header
            .padding(.vertical, 8)    // More vertical padding
            
            Divider()
                .padding(.horizontal, 8)
            
            // Content
            ZStack {
                if isLoading {
                    // Loading state
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.2)
                        
                        Text("Loading Settings...")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if tabSwitchLoading {
                    // Tab switch loading state
                    VStack(spacing: 12) {
                        ProgressView()
                            .scaleEffect(0.8)
                        
                        Text("Loading...")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        switch selectedTab {
                        case "models":
                            ModelSettingsContent()
                        case "general":
                            GeneralSettingsContent()
                        case "firewall":
                            FirewallSettingsContent()
                        default:
                            EmptyView()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .onAppear {
            // Simulate loading time for settings initialization
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                withAnimation(.easeInOut(duration: 0.3)) {
                    isLoading = false
                }
            }
        }
    }
}

struct TabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: .medium)) // Larger font
                .foregroundColor(isSelected ? .primary : .secondary)
                .padding(.horizontal, 10) // Reduced horizontal padding
                .padding(.vertical, 6)    // Reduced vertical padding
                .frame(minWidth: 50, minHeight: 28) // Smaller minimum tap target size
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSelected ? Color.blue.opacity(0.15) : Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(isSelected ? Color.blue.opacity(0.3) : Color.clear, lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle()) // Make entire area clickable
    }
}

struct ModelSettingsContent: View {
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var selectedProviderToAdd: ProviderTypeEnum? = nil
    @State private var expandedProviders: Set<String> = []
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Model Settings")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.horizontal, 8)
                .padding(.top, 8)
            
            // Add Provider Section
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Add Provider")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.secondary)
                    
                    let availableProviders = [ProviderTypeEnum.openai, .anthropic, .gemini, .ollama, .deepseek, .customOpenAI].filter { !settingsManager.providers.keys.contains($0.rawValue) }
                    
                    if availableProviders.isEmpty {
                        Text("(All providers added)")
                            .font(.system(size: 8))
                            .foregroundColor(.green)
                    } else if selectedProviderToAdd == nil {
                        Text("(Select one below)")
                            .font(.system(size: 8))
                            .foregroundColor(.orange)
                    } else {
                        Text("(\(getDisplayName(for: selectedProviderToAdd!)) selected)")
                            .font(.system(size: 8))
                            .foregroundColor(.blue)
                    }
                }
                .padding(.horizontal, 8)
                
                // Provider Type Radio Buttons
                VStack(alignment: .leading, spacing: 4) {
                    ForEach([ProviderTypeEnum.openai, .anthropic, .gemini, .ollama, .deepseek, .customOpenAI], id: \.self) { providerType in
                        let alreadyExists = settingsManager.providers.keys.contains(providerType.rawValue)
                        
                        Button(action: { 
                            if !alreadyExists {
                                selectedProviderToAdd = providerType 
                            }
                        }) {
                            HStack(spacing: 6) {
                                if alreadyExists {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 8))
                                        .foregroundColor(.green)
                                } else {
                                    Image(systemName: selectedProviderToAdd == providerType ? "largecircle.fill.circle" : "circle")
                                        .font(.system(size: 8))
                                        .foregroundColor(selectedProviderToAdd == providerType ? .blue : .secondary)
                                }
                                
                                Text(getDisplayName(for: providerType))
                                    .font(.system(size: 8))
                                    .foregroundColor(alreadyExists ? .green : .primary)
                                
                                if alreadyExists {
                                    Text("(Already added)")
                                        .font(.system(size: 7))
                                        .foregroundColor(.green)
                                }
                                
                                Spacer()
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                        .disabled(alreadyExists)
                    }
                }
                
                HStack {
                    let availableProviders = [ProviderTypeEnum.openai, .anthropic, .gemini, .ollama, .deepseek, .customOpenAI].filter { !settingsManager.providers.keys.contains($0.rawValue) }
                    
                    Button("Add Provider") {
                        if let providerToAdd = selectedProviderToAdd {
                            settingsManager.addProvider(type: providerToAdd)
                            expandedProviders.insert(providerToAdd.rawValue)
                            selectedProviderToAdd = nil // Reset selection after adding
                        }
                    }
                    .disabled(selectedProviderToAdd == nil || availableProviders.isEmpty)
                    
                    if availableProviders.isEmpty {
                        Text("← All providers already added")
                            .font(.system(size: 8))
                            .foregroundColor(.green)
                    } else if selectedProviderToAdd == nil {
                        Text("← Select a provider first")
                            .font(.system(size: 8))
                            .foregroundColor(.orange)
                    }
                }
                .font(.system(size: 8))
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
                .padding(.horizontal, 8)
            }
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.blue.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                    )
            )
            .padding(.horizontal, 8)
            
            // Existing Providers
            VStack(spacing: 6) {
                ForEach(Array(settingsManager.providers.keys.sorted()), id: \.self) { providerId in
                    if let provider = settingsManager.providers[providerId] {
                        ProviderConfigView(
                            providerId: providerId,
                            provider: provider,
                            isExpanded: expandedProviders.contains(providerId),
                            onToggle: {
                                if expandedProviders.contains(providerId) {
                                    expandedProviders.remove(providerId)
                                } else {
                                    expandedProviders.insert(providerId)
                                }
                            },
                            onUpdate: { updatedProvider in
                                settingsManager.updateProvider(providerId, config: updatedProvider)
                            },
                            onDelete: {
                                settingsManager.removeProvider(providerId)
                                expandedProviders.remove(providerId)
                            }
                        )
                    }
                }
            }
            .padding(.horizontal, 8)
            
            Divider()
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
            
            // Agent Model Selection
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Agent Models")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    if settingsManager.getSelectedModelsForAgents().isEmpty {
                        Text("Configure providers above first")
                            .font(.system(size: 7))
                            .foregroundColor(.orange)
                    }
                }
                .padding(.horizontal, 8)
                
                if settingsManager.getSelectedModelsForAgents().isEmpty {
                    Text("Add providers and select models above to assign them to agents")
                        .font(.system(size: 7))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.gray.opacity(0.1))
                        )
                        .padding(.horizontal, 8)
                } else {
                    AgentModelConfigView(agentName: .navigator)
                    AgentModelConfigView(agentName: .planner)
                    AgentModelConfigView(agentName: .validator)
                }
            }
            .padding(.horizontal, 8)
            
            Spacer(minLength: 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    private func getDisplayName(for type: ProviderTypeEnum) -> String {
        switch type {
        case .openai: return "OpenAI"
        case .anthropic: return "Anthropic"
        case .deepseek: return "DeepSeek"
        case .gemini: return "Google Gemini"
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
}

struct ProviderConfigView: View {
    let providerId: String
    let provider: ProviderConfig
    let isExpanded: Bool
    let onToggle: () -> Void
    let onUpdate: (ProviderConfig) -> Void
    let onDelete: () -> Void
    
    @State private var apiKey: String = ""
    @State private var baseUrl: String = ""
    @State private var showApiKey = false
    @State private var selectedModels: Set<String> = []
    @State private var isLoadingModels = false
    @StateObject private var settingsManager = SettingsManager.shared
    
    var providerDisplayName: String {
        provider.name ?? providerId
    }
    
    var availableModels: [String] {
        let models = provider.modelNames ?? []
        print("🔍 Debug: Provider \(providerId) has models: \(models)")
        
        // Temporary fallback for testing - if no models, show some test models
        if models.isEmpty {
            switch provider.type {
            case .openai:
                return ["gpt-4.1", "gpt-4o", "gpt-4o-mini"]
            case .anthropic:
                return ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"]
            case .ollama:
                return ["qwen3:14b", "llama3.1:8b"]
            default:
                return ["test-model-1", "test-model-2"]
            }
        }
        
        return models
    }
    
    var hasApiKey: Bool {
        !apiKey.isEmpty
    }
    
    var needsApiKey: Bool {
        // Ollama doesn't need API key since it's local
        provider.type != .ollama
    }
    
    var canSelectModels: Bool {
        // Can select models if: API key is present OR it's a local provider like Ollama
        hasApiKey || !needsApiKey
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 6) {
                Button(action: onToggle) {
                    HStack(spacing: 6) {
                        Image(systemName: "cube.fill")
                            .font(.system(size: 8))
                            .foregroundColor(.blue)
                        
                        Text(providerDisplayName)
                            .font(.system(size: 9, weight: .medium))
                        
                        Spacer()
                        
                        // Status indicator
                        Circle()
                            .fill(apiKey.isEmpty ? Color.orange : Color.green)
                            .frame(width: 4, height: 4)
                        
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 7))
                            .foregroundColor(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
            
            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    // API Key Field (only show if needed)
                    if needsApiKey {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("API Key")
                                    .font(.system(size: 8, weight: .medium))
                                    .foregroundColor(.primary)
                                
                                Button(action: { showApiKey.toggle() }) {
                                    Image(systemName: showApiKey ? "eye.slash" : "eye")
                                        .font(.system(size: 7))
                                        .foregroundColor(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                            
                            if showApiKey {
                                TextField("Enter API Key", text: $apiKey)
                                    .font(.system(size: 8))
                                    .textFieldStyle(.roundedBorder)
                            } else {
                                SecureField("Enter API Key", text: $apiKey)
                                    .font(.system(size: 8))
                                    .textFieldStyle(.roundedBorder)
                            }
                        }
                    } else {
                        // Show info for local providers
                        Text("Local provider - no API key needed")
                            .font(.system(size: 8))
                            .foregroundColor(.green)
                            .padding(4)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.green.opacity(0.1))
                            )
                    }
                    
                    // Base URL Field (for specific providers)
                    if provider.type == .ollama || provider.type == .customOpenAI {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Base URL")
                                .font(.system(size: 8, weight: .medium))
                                .foregroundColor(.primary)
                            
                            TextField("Enter Base URL", text: $baseUrl)
                                .font(.system(size: 8))
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                    
                    // Model Selection (always show)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("Available Models")
                                .font(.system(size: 8, weight: .medium))
                                .foregroundColor(.primary)
                            
                            if isLoadingModels {
                                ProgressView()
                                    .scaleEffect(0.5)
                                    .frame(width: 10, height: 10)
                            }
                            
                            if provider.type == .ollama {
                                Button(action: {
                                    isLoadingModels = true
                                    settingsManager.fetchOllamaModels(for: providerId)
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                        isLoadingModels = false
                                    }
                                }) {
                                    Image(systemName: "arrow.clockwise")
                                        .font(.system(size: 7))
                                        .foregroundColor(.blue)
                                }
                                .buttonStyle(.plain)
                            }
                            
                            Spacer()
                            
                            if !canSelectModels {
                                Text("Enter API key to enable")
                                    .font(.system(size: 7))
                                    .foregroundColor(.orange)
                            }
                        }
                        
                        if availableModels.isEmpty && !isLoadingModels {
                            Text("No models available. For Ollama, make sure models are installed.")
                                .font(.system(size: 7))
                                .foregroundColor(.orange)
                                .padding(4)
                                .background(
                                    RoundedRectangle(cornerRadius: 4)
                                        .fill(Color.orange.opacity(0.1))
                                )
                        } else {
                            ScrollView {
                                VStack(alignment: .leading, spacing: 2) {
                                    ForEach(availableModels, id: \.self) { model in
                                        Button(action: {
                                            if canSelectModels {
                                                if selectedModels.contains(model) {
                                                    selectedModels.remove(model)
                                                } else {
                                                    selectedModels.insert(model)
                                                }
                                            }
                                        }) {
                                            HStack(spacing: 4) {
                                                Image(systemName: selectedModels.contains(model) ? "checkmark.square" : "square")
                                                    .font(.system(size: 7))
                                                    .foregroundColor(selectedModels.contains(model) ? .blue : (canSelectModels ? .secondary : .gray))
                                                
                                                Text(model)
                                                    .font(.system(size: 7))
                                                    .foregroundColor(canSelectModels ? .primary : .gray)
                                                    .lineLimit(1)
                                                
                                                Spacer()
                                            }
                                            .padding(.horizontal, 4)
                                            .padding(.vertical, 2)
                                        }
                                        .buttonStyle(.plain)
                                        .disabled(!canSelectModels)
                                    }
                                }
                            }
                            .frame(maxHeight: 120)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.primary.opacity(0.05))
                            )
                        }
                    }
                    
                    // Action Buttons
                    HStack(spacing: 6) {
                        Button("Save") {
                            var updatedProvider = provider
                            updatedProvider.apiKey = apiKey
                            if !baseUrl.isEmpty {
                                updatedProvider.baseUrl = baseUrl
                            }
                            
                            // Update selected models
                            if !selectedModels.isEmpty {
                                updatedProvider.modelNames = Array(selectedModels)
                            }
                            
                            onUpdate(updatedProvider)
                        }
                        .font(.system(size: 8))
                        .buttonStyle(.borderedProminent)
                        .controlSize(.mini)
                        .disabled(needsApiKey && apiKey.isEmpty)
                        
                        Button("Delete") {
                            onDelete()
                        }
                        .font(.system(size: 8))
                        .foregroundColor(.red)
                        .buttonStyle(.borderless)
                        .controlSize(.mini)
                        
                        Spacer()
                    }
                }
                .padding(.leading, 12)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.primary.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
                )
        )
        .onAppear {
            apiKey = provider.apiKey
            baseUrl = provider.baseUrl ?? ""
            selectedModels = Set(provider.modelNames ?? [])
        }
    }
}

struct AgentModelConfigView: View {
    let agentName: AgentNameEnum
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var selectedModel: String = ""
    @State private var temperature: Double = 0.7
    @State private var topP: Double = 0.9
    
    var availableModels: [(providerId: String, modelName: String, displayName: String)] {
        return settingsManager.getSelectedModelsForAgents()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(agentName.rawValue.capitalized) Agent")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.primary)
            
            // Model Selection using Radio Buttons
            VStack(alignment: .leading, spacing: 3) {
                Text("Model")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                
                Button(action: { 
                    selectedModel = ""
                    // Clear the agent model when selecting "No Model"
                    if settingsManager.agentModels[agentName] != nil {
                        settingsManager.agentModels.removeValue(forKey: agentName)
                        settingsManager.saveSettings()
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: selectedModel.isEmpty ? "largecircle.fill.circle" : "circle")
                            .font(.system(size: 7))
                            .foregroundColor(selectedModel.isEmpty ? .blue : .secondary)
                        
                        Text("No Model")
                            .font(.system(size: 8))
                            .foregroundColor(.primary)
                        
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
                
                ForEach(availableModels, id: \.displayName) { model in
                    let modelValue = "\(model.providerId)>\(model.modelName)"
                    Button(action: {
                        selectedModel = modelValue
                        settingsManager.setAgentModel(agentName, provider: model.providerId, modelName: model.modelName)
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: selectedModel == modelValue ? "largecircle.fill.circle" : "circle")
                                .font(.system(size: 7))
                                .foregroundColor(selectedModel == modelValue ? .blue : .secondary)
                            
                            Text(model.displayName)
                                .font(.system(size: 8))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                            
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            
            // Parameters (only show if model is selected)
            if !selectedModel.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    // Temperature
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("Temperature")
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                            
                            Spacer()
                            
                            Text("\(temperature, specifier: "%.2f")")
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                        }
                        
                        Slider(value: $temperature, in: 0...2, step: 0.01)
                            .controlSize(.mini)
                    }
                    
                    // Top P
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("Top P")
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                            
                            Spacer()
                            
                            Text("\(topP, specifier: "%.3f")")
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                        }
                        
                        Slider(value: $topP, in: 0...1, step: 0.001)
                            .controlSize(.mini)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.gray.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.gray.opacity(0.2), lineWidth: 0.5)
                )
        )
        .onAppear {
            if let config = settingsManager.agentModels[agentName] {
                selectedModel = "\(config.provider)>\(config.modelName)"
                if let params = config.parameters {
                    temperature = params.temperature
                    topP = params.topP
                }
            }
        }
    }
}

struct GeneralSettingsContent: View {
    @StateObject private var settingsManager = GeneralSettingsManager.shared
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("General Settings")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.horizontal, 8)
                .padding(.top, 8)
            
            VStack(spacing: 12) {
                // Max Steps per Task
                SettingRow(
                    title: "Max Steps per Task",
                    description: "Step limit per task (1-50)",
                    content: {
                        TextField("", value: $settingsManager.maxSteps, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                            .font(.system(size: 8))
                            .onChange(of: settingsManager.maxSteps) { _, newValue in
                                if newValue < 1 { settingsManager.maxSteps = 1 }
                                if newValue > 50 { settingsManager.maxSteps = 50 }
                            }
                    }
                )
                
                // Max Actions per Step
                SettingRow(
                    title: "Max Actions per Step",
                    description: "Action limit per step (1-50)",
                    content: {
                        TextField("", value: $settingsManager.maxActionsPerStep, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                            .font(.system(size: 8))
                            .onChange(of: settingsManager.maxActionsPerStep) { _, newValue in
                                if newValue < 1 { settingsManager.maxActionsPerStep = 1 }
                                if newValue > 50 { settingsManager.maxActionsPerStep = 50 }
                            }
                    }
                )
                
                // Failure Tolerance
                SettingRow(
                    title: "Failure Tolerance",
                    description: "How many consecutive failures before stopping (1-10)",
                    content: {
                        TextField("", value: $settingsManager.maxFailures, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                            .font(.system(size: 8))
                            .onChange(of: settingsManager.maxFailures) { _, newValue in
                                if newValue < 1 { settingsManager.maxFailures = 1 }
                                if newValue > 10 { settingsManager.maxFailures = 10 }
                            }
                    }
                )
                
                // Enable Vision
                SettingRow(
                    title: "Enable Vision",
                    description: "Use vision capability of LLMs (consumes more tokens for better results)",
                    content: {
                        Toggle("", isOn: $settingsManager.useVision)
                            .toggleStyle(.switch)
                            .controlSize(.mini)
                    }
                )
                
                // Display Highlights
                SettingRow(
                    title: "Display Highlights",
                    description: "Show visual highlights on interactive elements (e.g. buttons, links, etc.)",
                    content: {
                        Toggle("", isOn: $settingsManager.displayHighlights)
                            .toggleStyle(.switch)
                            .controlSize(.mini)
                    }
                )
                
                // Replanning Frequency
                SettingRow(
                    title: "Replanning Frequency",
                    description: "Reconsider and update the plan every [Number] steps (1-20)",
                    content: {
                        TextField("", value: $settingsManager.planningInterval, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                            .font(.system(size: 8))
                            .onChange(of: settingsManager.planningInterval) { _, newValue in
                                if newValue < 1 { settingsManager.planningInterval = 1 }
                                if newValue > 20 { settingsManager.planningInterval = 20 }
                            }
                    }
                )
                
                // Page Load Wait Time
                SettingRow(
                    title: "Page Load Wait Time",
                    description: "Minimum wait time after page loads (250-5000ms)",
                    content: {
                        TextField("", value: $settingsManager.minWaitPageLoad, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                            .font(.system(size: 8))
                            .onChange(of: settingsManager.minWaitPageLoad) { _, newValue in
                                if newValue < 250 { settingsManager.minWaitPageLoad = 250 }
                                if newValue > 5000 { settingsManager.minWaitPageLoad = 5000 }
                            }
                    }
                )
                
                // Replay Historical Tasks
                SettingRow(
                    title: "Replay Historical Tasks (experimental)",
                    description: "Enable storing and replaying of agent step history (experimental, may have issues)",
                    content: {
                        Toggle("", isOn: $settingsManager.replayHistoricalTasks)
                            .toggleStyle(.switch)
                            .controlSize(.mini)
                    }
                )
            }
            .padding(.horizontal, 8)
            
            Spacer(minLength: 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SettingRow<Content: View>: View {
    let title: String
    let description: String
    let content: () -> Content
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.primary)
                
                Text(description)
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            
            Spacer()
            
            content()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.primary.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
                )
        )
    }
}

struct FirewallSettingsContent: View {
    @StateObject private var firewallManager = FirewallSettingsManager.shared
    @State private var newUrl: String = ""
    @State private var activeList: String = "allow" // "allow" or "deny"
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Firewall Settings")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.horizontal, 8)
                .padding(.top, 8)
            
            VStack(spacing: 12) {
                // Enable/Disable Firewall
                SettingRow(
                    title: "Enable Firewall",
                    description: "Control which websites the agent can access",
                    content: {
                        Toggle("", isOn: $firewallManager.enabled)
                            .toggleStyle(.switch)
                            .controlSize(.mini)
                            .onChange(of: firewallManager.enabled) { _, _ in
                                firewallManager.saveSettings()
                            }
                    }
                )
                
                // Add URL Section
                VStack(alignment: .leading, spacing: 8) {
                    Text("Add URL")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                    
                    VStack(alignment: .leading, spacing: 6) {
                        // List type selector
                        HStack(spacing: 12) {
                            Button(action: { activeList = "allow" }) {
                                HStack(spacing: 4) {
                                    Image(systemName: activeList == "allow" ? "largecircle.fill.circle" : "circle")
                                        .font(.system(size: 8))
                                        .foregroundColor(activeList == "allow" ? .green : .secondary)
                                    
                                    Text("Allow List")
                                        .font(.system(size: 8))
                                        .foregroundColor(.primary)
                                }
                            }
                            .buttonStyle(.plain)
                            
                            Button(action: { activeList = "deny" }) {
                                HStack(spacing: 4) {
                                    Image(systemName: activeList == "deny" ? "largecircle.fill.circle" : "circle")
                                        .font(.system(size: 8))
                                        .foregroundColor(activeList == "deny" ? .red : .secondary)
                                    
                                    Text("Deny List")
                                        .font(.system(size: 8))
                                        .foregroundColor(.primary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        
                        // URL input
                        HStack(spacing: 6) {
                            TextField("Enter URL (e.g., example.com)", text: $newUrl)
                                .font(.system(size: 8))
                                .textFieldStyle(.roundedBorder)
                            
                            Button("Add") {
                                if activeList == "allow" {
                                    firewallManager.addToAllowList(newUrl)
                                } else {
                                    firewallManager.addToDenyList(newUrl)
                                }
                                newUrl = ""
                            }
                            .font(.system(size: 8))
                            .buttonStyle(.borderedProminent)
                            .controlSize(.mini)
                            .disabled(newUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        .padding(.horizontal, 8)
                    }
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.blue.opacity(0.05))
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                            )
                    )
                    .padding(.horizontal, 8)
                }
                
                // Allow List
                if !firewallManager.allowList.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Allow List (\(firewallManager.allowList.count) URLs)")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.green)
                            .padding(.horizontal, 8)
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 3) {
                                ForEach(firewallManager.allowList, id: \.self) { url in
                                    HStack {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 8))
                                            .foregroundColor(.green)
                                        
                                        Text(url)
                                            .font(.system(size: 8))
                                            .foregroundColor(.primary)
                                        
                                        Spacer()
                                        
                                        Button(action: {
                                            firewallManager.removeFromAllowList(url)
                                        }) {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 8))
                                                .foregroundColor(.red)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(
                                        RoundedRectangle(cornerRadius: 4)
                                            .fill(Color.green.opacity(0.05))
                                    )
                                }
                            }
                        }
                        .frame(maxHeight: 120)
                        .padding(.horizontal, 8)
                    }
                }
                
                // Deny List
                if !firewallManager.denyList.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Deny List (\(firewallManager.denyList.count) URLs)")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.red)
                            .padding(.horizontal, 8)
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 3) {
                                ForEach(firewallManager.denyList, id: \.self) { url in
                                    HStack {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 8))
                                            .foregroundColor(.red)
                                        
                                        Text(url)
                                            .font(.system(size: 8))
                                            .foregroundColor(.primary)
                                        
                                        Spacer()
                                        
                                        Button(action: {
                                            firewallManager.removeFromDenyList(url)
                                        }) {
                                            Image(systemName: "trash.fill")
                                                .font(.system(size: 8))
                                                .foregroundColor(.red)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(
                                        RoundedRectangle(cornerRadius: 4)
                                            .fill(Color.red.opacity(0.05))
                                    )
                                }
                            }
                        }
                        .frame(maxHeight: 120)
                        .padding(.horizontal, 8)
                    }
                }
            }
            .padding(.horizontal, 8)
            
            Spacer(minLength: 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    SettingsPanel()
        .frame(width: 300, height: 600)
}