import Foundation
import Network
import CommonCrypto

class WebSocketServer {
    private let port: UInt16
    private var listener: NWListener?
    private var connection: NWConnection?
    private let queue = DispatchQueue(label: "websocket.server")
    private var pingTimer: Timer?
    private var isServerRunning = false
    
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
            print("⚠️ WebSocket server is already running")
            return
        }
        
        // Stop any existing listener first
        listener?.cancel()
        listener = nil
        
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
                    print("🚀 WebSocket server listening on port \(self?.port ?? 0)")
                case .failed(let error):
                    self?.isServerRunning = false
                    print("❌ Server failed: \(error)")
                    self?.onError?("Server failed to start: \(error)")
                    
                    // Only retry if it's not an "address in use" error
                    let errorDescription = "\(error)"
                    if case .posix(let posixErrorCode) = error, posixErrorCode == .EADDRINUSE {
                        print("⚠️ Port \(self?.port ?? 0) is already in use - not retrying")
                        return
                    } else if errorDescription.contains("Address already in use") || errorDescription.contains("rawValue: 48") {
                        print("⚠️ Port \(self?.port ?? 0) is already in use - not retrying")
                        return
                    }
                    
                    // Try to restart after a delay for other errors
                    DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                        self?.start()
                    }
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
            
            // Don't retry if it's an address in use error
            let errorDescription = "\(error)"
            if errorDescription.contains("Address already in use") || errorDescription.contains("rawValue: 48") {
                print("⚠️ Port \(port) is already in use - not retrying")
                return
            }
            
            // Retry after delay for other errors
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                self.start()
            }
        }
    }
    
    private func handleNewConnection(_ newConnection: NWConnection) {
        // Close existing connection if any
        stopKeepAlive()
        connection?.cancel()
        
        // Reset handshake state for new connection
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
            case .waiting(let error):
                print("⏳ TCP connection waiting: \(error)")
            case .preparing:
                print("🔄 TCP connection preparing...")
            default:
                print("🔍 TCP connection state: \(state)")
            }
        }
        
        connection?.start(queue: queue)
    }
    
    private var isWebSocketHandshakeComplete = false
    private var receivedData = Data()
    
    private func startReceiving() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            if let error = error {
                self?.onError?("Receive error: \(error)")
                return
            }
            
            if let data = data, !data.isEmpty {
                if self?.isWebSocketHandshakeComplete == false {
                    self?.handleHandshake(data)
                } else {
                    self?.handleWebSocketFrame(data)
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
        
        // Check if we have a complete HTTP request
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
    
    private func handleWebSocketFrame(_ data: Data) {
        // Parse WebSocket frame
        guard data.count >= 2 else { return }
        
        let firstByte = data[0]
        let secondByte = data[1]
        
        let _ = (firstByte & 0x80) != 0 // FIN bit - intentionally unused
        let opcode = firstByte & 0x0F
        let masked = (secondByte & 0x80) != 0
        var payloadLength = Int(secondByte & 0x7F)
        
        var dataIndex = 2
        
        // Handle extended payload length
        if payloadLength == 126 {
            guard data.count >= 4 else { return }
            payloadLength = Int(data[2]) << 8 | Int(data[3])
            dataIndex = 4
        } else if payloadLength == 127 {
            guard data.count >= 10 else { return }
            // For simplicity, we'll only handle smaller messages
            return
        }
        
        // Handle masking
        var maskingKey: [UInt8] = []
        if masked {
            guard data.count >= dataIndex + 4 else { return }
            maskingKey = Array(data[dataIndex..<dataIndex + 4])
            dataIndex += 4
        }
        
        guard data.count >= dataIndex + payloadLength else { return }
        
        var payload = Array(data[dataIndex..<dataIndex + payloadLength])
        
        // Unmask payload if needed
        if masked {
            for i in 0..<payload.count {
                payload[i] ^= maskingKey[i % 4]
            }
        }
        
        // Handle different opcodes
        switch opcode {
        case 0x1: // Text frame
            if let message = String(data: Data(payload), encoding: .utf8) {
                handleTextMessage(message)
            }
        case 0x8: // Close frame
            connection?.cancel()
        case 0x9: // Ping frame
            sendPong(Data(payload))
        default:
            break
        }
    }
    
    private func handleTextMessage(_ message: String) {
        print("📨 Received WebSocket message: \(message)")
        do {
            if let data = message.data(using: .utf8),
               let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                print("✅ Parsed JSON message: \(json)")
                
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
    
    private func sendSettingsToExtension() {
        // Send current settings to Chrome extension
        let settingsManager = SettingsManager.shared
        print("📤 WebSocketServer: Sending \(settingsManager.agentModels.count) agent models to extension")
        for (agent, config) in settingsManager.agentModels {
            print("   Agent \(agent.rawValue): \(config.provider) > \(config.modelName) (temp: \(config.parameters?.temperature ?? 0), topP: \(config.parameters?.topP ?? 0))")
        }
        
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
                "agentModels": settingsManager.agentModels.mapValues { config in
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
    
    func sendMessage(_ message: [String: Any]) {
        guard isWebSocketHandshakeComplete else {
            print("❌ Cannot send message: WebSocket handshake not complete")
            return
        }
        
        print("📤 Sending WebSocket message: \(message)")
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            if let text = String(data: data, encoding: .utf8) {
                print("📤 Serialized message: \(text)")
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
            // For simplicity, we'll limit message size
            return
        }
        
        // Payload data
        frame.append(data)
        
        connection.send(content: frame, completion: .contentProcessed { error in
            if let error = error {
                print("❌ Send error: \(error)")
            } else {
                print("✅ Message sent successfully")
            }
        })
    }
    
    private func sendPong(_ data: Data) {
        guard let connection = connection else { return }
        
        var frame = Data()
        frame.append(0x8A) // FIN + Pong opcode
        frame.append(UInt8(data.count))
        frame.append(data)
        
        connection.send(content: frame, completion: .contentProcessed { _ in
            print("🏓 Pong sent")
        })
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
        print("🏓 Sent ping to keep connection alive")
    }
    
    private func sendPingFrame(_ data: Data) {
        guard let connection = connection else { return }
        
        var frame = Data()
        frame.append(0x89) // FIN + Ping opcode
        frame.append(UInt8(data.count))
        frame.append(data)
        
        connection.send(content: frame, completion: .contentProcessed { error in
            if let error = error {
                print("❌ Failed to send ping: \(error)")
            }
        })
    }
    
    func stop() {
        print("🔌 Stopping WebSocket server...")
        stopKeepAlive()
        
        // Close connection first
        connection?.cancel()
        connection = nil
        
        // Cancel listener
        listener?.cancel()
        listener = nil
        
        // Reset state
        isWebSocketHandshakeComplete = false
        receivedData.removeAll()
        isServerRunning = false
        
        print("✅ WebSocket server stopped")
    }
}