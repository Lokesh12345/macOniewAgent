# Chrome Extension to Mac App Connection Analysis

## Available Connection Methods

### 1. Native Messaging
**How it works**: Chrome launches the native app as a subprocess and communicates via stdin/stdout

**Pros:**
- Official Chrome API
- Secure (requires manifest installation)
- No network ports needed
- Works with sandboxed apps

**Cons:**
- Complex setup (manifest installation required)
- Requires browser restart after manifest changes
- App runs as Chrome subprocess (not standalone)
- Different manifest paths for each OS/browser
- Hard to debug
- User needs admin rights for system-wide installation

**Best for**: Simple command-line tools, password managers

---

### 2. WebSocket Server
**How it works**: Mac app runs a WebSocket server, extension connects as client

**Pros:**
- Real-time bidirectional communication
- No browser restart needed
- Easy to debug
- Works across all browsers
- App remains independent
- Can handle multiple connections

**Cons:**
- Requires local port (firewall issues)
- Less secure (any local app can connect)
- Need to handle CORS
- Port conflicts possible

**Best for**: Real-time apps, development tools, multi-client scenarios

---

### 3. HTTP Server (REST API)
**How it works**: Mac app runs HTTP server, extension makes HTTP requests

**Pros:**
- Simple to implement
- Well-understood protocol
- Easy to test with curl/Postman
- Stateless communication

**Cons:**
- Not real-time (polling required)
- Higher latency
- Port/firewall issues
- CORS configuration needed

**Best for**: Simple request/response operations

---

### 4. Local Storage Bridge
**How it works**: Both apps read/write to shared local storage

**Pros:**
- No networking required
- Works offline
- Simple implementation

**Cons:**
- Not real-time
- Requires file system permissions
- Platform-specific paths
- Polling required

**Best for**: Config sharing, offline scenarios

---

### 5. Custom Protocol Handler
**How it works**: Register custom URL scheme (e.g., oniew://command)

**Pros:**
- Clean user experience
- No ports needed
- OS-level integration

**Cons:**
- One-way communication only
- Requires OS registration
- Limited data transfer
- Not suitable for continuous communication

**Best for**: Launching apps, one-time actions

---

## Recommendation for Oniew Agent

**Best Choice: WebSocket Server**

### Reasoning:

1. **User Experience**
   - No manifest installation required
   - No browser restarts needed
   - Works immediately after app launch
   - Easy "it just works" setup

2. **Technical Benefits**
   - Real-time bidirectional communication (essential for agent control)
   - Can stream execution logs/events
   - Supports multiple browser connections
   - Easy to implement reconnection logic

3. **Development Benefits**
   - Easy to debug (can test with wscat)
   - Works in development without special setup
   - Same code works in production

4. **Security Considerations**
   - Can implement token-based authentication
   - Can restrict to localhost only
   - Can use TLS for encryption (wss://)

### Implementation Strategy:

1. **Mac App (Server)**
   ```
   - WebSocket server on port 41899 (or similar high port)
   - JSON message protocol
   - Automatic reconnection handling
   - Token-based authentication
   ```

2. **Chrome Extension (Client)**
   ```
   - WebSocket client with reconnection
   - Fallback to polling if WebSocket fails
   - Connection status indicator
   ```

3. **Security**
   ```
   - Generate unique token on app start
   - Extension must authenticate with token
   - Only accept localhost connections
   ```

### Alternative Hybrid Approach:

For maximum compatibility, implement **both** WebSocket and Native Messaging:
- Use WebSocket by default (better UX)
- Fall back to Native Messaging if WebSocket fails
- Let power users choose their preferred method

This gives us the best of both worlds!