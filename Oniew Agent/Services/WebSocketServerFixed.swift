import Foundation
import Network
import CommonCrypto

// Fixed WebSocket server with proper frame buffering for large messages
class WebSocketServerFixed {
    private var listener: NWListener?
    private var connection: NWConnection?
    private let port: UInt16
    private let queue = DispatchQueue(label: "websocket.server", qos: .userInitiated)
    
    var onConnectionChanged: ((Bool) -> Void)?
    var onMessage: ((String) -> Void)?
    var onError: ((String) -> Void)?
    
    private var isServerRunning = false
    private var keepAliveTimer: Timer?
    
    // WebSocket state
    private var isWebSocketHandshakeComplete = false
    private var receivedData = Data()
    private var frameBuffer = Data()  // Buffer for accumulating partial frames
    
    init(port: UInt16) {
        self.port = port
    }
    
    func start() {
        guard !isServerRunning else {
            print("⚠️ WebSocket server already running")
            return
        }
        
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        
        do {
            listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: port))
            
            listener?.newConnectionHandler = { [weak self] newConnection in
                self?.handleNewConnection(newConnection)
            }
            
            listener?.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    self?.isServerRunning = true
                    print("✅ WebSocket server listening on port \(self?.port ?? 0)")
                case .failed(let error):
                    self?.isServerRunning = false
                    self?.onError?("Server failed: \(error)")
                    print("❌ WebSocket server failed: \(error)")
                case .cancelled:
                    self?.isServerRunning = false
                    print("🛑 WebSocket server cancelled")
                default:
                    break
                }
            }
            
            listener?.start(queue: queue)
            
        } catch {
            onError?("Failed to start server: \(error)")
            print("❌ Failed to start WebSocket server: \(error)")
        }
    }
    
    private func handleNewConnection(_ newConnection: NWConnection) {
        // Cancel existing connection
        connection?.cancel()
        
        // Reset state
        isWebSocketHandshakeComplete = false
        receivedData.removeAll()
        frameBuffer.removeAll()
        
        connection = newConnection
        print("🔗 New TCP connection from: \(newConnection.endpoint)")
        
        newConnection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("✅ TCP connection ready, waiting for WebSocket handshake")
                self?.startReceiving()
            case .failed(let error):
                print("❌ Connection failed: \(error)")
                self?.onConnectionChanged?(false)
            case .cancelled:
                print("🔌 Connection cancelled")
                self?.onConnectionChanged?(false)
            default:
                break
            }
        }
        
        newConnection.start(queue: queue)
    }
    
    private func startReceiving() {
        // Receive up to 10MB at once for large messages
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 10485760) { [weak self] data, _, isComplete, error in
            if let error = error {
                self?.onError?("Receive error: \(error)")
                return
            }
            
            guard let data = data, !data.isEmpty else {
                if isComplete {
                    self?.connection?.cancel()
                }
                return
            }
            
            if self?.isWebSocketHandshakeComplete == true {
                self?.handleWebSocketFrame(data)
            } else {
                self?.handleHandshake(data)
            }
            
            // Continue receiving
            self?.startReceiving()
        }
    }
    
    private func handleHandshake(_ data: Data) {
        receivedData.append(data)
        
        guard let request = String(data: receivedData, encoding: .utf8) else { return }
        
        if request.contains("\r\n\r\n") {
            print("📨 Received WebSocket handshake request")
            
            // Extract WebSocket key
            if let keyRange = request.range(of: "Sec-WebSocket-Key: "),
               let endRange = request.range(of: "\r\n", range: keyRange.upperBound..<request.endIndex) {
                let key = String(request[keyRange.upperBound..<endRange.lowerBound])
                let acceptKey = generateWebSocketAcceptKey(key)
                
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
                        }
                    })
                }
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
        // Append new data to frame buffer
        frameBuffer.append(data)
        
        // Process complete frames from buffer
        while processNextFrame() {
            // Keep processing frames until we can't parse a complete one
        }
    }
    
    private func processNextFrame() -> Bool {
        guard frameBuffer.count >= 2 else { return false }
        
        let firstByte = frameBuffer[0]
        let secondByte = frameBuffer[1]
        
        let fin = (firstByte & 0x80) != 0
        let opcode = firstByte & 0x0F
        let masked = (secondByte & 0x80) != 0
        var payloadLength = Int(secondByte & 0x7F)
        
        var headerLength = 2
        
        // Handle extended payload length
        if payloadLength == 126 {
            guard frameBuffer.count >= 4 else { return false }
            payloadLength = Int(frameBuffer[2]) << 8 | Int(frameBuffer[3])
            headerLength = 4
        } else if payloadLength == 127 {
            guard frameBuffer.count >= 10 else { return false }
            // Handle 64-bit payload length
            let high = UInt64(frameBuffer[2]) << 56 | UInt64(frameBuffer[3]) << 48 |
                      UInt64(frameBuffer[4]) << 40 | UInt64(frameBuffer[5]) << 32
            let low = UInt64(frameBuffer[6]) << 24 | UInt64(frameBuffer[7]) << 16 |
                     UInt64(frameBuffer[8]) << 8 | UInt64(frameBuffer[9])
            payloadLength = Int(high | low)
            headerLength = 10
            print("📊 Large frame: \(payloadLength) bytes")
        }
        
        // Add mask key length if masked
        if masked {
            headerLength += 4
        }
        
        // Check if we have the complete frame
        let totalFrameLength = headerLength + payloadLength
        guard frameBuffer.count >= totalFrameLength else {
            print("⏳ Waiting for more data: have \(frameBuffer.count), need \(totalFrameLength)")
            return false
        }
        
        // Extract mask key if present
        var maskKey: [UInt8] = []
        if masked {
            let maskStart = headerLength - 4
            maskKey = Array(frameBuffer[maskStart..<maskStart + 4])
        }
        
        // Extract and unmask payload
        let payloadStart = headerLength
        var payload = Array(frameBuffer[payloadStart..<payloadStart + payloadLength])
        
        if masked {
            for i in 0..<payload.count {
                payload[i] ^= maskKey[i % 4]
            }
        }
        
        // Process the frame based on opcode
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
        
        // Remove processed frame from buffer
        frameBuffer.removeFirst(totalFrameLength)
        
        return true  // Successfully processed a frame
    }
    
    private func handleTextMessage(_ message: String) {
        // Log differently based on message size
        if message.count > 10000 {
            print("📨 Received LARGE message: \(message.count) chars")
            
            // Try to identify message type
            if let data = message.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let messageType = json["type"] as? String {
                print("🎯 Large message type: \(messageType)")
                
                if messageType == "screenshot" {
                    print("📸 SCREENSHOT RECEIVED! Processing...")
                }
            }
        } else {
            print("📨 Received message: \(message)")
        }
        
        // Pass to handler
        onMessage?(message)
    }
    
    func sendMessage(_ message: String) {
        guard isWebSocketHandshakeComplete else {
            print("⚠️ Cannot send - handshake not complete")
            return
        }
        
        guard let data = message.data(using: .utf8) else { return }
        
        var frame = Data()
        
        // FIN = 1, opcode = 1 (text)
        frame.append(0x81)
        
        // Add payload length
        let length = data.count
        if length < 126 {
            frame.append(UInt8(length))
        } else if length < 65536 {
            frame.append(126)
            frame.append(UInt8((length >> 8) & 0xFF))
            frame.append(UInt8(length & 0xFF))
        } else {
            frame.append(127)
            let length64 = UInt64(length)
            for i in 0..<8 {
                frame.append(UInt8((length64 >> (56 - i * 8)) & 0xFF))
            }
        }
        
        // Add payload
        frame.append(data)
        
        // Send frame
        connection?.send(content: frame, completion: .contentProcessed { error in
            if let error = error {
                print("❌ Send failed: \(error)")
            }
        })
    }
    
    private func sendPong(_ data: Data) {
        var frame = Data()
        frame.append(0x8A) // FIN = 1, opcode = 10 (pong)
        
        if data.count < 126 {
            frame.append(UInt8(data.count))
        } else {
            frame.append(126)
            frame.append(UInt8((data.count >> 8) & 0xFF))
            frame.append(UInt8(data.count & 0xFF))
        }
        
        frame.append(data)
        
        connection?.send(content: frame, completion: .contentProcessed { _ in })
    }
    
    func stop() {
        listener?.cancel()
        connection?.cancel()
        listener = nil
        connection = nil
        
        isWebSocketHandshakeComplete = false
        receivedData.removeAll()
        frameBuffer.removeAll()
        isServerRunning = false
        
        print("✅ WebSocket server stopped")
    }
}