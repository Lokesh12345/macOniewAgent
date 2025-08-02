# Agent Optimization TODO - Oniew Agent Chrome Extension

## Overview
This document tracks the comprehensive optimization plan for the Oniew Agent Chrome extension based on deep analysis of the nanobrowser-based agent system. The goal is to improve speed, accuracy, and performance while reducing the current 15% task failure rate and 12-24 second execution delays.

## Analysis Summary
- **Current Architecture**: 3-agent sequential pipeline (Planner → Navigator → Validator)
- **Critical Issues**: Sequential execution, DOM rebuild overhead, missing actions, LLM context inefficiency
- **Target Improvements**: 60-70% speed increase, <5% failure rate, 50% token reduction

---

## PHASE 1: CRITICAL FIXES (Week 1-2) - BLOCKING ISSUES

### ❌ 1.1 Action Registry Expansion (URGENT - 15% failure rate)
**Location**: `/chrome-extension/src/background/agent/actions/`
**Problem**: Missing actions cause dead ends (scroll_page, refresh_page, date pickers)
**Impact**: 15% → <5% task failure rate

**Tasks**:
- [ ] Add `ScrollPageAction` for full page scrolling
- [ ] Add `RefreshPageAction` for page reloads
- [ ] Add `DatePickerAction` for calendar widgets
- [ ] Add `ModalAction` for popup handling
- [ ] Add `WaitAction` for custom delays
- [ ] Extend action schema validation
- [ ] Test on real sites with complex widgets

**Files to modify**:
- `actions/index.ts` - Registry expansion
- `actions/scroll.ts` - Page-level scrolling
- `actions/modal.ts` - Modal interaction
- `actions/date.ts` - Date picker handling

### ❌ 1.2 LLM Provider Reliability (URGENT - Planning failures)
**Location**: `/chrome-extension/src/background/agent/base.ts`
**Problem**: Frequent "Planning failed" or provider 4xx errors (Claude auth, Mistral 422)
**Impact**: Eliminate planning stalls

**Tasks**:
- [ ] Implement provider failover logic
- [ ] Add authentication refresh handling
- [ ] Create error categorization system
- [ ] Add retry strategies per provider
- [ ] Implement graceful degradation

**Files to modify**:
- `agent/base.ts` - LLM call reliability
- `../settings/` - Provider management
- Add new `providers/failover.ts`

### ❌ 1.3 DOM Build Failure Recovery (URGENT - Task hangs)
**Location**: `/chrome-extension/src/background/browser/dom.ts`
**Problem**: `[DOMService] Failed to build DOM tree` hangs tasks
**Impact**: Prevent infinite loops on complex pages

**Tasks**:
- [ ] Add DOM build retry limits (max 3 attempts)
- [ ] Implement fallback simple DOM mode
- [ ] Add timeout protection for DOM operations
- [ ] Create page complexity detection

**Files to modify**:
- `browser/dom.ts` - Fallback mechanisms
- `browser/page.ts` - Timeout handling

---

## PHASE 2: PERFORMANCE CORE (Week 3-4) - MAJOR GAINS

### ⏳ 2.1 Parallel Agent Pipeline (HIGH IMPACT - 60-70% speed gain)
**Location**: `/chrome-extension/src/background/agent/`
**Problem**: Sequential execution adds 4-8s per step × 3 agents = 12-24s delays
**Impact**: Reduce step time from 12-24s to 3-6s

**Tasks**:
- [ ] Refactor agent coordination for parallel execution
- [ ] Implement async validator (don't block next step)
- [ ] Create planner result caching
- [ ] Add agent state synchronization
- [ ] Implement pipeline coordination logic

**Files to modify**:
- `agent/coordinator.ts` - New parallel coordination
- `agent/planner.ts` - Async planning
- `agent/validator.ts` - Non-blocking validation
- `../background/index.ts` - Pipeline orchestration

### ⏳ 2.2 Incremental DOM Updates (HIGH IMPACT - 2-3s per step saved)
**Location**: `/chrome-extension/src/background/browser/dom.ts`
**Problem**: Complete DOM tree reconstruction every step (2-3s overhead)
**Impact**: 70-80% reduction in DOM processing time

**Tasks**:
- [ ] Implement MutationObserver for change detection
- [ ] Create incremental DOM update system
- [ ] Add element reference caching
- [ ] Build page stability detection
- [ ] Optimize element selection caching

**Files to modify**:
- `browser/dom.ts` - Incremental updates
- `browser/page.ts` - Change detection
- Add new `browser/cache.ts` - Element caching

### ⏳ 2.3 Smart Context Management (MEDIUM IMPACT - 40-50% token reduction)
**Location**: `/chrome-extension/src/background/agent/base.ts`
**Problem**: Full DOM + full history sent every LLM call
**Impact**: Reduce token usage and response latency

**Tasks**:
- [ ] Implement intelligent context trimming
- [ ] Create message summarization system
- [ ] Add relevant DOM extraction
- [ ] Build proper token estimation
- [ ] Implement context compression

**Files to modify**:
- `agent/base.ts` - Context optimization
- Add new `agent/context.ts` - Context management
- `utils.ts` - Token estimation utilities

---

## PHASE 3: ARCHITECTURE IMPROVEMENTS (Week 5-6) - SYSTEM OPTIMIZATION

### 🔧 3.1 Adaptive Wait Strategies
**Location**: `/chrome-extension/src/background/browser/`
**Problem**: Fixed 3-second waits regardless of page complexity
**Impact**: Optimize timing for different page types

**Tasks**:
- [ ] Replace fixed delays with adaptive waiting
- [ ] Implement element stability detection
- [ ] Add network quiet detection with adaptive timeouts
- [ ] Create page complexity scoring
- [ ] Build smart wait strategies per action type

**Files to modify**:
- `browser/page.ts` - Adaptive waiting
- `browser/network.ts` - Smart network detection

### 🔧 3.2 Enhanced Error Recovery
**Location**: Multiple files across agent system
**Problem**: Simple error handling causes task failures
**Impact**: Improve task completion reliability

**Tasks**:
- [ ] Categorize errors by type and severity
- [ ] Implement retry strategies specific to error types
- [ ] Add fallback action sequences
- [ ] Create error pattern recognition
- [ ] Build recovery action suggestions

**Files to modify**:
- `agent/error-handler.ts` - New error management
- `agent/base.ts` - Error integration
- `browser/page.ts` - Browser error handling

### 🔧 3.3 Task Queue System
**Location**: `/chrome-extension/src/background/index.ts`
**Problem**: Single-threaded executor, no task prioritization
**Impact**: Support multiple concurrent tasks

**Tasks**:
- [ ] Build async task queue system
- [ ] Implement task prioritization
- [ ] Add task progress persistence
- [ ] Create task state management
- [ ] Build concurrent task support

**Files to modify**:
- `background/index.ts` - Queue orchestration
- Add new `background/queue.ts` - Task queue
- Add new `background/task-manager.ts` - Task coordination

---

## PHASE 4: USER ENGAGEMENT & TRANSPARENCY (Week 4-5) - REAL-TIME FEEDBACK

### 📱 4.1 Enhanced Real-Time Logging for Mac App (HIGH UX IMPACT)
**Location**: `/chrome-extension/src/background/` + `/Oniew Agent/Services/`
**Problem**: Users don't see what agents are doing, causing perceived delays and uncertainty
**Impact**: Keep users engaged during long tasks, build trust in agent capabilities

**Tasks**:
- [ ] Implement detailed step-by-step progress logging
- [ ] Add agent reasoning transparency ("Navigator is analyzing page structure...")
- [ ] Create visual progress indicators for each agent phase
- [ ] Add real-time DOM analysis status updates
- [ ] Implement action preview before execution
- [ ] Show element detection and interaction reasoning
- [ ] Add estimated time remaining for current step

**Chrome Extension Side**:
- [ ] Enhance WebSocket message structure for detailed progress
- [ ] Add progress checkpoints in agent execution loop
- [ ] Create structured logging with categories (planning, navigation, validation)
- [ ] Implement real-time DOM analysis status
- [ ] Add action preview and confirmation workflow

**Mac App Side**:
- [ ] Expand AgentPanel progress display beyond simple text
- [ ] Add progress bars for multi-step operations
- [ ] Create categorized log viewer (Planning/Navigation/Validation)
- [ ] Implement real-time step visualization
- [ ] Add agent reasoning display panel
- [ ] Create expandable detail views for each step

**Files to modify**:
- `chrome-extension/src/background/log.ts` - Enhanced logging structure
- `chrome-extension/src/background/agent/base.ts` - Progress reporting
- `chrome-extension/src/background/browser/dom.ts` - DOM analysis status
- `Oniew Agent/Views/Components/AgentPanel.swift` - Enhanced UI
- `Oniew Agent/Services/ExtensionConnectionManager.swift` - Message handling

### 📱 4.2 Interactive Agent Control (MEDIUM UX IMPACT)
**Location**: `/Oniew Agent/Views/Components/`
**Problem**: Users can't intervene or guide agents during execution
**Impact**: Better user control and confidence in agent behavior

**Tasks**:
- [ ] Add pause/resume functionality for long tasks
- [ ] Implement step-by-step confirmation mode
- [ ] Create manual override options for failed steps
- [ ] Add real-time action preview with approval workflow
- [ ] Implement "explain this step" functionality
- [ ] Add manual element selection fallback
- [ ] Create agent behavior adjustment controls

**Files to modify**:
- `Oniew Agent/Views/Components/AgentPanel.swift` - Control interface
- `chrome-extension/src/background/index.ts` - Control message handling
- Add new `Oniew Agent/Views/Components/AgentControls.swift`

### 📱 4.3 Dynamic Task Planning & Visual Progress (HIGH UX IMPACT)
**Location**: `/chrome-extension/src/background/agent/` + `/Oniew Agent/Views/Components/`
**Problem**: Users don't see task breakdown and progress like Claude Code does
**Impact**: Show complete task roadmap with visual progress tracking

**Tasks**:
- [ ] Implement task decomposition before execution starts
- [ ] Create visual task roadmap display in Mac app
- [ ] Add real-time task completion with strikethrough
- [ ] Implement task dependency visualization
- [ ] Add estimated time per subtask
- [ ] Create expandable task detail views
- [ ] Show current vs. remaining tasks clearly

**Chrome Extension Side - Task Planning**:
- [ ] Add pre-execution planning phase to break down user requests
- [ ] Implement task dependency analysis
- [ ] Create subtask estimation system
- [ ] Add task complexity scoring
- [ ] Build task tree structure for complex requests
- [ ] Implement smart task grouping and sequencing

**Mac App Side - Visual Task Tracking**:
- [ ] Create TaskRoadmapView component with visual progress
- [ ] Add strikethrough animation for completed tasks
- [ ] Implement progress bar showing completed/total tasks
- [ ] Create expandable task cards with details
- [ ] Add visual indicators for current, completed, and pending tasks
- [ ] Show estimated time remaining for entire workflow

**Files to modify**:
- `chrome-extension/src/background/agent/planner.ts` - Task decomposition
- `chrome-extension/src/background/agent/task-analyzer.ts` - New task analysis
- `Oniew Agent/Views/Components/TaskRoadmapView.swift` - New visual roadmap
- `Oniew Agent/Views/Components/AgentPanel.swift` - Integration
- `Oniew Agent/Models/TaskModel.swift` - Task data structures

### 📱 4.4 Performance Metrics Dashboard (LOW PRIORITY - NICE TO HAVE)
**Location**: `/Oniew Agent/Views/Components/`
**Problem**: No visibility into agent performance and optimization impact
**Impact**: Demonstrate optimization improvements to users

**Tasks**:
- [ ] Create performance metrics collection
- [ ] Add step timing visualization
- [ ] Implement success rate tracking
- [ ] Create optimization impact dashboard
- [ ] Add historical performance trends
- [ ] Show token usage and cost tracking

**Files to modify**:
- Add new `Oniew Agent/Views/Components/MetricsDashboard.swift`
- `chrome-extension/src/background/` - Metrics collection
- `Oniew Agent/Models/` - Performance data models

---

## MONITORING & VALIDATION

### Performance Metrics to Track
- [ ] **Task Success Rate**: 85% → >95%
- [ ] **Average Step Time**: 12-24s → 3-6s  
- [ ] **LLM Token Usage**: Baseline → 50% reduction
- [ ] **DOM Processing Time**: 2-3s → <1s
- [ ] **Provider Reliability**: Auth failures → <1%

### Testing Strategy
- [ ] Create performance benchmark suite
- [ ] Build accuracy validation tests
- [ ] Test on complex real-world sites
- [ ] Validate with multi-step workflows
- [ ] Monitor error patterns and recovery

### Success Criteria
- [ ] 60-70% reduction in task completion time
- [ ] 15% → <5% task failure rate
- [ ] 40-50% reduction in LLM API costs
- [ ] Stable memory footprint (no leaks)
- [ ] Improved user experience responsiveness
- [ ] **User Engagement**: Real-time progress visibility with <1s update frequency
- [ ] **Transparency**: Users understand what agents are doing at each step
- [ ] **Control**: Users can pause/resume/override agent actions
- [ ] **Task Visibility**: Complete task roadmap shown before execution with progress tracking
- [ ] **Visual Feedback**: Strikethrough completed tasks, progress bars, and estimated time remaining

---

## IMPLEMENTATION NOTES

### High-Risk Changes (Require Careful Testing)
- **Parallel agent execution**: Complex coordination, potential race conditions
- **DOM caching**: Must invalidate appropriately to maintain accuracy
- **Context trimming**: Risk of losing important information

### Dependencies & Prerequisites
- Understanding of current agent coordination in `background/index.ts`
- Familiarity with LLM provider integrations
- Knowledge of Chrome extension architecture
- Testing environment for complex web applications

### Rollback Strategy
- Maintain feature flags for each optimization
- Keep original implementations as fallbacks
- Implement gradual rollout per optimization
- Monitor metrics closely during deployment

---

## DETAILED LOGGING IMPLEMENTATION SPECS

### WebSocket Message Structure for Real-Time Updates
```typescript
interface AgentProgressMessage {
  type: 'agent_progress'
  timestamp: number
  step_id: string
  agent: 'planner' | 'navigator' | 'validator'
  phase: 'starting' | 'thinking' | 'acting' | 'completed' | 'failed'
  details: {
    action?: string
    reasoning?: string
    progress_percent?: number
    estimated_remaining?: number
    element_found?: boolean
    dom_analysis_status?: string
    error_details?: string
  }
  context: {
    current_step: number
    total_steps?: number
    current_url: string
    task_description: string
  }
}
```

### Mac App UI Enhancements for Real-Time Feedback
```swift
// AgentPanel.swift additions
struct AgentProgressView: View {
    @State private var currentPhase: AgentPhase = .idle
    @State private var progressText: String = ""
    @State private var progressPercent: Double = 0.0
    @State private var estimatedTime: TimeInterval = 0
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Agent status indicator with animated dots
            HStack {
                Image(systemName: agentIcon)
                    .foregroundColor(agentColor)
                Text(currentPhase.description)
                    .font(.headline)
                Spacer()
                Text(formatTimeRemaining(estimatedTime))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            // Progress bar
            ProgressView(value: progressPercent, total: 1.0)
                .progressViewStyle(LinearProgressViewStyle())
            
            // Detailed reasoning text
            Text(progressText)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(nil)
                .animation(.easeInOut, value: progressText)
        }
    }
}
```

### Enhanced Logging Categories
- **🧠 Planning**: "Analyzing task requirements...", "Breaking down into steps...", "Estimated 3 actions needed"
- **🔍 Navigation**: "Locating login button...", "Found element at coordinates (234, 456)", "Scrolling to element..."
- **✅ Validation**: "Checking if login succeeded...", "Verifying page state change...", "Task completed successfully"
- **⚠️ Errors**: "Element not found, trying alternative selector...", "Page load timeout, retrying..."
- **⏱️ Performance**: "DOM analysis completed in 0.8s", "LLM response received in 2.1s"

### Task Roadmap Data Structures
```typescript
interface TaskRoadmap {
  id: string
  title: string
  description: string
  estimatedDuration: number
  complexity: 'low' | 'medium' | 'high'
  dependencies: string[]
  subtasks: SubTask[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startTime?: number
  completionTime?: number
}

interface SubTask {
  id: string
  title: string
  description: string
  agent: 'planner' | 'navigator' | 'validator'
  estimatedDuration: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  actions: ActionStep[]
}

interface ActionStep {
  id: string
  action: string
  target?: string
  reasoning: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  duration?: number
}
```

### Mac App Task Roadmap UI Component
```swift
struct TaskRoadmapView: View {
    @ObservedObject var taskManager: TaskManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Overall progress header
            HStack {
                Text("Task Progress")
                    .font(.headline)
                Spacer()
                Text("\(completedTasks)/\(totalTasks)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            // Overall progress bar
            ProgressView(value: Double(completedTasks), total: Double(totalTasks))
                .progressViewStyle(LinearProgressViewStyle(tint: .blue))
            
            // Individual task cards
            ForEach(taskManager.roadmap, id: \.id) { task in
                TaskCardView(task: task)
                    .animation(.easeInOut, value: task.status)
            }
        }
        .padding()
    }
}

struct TaskCardView: View {
    let task: TaskRoadmap
    @State private var isExpanded = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                // Status icon
                Image(systemName: statusIcon(task.status))
                    .foregroundColor(statusColor(task.status))
                
                // Task title with strikethrough if completed
                Text(task.title)
                    .font(.subheadline)
                    .strikethrough(task.status == .completed)
                    .foregroundColor(task.status == .completed ? .secondary : .primary)
                
                Spacer()
                
                // Estimated time
                if task.status != .completed {
                    Text(formatDuration(task.estimatedDuration))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                // Expand/collapse button
                Button(action: { isExpanded.toggle() }) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                }
            }
            
            // Expandable subtask details
            if isExpanded {
                ForEach(task.subtasks, id: \.id) { subtask in
                    SubTaskView(subtask: subtask)
                        .padding(.leading, 16)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray6))
        )
    }
}
```

## CURRENT STATUS: PLANNING COMPLETE ✅

**Next Action**: Begin Phase 1.1 - Action Registry Expansion
**Priority**: Fix 15% task failure rate before performance optimizations  
**Parallel Track**: Phase 4.1 - Enhanced Real-Time Logging for immediate UX improvement
**Timeline**: 6-week comprehensive optimization plan with user engagement improvements

---

*Last Updated: 2025-08-02*
*Context: Based on cross-validated analysis of nanobrowser agent system and real GitHub issue evidence*