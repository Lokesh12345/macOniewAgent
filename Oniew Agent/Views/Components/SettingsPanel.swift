import SwiftUI
import Foundation
import AppKit

struct SettingsPanel: View {
    // Settings state
    @State private var apiKey: String = ""
    @State private var selectedModel: String = "gpt-4"
    @State private var maxTokens: String = "4000"
    @State private var temperature: Double = 0.7
    @State private var enableLogging: Bool = true
    @State private var autoRetry: Bool = true
    @State private var retryCount: String = "3"
    
    // Ollama specific
    @State private var ollamaModels: [String] = []
    @State private var selectedOllamaModel: String = ""
    @State private var isLoadingOllamaModels: Bool = false
    
    // Focus states for text fields
    @FocusState private var isApiKeyFocused: Bool
    @FocusState private var isMaxTokensFocused: Bool
    @FocusState private var isRetryCountFocused: Bool
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // API Configuration Section
                settingsSection(title: "API Configuration", icon: "key.fill") {
                    VStack(alignment: .leading, spacing: 12) {
                        // API Key
                        VStack(alignment: .leading, spacing: 4) {
                            Text("API Key")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.primary)
                            
                            SecureField("Enter your API key", text: $apiKey)
                                .textFieldStyle(.plain)
                                .font(.system(size: 10))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(Color.primary.opacity(0.05))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 6)
                                                .stroke(isApiKeyFocused ? Color.blue.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 0.5)
                                        )
                                )
                                .focused($isApiKeyFocused)
                                .onTapGesture {
                                    isApiKeyFocused = true
                                }
                        }
                        
                        // Model Selection
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Model Provider")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.primary)
                            
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(["gpt-4", "gpt-3.5-turbo", "claude-3", "gemini-pro", "ollama"], id: \.self) { model in
                                    Button(action: {
                                        selectedModel = model
                                        if model == "ollama" {
                                            fetchOllamaModels()
                                        }
                                    }) {
                                        HStack(spacing: 8) {
                                            Image(systemName: selectedModel == model ? "largecircle.fill.circle" : "circle")
                                                .font(.system(size: 10))
                                                .foregroundColor(selectedModel == model ? .blue : .primary.opacity(0.6))
                                            
                                            Text(modelDisplayName(for: model))
                                                .font(.system(size: 10))
                                                .foregroundColor(.primary)
                                            
                                            Spacer()
                                        }
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(
                                            RoundedRectangle(cornerRadius: 4)
                                                .fill(selectedModel == model ? Color.blue.opacity(0.1) : Color.clear)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        
                        // Ollama Model Selection (only show when Ollama is selected)
                        if selectedModel == "ollama" {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text("Ollama Model")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(.primary)
                                    
                                    if isLoadingOllamaModels {
                                        ProgressView()
                                            .scaleEffect(0.6)
                                            .frame(width: 12, height: 12)
                                    }
                                    
                                    Spacer()
                                    
                                    Button(action: {
                                        fetchOllamaModels()
                                    }) {
                                        Image(systemName: "arrow.clockwise")
                                            .font(.system(size: 8))
                                            .foregroundColor(.blue)
                                    }
                                    .buttonStyle(.plain)
                                }
                                
                                if ollamaModels.isEmpty && !isLoadingOllamaModels {
                                    Text("No Ollama models found. Install models using 'ollama pull <model>'")
                                        .font(.system(size: 8))
                                        .foregroundColor(.orange)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(Color.orange.opacity(0.1))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 6)
                                                        .stroke(Color.orange.opacity(0.3), lineWidth: 0.5)
                                                )
                                        )
                                } else {
                                    VStack(alignment: .leading, spacing: 4) {
                                        ForEach(ollamaModels, id: \.self) { model in
                                            Button(action: {
                                                selectedOllamaModel = model
                                            }) {
                                                HStack(spacing: 8) {
                                                    Image(systemName: selectedOllamaModel == model ? "largecircle.fill.circle" : "circle")
                                                        .font(.system(size: 8))
                                                        .foregroundColor(selectedOllamaModel == model ? .blue : .primary.opacity(0.6))
                                                    
                                                    Text(model)
                                                        .font(.system(size: 9))
                                                        .foregroundColor(.primary)
                                                    
                                                    Spacer()
                                                }
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 3)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 3)
                                                        .fill(selectedOllamaModel == model ? Color.blue.opacity(0.1) : Color.clear)
                                                )
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Max Tokens
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Max Tokens")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.primary)
                            
                            TextField("4000", text: $maxTokens)
                                .textFieldStyle(.plain)
                                .font(.system(size: 10))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(Color.primary.opacity(0.05))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 6)
                                                .stroke(isMaxTokensFocused ? Color.blue.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 0.5)
                                        )
                                )
                                .focused($isMaxTokensFocused)
                                .onTapGesture {
                                    isMaxTokensFocused = true
                                }
                        }
                        
                        // Temperature
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("Temperature")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                Text("\(temperature, specifier: "%.1f")")
                                    .font(.system(size: 9))
                                    .foregroundColor(.secondary)
                            }
                            
                            Slider(value: $temperature, in: 0...2, step: 0.1)
                                .controlSize(.mini)
                        }
                    }
                }
                
                // Agent Behavior Section
                settingsSection(title: "Agent Behavior", icon: "brain.head.profile") {
                    VStack(alignment: .leading, spacing: 12) {
                        // Enable Logging
                        Toggle(isOn: $enableLogging) {
                            Text("Enable Logging")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.primary)
                        }
                        .toggleStyle(.checkbox)
                        
                        // Auto Retry
                        Toggle(isOn: $autoRetry) {
                            Text("Auto Retry on Failure")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.primary)
                        }
                        .toggleStyle(.checkbox)
                        
                        // Retry Count
                        if autoRetry {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Retry Count")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.primary)
                                
                                TextField("3", text: $retryCount)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 10))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 6)
                                    .background(
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(Color.primary.opacity(0.05))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 6)
                                                    .stroke(isRetryCountFocused ? Color.blue.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 0.5)
                                            )
                                    )
                                    .focused($isRetryCountFocused)
                                    .onTapGesture {
                                        isRetryCountFocused = true
                                    }
                            }
                        }
                    }
                }
                
                // Actions Section  
                settingsSection(title: "Actions", icon: "gear") {
                    VStack(spacing: 8) {
                        Button(action: {
                            saveSettings()
                        }) {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 10))
                                Text("Save Settings")
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(.blue)
                            )
                        }
                        .buttonStyle(.plain)
                        
                        Button(action: {
                            resetSettings()
                        }) {
                            HStack {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 10))
                                Text("Reset to Defaults")
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(.orange)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Color.orange.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Color.orange.opacity(0.3), lineWidth: 0.5)
                                    )
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            loadSettings()
        }
    }
    
    // MARK: - Settings Helper Functions
    
    private func settingsSection<Content: View>(title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                    .foregroundColor(.blue)
                
                Text(title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.primary)
            }
            
            content()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.blue.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
    
    private func saveSettings() {
        // Save settings to UserDefaults or other storage
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
        UserDefaults.standard.set(selectedModel, forKey: "selectedModel")
        UserDefaults.standard.set(selectedOllamaModel, forKey: "selectedOllamaModel")
        UserDefaults.standard.set(maxTokens, forKey: "maxTokens")
        UserDefaults.standard.set(temperature, forKey: "temperature")
        UserDefaults.standard.set(enableLogging, forKey: "enableLogging")
        UserDefaults.standard.set(autoRetry, forKey: "autoRetry")
        UserDefaults.standard.set(retryCount, forKey: "retryCount")
        
        print("Settings saved successfully!")
    }
    
    private func resetSettings() {
        apiKey = ""
        selectedModel = "gpt-4"
        selectedOllamaModel = ""
        maxTokens = "4000"
        temperature = 0.7
        enableLogging = true
        autoRetry = true
        retryCount = "3"
        
        print("Settings reset to defaults!")
    }
    
    private func loadSettings() {
        // Load settings from UserDefaults
        apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""
        selectedModel = UserDefaults.standard.string(forKey: "selectedModel") ?? "gpt-4"
        selectedOllamaModel = UserDefaults.standard.string(forKey: "selectedOllamaModel") ?? ""
        maxTokens = UserDefaults.standard.string(forKey: "maxTokens") ?? "4000"
        temperature = UserDefaults.standard.double(forKey: "temperature") != 0 ? UserDefaults.standard.double(forKey: "temperature") : 0.7
        enableLogging = UserDefaults.standard.bool(forKey: "enableLogging")
        autoRetry = UserDefaults.standard.bool(forKey: "autoRetry") 
        retryCount = UserDefaults.standard.string(forKey: "retryCount") ?? "3"
        
        // Set defaults for first time
        if !UserDefaults.standard.bool(forKey: "hasLaunchedBefore") {
            enableLogging = true
            autoRetry = true
            UserDefaults.standard.set(true, forKey: "hasLaunchedBefore")
        }
        
        // Load Ollama models if Ollama is selected
        if selectedModel == "ollama" {
            fetchOllamaModels()
        }
    }
    
    private func fetchOllamaModels() {
        isLoadingOllamaModels = true
        
        Task {
            do {
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
                    await MainActor.run {
                        print("Ollama not found in common installation paths")
                        ollamaModels = []
                        isLoadingOllamaModels = false
                    }
                    return
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
                
                await MainActor.run {
                    if process.terminationStatus == 0 {
                        parseOllamaModels(from: output)
                    } else {
                        print("Ollama not found or error occurred: \(output)")
                        ollamaModels = []
                    }
                    isLoadingOllamaModels = false
                }
                
            } catch {
                await MainActor.run {
                    print("Error fetching Ollama models: \(error)")
                    ollamaModels = []
                    isLoadingOllamaModels = false
                }
            }
        }
    }
    
    private func parseOllamaModels(from output: String) {
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
        
        ollamaModels = models
        
        // Set first model as default if none selected
        if !models.isEmpty && selectedOllamaModel.isEmpty {
            selectedOllamaModel = models.first ?? ""
        }
    }
    
    // Helper function to get display names for models
    private func modelDisplayName(for model: String) -> String {
        switch model {
        case "gpt-4":
            return "GPT-4"
        case "gpt-3.5-turbo":
            return "GPT-3.5 Turbo"
        case "claude-3":
            return "Claude-3"
        case "gemini-pro":
            return "Gemini Pro"
        case "ollama":
            return "Ollama"
        default:
            return model
        }
    }
}

#Preview {
    SettingsPanel()
        .frame(width: 300, height: 600)
}