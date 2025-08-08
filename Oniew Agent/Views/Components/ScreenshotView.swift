import SwiftUI
import AppKit

struct ScreenshotView: View {
    let screenshot: NSImage?
    let websiteInfo: VisualAgentManager.WebsiteInfo?
    let isProcessing: Bool
    
    @State private var isHovered = false
    @State private var showFullScreen = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 6) {
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.blue)
                
                Text("Current Screenshot")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.primary)
                
                Spacer()
                
                if isProcessing {
                    HStack(spacing: 4) {
                        ProgressView()
                            .scaleEffect(0.5)
                        Text("Analyzing...")
                            .font(.system(size: 8))
                            .foregroundColor(.blue)
                    }
                }
            }
            
            // Screenshot display area
            ZStack {
                if let screenshot = screenshot {
                    // Screenshot image
                    Image(nsImage: screenshot)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: 120)
                        .background(Color.black.opacity(0.1))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                        )
                        .scaleEffect(isHovered ? 1.02 : 1.0)
                        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
                        .onHover { hovering in
                            withAnimation(.easeInOut(duration: 0.2)) {
                                isHovered = hovering
                            }
                        }
                        .onTapGesture {
                            showFullScreen = true
                        }
                        .help("Click to view full size")
                    
                    // Overlay controls
                    VStack {
                        HStack {
                            Spacer()
                            Button(action: {
                                showFullScreen = true
                            }) {
                                Image(systemName: "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 10))
                                    .foregroundColor(.white)
                                    .padding(6)
                                    .background(
                                        Circle()
                                            .fill(Color.black.opacity(0.6))
                                    )
                            }
                            .buttonStyle(PlainButtonStyle())
                            .opacity(isHovered ? 1.0 : 0.0)
                            .animation(.easeInOut(duration: 0.2), value: isHovered)
                        }
                        Spacer()
                    }
                    .padding(8)
                } else {
                    // Placeholder when no screenshot
                    VStack(spacing: 8) {
                        Image(systemName: "camera.metering.unknown")
                            .font(.system(size: 24))
                            .foregroundColor(.secondary.opacity(0.6))
                        
                        Text("No screenshot yet")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                        
                        Text("Start a task to see the screenshot")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary.opacity(0.8))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, minHeight: 120)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.secondary.opacity(0.1))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                                    .foregroundColor(.secondary.opacity(0.3))
                            )
                    )
                }
            }
            
            // Website information
            if let websiteInfo = websiteInfo {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Image(systemName: "globe")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                        
                        VStack(alignment: .leading, spacing: 1) {
                            Text(websiteInfo.title)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                            
                            Text(websiteInfo.url)
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                        
                        Spacer()
                        
                        Text(formatTimestamp(websiteInfo.timestamp))
                            .font(.system(size: 8))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.blue.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.blue.opacity(0.2), lineWidth: 0.5)
                        )
                )
            }
        }
        .sheet(isPresented: $showFullScreen) {
            FullScreenshotView(screenshot: screenshot)
        }
    }
    
    private func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}

struct FullScreenshotView: View {
    let screenshot: NSImage?
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        VStack {
            HStack {
                Text("Screenshot Analysis View")
                    .font(.system(size: 16, weight: .semibold))
                
                Spacer()
                
                Button("Close") {
                    dismiss()
                }
                .keyboardShortcut(.escape)
            }
            .padding()
            
            if let screenshot = screenshot {
                ScrollView([.horizontal, .vertical]) {
                    Image(nsImage: screenshot)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            } else {
                Text("No screenshot available")
                    .font(.system(size: 18))
                    .foregroundColor(.secondary)
            }
        }
        .frame(minWidth: 800, minHeight: 600)
    }
}

#Preview {
    VStack {
        ScreenshotView(
            screenshot: nil,
            websiteInfo: nil,
            isProcessing: false
        )
        .frame(width: 300)
        
        ScreenshotView(
            screenshot: nil,
            websiteInfo: VisualAgentManager.WebsiteInfo(
                url: "https://www.google.com",
                title: "Google",
                timestamp: Date()
            ),
            isProcessing: true
        )
        .frame(width: 300)
    }
    .padding()
}