import Foundation
import Network
import CommonCrypto

// Simple, reliable WebSocket server based on official WebSocket standards
class SimpleWebSocketServer {
    private let port: UInt16
    private var listener: NWListener?
    private var connection: NWConnection?
    private let queue = DispatchQueue(label: "websocket.server", qos: .userInitiated)
    private var pingTimer: Timer?
    private var isServerRunning = false
    
    // WebSocket state
    private var isWebSocketHandshakeComplete = false
    private var receivedData = Data()
    
    var onConnectionChanged: ((Bool) -> Void)?
    var onMessage: (([String: Any]) -> Void)?
    var onError: ((String) -> Void)?
    
    var isRunning: Bool {
        return isServerRunning
    }
    
    var hasActiveConnection: Bool {
        return connection != nil && isWebSocketHandshakeComplete
    }
    
    init(port: UInt16) {
        self.port = port
    }
    
    func start() {
        guard !isServerRunning else {
            print("⚠️ WebSocket server already running")
            return
        }
        
        do {
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            parameters.allowFastOpen = true
            
            listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: port)!)
            
            listener?.newConnectionHandler = { [weak self] newConnection in
                self?.handleNewConnection(newConnection)
            }
            
            listener?.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    self?.isServerRunning = true
                    print("🚀 Simple WebSocket server listening on port \(self?.port ?? 0)")
                case .failed(let error):
                    self?.isServerRunning = false
                    print("❌ Server failed: \(error)")
                    self?.onError?("Server failed to start: \(error)")
                case .cancelled:
                    self?.isServerRunning = false
                    print("🔌 WebSocket server cancelled")
                default:
                    break
                }
            }
            
            listener?.start(queue: queue)
            
        } catch {
            isServerRunning = false
            print("❌ Failed to start server: \(error)")
            onError?("Failed to start server: \(error)")
        }
    }
    
    private func handleNewConnection(_ newConnection: NWConnection) {
        // Close existing connection if any
        stopKeepAlive()
        connection?.cancel()
        
        // Reset state for new connection
        isWebSocketHandshakeComplete = false
        receivedData.removeAll()
        
        connection = newConnection
        print("🔗 New TCP connection from: \(newConnection.endpoint)")
        
        connection?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("✅ TCP connection ready, waiting for WebSocket handshake")
                self?.startReceiving()
            case .cancelled:
                print("🔌 TCP connection disconnected (cancelled)")
                self?.stopKeepAlive()
                self?.onConnectionChanged?(false)
                self?.connection = nil
            case .failed(let error):
                print("❌ TCP connection failed: \(error)")
                self?.stopKeepAlive()
                self?.onConnectionChanged?(false)
                self?.connection = nil
            default:
                break
            }
        }
        
        connection?.start(queue: queue)
    }
    
    private func startReceiving() {
        // Use a much larger buffer for screenshots - 20MB
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 20_971_520) { [weak self] data, _, isComplete, error in
            if let error = error {
                self?.onError?("Receive error: \(error)")
                return
            }
            
            if let data = data, !data.isEmpty {
                if self?.isWebSocketHandshakeComplete == false {
                    self?.handleHandshake(data)
                } else {
                    // Simple approach: try to extract text directly
                    self?.handleIncomingData(data)
                }
            }
            
            if !isComplete {
                self?.startReceiving()
            }
        }
    }
    
    private func handleHandshake(_ data: Data) {
        receivedData.append(data)
        
        guard let request = String(data: receivedData, encoding: .utf8) else { return }
        
        if request.contains("\r\n\r\n") {
            print("📨 Received WebSocket handshake request")
            
            // Parse the Sec-WebSocket-Key
            let lines = request.components(separatedBy: "\r\n")
            var webSocketKey: String?
            
            for line in lines {
                if line.lowercased().hasPrefix("sec-websocket-key:") {
                    webSocketKey = String(line.dropFirst("sec-websocket-key:".count)).trimmingCharacters(in: .whitespaces)
                    break
                }
            }
            
            guard let key = webSocketKey else {
                print("❌ No Sec-WebSocket-Key found in handshake")
                connection?.cancel()
                return
            }
            
            // Generate the accept key
            let acceptKey = generateWebSocketAcceptKey(key)
            
            // Send handshake response
            let response = "HTTP/1.1 101 Switching Protocols\r\n" +
                          "Upgrade: websocket\r\n" +
                          "Connection: Upgrade\r\n" +
                          "Sec-WebSocket-Accept: \(acceptKey)\r\n" +
                          "\r\n"
            
            if let responseData = response.data(using: .utf8) {
                connection?.send(content: responseData, completion: .contentProcessed { [weak self] error in
                    if let error = error {
                        print("❌ Failed to send handshake response: \(error)")
                    } else {
                        print("🤝 WebSocket handshake complete")
                        self?.isWebSocketHandshakeComplete = true
                        self?.onConnectionChanged?(true)
                        self?.startKeepAlive()
                    }
                })
            }
            
            receivedData.removeAll()
        }
    }
    
    private func generateWebSocketAcceptKey(_ key: String) -> String {
        let acceptGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        let combinedKey = key + acceptGUID
        
        guard let data = combinedKey.data(using: .utf8) else { return "" }
        
        let hash = data.withUnsafeBytes { bytes in
            var digest = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
            CC_SHA1(bytes.bindMemory(to: UInt8.self).baseAddress, CC_LONG(data.count), &digest)
            return Data(digest)
        }
        
        return hash.base64EncodedString()
    }
    
    // Simple data handling - accumulate data until we have complete frames
    private var dataBuffer = Data()
    
    private func handleIncomingData(_ data: Data) {
        print("📦 Received \(data.count) bytes of WebSocket data")
        
        // Accumulate data
        dataBuffer.append(data)
        print("🔄 Buffer now has \(dataBuffer.count) bytes")
        
        // Try to extract complete messages
        while let text = extractTextFromWebSocketData(dataBuffer) {
            handleTextMessage(text)
            // Remove processed data (this is simplified - in reality we'd track frame boundaries)
            dataBuffer.removeAll()
        }
    }
    
    // Simple WebSocket frame extraction focusing on text frames
    private func extractTextFromWebSocketData(_ data: Data) -> String? {
        guard data.count >= 2 else { return nil }
        
        let firstByte = data[0]
        let secondByte = data[1]
        
        // Check if it's a text frame (opcode 1)
        let opcode = firstByte & 0x0F
        guard opcode == 0x1 else { return nil }
        
        let masked = (secondByte & 0x80) != 0
        var payloadLength = Int(secondByte & 0x7F)
        var dataIndex = 2
        
        // Handle extended payload length
        if payloadLength == 126 {
            guard data.count >= 4 else { return nil }
            payloadLength = Int(data[2]) << 8 | Int(data[3])
            dataIndex = 4
        } else if payloadLength == 127 {
            guard data.count >= 10 else { return nil }
            // Handle 64-bit payload length correctly
            let high = UInt64(data[2]) << 56 | UInt64(data[3]) << 48 | UInt64(data[4]) << 40 | UInt64(data[5]) << 32
            let low = UInt64(data[6]) << 24 | UInt64(data[7]) << 16 | UInt64(data[8]) << 8 | UInt64(data[9])
            payloadLength = Int(high | low)
            dataIndex = 10
        }
        
        // Handle masking
        var maskingKey: [UInt8] = []
        if masked {
            guard data.count >= dataIndex + 4 else { return nil }
            maskingKey = Array(data[dataIndex..<dataIndex + 4])
            dataIndex += 4
        }
        
        // Extract payload
        guard data.count >= dataIndex + payloadLength else { return nil }
        var payload = Array(data[dataIndex..<dataIndex + payloadLength])
        
        // Unmask payload if needed
        if masked {
            for i in 0..<payload.count {
                payload[i] ^= maskingKey[i % 4]
            }
        }
        
        return String(data: Data(payload), encoding: .utf8)
    }
    
    private func handleTextMessage(_ message: String) {
        if message.count > 10000 {
            print("📨 Received LARGE message: \(message.count) chars")
        } else {
            print("📨 Received message: \(message)")
        }
        
        do {
            if let data = message.data(using: .utf8),
               let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                // Handle settings synchronization messages
                if let messageType = json["type"] as? String {
                    switch messageType {
                    case "settings_request":
                        sendSettingsToExtension()
                    case "general_settings_request":
                        sendGeneralSettingsToExtension()
                    case "firewall_settings_request":
                        sendFirewallSettingsToExtension()
                    default:
                        onMessage?(json)
                    }
                } else {
                    onMessage?(json)
                }
            }
        } catch {
            print("❌ Failed to parse message: \(error)")
            onError?("Failed to parse message: \(error)")
        }
    }
    
    func sendMessage(_ message: [String: Any]) {
        guard isWebSocketHandshakeComplete else {
            print("❌ Cannot send message: WebSocket handshake not complete")
            return
        }
        
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            if let text = String(data: data, encoding: .utf8) {
                sendTextFrame(text)
            }
        } catch {
            print("❌ Failed to serialize message: \(error)")
            onError?("Failed to serialize message: \(error)")
        }
    }
    
    private func sendTextFrame(_ text: String) {
        guard let connection = connection,
              let data = text.data(using: .utf8) else { return }
        
        var frame = Data()
        
        // First byte: FIN (1) + RSV (000) + Opcode (0001 for text)
        frame.append(0x81)
        
        // Payload length
        let length = data.count
        if length < 126 {
            frame.append(UInt8(length))
        } else if length < 65536 {
            frame.append(126)
            frame.append(UInt8(length >> 8))
            frame.append(UInt8(length & 0xFF))
        } else {
            frame.append(127)
            let length64 = UInt64(length)
            for i in 0..<8 {
                frame.append(UInt8((length64 >> (56 - i * 8)) & 0xFF))
            }
        }
        
        // Payload data
        frame.append(data)
        
        connection.send(content: frame, completion: .contentProcessed { error in
            if let error = error {
                print("❌ Send error: \(error)")
            }
        })
    }
    
    private func sendSettingsToExtension() {
        // Send current settings to Chrome extension
        let settingsManager = SettingsManager.shared
        print("📤 SimpleWebSocketServer: Sending \(settingsManager.agentModels.count) agent models to extension")
        
        let settingsUpdate: [String: Any] = [
            "type": "settings_update",
            "data": [
                "providers": settingsManager.providers.mapValues { provider in
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
                "agentModels": {
                    var agentModelsWithStringKeys: [String: Any] = [:]
                    for (key, config) in settingsManager.agentModels {
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
                        agentModelsWithStringKeys[key.rawValue] = dict
                    }
                    return agentModelsWithStringKeys
                }()
            ]
        ]
        
        sendMessage(settingsUpdate)
    }
    
    private func sendGeneralSettingsToExtension() {
        // Send current general settings to Chrome extension
        let generalSettingsManager = GeneralSettingsManager.shared
        
        let generalSettingsUpdate: [String: Any] = [
            "type": "general_settings_update",
            "data": [
                "maxSteps": generalSettingsManager.maxSteps,
                "maxActionsPerStep": generalSettingsManager.maxActionsPerStep,
                "maxFailures": generalSettingsManager.maxFailures,
                "useVision": generalSettingsManager.useVision,
                "displayHighlights": generalSettingsManager.displayHighlights,
                "planningInterval": generalSettingsManager.planningInterval,
                "minWaitPageLoad": generalSettingsManager.minWaitPageLoad,
                "replayHistoricalTasks": generalSettingsManager.replayHistoricalTasks
            ]
        ]
        
        sendMessage(generalSettingsUpdate)
    }
    
    private func sendFirewallSettingsToExtension() {
        // Send current firewall settings to Chrome extension
        let firewallManager = FirewallSettingsManager.shared
        
        let firewallSettingsUpdate: [String: Any] = [
            "type": "firewall_settings_update",
            "data": [
                "enabled": firewallManager.enabled,
                "allowList": firewallManager.allowList,
                "denyList": firewallManager.denyList
            ]
        ]
        
        sendMessage(firewallSettingsUpdate)
    }
    
    private func startKeepAlive() {
        stopKeepAlive()
        
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.sendPing()
        }
    }
    
    private func stopKeepAlive() {
        pingTimer?.invalidate()
        pingTimer = nil
    }
    
    private func sendPing() {
        guard isWebSocketHandshakeComplete else { return }
        
        let pingData = Data()
        sendPingFrame(pingData)
    }
    
    private func sendPingFrame(_ data: Data) {
        guard let connection = connection else { return }
        
        var frame = Data()
        frame.append(0x89) // FIN + Ping opcode
        frame.append(UInt8(data.count))
        frame.append(data)
        
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }
    
    func stop() {
        print("🔌 Stopping WebSocket server...")
        stopKeepAlive()
        
        connection?.cancel()
        connection = nil
        
        listener?.cancel()
        listener = nil
        
        isWebSocketHandshakeComplete = false
        receivedData.removeAll()
        isServerRunning = false
        
        print("✅ WebSocket server stopped")
    }
}