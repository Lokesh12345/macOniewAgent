//
//  ContentView.swift
//  Oniew Agent
//
//  Created by lokesh on 01/08/25.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        AgentPanel()
            .frame(width: 300, height: 600)
            .background(Color.clear)
            .allowsHitTesting(true)
    }
}

#Preview {
    ContentView()
}
