# Oniew Agent - macOS Control Agent

## Project Overview
Oniew Agent is a macOS application that provides AI-powered control and automation of macOS systems. This agent allows users to interact with their Mac through natural language commands and automate various system tasks.

## Architecture
- **Platform**: macOS (SwiftUI)
- **Language**: Swift
- **Framework**: SwiftUI for UI, Foundation for system interactions
- **Target**: macOS 12.0+

## Core Features
- System automation and control
- Natural language command processing
- File system operations
- Application management
- System preferences modification
- Accessibility-based UI automation

## Development Environment
- Xcode 14.0+
- Swift 5.7+
- macOS 12.0+ deployment target

## Key Components
- `Oniew_AgentApp.swift` - Main application entry point
- `ContentView.swift` - Primary user interface
- Additional views and controllers for specific functionality

## System Permissions Required
- Accessibility API access for UI automation
- Full Disk Access for file operations
- Automation permissions for controlling other applications

## Security Considerations
- All system access is controlled through macOS permission prompts
- No remote code execution capabilities
- Local-only operation for security

## Testing
- Unit tests in `Oniew AgentTests/`
- UI tests in `Oniew AgentUITests/`

## Commands for Development
- Build: `xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" build`
- Test: `xcodebuild -project "Oniew Agent.xcodeproj" -scheme "Oniew Agent" test`
- Clean: `xcodebuild -project "Oniew Agent.xcodeproj" clean`

## Project Structure
```
Oniew Agent/
├── Oniew Agent.xcodeproj/     # Xcode project files
├── Oniew Agent/               # Main app source
│   ├── Assets.xcassets/       # App assets and icons
│   ├── ContentView.swift      # Main UI view
│   ├── Oniew_AgentApp.swift   # App entry point
│   └── Oniew_Agent.entitlements # App capabilities
├── Oniew AgentTests/          # Unit tests
├── Oniew AgentUITests/        # UI tests
└── .gitignore                 # Git ignore rules
```

## Development Notes
- Focus on defensive security practices
- Implement proper error handling for system operations
- Use SwiftUI for modern, declarative UI
- Follow macOS Human Interface Guidelines
- Ensure compatibility with macOS accessibility features