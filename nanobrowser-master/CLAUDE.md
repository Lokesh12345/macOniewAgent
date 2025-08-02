# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

This is a monorepo using pnpm and Turbo. Key commands:

```bash
# Development (Chrome)
pnpm dev

# Development (Firefox)
pnpm dev:firefox

# Build for production
pnpm build

# Build for Firefox
pnpm build:firefox

# Create ZIP for distribution
pnpm zip
pnpm zip:firefox

# Code quality
pnpm lint
pnpm type-check
pnpm prettier

# Clean operations
pnpm clean              # Full clean
pnpm clean:bundle       # Clean dist only
pnpm clean:node_modules # Clean dependencies
```

## Architecture Overview

Nanobrowser is a Chrome extension with a multi-agent AI system for web automation:

### Core Components

1. **Multi-Agent System** (`chrome-extension/src/background/agent/`):
   - **Navigator Agent**: Executes web actions (clicking, typing, navigation)
   - **Planner Agent**: High-level task planning and strategy
   - **Validator Agent**: Validates action outcomes and success criteria
   - **Executor**: Orchestrates agent collaboration and task execution

2. **Browser Context** (`chrome-extension/src/background/browser/`):
   - Manages Chrome debugger protocol for DOM interaction
   - Handles page state, screenshots, and element highlighting
   - DOM service provides structured element trees for agent consumption

3. **Extension Pages** (`pages/`):
   - **Side Panel**: Main chat interface for user interaction
   - **Options Page**: Settings and model configuration
   - **Content Scripts**: Injected DOM manipulation utilities

### Key Architecture Patterns

- **Event-Driven Communication**: Agents communicate via event system with the side panel
- **LLM Provider Abstraction**: Supports multiple LLM providers (OpenAI, Anthropic, Gemini, etc.)
- **Action Schema System**: Dynamic action schemas generated from available browser actions
- **State Management**: Chrome storage API with typed stores for settings and chat history

### Browser Integration

- Uses Chrome Debugger Protocol for reliable DOM access
- Injects `buildDomTree.js` script for enhanced DOM parsing
- Side panel provides persistent chat interface
- Background service worker handles all AI agent logic

### Development Notes

- TypeScript with strict type checking
- Uses Vite for bundling with Chrome extension manifest
- Tailwind CSS for styling
- React for UI components
- LangChain integration for LLM abstraction
- Zod schemas for runtime type validation

### Multi-Agent Workflow

1. User submits task via side panel
2. Executor creates Navigator, Planner (optional), Validator (optional) agents
3. Navigator executes actions based on current DOM state
4. Planner provides strategic guidance at intervals
5. Validator checks if goals are achieved
6. Process continues until task completion or failure

The system emphasizes modularity, with each agent having specific responsibilities and the ability to use different LLM models for cost/performance optimization.