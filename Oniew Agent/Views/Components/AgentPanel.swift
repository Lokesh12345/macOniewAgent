import SwiftUI
import Foundation
import AppKit

struct AgentPanel: View {
    @State private var isHovering: Bool = false
    @State private var selectedQuestion: Question? = nil
    @State private var isAnalyzing = false
    @State private var showingAgentLogs = false
    @State private var questions: [Question] = []
    @State private var agentLogs: [AgentLog] = []
    @State private var chatText: String = ""
    @FocusState private var isChatFocused: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                questionsHeader
                
                if showingAgentLogs {
                    agentLogsContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    questionsContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        if let window = NSApplication.shared.windows.first {
                            let currentLocation = window.frame.origin
                            let newLocation = NSPoint(
                                x: currentLocation.x + value.translation.width,
                                y: currentLocation.y - value.translation.height
                            )
                            window.setFrameOrigin(newLocation)
                        }
                    }
            )
            
            // Chat footer
            chatFooter
        }
        .padding(8)
        .background(panelBackground)
        .onHover { hovering in
            isHovering = hovering
        }
    }
    
    private var questionsHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                HStack(spacing: 2) {
                    Button(action: {
                        showingAgentLogs = false
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "questionmark.bubble.fill")
                                .font(.system(size: 10))
                            
                            Text("Agent")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(showingAgentLogs ? .primary.opacity(0.5) : .primary.opacity(0.8))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(showingAgentLogs ? Color.clear : Color.blue.opacity(0.1))
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: {
                        showingAgentLogs = true
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "Setting")
                                .font(.system(size: 10))
                            
                            Text("Settings")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundColor(showingAgentLogs ? .primary.opacity(0.8) : .primary.opacity(0.5))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(showingAgentLogs ? Color.blue.opacity(0.1) : Color.clear)
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                
                Spacer()
                
                if isAnalyzing {
                    ProgressView()
                        .scaleEffect(0.6)
                }
                
                // Exit button
                Button(action: {
                    exitApp()
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.primary.opacity(0.7))
                        .padding(4)
                        .background(
                            Circle()
                                .fill(Color.red.opacity(0.1))
                        )
                }
                .buttonStyle(PlainButtonStyle())
                .onHover { hovering in
                    // Could add hover effect here if needed
                }
                
                if questions.count > 1 {
                    Button(action: {
                        clearAllButLastQuestion()
                    }) {
                        HStack(spacing: 2) {
                            Image(systemName: "trash.fill")
                                .font(.system(size: 8))
                            Text("Clear")
                                .font(.system(size: 8, weight: .medium))
                        }
                        .foregroundColor(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.orange.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.orange.opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            
            HStack(spacing: 4) {
                if showingAgentLogs {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 4, height: 4)
                    
                    Text("Agent running")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    Text("\(agentLogs.count) logs")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                } else {
                    Circle()
                        .fill(questions.isEmpty ? Color.gray : Color.blue)
                        .frame(width: 4, height: 4)
                    
                    Text("\(questions.count) steps todo")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    
    private var questionsContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if questions.isEmpty {
                    questionsEmptyState
                } else {
                    ForEach(questions.reversed()) { question in
                        QuestionCard(
                            question: question,
                            onQuestionTapped: { selectedQuestion in
                                self.selectedQuestion = selectedQuestion
                            },
                            onRetryTapped: { question in
                                retryQuestion(question)
                            }
                        )
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .top)),
                            removal: .opacity.combined(with: .move(edge: .trailing))
                        ))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(.easeInOut(duration: 0.3), value: questions.count)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var agentLogsContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if agentLogs.isEmpty {
                    agentEmptyState
                } else {
                    agentLogsSection
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var agentLogsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 10))
                    .foregroundColor(.blue)
                
                Text("Agent Server Logs")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.primary)
                
                Spacer()
                
                Text("\(agentLogs.count) logs")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                ForEach(agentLogs.reversed()) { log in
                    AgentLogRow(log: log)
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.blue.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.blue.opacity(0.3), lineWidth: 0.5)
                )
        )
    }
    
    private var agentEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 24))
                .foregroundColor(.primary.opacity(0.4))
            
            Text("No Agent Activity")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary.opacity(0.6))
            
            Text("Agent logs will appear here")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }
    
    private var questionsEmptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Hey , hi there! , what do you want me to do?")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.primary.opacity(0.8))
            
            Text("Just mention me in the chat and I will start working on it.")
                .font(.system(size: 9))
                .foregroundColor(.secondary)
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(8)
    }
    
    private var chatFooter: some View {
        VStack(spacing: 8) {
            // Separator line
            Rectangle()
                .fill(Color.primary.opacity(0.1))
                .frame(height: 0.5)
            
            // Chat input area
            HStack(spacing: 8) {
                // Text input
                TextEditor(text: $chatText)
                    .font(.system(size: 11))
                    .foregroundColor(.primary)
                    .scrollContentBackground(.hidden)
                    .focused($isChatFocused)
                    .frame(minHeight: 60, maxHeight: 100)
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.primary.opacity(0.05))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isChatFocused ? Color.blue.opacity(0.5) : Color.primary.opacity(0.1), lineWidth: 1)
                            )
                    )
                    .overlay(alignment: .topLeading) {
                        if chatText.isEmpty {
                            Text("Ask me anything...")
                                .font(.system(size: 11))
                                .foregroundColor(.primary.opacity(0.5))
                                .padding(12)
                                .allowsHitTesting(false)
                        }
                    }
                    .onTapGesture {
                        isChatFocused = true
                    }
                    .onSubmit {
                        sendMessage()
                    }
                
                // Start button
                Button(action: {
                    sendMessage()
                }) {
                    Image(systemName: chatText.isEmpty ? "paperplane" : "paperplane.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(chatText.isEmpty ? .primary.opacity(0.4) : .white)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(chatText.isEmpty ? Color.primary.opacity(0.1) : Color.blue)
                        )
                }
                .buttonStyle(PlainButtonStyle())
                .disabled(chatText.isEmpty)
                .animation(.easeInOut(duration: 0.2), value: chatText.isEmpty)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }
    
    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(Color.primary.opacity(0.05))
            .background(.regularMaterial.opacity(min(0.8, 0.6 * 1.2)))
            .blur(radius: 1.0, opaque: false)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.primary.opacity(0.6), lineWidth: 0.5)
            )
            .shadow(
                color: .black.opacity(0.15),
                radius: 8,
                x: 0,
                y: 4
            )
    }
    
    private func clearAllButLastQuestion() {
        if questions.count > 1 {
            let lastQuestion = questions.last
            questions = lastQuestion.map { [$0] } ?? []
        }
    }
    
    private func retryQuestion(_ question: Question) {
        print("Retrying question: \(question.text)")
    }
    
    private func exitApp() {
        NSApplication.shared.terminate(nil)
    }
    
    private func sendMessage() {
        guard !chatText.isEmpty else { return }
        
        print("Sending message: \(chatText)")
        
        // Add to questions or agent logs based on current mode
        if showingAgentLogs {
            let newLog = AgentLog(message: "User: \(chatText)")
            agentLogs.append(newLog)
        } else {
            let newQuestion = Question(
                text: chatText,
                category: "User Input",
                confidence: 1.0,
                answer: "Processing your request...",
                needsRetry: false
            )
            questions.append(newQuestion)
        }
        
        // Clear input
        chatText = ""
        isChatFocused = false
    }
    
}

struct QuestionCard: View {
    let question: Question
    let onQuestionTapped: (Question) -> Void
    let onRetryTapped: (Question) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 8))
                    .foregroundColor(.primary.opacity(0.8))
                
                Text(question.category)
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text("\(Int(question.confidence * 100))%")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(.primary.opacity(0.8))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.blue.opacity(0.1))
                    )
            }
            
            Text(question.text)
                .font(.system(size: 9))
                .foregroundColor(.primary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
            
            if !question.answer.isEmpty {
                Text(String(question.answer.prefix(60)) + "...")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .padding(.top, 2)
            }
            
            HStack(spacing: 8) {
                Button(action: {
                    onQuestionTapped(question)
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 8))
                        
                        Text("View Answer")
                            .font(.system(size: 8, weight: .medium))
                    }
                    .foregroundColor(.primary.opacity(0.8))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.blue.opacity(0.1))
                    )
                }
                .buttonStyle(PlainButtonStyle())
                
                if question.needsRetry {
                    Button(action: {
                        onRetryTapped(question)
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 8))
                            
                            Text("Retry")
                                .font(.system(size: 8, weight: .medium))
                        }
                        .foregroundColor(.orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.orange.opacity(0.1))
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
                )
        )
    }
}

struct AgentLogRow: View {
    let log: AgentLog
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(formatTime(log.timestamp))
                .font(.system(size: 8).monospaced())
                .foregroundColor(.primary.opacity(0.5))
                .frame(width: 45, alignment: .leading)
            
            Circle()
                .fill(logColor)
                .frame(width: 4, height: 4)
                .padding(.top, 4)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(log.message)
                    .font(.system(size: 10))
                    .foregroundColor(.primary.opacity(0.9))
                    .textSelection(.enabled)
            }
            
            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.blue.opacity(0.05))
        )
    }
    
    private var logColor: Color {
        if log.message.contains("SUCCESS") || log.message.contains("✅") {
            return .green
        } else if log.message.contains("ERROR") || log.message.contains("❌") {
            return .red
        } else {
            return .blue
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}

struct Question: Identifiable {
    let id = UUID()
    let text: String
    let category: String
    let confidence: Double
    let answer: String
    let needsRetry: Bool
    let timestamp: Date
    
    init(text: String, category: String = "General", confidence: Double = 0.8, answer: String = "", needsRetry: Bool = false) {
        self.text = text
        self.category = category
        self.confidence = confidence
        self.answer = answer
        self.needsRetry = needsRetry
        self.timestamp = Date()
    }
}

struct AgentLog: Identifiable {
    let id = UUID()
    let message: String
    let timestamp: Date
    
    init(message: String) {
        self.message = message
        self.timestamp = Date()
    }
}