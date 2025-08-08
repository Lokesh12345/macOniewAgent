//
//  Oniew_AgentApp.swift
//  Oniew Agent
//
//  Created by lokesh on 01/08/25.
//

import SwiftUI
import AppKit

@main
struct Oniew_AgentApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    configureWindow()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .windowLevel(.floating)
    }
    
    private func configureWindow() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if let window = NSApplication.shared.windows.first {
                window.backgroundColor = NSColor.clear
                window.isOpaque = false
                window.hasShadow = false
                window.level = .floating
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.styleMask = [.borderless, .fullSizeContentView]
                
                // Position window at right side center of screen
                if let screen = NSScreen.main {
                    let screenFrame = screen.visibleFrame
                    let windowSize = window.frame.size
                    
                    let xPosition = screenFrame.maxX - windowSize.width - 20
                    let yPosition = screenFrame.midY - (windowSize.height / 2)
                    
                    window.setFrameOrigin(NSPoint(x: xPosition, y: yPosition))
                }
                
                // Configure stealth mode (hide from screen sharing by default)
                WindowConfigurator.configureScreenSharingHiding(window)
                
                window.makeKeyAndOrderFront(nil)
            }
        }
    }
}
