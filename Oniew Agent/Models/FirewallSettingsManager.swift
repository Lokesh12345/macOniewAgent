import Foundation
import Combine

struct FirewallConfig: Codable {
    var enabled: Bool
    var allowList: [String]
    var denyList: [String]
    
    init(enabled: Bool = true, allowList: [String] = [], denyList: [String] = []) {
        self.enabled = enabled
        self.allowList = allowList
        self.denyList = denyList
    }
}

class FirewallSettingsManager: ObservableObject {
    static let shared = FirewallSettingsManager()
    
    @Published var enabled: Bool = true
    @Published var allowList: [String] = []
    @Published var denyList: [String] = []
    
    private var webSocketServer: WebSocketServer?
    private let userDefaults = UserDefaults.standard
    private let firewallKey = "firewall_settings"
    
    private init() {
        loadSettings()
    }
    
    func setWebSocketServer(_ server: WebSocketServer) {
        self.webSocketServer = server
    }
    
    private func loadSettings() {
        if let data = userDefaults.data(forKey: firewallKey),
           let config = try? JSONDecoder().decode(FirewallConfig.self, from: data) {
            self.enabled = config.enabled
            self.allowList = config.allowList
            self.denyList = config.denyList
        } else {
            // Default settings
            self.enabled = true
            self.allowList = []
            self.denyList = []
        }
    }
    
    func saveSettings() {
        let config = FirewallConfig(
            enabled: enabled,
            allowList: allowList,
            denyList: denyList
        )
        
        if let encoded = try? JSONEncoder().encode(config) {
            userDefaults.set(encoded, forKey: firewallKey)
        }
        
        // Sync with Chrome extension
        syncWithExtension()
    }
    
    func addToAllowList(_ url: String) {
        let normalizedUrl = normalizeUrl(url)
        guard !normalizedUrl.isEmpty && !allowList.contains(normalizedUrl) else { return }
        
        // Remove from deny list if it exists there
        denyList.removeAll { $0 == normalizedUrl }
        
        // Add to allow list
        allowList.append(normalizedUrl)
        saveSettings()
    }
    
    func removeFromAllowList(_ url: String) {
        let normalizedUrl = normalizeUrl(url)
        allowList.removeAll { $0 == normalizedUrl }
        saveSettings()
    }
    
    func addToDenyList(_ url: String) {
        let normalizedUrl = normalizeUrl(url)
        guard !normalizedUrl.isEmpty && !denyList.contains(normalizedUrl) else { return }
        
        // Remove from allow list if it exists there
        allowList.removeAll { $0 == normalizedUrl }
        
        // Add to deny list
        denyList.append(normalizedUrl)
        saveSettings()
    }
    
    func removeFromDenyList(_ url: String) {
        let normalizedUrl = normalizeUrl(url)
        denyList.removeAll { $0 == normalizedUrl }
        saveSettings()
    }
    
    private func normalizeUrl(_ url: String) -> String {
        return url
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
    }
    
    private func syncWithExtension() {
        let firewallUpdate: [String: Any] = [
            "type": "firewall_settings_update",
            "data": [
                "enabled": enabled,
                "allowList": allowList,
                "denyList": denyList
            ]
        ]
        
        webSocketServer?.sendMessage(firewallUpdate)
    }
}