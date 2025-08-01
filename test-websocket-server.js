// Test WebSocket server with proper handshake
const http = require('http');
const crypto = require('crypto');

const port = 41900; // Use different port to test our implementation

const server = http.createServer();

server.on('upgrade', (request, socket, head) => {
  console.log('📨 WebSocket upgrade request received');
  
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  
  // Generate accept key
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  // Send handshake response
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
    ''
  ].join('\r\n');
  
  socket.write(responseHeaders);
  console.log('✅ WebSocket handshake complete');
  
  // Handle WebSocket frames
  socket.on('data', (buffer) => {
    console.log('📨 Received WebSocket frame');
    
    // Simple text frame parsing
    if (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0F;
      
      if (opcode === 0x1) { // Text frame
        const masked = (secondByte & 0x80) !== 0;
        let payloadLength = secondByte & 0x7F;
        let dataIndex = 2;
        
        if (masked) {
          const maskingKey = buffer.slice(dataIndex, dataIndex + 4);
          dataIndex += 4;
          
          const payload = buffer.slice(dataIndex, dataIndex + payloadLength);
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskingKey[i % 4];
          }
          
          const message = payload.toString('utf8');
          console.log('📨 Message:', message);
          
          // Send echo response
          const response = JSON.stringify({
            type: 'echo',
            message: `Server received: ${message}`
          });
          
          sendTextFrame(socket, response);
        }
      }
    }
  });
  
  socket.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });
});

function sendTextFrame(socket, text) {
  const data = Buffer.from(text, 'utf8');
  const frame = Buffer.alloc(2 + data.length);
  
  frame[0] = 0x81; // FIN + text opcode
  frame[1] = data.length; // payload length (assuming < 126)
  data.copy(frame, 2);
  
  socket.write(frame);
  console.log('📤 Sent message:', text);
}

server.listen(port, () => {
  console.log(`🚀 Test WebSocket server listening on port ${port}`);
  console.log('Test with: wscat -c ws://localhost:41900');
});