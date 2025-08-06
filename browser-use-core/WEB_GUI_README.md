# 🌐 Browser-Use Web GUI

**Professional web-based interface for browser-use AI agent** - Access through your browser at `http://localhost:8080`

![Browser-Use Web GUI](https://via.placeholder.com/800x400/1e3c72/ffffff?text=🤖+Browser-Use+Web+GUI)

## ✨ Features

### 🎯 **Natural Language Prompts**
Give tasks in plain English through a beautiful web interface:
- `"Navigate to Google and search for 'AI automation'"`
- `"Go to Gmail and check for new emails"`
- `"Find the best laptops under $1000 on Amazon"`

### 🖥️ **Real-time Monitoring**
- **Live execution logs** with timestamps and color-coded levels
- **Memory tracking** showing autocomplete events and task progress
- **Status indicators** for LLM, Browser, and Agent states
- **Progress bar** with animations during task execution

### 🧠 **Enhanced Memory System**
- **Task Memory**: Tracks execution progress and context
- **Autocomplete Detection**: Monitors form interactions (Gmail, search boxes)
- **Sequence Breaking**: Detects when user input is needed
- **Event History**: Visual display of detected automation events

### ⚙️ **Professional Controls**
- **Configurable settings**: Max steps (1-50), headless mode toggle
- **Quick tasks**: Pre-built common automation scenarios
- **Real-time WebSocket**: Instant updates without page refresh
- **Responsive design**: Works on desktop, tablet, and mobile

## 🚀 Quick Start

### 1. Launch Web GUI
```bash
# Easy launch with checks
./launch_web_gui.sh

# Or manually
python3 web_app.py
```

### 2. Open in Browser
Navigate to: **http://localhost:8080**

### 3. Enter Your Task
In the task input area, describe what you want:

**Example Tasks:**
```
Navigate to Google and search for 'latest AI trends 2025'

Go to Gmail, check for unread emails from the last week

Visit Amazon and find wireless headphones under $100 with good reviews

Go to GitHub, search for 'browser automation', and find the most popular repositories

Visit Wikipedia, search for 'machine learning', and summarize the main article
```

### 4. Configure & Run
- Set **Max Steps** (default: 10)
- Toggle **Headless Mode** (browser visibility)
- Click **🚀 Run Task** and watch the magic happen!

## 🎮 Interface Overview

### 🎯 Left Panel - Task Input & Controls
- **📝 Task Input**: Large text area for natural language prompts
- **⚡ Quick Tasks**: 4 pre-built tasks (Google, Gmail, Wikipedia, GitHub)
- **⚙️ Settings**: Max steps and headless mode controls
- **🚀 Action Buttons**: Run/Stop task controls with real-time state

### 📊 Right Panel - Monitoring & Memory
- **📋 Output & Logs**: Real-time execution logs with color coding
- **🧠 Memory & Stats**: Live memory state and autocomplete detection
- **📈 Execution Stats**: Steps, success/failure, performance metrics

### 📊 Status Bar
- **🦙 LLM Status**: Ollama connection (Connected ✅/Disconnected ❌)
- **🌐 Browser Status**: Browser session state (Ready/Running)  
- **🤖 Agent Status**: Current execution state (Idle/Running/Completed)

## 🔧 Technical Requirements

### System Requirements
- **Python 3.11+** 
- **Flask & SocketIO** (auto-installed)
- **Browser-use** (integrated)
- **Ollama with Qwen3:14B** model

### Setup Ollama
```bash
# Start Ollama with CORS for web access
OLLAMA_ORIGINS="*" ollama serve

# Install required model
ollama pull Qwen3:14B
```

### Manual Installation
```bash
pip3 install flask flask-socketio
python3 web_app.py
```

## 📝 Usage Examples

### 🔍 **Web Research & Search**
```
"Go to Google, search for 'quantum computing breakthroughs 2024', and summarize the top 3 results"
```

### 📧 **Email Management**
```
"Navigate to Gmail, check my inbox for emails from 'support@company.com', and list the subjects"
```

### 🛒 **E-commerce & Shopping**
```
"Go to Amazon, search for 'mechanical keyboards', filter by 4+ stars, and show me the top 5 under $200"
```

### 📚 **Research & Documentation**
```
"Visit Wikipedia, search for 'artificial neural networks', extract the definition and main applications"
```

### 💻 **Developer Tasks**
```
"Go to GitHub, search for 'python web scraping', and find repositories with 1000+ stars updated in the last year"
```

## 🎯 Quick Tasks (Pre-built)

The interface includes 4 ready-to-use tasks:

1. **🔍 Google Search**: `"Navigate to Google and search for 'AI automation'"`
2. **📧 Gmail Check**: `"Go to Gmail and check for new emails"`
3. **📚 Wikipedia**: `"Visit Wikipedia and search for 'artificial intelligence'"`
4. **💻 GitHub**: `"Go to GitHub and search for 'browser automation'"`

Click any quick task to auto-fill the prompt!

## 🔍 Advanced Features

### 🧠 Memory Management
- **Real-time Memory Display**: See task progress and system state
- **Autocomplete Detection**: Monitor form interactions and dropdown events
- **Sequence Breaking**: Automatic detection when user input is required
- **Event Tracking**: Visual history of automation events and decisions

### ⚙️ Advanced Settings
- **Max Steps Control**: Limit agent actions (1-50 steps)
- **Headless Mode**: Run browser in background for faster execution
- **Real-time Updates**: WebSocket communication for instant feedback
- **Mobile Responsive**: Works perfectly on all devices

### 📊 Monitoring & Debugging
- **Color-coded Logs**: INFO (blue), ERROR (red), WARNING (yellow)
- **Timestamp Tracking**: Precise execution timing
- **Memory State Visualization**: Live memory and autocomplete events
- **Performance Metrics**: Steps executed, success rates, timing

## 🌐 Network & Access

### Local Access
- **Primary**: http://localhost:8080
- **Network**: http://192.168.1.xxx:8080 (your local IP)

### Remote Access (Advanced)
To access from other devices on your network:
1. Find your IP: `ifconfig | grep inet`
2. Open firewall port 8080 if needed
3. Access via: `http://YOUR_IP:8080`

## 🛠️ Troubleshooting

### 🦙 LLM Connection Issues
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama with CORS
OLLAMA_ORIGINS="*" ollama serve

# Verify model
ollama list | grep Qwen3
```

### 🌐 Web Server Issues
```bash
# Check port availability
lsof -ti:8080

# Kill process using port
kill $(lsof -ti:8080)

# Restart web GUI
python3 web_app.py
```

### 🤖 Browser Issues
```bash
# Install Playwright browsers
python3 -m playwright install chromium

# Check browser-use
python3 -c "import browser_use; print('✅ Browser-use ready')"
```

## 🚀 Performance Tips

### 🏃‍♂️ **Speed Optimization**
- Use **headless mode** for faster execution
- Set **lower max steps** for simple tasks (3-5)
- **Clear logs** periodically for better performance
- Use **specific prompts** rather than vague instructions

### 💾 **Memory Management**
- Monitor memory display for complex tasks
- **Break down large tasks** into smaller steps
- Use **sequence breaking** for interactive tasks
- **Stop tasks** that seem stuck or infinite

## 📚 Integration with Oniew Agent

This web GUI integrates your **Oniew Agent innovations**:

- **✅ Memory Management System**: Full task context tracking
- **✅ Autocomplete Detection**: Gmail, forms, search boxes
- **✅ DOM Change Awareness**: Smart page interaction monitoring  
- **✅ Sequence Breaking**: Intelligent pause for user input
- **✅ Enhanced Actions**: Improved input and click handling

## 🎯 Next Steps

1. **Try Different Tasks**: Experiment with various automation scenarios
2. **Monitor Memory**: Watch how the system tracks autocomplete events
3. **Use Quick Tasks**: Test the pre-built automation examples
4. **Headless vs Visible**: Compare performance modes
5. **Complex Workflows**: Chain multiple tasks together

## 🔗 Files & Structure

```
browser-use-core/
├── web_app.py              # Main Flask web application
├── templates/index.html    # Beautiful web interface
├── launch_web_gui.sh      # Easy launch script
├── requirements_web.txt   # Python dependencies
└── WEB_GUI_README.md     # This documentation
```

---

## 🎉 **Ready to Use!**

Your **Browser-Use Web GUI** is now ready! Access it at:

### 🌐 **http://localhost:8080**

**Professional web interface for AI browser automation** - No coding required, just natural language prompts! 🚀