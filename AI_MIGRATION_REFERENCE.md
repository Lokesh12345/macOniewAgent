# AI Migration Reference Document

## Current Architecture Analysis

### What We Have Now

#### Extension (Heavy - Contains AI Logic)
Located in: `extension/chrome-extension/src/background/agent/agents/`

**AI Components to Move:**
1. **PlannerAgent** (`planner.ts`)
   - Uses LangChain with LLM API keys
   - Plans task execution steps
   - Requires OpenAI/Anthropic API keys

2. **NavigatorAgent** (`navigator.ts`) 
   - Most complex agent (26KB file)
   - Decides what actions to take on web pages
   - Uses structured output with JSON schema
   - Maintains action registry

3. **ValidatorAgent** (`validator.ts`)
   - Validates if task is completed correctly
   - Uses LLM to check results
   - Requires API keys

**Dependencies:**
- LangChain libraries
- Zod schemas for validation
- Direct LLM API calls
- API keys stored in extension

#### Mac App (Currently Light)
Located in: `Oniew Agent/Services/`

**Current Capabilities:**
- WebSocket server on port 41899
- Receives messages from extension
- Sends task execution commands
- Handles settings and UI

**WebSocket Handler:** `ExtensionConnectionManager.swift`
- Basic message passing
- No AI logic currently

## What We Need to Change

### Goal: Thin Extension + Smart Mac App

#### Extension (Make it Thin - Just Executor)
**Keep Only:**
- DOM manipulation
- Screenshot capture
- Browser action execution (click, type, scroll)
- WebSocket client to Mac app

**Remove:**
- All AI agents (Planner, Navigator, Validator)
- LangChain dependencies
- API key storage
- Complex decision logic

#### Mac App (Make it Smart - All AI Logic)
**Add:**
- AI orchestration layer
- Secure API key storage
- Planning logic
- Navigation decisions
- Validation logic

## New Message Flow

### Current Flow (Complex)
```
User Input → Extension → AI Agents (in extension) → Browser Actions
```

### New Flow (Simple)
```
User Input → Mac App → AI Processing → Simple Commands → Extension → Browser Actions
```

## WebSocket Protocol Changes

### Current Messages (Extension → Mac App)
```json
{
  "type": "executor_event",
  "data": {
    "event": {
      "actor": "navigator",
      "state": "step_ok",
      "message": "complex AI output"
    }
  }
}
```

### New Messages (Simplified)

#### Mac App → Extension (Commands)
```json
{
  "type": "browser_command",
  "command": "click",
  "selector": "#button",
  "commandId": "123"
}
```

#### Extension → Mac App (State)
```json
{
  "type": "browser_state",
  "screenshot": "base64...",
  "url": "https://example.com",
  "html": "<simplified dom>",
  "commandId": "123"
}
```

## Migration Steps

### Phase 1: Create AI Layer in Mac App (2 days)
1. Create `AIOrchestrator.swift` service
2. Add secure API key storage
3. Implement planning logic
4. Implement navigation logic
5. Implement validation logic

### Phase 2: Simplify Extension (2 days)
1. Create new `BrowserExecutor.ts` (simple commands only)
2. Remove all agent files
3. Remove LangChain dependencies
4. Update message handlers

### Phase 3: Connect Everything (1 day)
1. Update WebSocket protocol
2. Test end-to-end flow
3. Handle edge cases

## File Structure Changes

### Extension (After Migration)
```
extension/chrome-extension/src/
├── background/
│   ├── executor.ts (simplified)
│   ├── browser-actions.ts (click, type, etc)
│   └── websocket-client.ts
├── content/
│   └── dom-manipulator.ts
```

### Mac App (After Migration)
```
Oniew Agent/
├── Services/
│   ├── AI/
│   │   ├── AIOrchestrator.swift
│   │   ├── TaskPlanner.swift
│   │   ├── NavigationDecider.swift
│   │   └── ResultValidator.swift
│   ├── ExtensionConnectionManager.swift (updated)
│   └── SecureAPIKeyManager.swift (new)
```

## Benefits After Migration

1. **Security**: API keys never exposed to users
2. **Cost Control**: Track usage per user
3. **Performance**: Lighter extension = faster browsing
4. **Maintenance**: Easier to update AI logic
5. **Scalability**: Can add cloud backend later

## Risk Assessment

### Low Risk Items
- Moving planning logic (straightforward)
- Moving validation logic (simple)
- Simplifying extension (removing code)

### Medium Risk Items  
- Moving navigator logic (complex, needs careful translation)
- Updating WebSocket protocol
- Testing all edge cases

### Mitigation
- Keep old code as backup
- Test incrementally
- Run both systems in parallel initially

## Success Metrics

- [ ] Extension size reduced by 70%
- [ ] API keys removed from extension
- [ ] All tests passing
- [ ] Same functionality maintained
- [ ] Response time < 500ms for actions

## Code Snippets Needed

### 1. Swift AI Orchestrator (Mac App)
```swift
class AIOrchestrator {
    func processTask(_ task: String, browserState: BrowserState) async -> BrowserCommand
}
```

### 2. TypeScript Browser Executor (Extension)
```typescript
class BrowserExecutor {
    async executeCommand(command: BrowserCommand): Promise<BrowserState>
}
```

### 3. WebSocket Protocol Handler
```swift
func handleBrowserState(_ state: BrowserState) {
    let command = await aiOrchestrator.decide(state)
    sendCommand(command)
}
```

## Next Steps

1. Start with Phase 1 - Create AI layer in Mac app
2. Test with simple tasks first
3. Gradually migrate complex logic
4. Remove old code only after verification