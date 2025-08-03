# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands for Development

### Building and Running
```bash
# Build the macOS app
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" build

# Run tests
xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" test

# Clean build artifacts
xcodebuild -project "Oniew Agent.xcodeproj" clean

# Run with Xcode (recommended for development)
open "Oniew Agent.xcodeproj"
```

### Chrome Extension Development
```bash
# Navigate to extension directory
cd nanobrowser-master

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build for production
pnpm build

# Lint and type checking
pnpm lint
pnpm type-check
```

## Architecture Overview

Oniew Agent is a macOS application with Chrome extension integration that enables AI-powered browser automation and control.

### macOS Application Components

1. **Window Management** (`Oniew_AgentApp.swift`):
   - Floating panel interface positioned at screen edge
   - Borderless, transparent window with hover controls
   - Always-on-top behavior for quick access

2. **WebSocket Server** (`Services/WebSocketServer.swift`):
   - Runs on port 8765 for Chrome extension communication
   - Handles bidirectional messaging with proper WebSocket framing
   - Automatic reconnection and keep-alive mechanisms
   - Settings synchronization between app and extension

3. **Settings Management**:
   - `SettingsManager`: AI model configurations per agent type
   - `GeneralSettingsManager`: Task execution parameters
   - `FirewallSettingsManager`: URL access control lists
   - All settings persist and sync with Chrome extension

4. **UI Components** (`Views/Components/`):
   - `AgentPanel`: Real-time task monitoring and status
   - `SettingsPanel`: Model provider and parameter configuration
   - `TaskMonitorPanel`: Active task visualization

### Integration Architecture

The system operates as a hybrid macOS + Chrome extension solution:

1. **macOS App**: Provides the UI, settings management, and WebSocket server
2. **Chrome Extension**: Executes browser automation using AI agents
3. **Communication**: WebSocket protocol for real-time bidirectional messaging

### WebSocket Message Protocol

Messages are JSON-formatted with the following types:
- `settings_request/update`: Sync AI model configurations
- `general_settings_request/update`: Sync execution parameters
- `firewall_settings_request/update`: Sync URL access rules
- Task execution messages from extension to app

### Key Integration Points

1. **Extension Connection** (`Services/ExtensionConnectionManager.swift`):
   - Manages WebSocket server lifecycle
   - Handles connection state and error recovery
   - Routes messages between UI and extension

2. **Settings Synchronization**:
   - App acts as source of truth for all settings
   - Extension requests settings on connection
   - Changes in app immediately sync to extension

3. **Task Monitoring**:
   - Extension sends task progress updates
   - App displays real-time status in floating panel
   - Error states and completion tracked visually

### Development Workflow

1. Start the macOS app to launch WebSocket server
2. Load Chrome extension in developer mode
3. Extension automatically connects to local WebSocket
4. Configure AI models and settings in macOS app
5. Execute browser automation tasks from extension
6. Monitor progress in macOS floating panel

### Security Model

- Local-only WebSocket communication (no remote access)
- macOS app requires no special permissions
- Chrome extension handles all browser interactions
- Settings stored locally with no cloud sync