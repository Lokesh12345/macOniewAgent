import SwiftUI

struct VLSettingsPanel: View {
    @EnvironmentObject var settingsManager: VLSettingsManager
    @State private var isRefreshingOllama = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 4) {
                // Header - Compact
                headerSection
                
                // Model Selection - Compact
                modelSelectionSection
                
                // API Configuration - Compact
                if settingsManager.selectedModel.provider.requiresApiKey {
                    apiConfigurationSection
                }
                
                // Ollama Status - Compact
                ollamaStatusSection
                
                // Advanced Settings - Compact
                advancedSettingsSection
            }
            .padding(6)
        }
    }
    
    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("Vision Model Settings")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                
                Text("Configure AI models for browser automation")
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // Status indicator - Compact
            HStack(spacing: 3) {
                Circle()
                    .fill(settingsManager.isCurrentModelValid ? Color.green : Color.orange)
                    .frame(width: 6, height: 6)
                
                Text(settingsManager.isCurrentModelValid ? "Ready" : "Setup Required")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(settingsManager.isCurrentModelValid ? Color.green : Color.orange)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                Capsule()
                    .fill((settingsManager.isCurrentModelValid ? Color.green : Color.orange).opacity(0.1))
            )
        }
        .padding(6)
    }
    
    private var modelSelectionSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Selected Model")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.primary)
            
            // Current selection - Very compact
            HStack(spacing: 6) {
                Image(systemName: providerIcon(settingsManager.selectedModel.provider))
                    .foregroundColor(providerColor(settingsManager.selectedModel.provider))
                    .frame(width: 14)
                    .font(.system(size: 11))
                
                VStack(alignment: .leading, spacing: 0) {
                    Text(settingsManager.selectedModel.displayName)
                        .font(.system(size: 10, weight: .medium))
                    Text(settingsManager.selectedModel.provider.displayName)
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if settingsManager.selectedModel.isLocal {
                    Text("Local")
                        .font(.system(size: 7, weight: .medium))
                        .foregroundColor(.green)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(Color.green.opacity(0.15)))
                }
            }
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.blue.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                    )
            )
            
            // Provider sections - Very compact
            ForEach(VLModelProvider.allCases, id: \.rawValue) { provider in
                providerSection(provider)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(.regularMaterial.opacity(0.5))
        )
    }
    
    private func providerSection(_ provider: VLModelProvider) -> some View {
        let providerModels = settingsManager.availableModels.filter { $0.provider == provider }
        
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: providerIcon(provider))
                    .foregroundColor(providerColor(provider))
                    .frame(width: 10)
                    .font(.system(size: 9))
                
                Text(provider.displayName)
                    .font(.system(size: 9, weight: .medium))
                
                Spacer()
                
                if provider == .ollama {
                    Button(action: refreshOllamaModels) {
                        HStack(spacing: 1) {
                            if isRefreshingOllama {
                                ProgressView()
                                    .scaleEffect(0.3)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 6))
                            }
                            Text("Refresh")
                                .font(.system(size: 7, weight: .medium))
                        }
                        .foregroundColor(.blue)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(Color.blue.opacity(0.1)))
                    }
                    .buttonStyle(PlainButtonStyle())
                    .disabled(isRefreshingOllama)
                }
                
                Text("\\(providerModels.count)")
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 3)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(Color.secondary.opacity(0.1)))
            }
            
            if providerModels.isEmpty && provider == .ollama {
                compactOllamaEmptyState
            } else if !providerModels.isEmpty {
                VStack(alignment: .leading, spacing: 1) {
                    ForEach(providerModels) { model in
                        compactModelListItem(model)
                    }
                }
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 3)
                .fill(providerColor(provider).opacity(0.03))
        )
    }
    
    private func compactModelListItem(_ model: VLModel) -> some View {
        Button(action: { settingsManager.selectModel(model) }) {
            HStack(spacing: 4) {
                Circle()
                    .fill(settingsManager.selectedModel.id == model.id ? Color.blue : Color.secondary.opacity(0.3))
                    .frame(width: 4, height: 4)
                
                Text(model.displayName)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                
                Spacer(minLength: 0)
                
                if model.isLocal {
                    Text("Local")
                        .font(.system(size: 6, weight: .medium))
                        .foregroundColor(.green)
                        .padding(.horizontal, 2)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(Color.green.opacity(0.1)))
                }
                
                if !model.supportsVision {
                    Image(systemName: "eye.slash")
                        .font(.system(size: 7))
                        .foregroundColor(.orange)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 3)
                    .fill(settingsManager.selectedModel.id == model.id ? Color.blue.opacity(0.08) : Color.clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .stroke(settingsManager.selectedModel.id == model.id ? Color.blue.opacity(0.3) : Color.clear, lineWidth: 0.5)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private var compactOllamaEmptyState: some View {
        VStack(spacing: 2) {
            Text("No vision models")
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(.secondary)
            
            Text("Install: ollama pull llava")
                .font(.system(size: 7).monospaced())
                .foregroundColor(.secondary)
                .padding(3)
                .background(
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.secondary.opacity(0.1))
                )
        }
    }
    
    private var apiConfigurationSection: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Image(systemName: "key.fill")
                    .foregroundColor(.orange)
                    .font(.system(size: 10))
                Text("API Key")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.primary)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text("\\(settingsManager.selectedModel.provider.displayName) API Key")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.primary)
                
                SecureField("Enter API key...", text: Binding(
                    get: { settingsManager.getApiKey(for: settingsManager.selectedModel.provider) },
                    set: { settingsManager.updateApiKey(for: settingsManager.selectedModel.provider, key: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 9).monospaced())
                
                if !settingsManager.getApiKey(for: settingsManager.selectedModel.provider).isEmpty {
                    HStack(spacing: 2) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                            .font(.system(size: 8))
                        Text("Configured")
                            .font(.system(size: 8))
                            .foregroundColor(.green)
                    }
                }
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(.regularMaterial.opacity(0.5))
        )
    }
    
    private var ollamaStatusSection: some View {
        HStack {
            Image(systemName: "desktopcomputer")
                .foregroundColor(.green)
                .frame(width: 12)
                .font(.system(size: 10))
            
            VStack(alignment: .leading, spacing: 0) {
                Text("Ollama")
                    .font(.system(size: 9, weight: .medium))
                
                let visionModels = settingsManager.ollamaModels.filter { $0.supportsVision }
                Text("\\(settingsManager.ollamaModels.count) models (\\(visionModels.count) vision)")
                    .font(.system(size: 7))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Circle()
                .fill(settingsManager.ollamaModels.isEmpty ? Color.red : Color.green)
                .frame(width: 4, height: 4)
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.green.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(Color.green.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
    
    private var advancedSettingsSection: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Advanced")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.primary)
            
            VStack(spacing: 3) {
                // Temperature
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text("Temperature")
                            .font(.system(size: 8, weight: .medium))
                        Spacer()
                        Text(String(format: "%.1f", settingsManager.temperature))
                            .font(.system(size: 8).monospaced())
                            .foregroundColor(.secondary)
                    }
                    
                    Slider(value: $settingsManager.temperature, in: 0...1, step: 0.1) {
                        Text("Temperature")
                    }
                    .onChange(of: settingsManager.temperature) {
                        settingsManager.saveSettings()
                    }
                }
                
                // Max Tokens
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text("Max Tokens")
                            .font(.system(size: 8, weight: .medium))
                        Spacer()
                        Text("\\(settingsManager.maxTokens)")
                            .font(.system(size: 8).monospaced())
                            .foregroundColor(.secondary)
                    }
                    
                    Slider(value: Binding(
                        get: { Double(settingsManager.maxTokens) },
                        set: { settingsManager.maxTokens = Int($0) }
                    ), in: 100...4000, step: 100) {
                        Text("Max Tokens")
                    }
                    .onChange(of: settingsManager.maxTokens) {
                        settingsManager.saveSettings()
                    }
                }
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(.regularMaterial.opacity(0.5))
        )
    }
    
    private func refreshOllamaModels() {
        isRefreshingOllama = true
        settingsManager.loadOllamaModels()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            isRefreshingOllama = false
        }
    }
    
    private func providerIcon(_ provider: VLModelProvider) -> String {
        switch provider {
        case .openai: return "brain.head.profile"
        case .anthropic: return "brain"
        case .google: return "magnifyingglass"
        case .ollama: return "desktopcomputer"
        }
    }
    
    private func providerColor(_ provider: VLModelProvider) -> Color {
        switch provider {
        case .openai: return .blue
        case .anthropic: return .purple
        case .google: return .green
        case .ollama: return .orange
        }
    }
}

#Preview {
    let settingsManager = VLSettingsManager()
    return VLSettingsPanel()
        .environmentObject(settingsManager)
        .frame(width: 400, height: 600)
}