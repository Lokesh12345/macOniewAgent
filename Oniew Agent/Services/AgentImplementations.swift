@preconcurrency import Foundation

// MARK: - Navigator Agent

@MainActor
class NavigatorAgent: BaseAgent {
    typealias OutputType = NavigatorOutput
    
    let id = "navigator"
    private var isProcessing = false
    let context: AgentContext
    
    private let actionRegistry: ActionRegistry
    private let vlModelService: VLModelService
    private var consecutiveFailures = 0
    private let maxConsecutiveFailures = 3
    
    init(context: AgentContext, actionRegistry: ActionRegistry, vlModelService: VLModelService) {
        self.context = context
        self.actionRegistry = actionRegistry
        self.vlModelService = vlModelService
    }
    
    // Helper method for screenshot capture when LLM specifically requests it
    private func captureScreenshotIfNeeded(_ prompt: String) async -> String {
        // Check if the prompt specifically asks for visual context
        let needsScreenshot = prompt.lowercased().contains("screenshot") || 
                             prompt.lowercased().contains("visual") ||
                             prompt.lowercased().contains("image")
        
        guard needsScreenshot else {
            return "" // No screenshot needed
        }
        
        if #available(macOS 12.3, *) {
            do {
                let screenshotService = MacScreenshotService()
                let base64 = try await screenshotService.captureSilentScreenshotAsBase64()
                return "data:image/png;base64,\(base64)"
            } catch {
                print("❌ Screenshot capture failed: \(error)")
                return ""
            }
        } else {
            return ""
        }
    }
    
    func execute() async throws -> AgentOutput<NavigatorOutput> {
        isProcessing = true
        context.emitEvent(.navigator, .navigationStart, "Starting navigation step")
        
        do {
            // 1. Get current state (screenshot + DOM if available)
            let currentState = await getCurrentState()
            
            // 2. Generate action plan using VL model
            let actionPlan = await generateActionPlan(currentState: currentState)
            
            // 3. Execute actions
            var allResults: [ActionResult] = []
            
            for action in actionPlan.actions {
                context.emitEvent(.navigator, .actionExecuted, "Executing: \(action.actionType)")
                
                let result = await actionRegistry.executeAction(action.actionType, parameters: action.parameters)
                allResults.append(result)
                
                // Handle DOM changes - trigger replanning if needed
                if result.reanalysisNeeded || result.domChangedAfterInput {
                    context.needsReplanning = true
                    context.emitEvent(.navigator, .replanningTriggered, "DOM changed - replanning needed")
                    break
                }
                
                // Stop if action failed
                if !result.success {
                    consecutiveFailures += 1
                    if consecutiveFailures >= maxConsecutiveFailures {
                        throw AgentError.maxFailuresReached("Too many consecutive navigation failures")
                    }
                    break
                } else {
                    consecutiveFailures = 0
                }
                
                // Small delay between actions
                if actionPlan.actions.firstIndex(where: { $0.actionType == action.actionType && $0.reasoning == action.reasoning }) != actionPlan.actions.count - 1 {
                    try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                }
            }
            
            // 4. Determine if task is complete
            let isComplete = await evaluateCompletion(results: allResults, originalTask: context.messageHistory.first?.content ?? "")
            
            let output = NavigatorOutput(
                actions: actionPlan.actions.map { $0.actionType },
                results: allResults,
                isComplete: isComplete,
                needsReplanning: context.needsReplanning,
                reasoning: actionPlan.reasoning,
                screenshot: currentState.screenshot
            )
            
            context.emitEvent(.navigator, .navigationComplete, "Navigation step completed")
            isProcessing = false
            
            return AgentOutput(success: true, result: output)
            
        } catch {
            consecutiveFailures += 1
            context.emitEvent(.navigator, .navigationFailed, error.localizedDescription)
            isProcessing = false
            
            return AgentOutput(success: false, error: error.localizedDescription)
        }
    }
    
    private func getCurrentState() async -> CurrentState {
        // DOM-first approach like extension - no mandatory screenshot
        context.emitEvent(.navigator, .domAnalyzing, "Getting current DOM state")
        
        // Return state with DOM elements (no screenshot unless requested)
        let state = CurrentState(
            screenshot: "", // Empty initially - DOM first!
            url: "Browser Context",
            title: "DOM Analysis",
            domElements: Array(context.domElementMapping.values),
            timestamp: Date()
        )
        
        return state
    }
    
    private func generateActionPlan(currentState: CurrentState) async -> ActionPlan {
        context.emitEvent(.navigator, .vlModelProcessing, "Generating action plan")
        
        // Create VL model prompt
        let prompt = createNavigatorPrompt(currentState: currentState)
        
        do {
            // Create DOM context for the VL model
            let domContext = createDOMContext(currentState.domElements)
            let fullPrompt = prompt + domContext
            
            let response = try await vlModelService.processInstruction(
                instruction: fullPrompt,
                screenshot: currentState.screenshot
            )
            
            let actions = parseActionsFromResponse(response.response)
            
            return ActionPlan(
                actions: actions,
                reasoning: response.response,
                confidence: response.confidence
            )
            
        } catch {
            // Fallback to simple DOM-based action
            print("VL model failed, using DOM fallback: \(error)")
            
            let fallbackActions = generateFallbackActions(currentState: currentState)
            
            return ActionPlan(
                actions: fallbackActions,
                reasoning: "Fallback action plan due to VL model error",
                confidence: 0.5
            )
        }
    }
    
    private func createNavigatorPrompt(currentState: CurrentState) -> String {
        let task = context.messageHistory.first?.content ?? "Navigate the website"
        let domContext = createDOMContext(currentState.domElements)
        let historyContext = createHistoryContext()
        
        return """
        You are an expert web navigator AI. Your task is to complete this objective: "\(task)"
        
        Current Website: \(currentState.title) (\(currentState.url))
        
        \(domContext)
        
        \(historyContext)
        
        Available Actions:
        \(actionRegistry.getActionsForPrompt())
        
        Please analyze the screenshot and current state, then provide a JSON response with your next actions:
        
        {
            "reasoning": "Your step-by-step reasoning for the actions",
            "actions": [
                {
                    "actionType": "actionName",
                    "parameters": { "key": "value" },
                    "reasoning": "Why this specific action"
                }
            ],
            "isComplete": false,
            "confidence": 0.8
        }
        
        Important:
        - Use index numbers from the DOM elements for clickElement and inputText actions
        - Take screenshots after significant actions to verify progress
        - If you see autocomplete or suggestions appearing, mention that DOM reanalysis is needed
        - Be precise with element targeting using the provided index numbers
        - Limit to maximum \(context.maxActionsPerStep) actions per step
        """
    }
    
    private func createDOMContext(_ elements: [DOMElement]) -> String {
        if elements.isEmpty {
            return "DOM Elements: No elements currently mapped. Consider running domVisualize first."
        }
        
        let elementDescriptions = elements.prefix(20).map { element in
            let text = element.text?.prefix(50) ?? ""
            let attrs = [element.className, element.elementId].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
            
            return "[\(element.index)] \(element.tagName) - \"\(text)\" (\(attrs))"
        }.joined(separator: "\n")
        
        return """
        DOM Elements (showing first 20):
        \(elementDescriptions)
        
        Total elements: \(elements.count)
        """
    }
    
    private func createHistoryContext() -> String {
        let recentActions = context.actionResults.suffix(3).map { result in
            "\(result.action.actionType): \(result.success ? "✅" : "❌")"
        }.joined(separator: ", ")
        
        if recentActions.isEmpty {
            return "Recent Actions: None"
        }
        
        return "Recent Actions: \(recentActions)"
    }
    
    private func parseActionsFromResponse(_ response: String) -> [PlannedAction] {
        // Try to parse JSON from response
        guard let data = response.data(using: .utf8) else {
            return generateSimpleFallbackActions()
        }
        
        do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                // Parse Navigator JSON format: {"action": [{"input_text": {"index": 7, "text": "query"}}]}
                if let actionsArray = json["action"] as? [[String: Any]] {
                    print("📋 Parsing Navigator format with \(actionsArray.count) actions")
                    
                    return actionsArray.compactMap { actionDict in
                        // Navigator format: {"input_text": {"index": 7, "text": "query"}}
                        for (actionType, params) in actionDict {
                            guard let parameters = params as? [String: Any] else {
                                print("      ❌ Invalid parameters for action: \(actionType)")
                                continue
                            }
                            
                            // Convert Navigator action names to our format
                            let convertedActionType: String
                            switch actionType {
                            case "input_text":
                                convertedActionType = "inputText"
                            case "click_element":
                                convertedActionType = "clickElement"
                            case "scroll_to_percent":
                                convertedActionType = "scrollToPercent"
                            case "scroll_to_top":
                                convertedActionType = "scrollToTop"
                            case "scroll_to_bottom":
                                convertedActionType = "scrollToBottom"
                            case "wait":
                                convertedActionType = "wait"
                            case "domVisualize":
                                convertedActionType = "domVisualize"
                            default:
                                print("      ❌ Unknown Navigator action type: \(actionType)")
                                continue
                            }
                            
                            return PlannedAction(
                                actionType: convertedActionType,
                                parameters: parameters,
                                reasoning: "Navigator action: \(actionType)"
                            )
                        }
                        
                        return nil
                    }
                }
                // Fallback: try old format for backward compatibility
                else if let actionsArray = json["actions"] as? [[String: Any]] {
                    print("📋 Parsing legacy format with \(actionsArray.count) actions")
                    
                    return actionsArray.compactMap { actionDict in
                        // Support both "type" and "actionType" field names
                        guard let actionType = (actionDict["type"] as? String) ?? (actionDict["actionType"] as? String) else {
                            return nil
                        }
                        
                        // Parameters might be embedded in the action dict itself for simple actions
                        let parameters = (actionDict["parameters"] as? [String: Any]) ?? [:]
                        
                        // Extract additional parameters from the action dict for simple actions like domVisualize
                        var finalParameters = parameters
                        if let index = actionDict["index"] as? Int {
                            finalParameters["index"] = index
                        }
                        if let text = actionDict["text"] as? String {
                            finalParameters["text"] = text
                        }
                        if let percent = actionDict["percent"] as? Int {
                            finalParameters["percent"] = percent
                        }
                        if let seconds = actionDict["seconds"] as? Int {
                            finalParameters["seconds"] = seconds
                        }
                        
                        return PlannedAction(
                            actionType: actionType,
                            parameters: finalParameters,
                            reasoning: actionDict["reasoning"] as? String ?? ""
                        )
                    }
                }
            }
        } catch {
            print("Failed to parse action JSON: \(error)")
        }
        
        return generateSimpleFallbackActions()
    }
    
    private func generateFallbackActions(currentState: CurrentState) -> [PlannedAction] {
        // Simple fallback based on available DOM elements
        if currentState.domElements.isEmpty {
            return [PlannedAction(actionType: "domVisualize", parameters: [:], reasoning: "Need to analyze DOM first")]
        }
        
        // Look for common interactive elements
        if let searchInput = currentState.domElements.first(where: { $0.type?.lowercased().contains("search") == true }) {
            return [PlannedAction(
                actionType: "inputText",
                parameters: ["index": searchInput.index, "text": "search query"],
                reasoning: "Found search input, entering query"
            )]
        }
        
        if let clickableElement = currentState.domElements.first(where: { $0.isInteractable && $0.isVisible }) {
            return [PlannedAction(
                actionType: "clickElement", 
                parameters: ["index": clickableElement.index],
                reasoning: "Found clickable element"
            )]
        }
        
        return [PlannedAction(actionType: "domVisualize", parameters: [:], reasoning: "DOM-first approach - analyzing page structure")]
    }
    
    private func generateSimpleFallbackActions() -> [PlannedAction] {
        // DOM-first fallback - never default to screenshots
        return [PlannedAction(actionType: "domVisualize", parameters: [:], reasoning: "DOM-first fallback - need to analyze page structure")]
    }
    
    private func evaluateCompletion(results: [ActionResult], originalTask: String) async -> Bool {
        // Simple completion evaluation - could be enhanced with VL model
        let successfulActions = results.filter { $0.success }
        let hasSignificantProgress = successfulActions.count >= 1
        
        // Check if we've hit DOM changes that need replanning
        let needsReplanning = results.contains { $0.reanalysisNeeded || $0.domChangedAfterInput }
        
        return hasSignificantProgress && !needsReplanning
    }
    
    func cancel() async {
        isProcessing = false
        context.cancel()
    }
    
    func reset() async {
        isProcessing = false
        consecutiveFailures = 0
    }
    
    func getProcessingState() async -> Bool {
        return isProcessing
    }
    
    func setProcessingState(_ processing: Bool) async {
        isProcessing = processing
    }
}

// MARK: - Planner Agent

@MainActor
class PlannerAgent: BaseAgent {
    typealias OutputType = PlannerOutput
    
    let id = "planner"
    private var isProcessing = false
    let context: AgentContext
    
    private let vlModelService: VLModelService
    
    init(context: AgentContext, vlModelService: VLModelService) {
        self.context = context
        self.vlModelService = vlModelService
    }
    
    // Helper method for screenshot capture when LLM specifically requests it
    private func captureScreenshotIfNeeded(_ prompt: String) async -> String {
        // Check if the prompt specifically asks for visual context
        let needsScreenshot = prompt.lowercased().contains("screenshot") || 
                             prompt.lowercased().contains("visual") ||
                             prompt.lowercased().contains("image")
        
        guard needsScreenshot else {
            return "" // No screenshot needed
        }
        
        if #available(macOS 12.3, *) {
            do {
                let screenshotService = MacScreenshotService()
                let base64 = try await screenshotService.captureSilentScreenshotAsBase64()
                return "data:image/png;base64,\(base64)"
            } catch {
                print("❌ Screenshot capture failed: \(error)")
                return ""
            }
        } else {
            return ""
        }
    }
    
    func execute() async throws -> AgentOutput<PlannerOutput> {
        isProcessing = true
        context.emitEvent(.planner, .planningStart, "Starting task planning")
        
        do {
            // Get current context
            let currentContext = await getCurrentPlanningContext()
            
            // Generate plan using VL model
            let prompt = createPlannerPrompt(context: currentContext)
            
            // Add DOM context for planning
            let domContext = currentContext.domElements.isEmpty ? "" : 
                "\n\nAvailable DOM Elements:\n" + currentContext.domElements.prefix(10).map { element in
                    "[\(element.index)] \(element.tagName) - \"\(element.text?.prefix(30) ?? "")\""
                }.joined(separator: "\n")
            let fullPrompt = prompt + domContext
            
            let response = try await vlModelService.processInstruction(
                instruction: fullPrompt,
                screenshot: currentContext.screenshot
            )
            
            let planResult = parsePlanFromResponse(response.response)
            
            let output = PlannerOutput(
                plan: planResult.plan,
                nextSteps: planResult.steps,
                isComplete: planResult.isComplete,
                confidence: response.confidence,
                reasoning: response.response,
                needsWebTask: planResult.needsWebTask
            )
            
            context.emitEvent(.planner, .planningComplete, "Planning completed with \(planResult.steps.count) steps")
            isProcessing = false
            
            return AgentOutput(success: true, result: output)
            
        } catch {
            context.emitEvent(.planner, .planningFailed, error.localizedDescription)
            isProcessing = false
            
            return AgentOutput(success: false, error: error.localizedDescription)
        }
    }
    
    private func getCurrentPlanningContext() async -> PlanningContext {
        // DOM-first planning context (no mandatory screenshot)
        return PlanningContext(
            originalTask: context.messageHistory.first?.content ?? "",
            currentStep: context.currentStep,
            maxSteps: context.maxSteps,
            screenshot: "", // Empty initially - DOM first!
            url: "Browser Context",
            title: "DOM Planning",
            recentActions: Array(context.actionResults.suffix(5)),
            domElements: Array(context.domElementMapping.values)
        )
    }
    
    private func createPlannerPrompt(context: PlanningContext) -> String {
        let actionHistory = context.recentActions.map { result in
            "\(result.action.actionType): \(result.success ? "✅" : "❌ \(result.error ?? "")")"
        }.joined(separator: "\n")
        
        return """
        You are a helpful assistant. You are good at answering general questions and helping users break down web browsing tasks into smaller steps.
        
        Original Task: "\(context.originalTask)"
        Current Website: \(context.title) (\(context.url))
        Progress: Step \(context.currentStep) of \(context.maxSteps)
        
        Recent Actions:
        \(actionHistory.isEmpty ? "None yet" : actionHistory)
        
        Available DOM Elements: \(context.domElements.count) elements
        
        CRITICAL: Suggest ONLY the very next immediate action - NOT multiple steps
        The Navigator executes ONE action at a time, so plan accordingly.
        
        RESPONSE FORMAT: Your must always respond with a valid JSON object with the following fields:
        {
            "observation": "brief analysis of the current state and what has been done so far",
            "done": false,
            "challenges": "list any potential challenges or roadblocks",
            "next_steps": "EXACTLY ONE immediate next action to take. DO NOT list multiple steps.",
            "reasoning": "explain your reasoning for the suggested next steps",
            "web_task": true
        }
        
        Consider:
        - What has been accomplished so far
        - What still needs to be done
        - Any obstacles or challenges
        - Whether the task appears to be complete
        - If this requires continued web interaction
        """
    }
    
    private func parsePlanFromResponse(_ response: String) -> ParsedPlan {
        do {
            if let data = response.data(using: .utf8),
               let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                // Parse extension planner format
                let observation = json["observation"] as? String ?? ""
                let nextSteps = json["next_steps"] as? String ?? "Continue with navigation"
                let isComplete = json["done"] as? Bool ?? false
                let needsWebTask = json["web_task"] as? Bool ?? true
                let reasoning = json["reasoning"] as? String ?? ""
                
                return ParsedPlan(
                    plan: observation + ". " + reasoning,
                    steps: [nextSteps], // Convert single step to array
                    isComplete: isComplete,
                    needsWebTask: needsWebTask
                )
            }
        } catch {
            print("Failed to parse plan JSON: \(error)")
        }
        
        // Fallback
        return ParsedPlan(
            plan: response,
            steps: ["Continue with current approach"],
            isComplete: false,
            needsWebTask: true
        )
    }
    
    func cancel() async {
        isProcessing = false
        context.cancel()
    }
    
    func reset() async {
        isProcessing = false
    }
    
    func getProcessingState() async -> Bool {
        return isProcessing
    }
    
    func setProcessingState(_ processing: Bool) async {
        isProcessing = processing
    }
}

// MARK: - Validator Agent

@MainActor
class ValidatorAgent: BaseAgent {
    typealias OutputType = ValidatorOutput
    
    let id = "validator"
    private var isProcessing = false
    let context: AgentContext
    
    private let vlModelService: VLModelService
    private var originalTask: String
    private var plannedSteps: [String] = []
    
    init(context: AgentContext, vlModelService: VLModelService, originalTask: String) {
        self.context = context
        self.vlModelService = vlModelService
        self.originalTask = originalTask
    }
    
    // Helper method for screenshot capture when LLM specifically requests it
    private func captureScreenshotIfNeeded(_ prompt: String) async -> String {
        // Check if the prompt specifically asks for visual context
        let needsScreenshot = prompt.lowercased().contains("screenshot") || 
                             prompt.lowercased().contains("visual") ||
                             prompt.lowercased().contains("image")
        
        guard needsScreenshot else {
            return "" // No screenshot needed
        }
        
        if #available(macOS 12.3, *) {
            do {
                let screenshotService = MacScreenshotService()
                let base64 = try await screenshotService.captureSilentScreenshotAsBase64()
                return "data:image/png;base64,\(base64)"
            } catch {
                print("❌ Screenshot capture failed: \(error)")
                return ""
            }
        } else {
            return ""
        }
    }
    
    func execute() async throws -> AgentOutput<ValidatorOutput> {
        isProcessing = true
        context.emitEvent(.validator, .validationStart, "Starting task validation")
        
        do {
            // Get current state for validation
            let validationContext = await getValidationContext()
            
            // Validate using VL model
            let prompt = createValidatorPrompt(context: validationContext)
            
            // Add DOM context for validation - just the executed actions summary
            let domContext = context.domElementMapping.isEmpty ? "" :
                "\n\nDOM Elements Available: \(context.domElementMapping.count) indexed elements"
            let fullPrompt = prompt + domContext
            
            let response = try await vlModelService.processInstruction(
                instruction: fullPrompt,
                screenshot: validationContext.screenshot
            )
            
            let validationResult = parseValidationFromResponse(response.response)
            
            let output = ValidatorOutput(
                isValid: validationResult.isValid,
                confidence: response.confidence,
                reasoning: response.response,
                suggestions: validationResult.suggestions,
                completionScore: validationResult.completionScore
            )
            
            let status = validationResult.isValid ? "Task validation successful" : "Task validation failed"
            context.emitEvent(.validator, validationResult.isValid ? .validationComplete : .validationFailed, status)
            isProcessing = false
            
            return AgentOutput(success: true, result: output)
            
        } catch {
            context.emitEvent(.validator, .validationFailed, error.localizedDescription)
            isProcessing = false
            
            return AgentOutput(success: false, error: error.localizedDescription)
        }
    }
    
    func setPlan(_ steps: [String]) {
        self.plannedSteps = steps
    }
    
    private func getValidationContext() async -> ValidationContext {
        // DOM-first validation context (no mandatory screenshot)
        return ValidationContext(
            originalTask: originalTask,
            plannedSteps: plannedSteps,
            screenshot: "", // Empty initially - DOM first!
            url: "Browser Context",
            title: "DOM Validation",
            executedActions: context.actionResults,
            currentStep: context.currentStep
        )
    }
    
    private func createValidatorPrompt(context: ValidationContext) -> String {
        let executionSummary = context.executedActions.map { result in
            "\(result.action.actionType): \(result.success ? "✅" : "❌")"
        }.joined(separator: ", ")
        
        return """
        You are a validator of an agent who interacts with a browser.
        
        YOUR ROLE:
        1. Validate if the agent's last action matches the user's request and if the ultimate task is completed.
        2. Determine if the ultimate task is fully completed
        3. Answer the ultimate task based on the provided context if the task is completed
        
        Original Task: "\(context.originalTask)"
        
        Planned Steps:
        \(context.plannedSteps.isEmpty ? "No specific plan provided" : context.plannedSteps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))
        
        Executed Actions: \(executionSummary.isEmpty ? "None yet" : executionSummary)
        
        Current Page: \(context.title) (\(context.url))
        
        RESPONSE FORMAT: You must ALWAYS respond with valid JSON in this exact format:
        {
          "is_valid": true,  // Boolean value indicating if task is completed correctly
          "reason": "clear explanation of validation result",
          "answer": "human-readable final answer if valid, empty string if not valid"
        }
        
        Consider:
        - Does the current page state match what the task requested?
        - Are there any visible error messages or failures?
        - Has the objective been clearly achieved?
        - What evidence supports or contradicts task completion?
        """
    }
    
    private func parseValidationFromResponse(_ response: String) -> ParsedValidation {
        do {
            if let data = response.data(using: .utf8),
               let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                // Parse extension validator format
                let isValid = json["is_valid"] as? Bool ?? false
                let reason = json["reason"] as? String ?? "No reason provided"
                let answer = json["answer"] as? String ?? ""
                
                // Convert to our format
                let suggestions = isValid ? [] : [reason, "Continue with task execution"]
                let completionScore = isValid ? 1.0 : 0.0
                
                return ParsedValidation(
                    isValid: isValid,
                    completionScore: completionScore,
                    suggestions: suggestions
                )
            }
        } catch {
            print("Failed to parse validation JSON: \(error)")
        }
        
        // Conservative fallback - assume not complete
        return ParsedValidation(
            isValid: false,
            completionScore: 0.0,
            suggestions: ["Continue with task execution", "Take additional screenshots for verification"]
        )
    }
    
    func cancel() async {
        isProcessing = false
        context.cancel()
    }
    
    func reset() async {
        isProcessing = false
        plannedSteps = []
    }
    
    func getProcessingState() async -> Bool {
        return isProcessing
    }
    
    func setProcessingState(_ processing: Bool) async {
        isProcessing = processing
    }
}

// MARK: - Supporting Types

struct CurrentState {
    let screenshot: String
    let url: String
    let title: String
    let domElements: [DOMElement]
    let timestamp: Date
}

struct ActionPlan {
    let actions: [PlannedAction]
    let reasoning: String
    let confidence: Double
}

struct PlannedAction {
    let actionType: String
    let parameters: [String: Any]
    let reasoning: String
}

struct PlanningContext {
    let originalTask: String
    let currentStep: Int
    let maxSteps: Int
    let screenshot: String
    let url: String
    let title: String
    let recentActions: [ActionResult]
    let domElements: [DOMElement]
}

struct ValidationContext {
    let originalTask: String
    let plannedSteps: [String]
    let screenshot: String
    let url: String
    let title: String
    let executedActions: [ActionResult]
    let currentStep: Int
}

struct ParsedPlan {
    let plan: String
    let steps: [String]
    let isComplete: Bool
    let needsWebTask: Bool
}

struct ParsedValidation {
    let isValid: Bool
    let completionScore: Double
    let suggestions: [String]
}

// MARK: - Output Types

struct NavigatorOutput: Codable {
    let actions: [String]
    let results: [ActionResult]
    let isComplete: Bool
    let needsReplanning: Bool
    let reasoning: String
    let screenshot: String
}

struct PlannerOutput: Codable {
    let plan: String
    let nextSteps: [String]
    let isComplete: Bool
    let confidence: Double
    let reasoning: String
    let needsWebTask: Bool
}

struct ValidatorOutput: Codable {
    let isValid: Bool
    let confidence: Double
    let reasoning: String
    let suggestions: [String]
    let completionScore: Double
}

// MARK: - Agent Errors

enum AgentError: Error, LocalizedError {
    case maxFailuresReached(String)
    case invalidResponse(String)
    case cancelled
    case timeout
    
    var errorDescription: String? {
        switch self {
        case .maxFailuresReached(let message):
            return message
        case .invalidResponse(let message):
            return "Invalid response: \(message)"
        case .cancelled:
            return "Operation was cancelled"
        case .timeout:
            return "Operation timed out"
        }
    }
}