# Visual Agent

A simplified browser automation system using vision-language models for direct visual understanding.

## Architecture

**Simple Flow:**
```
User Task → Screenshot → VL Model → Actions → Browser Execution
```

**Components:**
- **Mac App**: SwiftUI interface with WebSocket server
- **Chrome Extension**: Minimal screenshot capture + action execution
- **VL Model**: GPT-4V/Claude 3.5 Sonnet for visual analysis

## Setup

### 1. Chrome Extension
```bash
cd extension
# Load unpacked extension in Chrome developer mode
```

### 2. Mac App
```bash
cd mac-app
# Open in Xcode and build
# Update VL model API key in VLModelService.swift
```

### 3. Usage
1. Launch Mac app (floating window appears)
2. Extension auto-connects via WebSocket
3. Type task: "Click the search button"
4. Agent takes screenshot → analyzes → executes

## Key Features

- **Visual-first**: Direct screenshot analysis, no DOM parsing
- **Simple**: Single VL model call per action cycle  
- **Real-time**: WebSocket communication for instant feedback
- **Minimal**: No complex multi-agent orchestration

## Extension API

```javascript
// Takes screenshot
chrome.tabs.captureVisibleTab()

// Executes actions
{ type: "click", coordinates: {x: 100, y: 200} }
{ type: "type", selector: "input", text: "hello" }  
{ type: "scroll", direction: "down", amount: 300 }
```

## VL Model Integration

Replace API key in `VLModelService.swift`:
```swift
private let apiKey = "your-openai-api-key"
```

Supports GPT-4V, Claude 3.5 Sonnet, or any vision-language model with JSON output.