#!/bin/bash
# Launch Browser-Use Web GUI

echo "🌐 Launching Browser-Use Web GUI..."
echo "🔧 Checking requirements..."

# Check if Ollama is running
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is running"
else
    echo "⚠️  Ollama not running. Start it with:"
    echo "   OLLAMA_ORIGINS='*' ollama serve"
    echo ""
fi

# Check Python version
python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if [[ $(echo "$python_version >= 3.11" | bc -l) -eq 1 ]]; then
    echo "✅ Python $python_version"
else
    echo "❌ Python $python_version - Need Python 3.11+"
    exit 1
fi

# Check Flask
if python3 -c "import flask" > /dev/null 2>&1; then
    echo "✅ Flask available"
else
    echo "⚠️  Installing Flask..."
    pip3 install flask flask-socketio
fi

echo ""
echo "🚀 Starting Web GUI..."
echo "📱 Access at: http://localhost:8888"
echo "🛑 Press Ctrl+C to stop"
echo ""

# Launch the web app
python3 web_app.py