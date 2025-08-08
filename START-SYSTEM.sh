#!/bin/bash

echo "🚀 Starting Visual Agent Memory System..."

# Check if extension folder exists
if [ ! -d "visual-agent/extension" ]; then
    echo "❌ Extension folder not found!"
    echo "Make sure you're running this from the project root directory"
    exit 1
fi

# Check if Mac app exists
if [ ! -f "Oniew Agent.xcodeproj/project.pbxproj" ]; then
    echo "❌ Mac app project not found!"
    exit 1
fi

echo "📁 Project structure verified"

# Instructions for manual steps
echo ""
echo "🔧 MANUAL SETUP REQUIRED:"
echo ""
echo "1. LOAD CHROME EXTENSION:"
echo "   • Open Chrome and go to: chrome://extensions/"
echo "   • Toggle 'Developer mode' ON (top right)"
echo "   • Click 'Load unpacked' button"
echo "   • Select folder: $(pwd)/visual-agent/extension"
echo "   • Verify 'Visual Agent' appears in extensions list"
echo ""
echo "2. BUILD & RUN MAC APP:"
echo "   • Double-click: Oniew Agent.xcodeproj"
echo "   • In Xcode: Press ⌘+R to build and run"
echo "   • Grant any permissions requested"
echo "   • Floating panel should appear on screen"
echo ""
echo "3. CONFIGURE AI MODEL:"
echo "   • In Mac app, click 'Settings' tab"
echo "   • Choose your preferred AI model (OpenAI, Claude, etc.)"
echo "   • Enter your API key if using cloud models"
echo "   • Or select local Ollama model if available"
echo ""
echo "4. TEST CONNECTION:"
echo "   • Click Visual Agent extension icon in Chrome"
echo "   • Should show '🟢 Connected to Mac App'"
echo "   • Mac app should show 'Connected' status"
echo ""
echo "5. RUN FIRST TASK:"
echo "   • Open any website in Chrome (try google.com)"
echo "   • In Mac app, type: 'Click the search box'"
echo "   • Watch the magic happen! 🪄"
echo ""
echo "📚 For troubleshooting, see: SETUP-TROUBLESHOOTING.md"
echo ""
echo "🧠 MEMORY FEATURES:"
echo "   • AI remembers previous actions and results"
echo "   • Learns from successful patterns"
echo "   • Avoids repeating failed actions"
echo "   • Builds context across task sessions"
echo ""
echo "✨ System ready for setup! Follow the manual steps above."