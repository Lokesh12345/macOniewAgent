import Foundation

class VLModelService {
    private let settingsManager = VLSettingsManager()
    
    func analyzeScreenshot(_ screenshot: String, task: String, memoryContext: String = "", completion: @escaping (VLAnalysisResult) -> Void) {
        let currentModel = settingsManager.selectedModel
        
        print("🔍 VL Model Analysis Starting...")
        print("   📋 Task: \(task)")
        print("   🧠 Model: \(currentModel.name) (\(currentModel.provider.rawValue))")
        print("   📸 Screenshot size: \(screenshot.count) characters")
        print("   🧩 Memory context: \(memoryContext.isEmpty ? "None" : "\(memoryContext.count) chars")")
        
        // Check if we have valid configuration
        guard settingsManager.isCurrentModelValid else {
            let error = "Model not configured properly. Please check API key in settings."
            print("❌ VL Model Error: \(error)")
            completion(.failure(error))
            return
        }
        
        print("✅ Model configuration valid, proceeding with \(currentModel.provider.rawValue)")
        
        switch currentModel.provider {
        case .openai:
            analyzeWithOpenAI(screenshot: screenshot, task: task, model: currentModel, memoryContext: memoryContext, completion: completion)
        case .anthropic:
            analyzeWithAnthropic(screenshot: screenshot, task: task, model: currentModel, memoryContext: memoryContext, completion: completion)
        case .google:
            analyzeWithGoogle(screenshot: screenshot, task: task, model: currentModel, memoryContext: memoryContext, completion: completion)
        case .ollama:
            analyzeWithOllama(screenshot: screenshot, task: task, model: currentModel, memoryContext: memoryContext, completion: completion)
        }
    }
    
    // MARK: - OpenAI Implementation
    private func analyzeWithOpenAI(screenshot: String, task: String, model: VLModel, memoryContext: String = "", completion: @escaping (VLAnalysisResult) -> Void) {
        let systemPrompt = createSystemPrompt()
        let userPrompt = "Task: \(task)\(memoryContext)\n\nPlease analyze this screenshot and provide the actions needed to complete this task."
        
        let requestBody: [String: Any] = [
            "model": model.name,
            "messages": [
                ["role": "system", "content": systemPrompt],
                [
                    "role": "user",
                    "content": [
                        ["type": "text", "text": userPrompt],
                        ["type": "image_url", "image_url": ["url": screenshot]]
                    ]
                ]
            ],
            "max_tokens": settingsManager.maxTokens,
            "temperature": settingsManager.temperature
        ]
        
        makeAPICall(
            url: model.provider.baseURL,
            headers: ["Authorization": "Bearer \(settingsManager.getApiKey(for: .openai))"],
            body: requestBody,
            completion: completion
        )
    }
    
    // MARK: - Anthropic Implementation
    private func analyzeWithAnthropic(screenshot: String, task: String, model: VLModel, memoryContext: String = "", completion: @escaping (VLAnalysisResult) -> Void) {
        let systemPrompt = createSystemPrompt()
        let userPrompt = "Task: \(task)\(memoryContext)\n\nPlease analyze this screenshot and provide the actions needed to complete this task."
        
        // Convert base64 image to proper format for Anthropic
        let imageData = screenshot.replacingOccurrences(of: "data:image/png;base64,", with: "")
        
        let requestBody: [String: Any] = [
            "model": model.name,
            "max_tokens": settingsManager.maxTokens,
            "temperature": settingsManager.temperature,
            "system": systemPrompt,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        ["type": "text", "text": userPrompt],
                        [
                            "type": "image",
                            "source": [
                                "type": "base64",
                                "media_type": "image/png",
                                "data": imageData
                            ]
                        ]
                    ]
                ]
            ]
        ]
        
        makeAPICall(
            url: model.provider.baseURL,
            headers: [
                "x-api-key": settingsManager.getApiKey(for: .anthropic),
                "anthropic-version": "2023-06-01"
            ],
            body: requestBody,
            responseHandler: { json in
                if let content = json["content"] as? [[String: Any]],
                   let firstContent = content.first,
                   let text = firstContent["text"] as? String {
                    return text
                }
                return nil
            },
            completion: completion
        )
    }
    
    // MARK: - Google Gemini Implementation
    private func analyzeWithGoogle(screenshot: String, task: String, model: VLModel, memoryContext: String = "", completion: @escaping (VLAnalysisResult) -> Void) {
        let systemPrompt = createSystemPrompt()
        let userPrompt = "Task: \(task)\(memoryContext)\n\nPlease analyze this screenshot and provide the actions needed to complete this task."
        
        let imageData = screenshot.replacingOccurrences(of: "data:image/png;base64,", with: "")
        let url = "\(model.provider.baseURL)/\(model.name):generateContent?key=\(settingsManager.getApiKey(for: .google))"
        
        let requestBody: [String: Any] = [
            "contents": [
                [
                    "parts": [
                        ["text": "\(systemPrompt)\n\n\(userPrompt)"],
                        [
                            "inline_data": [
                                "mime_type": "image/png",
                                "data": imageData
                            ]
                        ]
                    ]
                ]
            ],
            "generationConfig": [
                "temperature": settingsManager.temperature,
                "maxOutputTokens": settingsManager.maxTokens
            ]
        ]
        
        makeAPICall(
            url: url,
            headers: [:],
            body: requestBody,
            responseHandler: { json in
                if let candidates = json["candidates"] as? [[String: Any]],
                   let firstCandidate = candidates.first,
                   let content = firstCandidate["content"] as? [String: Any],
                   let parts = content["parts"] as? [[String: Any]],
                   let firstPart = parts.first,
                   let text = firstPart["text"] as? String {
                    return text
                }
                return nil
            },
            completion: completion
        )
    }
    
    // MARK: - Ollama Implementation
    private func analyzeWithOllama(screenshot: String, task: String, model: VLModel, memoryContext: String = "", completion: @escaping (VLAnalysisResult) -> Void) {
        print("🦙 Ollama Analysis Starting...")
        print("   🌐 URL: \(model.provider.baseURL)")
        print("   🏷️ Model: \(model.name)")
        
        let systemPrompt = createSystemPrompt()
        let userPrompt = "Task: \(task)\(memoryContext)\n\nPlease analyze this screenshot and provide the actions needed to complete this task."
        
        print("   💬 System Prompt Length: \(systemPrompt.count) chars")
        print("   💬 User Prompt: \(userPrompt.prefix(100))...")
        
        // Clean base64 image data - remove data URL prefix if present
        let cleanImageData = screenshot
            .replacingOccurrences(of: "data:image/png;base64,", with: "")
            .replacingOccurrences(of: "data:image/jpeg;base64,", with: "")
            .replacingOccurrences(of: "data:image/webp;base64,", with: "")
        
        print("   🖼️ Clean image data length: \(cleanImageData.count) chars")
        
        // Ollama chat API with vision - proper format
        let requestBody: [String: Any] = [
            "model": model.name,
            "messages": [
                [
                    "role": "user",
                    "content": userPrompt,
                    "images": [cleanImageData]
                ]
            ],
            "stream": false,
            "options": [
                "temperature": settingsManager.temperature,
                "num_predict": settingsManager.maxTokens
            ]
        ]
        
        print("   📤 Sending request to Ollama...")
        print("   🔧 Temperature: \(settingsManager.temperature)")
        print("   📊 Max tokens: \(settingsManager.maxTokens)")
        
        // Use /api/chat endpoint for Ollama
        let chatURL = model.provider.baseURL.hasSuffix("/api/chat") ? 
            model.provider.baseURL : 
            model.provider.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/chat"
        
        print("   🎯 Full API URL: \(chatURL)")
        
        makeAPICall(
            url: chatURL,
            headers: [:],
            body: requestBody,
            responseHandler: { json in
                print("🦙 Ollama Raw Response:")
                if let jsonData = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    print(jsonString.prefix(1000))
                } else {
                    print("   Failed to serialize response")
                }
                
                // Ollama response format: { "message": { "content": "..." } }
                if let message = json["message"] as? [String: Any],
                   let content = message["content"] as? String {
                    print("✅ Ollama Content extracted: \(content.prefix(200))...")
                    return content
                } else {
                    print("❌ Failed to extract content from Ollama response")
                    print("   Available keys: \(json.keys.joined(separator: ", "))")
                    return nil
                }
            },
            completion: { result in
                print("🦙 Ollama Analysis Complete:")
                switch result {
                case .success(let analysis, let actions):
                    print("   ✅ Success: \(analysis.prefix(100))...")
                    print("   🎯 Actions: \(actions.count) actions generated")
                    for (i, action) in actions.enumerated() {
                        print("      \(i+1). \(action.description)")
                    }
                case .failure(let error):
                    print("   ❌ Failed: \(error)")
                }
                completion(result)
            }
        )
    }
    
    // MARK: - Common Helpers
    private func createSystemPrompt() -> String {
        return """
        You are an expert browser automation AI assistant with visual understanding and task memory. Your job is to analyze screenshots and generate precise browser actions to complete user tasks.

        VISUAL ANALYSIS:
        - Carefully examine the screenshot to understand the current page state
        - Identify interactive elements: buttons, links, input fields, menus
        - Note the page layout, content, and navigation options
        - Look for search boxes, forms, navigation menus, and actionable items

        MEMORY INTEGRATION:
        If you receive task memory context, use it intelligently to:
        - Avoid repeating failed actions that didn't work before
        - Build upon successful previous steps and continue the workflow  
        - Understand what has already been attempted or accomplished
        - Make informed decisions based on past results and learnings
        - Adapt your strategy based on what worked or failed previously

        OUTPUT FORMAT:
        Always respond with valid JSON containing both analysis and actions:
        ```json
        {
            "analysis": "Clear description of what you see and your step-by-step plan to complete the task",
            "actions": [
                {
                    "type": "click",
                    "coordinates": {"x": 150, "y": 300},
                    "selector": "#search-button"
                },
                {
                    "type": "type", 
                    "selector": "input[type='search']",
                    "text": "search query here"
                },
                {
                    "type": "scroll",
                    "direction": "down",
                    "amount": 400
                }
            ]
        }
        ```

        ACTION TYPES:
        - click: Use coordinates for precise clicking. Include selector if available for backup.
        - type: Use selector to target input fields. Include the exact text to type.
        - scroll: Use direction ("up"/"down") and amount in pixels.

        BEST PRACTICES:
        - Prefer coordinates for clicking as they're more reliable than selectors
        - Use descriptive analysis to explain your reasoning
        - Generate 1-3 actions per response to avoid overwhelming the system
        - Be specific about what you're trying to accomplish in each step
        - If you see forms, fill them out completely before submitting
        """
    }
    
    private func makeAPICall(
        url: String,
        headers: [String: String],
        body: [String: Any],
        responseHandler: ((([String: Any]) -> String?))? = nil,
        completion: @escaping (VLAnalysisResult) -> Void
    ) {
        print("🌐 Making API Call...")
        print("   🎯 URL: \(url)")
        print("   📋 Headers: \(headers.keys.joined(separator: ", "))")
        
        guard let apiURL = URL(string: url) else {
            let error = "Invalid API URL: \(url)"
            print("❌ \(error)")
            completion(.failure(error))
            return
        }
        
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60.0 // 60 second timeout
        
        // Set custom headers
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            request.httpBody = bodyData
            print("   📦 Request body size: \(bodyData.count) bytes")
            
            // Log request body (truncated for large images)
            if let bodyString = String(data: bodyData, encoding: .utf8) {
                let truncatedBody = bodyString.count > 500 ? 
                    String(bodyString.prefix(500)) + "... (truncated)" : bodyString
                print("   📝 Request body preview: \(truncatedBody)")
            }
        } catch {
            let errorMsg = "Failed to serialize request: \(error)"
            print("❌ \(errorMsg)")
            completion(.failure(errorMsg))
            return
        }
        
        print("   🚀 Sending request...")
        let startTime = Date()
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            let duration = Date().timeIntervalSince(startTime)
            print("   ⏱️ Request completed in \(String(format: "%.2f", duration))s")
            
            if let error = error {
                let errorMsg = "Network error: \(error.localizedDescription)"
                print("❌ \(errorMsg)")
                completion(.failure(errorMsg))
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                print("   📊 HTTP Status: \(httpResponse.statusCode)")
                if httpResponse.statusCode != 200 {
                    let errorMsg = "HTTP Error: \(httpResponse.statusCode)"
                    print("❌ \(errorMsg)")
                    completion(.failure(errorMsg))
                    return
                }
            }
            
            guard let data = data else {
                let errorMsg = "No data received"
                print("❌ \(errorMsg)")
                completion(.failure(errorMsg))
                return
            }
            
            print("   📥 Response data size: \(data.count) bytes")
            
            do {
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    let errorMsg = "Invalid JSON response"
                    print("❌ \(errorMsg)")
                    if let responseString = String(data: data, encoding: .utf8) {
                        print("   📝 Raw response: \(responseString.prefix(500))")
                    }
                    completion(.failure(errorMsg))
                    return
                }
                
                print("✅ Valid JSON response received")
                print("   🔑 Response keys: \(json.keys.joined(separator: ", "))")
                
                // Check for API errors
                if let error = json["error"] as? [String: Any],
                   let message = error["message"] as? String {
                    let errorMsg = "API Error: \(message)"
                    print("❌ \(errorMsg)")
                    completion(.failure(errorMsg))
                    return
                } else if let error = json["error"] as? String {
                    let errorMsg = "API Error: \(error)"
                    print("❌ \(errorMsg)")
                    completion(.failure(errorMsg))
                    return
                }
                
                // Extract content using custom handler or default OpenAI format
                let content: String
                if let handler = responseHandler {
                    print("   🔄 Using custom response handler...")
                    guard let extractedContent = handler(json) else {
                        let errorMsg = "Failed to extract content from response"
                        print("❌ \(errorMsg)")
                        completion(.failure(errorMsg))
                        return
                    }
                    content = extractedContent
                } else {
                    print("   🔄 Using default OpenAI response format...")
                    // Default OpenAI format
                    guard let choices = json["choices"] as? [[String: Any]],
                          let firstChoice = choices.first,
                          let message = firstChoice["message"] as? [String: Any],
                          let messageContent = message["content"] as? String else {
                        let errorMsg = "Invalid response format"
                        print("❌ \(errorMsg)")
                        print("   📝 Available structure: \(json)")
                        completion(.failure(errorMsg))
                        return
                    }
                    content = messageContent
                }
                
                print("✅ Content extracted successfully (\(content.count) chars)")
                print("   📄 Content preview: \(content.prefix(200))...")
                
                self.parseModelResponse(content, completion: completion)
                
            } catch {
                let errorMsg = "Failed to parse response: \(error)"
                print("❌ \(errorMsg)")
                completion(.failure(errorMsg))
            }
        }.resume()
    }
    
    private func parseModelResponse(_ content: String, completion: @escaping (VLAnalysisResult) -> Void) {
        print("🔍 Parsing Model Response...")
        print("   📄 Raw content length: \(content.count) chars")
        print("   📄 Content preview: \(content.prefix(300))...")
        
        let jsonString = extractJSONFromContent(content)
        print("   📋 Extracted JSON: \(jsonString.prefix(500))...")
        
        guard let data = jsonString.data(using: .utf8) else {
            let error = "Failed to convert response to data"
            print("❌ \(error)")
            completion(.failure(error))
            return
        }
        
        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                let error = "Failed to parse JSON from extracted content"
                print("❌ \(error)")
                completion(.failure(error))
                return
            }
            
            print("✅ JSON parsed successfully")
            print("   🔑 JSON keys: \(json.keys.joined(separator: ", "))")
            
            guard let actionsArray = json["actions"] as? [[String: Any]] else {
                let error = "No 'actions' array found in response"
                print("❌ \(error)")
                print("   📝 Available JSON: \(json)")
                completion(.failure(error))
                return
            }
            
            print("   🎯 Found \(actionsArray.count) actions in response")
            
            let actions = actionsArray.compactMap { actionDict -> BrowserAction? in
                print("      🔍 Processing action: \(actionDict)")
                
                guard let typeString = actionDict["type"] as? String else { 
                    print("      ❌ No type found in action")
                    return nil 
                }
                
                let actionType: BrowserAction.ActionType
                switch typeString {
                case "click": actionType = .click
                case "type": actionType = .type
                case "scroll": actionType = .scroll
                default: 
                    print("      ❌ Unknown action type: \(typeString)")
                    return nil
                }
                
                let selector = actionDict["selector"] as? String
                let text = actionDict["text"] as? String
                let direction = actionDict["direction"] as? String
                let amount = actionDict["amount"] as? Int
                
                var coordinates: CGPoint?
                if let coordDict = actionDict["coordinates"] as? [String: Any],
                   let x = coordDict["x"] as? Double,
                   let y = coordDict["y"] as? Double {
                    coordinates = CGPoint(x: x, y: y)
                    print("      📍 Coordinates: (\(x), \(y))")
                } else if let coordDict = actionDict["coordinates"] as? [String: Any] {
                    print("      ⚠️ Invalid coordinates format: \(coordDict)")
                }
                
                let action = BrowserAction(
                    type: actionType,
                    selector: selector,
                    coordinates: coordinates,
                    text: text,
                    direction: direction,
                    amount: amount
                )
                
                print("      ✅ Created action: \(action.description)")
                return action
            }
            
            print("   ✅ Successfully parsed \(actions.count) valid actions")
            
            // Extract analysis from the JSON if available
            let analysis = json["analysis"] as? String ?? "Analysis completed"
            print("   📊 Analysis: \(analysis.prefix(100))...")
            
            completion(.success(analysis, actions))
            
        } catch {
            let errorMsg = "Failed to parse model response: \(error)"
            print("❌ \(errorMsg)")
            completion(.failure(errorMsg))
        }
    }
    
    private func extractJSONFromContent(_ content: String) -> String {
        if let jsonStart = content.range(of: "```json"),
           let jsonEnd = content.range(of: "```", range: jsonStart.upperBound..<content.endIndex) {
            let jsonContent = content[jsonStart.upperBound..<jsonEnd.lowerBound]
            return String(jsonContent).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        
        if let jsonStart = content.range(of: "{"),
           let jsonEnd = content.range(of: "}", options: .backwards) {
            return String(content[jsonStart.lowerBound...jsonEnd.upperBound])
        }
        
        return content
    }
}