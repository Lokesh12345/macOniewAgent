# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Oniew Agent - macOS AI Control System

## Project Overview
Oniew Agent is a sophisticated macOS application that combines a native SwiftUI interface with a Chrome extension (Nanobrowser-based) to provide AI-powered browser automation and system control. The system uses real-time WebSocket communication between the Mac app and browser extension for seamless AI task execution.

## Architecture

### Core Components
1. **macOS Application** (SwiftUI)
   - Floating window interface positioned on right side of screen  
   - WebSocket server for extension communication (port 41899)
   - Settings management for AI providers and agent configurations
   - Real-time task monitoring and execution feedback

2. **Chrome Extension** (Nanobrowser fork)
   - Multi-agent AI system (Navigator, Planner, Validator)
   - Browser automation and web interaction capabilities
   - Connects to Mac app via WebSocket for task coordination

3. **Communication Layer**
   - WebSocket server implementation with custom protocol
   - JSON message passing for task execution and status updates
   - Real-time bidirectional communication

### Key Technologies
- **Platform**: macOS 12.0+ (SwiftUI, Foundation, Network)
- **Language**: Swift for Mac app, TypeScript for extension
- **Communication**: Custom WebSocket protocol
- **AI Integration**: Multi-provider support (OpenAI, Anthropic, Ollama, etc.)

## Development Commands

### Mac Application
```bash
# Build the Mac app
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" build

# Run tests
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" test

# Clean build artifacts
xcodebuild -project "Oniew Agent.xcodeproj" clean

# Build and run (for development)
# Use Xcode's Run button or ⌘+R shortcut
```

### Chrome Extension (located in `extension/`)
```bash
# Install dependencies
pnpm install

# Development build with hot reload
pnpm dev

# Production build
pnpm build

# Type checking
pnpm type-check

# Linting and formatting
pnpm lint
pnpm prettier

# Clean all build artifacts
pnpm clean
```

### WebSocket Server Testing
```bash
# Test WebSocket connection (requires Node.js and ws package)
node test-websocket.js

# Start Ollama server (if using local models)
./start-ollama.sh
```

## Architecture Patterns

### SwiftUI Application Structure
- **App Entry Point**: `Oniew_AgentApp.swift` configures floating window behavior
- **Main Interface**: `ContentView.swift` hosts `AgentPanel` component
- **Modular Components**: 
  - `AgentPanel.swift` - Main task interface with real-time execution monitoring
  - `SettingsPanel.swift` - AI provider and agent configuration
  - `TaskMonitorPanel.swift` - Task execution monitoring

### Services Layer
- **WebSocketServer.swift**: Full WebSocket implementation with handshake, framing, and ping/pong
- **ExtensionConnectionManager.swift**: High-level connection management and message routing
- **Settings Managers**: Separate managers for general, provider, and firewall settings

### State Management
- Uses `@StateObject` and `@Published` for reactive UI updates
- `NotificationCenter` for cross-component communication
- Shared singleton managers for settings and connection state

### WebSocket Communication Protocol
```json
// Task execution
{"type": "execute_task", "data": {"task": "...", "taskId": "..."}}

// Status updates
{"type": "executor_event", "data": {"event": {...}}}
{"type": "task_analysis", "data": {...}}
{"type": "step_progress", "data": {...}}

// Settings synchronization  
{"type": "settings_request", "data": {}}
{"type": "settings_update", "data": {"providers": {...}, "agentModels": {...}}}
```

## Development Guidelines

### Permissions & Entitlements
- App uses borderless window style with floating level
- Required entitlements for system access defined in `Oniew_Agent.entitlements`
- Network permissions for WebSocket server operation

### Error Handling
- WebSocket server includes robust reconnection logic
- Address-in-use detection prevents port conflicts
- Graceful handling of extension disconnections

### UI Patterns
- Floating panel design with drag-to-move functionality
- Real-time execution steps with animated progress indicators
- Conditional UI based on connection status and task execution state

### Testing Strategy
- Unit tests for core functionality in `Oniew AgentTests/`
- UI tests for interface interactions in `Oniew AgentUITests/`
- Manual WebSocket testing scripts provided

## Extension Integration

### Build Integration
The extension uses a monorepo structure with:
- `pages/` - Different extension pages (options, side-panel, content)
- `chrome-extension/` - Main extension logic and background scripts
- `packages/` - Shared packages and utilities

### Key Extension Commands
```bash
# Build for Chrome (default)
pnpm build

# Build for Firefox
pnpm build:firefox

# Package for distribution
pnpm zip

# Development with file watching
pnpm dev
```

## Common Development Tasks

### Adding New WebSocket Message Types
1. Define message structure in both Mac app and extension
2. Add handler in `ExtensionConnectionManager.handleExtensionMessage()`
3. Update message routing logic
4. Test bidirectional communication

### Modifying Agent Configuration
1. Update settings models in `Models/` directory
2. Synchronize changes through WebSocket settings messages
3. Update UI components in `SettingsPanel.swift`

### Debugging Connection Issues
1. Check WebSocket server logs in Xcode console
2. Verify port 41899 availability: `lsof -ti:41899`
3. Test with provided WebSocket test scripts
4. Monitor extension console for connection errors