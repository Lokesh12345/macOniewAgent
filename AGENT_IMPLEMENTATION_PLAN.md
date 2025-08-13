# Oniew Agent Implementation Plan: Adding Intelligent Agent Capabilities

## Overview

This document outlines the specific implementation strategy for transforming Oniew Agent from a browser automation tool into an intelligent autonomous agent system, based on the architecture analysis and state-of-the-art agent design principles.

## Current Architecture Assessment

### Strengths
- ✅ Robust WebSocket communication (Mac ↔ Extension)
- ✅ Real-time visual feedback through screenshots
- ✅ Multi-agent system in Chrome extension (Navigator, Planner, Validator)
- ✅ DOM analysis and element interaction capabilities
- ✅ Modular SwiftUI interface with floating window design
- ✅ VL model integration (GPT-4V, Claude, Gemini, Ollama)
- ✅ Task memory management foundation

### Current Limitations
- ❌ Single-step task execution (no autonomous workflows)
- ❌ Limited error recovery and adaptation
- ❌ No cross-session learning or knowledge persistence
- ❌ Manual task orchestration required
- ❌ No intelligent task decomposition
- ❌ Basic retry mechanisms without context awareness

## Implementation Roadmap

### Phase 1: Foundation Enhancement (2-3 weeks)

#### 1.1 Intelligent Task Manager Service
**Location**: New service layer in Mac app
**Files to Create**:
- `Oniew Agent/Services/IntelligentTaskManager.swift`
- `Oniew Agent/Models/TaskPlan.swift`
- `Oniew Agent/Models/TaskExecution.swift`

```swift
// Core task management with decomposition
class IntelligentTaskManager: ObservableObject {
    @Published var currentPlan: TaskPlan?
    @Published var executionState: TaskExecutionState = .idle
    
    private let taskDecomposer: TaskDecomposer
    private let executionEngine: ExecutionEngine
    private let memoryManager: TaskMemoryManager
    
    func executeTask(_ description: String) async throws -> TaskResult {
        // 1. Analyze task complexity and decompose
        let plan = try await taskDecomposer.createPlan(for: description)
        currentPlan = plan
        
        // 2. Execute with real-time monitoring
        executionState = .executing
        let result = try await executionEngine.execute(plan)
        
        // 3. Learn from execution
        memoryManager.recordExecution(TaskExecution(plan: plan, result: result))
        
        executionState = .completed
        return result
    }
}
```

#### 1.2 Enhanced Memory System
**Location**: Extend existing `TaskMemoryManager.swift`
**Enhancement Areas**:
- Cross-session persistence using CoreData/SQLite
- Pattern recognition for similar tasks
- Success/failure learning

```swift
extension TaskMemoryManager {
    // Cross-session knowledge base
    func saveKnowledge(_ knowledge: TaskKnowledge) {
        persistentStore.save(knowledge)
    }
    
    func findSimilarTasks(to description: String) -> [TaskExecution] {
        return persistentStore.query(
            similarTo: description,
            using: semanticSimilarity
        )
    }
    
    // Learning from patterns
    func extractPatterns(from executions: [TaskExecution]) -> [TaskPattern] {
        return patternRecognizer.analyze(executions)
    }
}
```

#### 1.3 WebSocket Protocol Enhancement
**Location**: Update `ExtensionConnectionManager.swift`
**New Message Types**:

```swift
enum AgenticMessageType: String, CaseIterable {
    // Existing messages
    case takeScreenshot = "take_screenshot"
    case executeBrowserAction = "execute_browser_action"
    
    // New agentic messages
    case planTask = "plan_task"
    case executeStep = "execute_step"
    case adaptPlan = "adapt_plan"
    case queryContext = "query_context"
    case learnFromOutcome = "learn_from_outcome"
}
```

### Phase 2: Task Planning and Decomposition (3-4 weeks)

#### 2.1 Task Decomposer Service
**Files to Create**:
- `Oniew Agent/Services/TaskDecomposer.swift`
- `Oniew Agent/Models/TaskNode.swift`
- `Oniew Agent/Models/ExecutionStrategy.swift`

```swift
class TaskDecomposer {
    private let vlModelService: VLModelService
    private let memoryManager: TaskMemoryManager
    
    func createPlan(for description: String) async throws -> TaskPlan {
        // 1. Analyze task complexity
        let complexity = try await analyzeComplexity(description)
        
        // 2. Check for similar past executions
        let similarTasks = memoryManager.findSimilarTasks(to: description)
        
        // 3. Generate execution plan
        switch complexity {
        case .simple:
            return createAtomicPlan(description)
        case .complex:
            return try await createCompositeplan(description, similar: similarTasks)
        }
    }
    
    private func createCompositeplan(
        _ description: String, 
        similar: [TaskExecution]
    ) async throws -> TaskPlan {
        let prompt = TaskPlanningPrompt(
            task: description,
            context: getCurrentContext(),
            similarTasks: similar.map(\.summary)
        )
        
        let response = try await vlModelService.generatePlan(prompt)
        return TaskPlan(from: response)
    }
}
```

#### 2.2 Execution Engine with Adaptation
**Files to Create**:
- `Oniew Agent/Services/ExecutionEngine.swift`
- `Oniew Agent/Services/AdaptationEngine.swift`

```swift
class ExecutionEngine {
    private let connectionManager: ExtensionConnectionManager
    private let adaptationEngine: AdaptationEngine
    private let progressMonitor: ProgressMonitor
    
    func execute(_ plan: TaskPlan) async throws -> TaskResult {
        var currentPlan = plan
        var executionContext = ExecutionContext()
        
        for step in currentPlan.steps {
            do {
                let result = try await executeStep(step, context: executionContext)
                progressMonitor.recordStep(step, result: result)
                
                // Check if adaptation is needed
                if result.requiresAdaptation {
                    currentPlan = try await adaptationEngine.adaptPlan(
                        current: currentPlan,
                        stepResult: result,
                        context: executionContext
                    )
                }
                
                executionContext.update(with: result)
                
            } catch {
                // Intelligent error recovery
                let recovery = try await adaptationEngine.createRecoveryPlan(
                    error: error,
                    step: step,
                    context: executionContext
                )
                
                currentPlan = recovery.updatedPlan
                continue
            }
        }
        
        return TaskResult(plan: currentPlan, context: executionContext)
    }
}
```

### Phase 3: Learning and Adaptation (2-3 weeks)

#### 3.1 Pattern Recognition Engine
**Files to Create**:
- `Oniew Agent/Learning/PatternRecognitionEngine.swift`
- `Oniew Agent/Learning/TaskPattern.swift`

```swift
class PatternRecognitionEngine {
    func identifyPatterns(in executions: [TaskExecution]) -> [TaskPattern] {
        let sequencePatterns = findSequencePatterns(executions)
        let outcomePatterns = findOutcomePatterns(executions)
        let errorPatterns = findErrorPatterns(executions)
        
        return combinePatterns(
            sequences: sequencePatterns,
            outcomes: outcomePatterns,
            errors: errorPatterns
        )
    }
    
    private func findSequencePatterns(_ executions: [TaskExecution]) -> [SequencePattern] {
        // Analyze common action sequences that lead to success
        return executions
            .filter(\.isSuccessful)
            .map(\.actionSequence)
            .findCommonSubsequences()
    }
}
```

#### 3.2 Strategy Learning System
**Files to Create**:
- `Oniew Agent/Learning/StrategyLearningEngine.swift`
- `Oniew Agent/Models/Strategy.swift`

```swift
class StrategyLearningEngine {
    private let patternEngine: PatternRecognitionEngine
    private let strategyStore: StrategyStore
    
    func learnStrategy(from execution: TaskExecution) {
        let patterns = patternEngine.extractPatterns(from: execution)
        
        if execution.isSuccessful {
            reinforceStrategy(execution.strategy, patterns: patterns)
        } else {
            penalizeStrategy(execution.strategy, error: execution.error)
        }
    }
    
    func suggestOptimalStrategy(for task: Task) -> Strategy {
        let relevantPatterns = strategyStore.findPatterns(for: task)
        return synthesizeStrategy(from: relevantPatterns)
    }
}
```

### Phase 4: Advanced Capabilities (3-4 weeks)

#### 4.1 Multi-Step Workflow Engine
**Files to Create**:
- `Oniew Agent/Services/WorkflowEngine.swift`
- `Oniew Agent/Models/Workflow.swift`

```swift
class WorkflowEngine {
    private let taskManager: IntelligentTaskManager
    private let contextManager: ContextManager
    private let stateManager: WorkflowStateManager
    
    func executeWorkflow(_ goals: [String]) async throws -> WorkflowResult {
        let workflow = try await createWorkflow(from: goals)
        var state = WorkflowState()
        
        for stage in workflow.stages {
            state = try await executeStage(stage, currentState: state)
            
            // Check for stage completion and adaptation needs
            if stage.requiresValidation {
                let validation = try await validateStageCompletion(stage, state: state)
                if !validation.isValid {
                    state = try await handleStageFailure(stage, validation: validation, state: state)
                }
            }
        }
        
        return WorkflowResult(workflow: workflow, finalState: state)
    }
}
```

#### 4.2 Proactive Task Suggestion
**Files to Create**:
- `Oniew Agent/Services/TaskSuggestionEngine.swift`
- `Oniew Agent/Models/TaskSuggestion.swift`

```swift
class TaskSuggestionEngine {
    private let memoryManager: TaskMemoryManager
    private let patternEngine: PatternRecognitionEngine
    
    func generateSuggestions(for context: BrowserContext) -> [TaskSuggestion] {
        let historicalPatterns = memoryManager.findPatterns(for: context)
        let contextualOpportunities = analyzeCurrentContext(context)
        
        return synthesizeSuggestions(
            patterns: historicalPatterns,
            opportunities: contextualOpportunities
        )
    }
}
```

## UI Integration Strategy

### 1. Enhanced Agent Panel
**Location**: Update `AgentPanel.swift`

```swift
struct EnhancedAgentPanel: View {
    @StateObject private var taskManager = IntelligentTaskManager()
    @StateObject private var workflowEngine = WorkflowEngine()
    @State private var taskMode: TaskMode = .simple
    
    enum TaskMode {
        case simple      // Single action
        case complex     // Multi-step task
        case workflow    // Multi-goal workflow
    }
    
    var body: some View {
        VStack(spacing: 16) {
            // Task mode selector
            Picker("Task Mode", selection: $taskMode) {
                Text("Simple").tag(TaskMode.simple)
                Text("Complex").tag(TaskMode.complex)
                Text("Workflow").tag(TaskMode.workflow)
            }
            .pickerStyle(SegmentedPickerStyle())
            
            // Task input based on mode
            switch taskMode {
            case .simple:
                SimpleTaskInput()
            case .complex:
                ComplexTaskInput()
            case .workflow:
                WorkflowInput()
            }
            
            // Execution progress
            if let plan = taskManager.currentPlan {
                TaskProgressView(plan: plan)
            }
            
            // Suggestions based on context
            TaskSuggestionsView()
        }
    }
}
```

### 2. Task Progress Visualization
**Files to Create**:
- `Oniew Agent/Views/TaskProgressView.swift`
- `Oniew Agent/Views/TaskStepView.swift`

```swift
struct TaskProgressView: View {
    let plan: TaskPlan
    @State private var expandedSteps: Set<UUID> = []
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Task Progress")
                .font(.headline)
            
            ForEach(plan.steps) { step in
                TaskStepView(
                    step: step,
                    isExpanded: expandedSteps.contains(step.id)
                ) {
                    if expandedSteps.contains(step.id) {
                        expandedSteps.remove(step.id)
                    } else {
                        expandedSteps.insert(step.id)
                    }
                }
            }
        }
    }
}
```

## Chrome Extension Integration

### Enhanced Content Script
**Location**: Update `visual-agent/extension/src/content.js`

```javascript
// Enhanced agent capabilities
window.oniewAgent = {
    // Existing capabilities
    domAnalyzer: window.domAnalyzer,
    
    // New agentic capabilities
    workflowEngine: {
        async executeWorkflow(steps) {
            const results = [];
            for (const step of steps) {
                try {
                    const result = await this.executeStep(step);
                    results.push(result);
                    
                    // Check if adaptation is needed
                    if (result.requiresAdaptation) {
                        const adaptation = await this.requestAdaptation(step, result);
                        steps = adaptation.updatedSteps;
                    }
                } catch (error) {
                    // Request recovery plan from Mac app
                    const recovery = await this.requestRecovery(step, error);
                    steps = recovery.updatedSteps;
                }
            }
            return results;
        }
    },
    
    contextAnalyzer: {
        getCurrentContext() {
            return {
                url: window.location.href,
                pageStructure: this.analyzePageStructure(),
                userInteractions: this.getRecentInteractions(),
                domState: window.domAnalyzer.getCurrentState()
            };
        }
    }
};
```

## Data Models

### Core Models
**Files to Create**:

```swift
// TaskPlan.swift
struct TaskPlan: Codable, Identifiable {
    let id: UUID
    let description: String
    let complexity: TaskComplexity
    let steps: [TaskStep]
    let estimatedDuration: TimeInterval
    let successCriteria: [SuccessCriterion]
    let rollbackPoints: [RollbackPoint]
}

// TaskExecution.swift
struct TaskExecution: Codable {
    let id: UUID
    let plan: TaskPlan
    let startTime: Date
    let endTime: Date?
    let result: TaskResult
    let context: ExecutionContext
    let adaptations: [Adaptation]
    let learnings: [Learning]
}

// TaskPattern.swift
struct TaskPattern: Codable {
    let id: UUID
    let type: PatternType
    let frequency: Int
    let successRate: Double
    let conditions: [Condition]
    let actions: [Action]
    let outcomes: [Outcome]
}
```

## Testing Strategy

### Unit Tests
- Task decomposition logic
- Pattern recognition algorithms
- Strategy learning mechanisms
- Error recovery scenarios

### Integration Tests
- Mac app ↔ Extension communication
- Multi-step workflow execution
- Cross-session memory persistence
- Real browser automation scenarios

### Performance Tests
- Response time for task planning
- Memory usage during complex workflows
- WebSocket communication efficiency
- Learning system performance

## Success Metrics

### Performance Metrics
- **Task Completion Rate**: Target >90% for complex tasks
- **Execution Efficiency**: 2-3x faster than manual execution
- **Error Recovery Rate**: >80% successful recovery
- **Learning Velocity**: Measurable improvement over 10+ executions

### User Experience Metrics
- **Setup Time**: <5 minutes for new users
- **Learning Curve**: Productive within first session
- **User Satisfaction**: >4.5/5 rating
- **Task Success**: >95% accuracy for well-defined tasks

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | 2-3 weeks | Foundation enhancement, basic task management |
| Phase 2 | 3-4 weeks | Task planning, decomposition, basic adaptation |
| Phase 3 | 2-3 weeks | Learning system, pattern recognition |
| Phase 4 | 3-4 weeks | Advanced workflows, proactive suggestions |
| **Total** | **10-14 weeks** | **Full autonomous agent system** |

## Risk Mitigation

### Technical Risks
- **Complex UI State Management**: Use proven SwiftUI patterns and state management
- **WebSocket Reliability**: Implement robust reconnection and error handling
- **Learning System Performance**: Start with simple algorithms, optimize iteratively

### User Experience Risks
- **Over-automation**: Maintain user control and transparency
- **Task Complexity**: Start with simple tasks, gradually increase complexity
- **Error Communication**: Clear, actionable error messages and recovery suggestions

This implementation plan provides a clear roadmap for transforming Oniew Agent into a state-of-the-art autonomous agent system while building on the existing robust foundation.