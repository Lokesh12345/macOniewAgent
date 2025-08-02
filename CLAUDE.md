# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Oniew Agent - macOS Control Agent

## Project Overview
Oniew Agent is a dual-component AI-powered automation system consisting of:
1. **macOS Application** (Swift/SwiftUI) - Floating control interface
2. **Chrome Extension** (TypeScript/React) - Browser automation based on nanobrowser

## Development Commands

### macOS Application
```bash
# Build
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" build

# Test
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" test

# Clean
xcodebuild -project "Oniew Agent.xcodeproj" clean
```

### Chrome Extension (nanobrowser-master/)
```bash
# Development with hot reload
pnpm dev

# Production build
pnpm build

# Create distribution package
pnpm zip

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## Architecture Overview

### Core Components
- **AgentPanel.swift** (1,622 lines) - Main UI with tabbed interface, task execution display, and chat input
- **WebSocketServer.swift** - Custom WebSocket implementation (port 41899)
- **ExtensionConnectionManager.swift** - Handles communication between macOS app and Chrome extension
- **SettingsManager.swift** - Manages 12 LLM providers with agent-specific model assignments

### Communication Protocol
- Custom WebSocket server on port 41899 (localhost-only)
- JSON message format between macOS app and Chrome extension
- Auto-reconnection and ping/pong heartbeat
- Real-time task execution updates

### UI Architecture
- Floating, borderless window (300x600px) positioned at right-center screen
- Always-on-top with transparent background
- Drag-to-move functionality
- SwiftUI MVVM pattern with reactive data binding

### LLM Integration
- Supports 12 providers: OpenAI, Anthropic, Ollama, Groq, DeepSeek, etc.
- Agent-specific model assignments (planner, navigator, validator)
- Automatic Ollama model discovery
- Settings synchronized between app and extension

## Security Configuration
The app requires extensive macOS permissions (defined in entitlements):
- Audio input access for voice commands
- Screen capture for monitoring
- File system access for downloads
- Apple Events automation for system control
- Subprocess execution for external tools

## Key Development Patterns

### State Management
- `@StateObject` and `@Published` for reactive SwiftUI components
- Singleton pattern for core services (`ExtensionConnectionManager.shared`, `SettingsManager.shared`)
- `NotificationCenter` for cross-component communication

### WebSocket Implementation
- Pure Swift implementation without external dependencies
- Custom frame parsing and handshake handling
- Supports WebSocket protocol RFC 6455

### Extension Development
- Based on nanobrowser architecture
- Chrome Manifest V3
- Shared TypeScript packages for common functionality

## Testing
- Minimal unit tests in `Oniew AgentTests/`
- UI tests in `Oniew AgentUITests/`
- Integration testing via WebSocket connection between components
- Use `wscat` for WebSocket debugging: `wscat -c ws://localhost:41899`

## Development Environment
- macOS 12.0+ deployment target
- Xcode 14.0+ with Swift 5.7+
- Node.js 22.12.0+ for extension development
- Chrome browser for extension testing

## Project Structure Notes
- `nanobrowser-master/` contains the Chrome extension codebase
- `Oniew Agent/Models/`, `Services/`, `Views/Components/` organize Swift code by layer
- Settings are synchronized between macOS app and extension via WebSocket
- Both codebases maintain independent build systems but share communication protocol