# OpenAI GPT-4o Mini Setup Guide

## ✅ **Default Configuration Applied**

Your Mac app is now configured to use **GPT-4o Mini** as the default VL model - this is:
- **Cost-effective**: ~$0.15 per 1M input tokens (much cheaper than GPT-4o)
- **Fast**: Quick response times for visual analysis
- **Reliable**: Stable and well-tested for browser automation
- **Vision-capable**: Excellent at understanding screenshots and UI elements

## 🔑 **Get Your OpenAI API Key**

1. **Go to OpenAI Platform**: https://platform.openai.com/api-keys
2. **Sign in** to your OpenAI account (create one if needed)
3. **Create new API key**:
   - Click "Create new secret key"
   - Name it something like "Oniew Visual Agent"
   - Copy the key (starts with `sk-...`)

## ⚙️ **Configure Your Mac App**

1. **Open your Mac app**
2. **Go to Settings** (gear icon in the top right)
3. **Enter your OpenAI API key** in the OpenAI section
4. **Verify the model** is set to "GPT-4o Mini (Vision)"
5. **Click Save**

## 🧪 **Test the Setup**

1. **Install the visual-agent extension** in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Load unpacked: `/Users/lokesh/Desktop/projects/mac/Oniew Agent/visual-agent/extension/`

2. **Test visual analysis**:
   - Open any website (like google.com) in Chrome
   - In your Mac app, enter: "what do you see?"
   - The app should capture a screenshot and analyze it with GPT-4o Mini

## 📊 **Default Settings Applied**

- **Model**: GPT-4o Mini (Vision)
- **Temperature**: 0.3 (balanced creativity/consistency)
- **Max Tokens**: 1500 (enough for detailed analysis + actions)
- **Memory**: Enabled (learns from previous actions)

## 🔍 **Comprehensive Logging**

I've added detailed logging throughout the system. You'll see logs like:
```
🔍 VL Model Analysis Starting...
   📋 Task: what do you see?
   🧠 Model: gpt-4o-mini (openai)
   📸 Screenshot size: 123456 characters
   🧩 Memory context: None
✅ Model configuration valid, proceeding with openai
```

## 💰 **Cost Estimation**

GPT-4o Mini pricing:
- **Input**: $0.15 per 1M tokens
- **Output**: $0.60 per 1M tokens

For visual tasks:
- Screenshot analysis: ~$0.01-0.05 per request
- Very affordable for regular use

## 🛠️ **Troubleshooting**

### "Model not configured properly"
- Check that your API key is entered correctly
- Verify the key has sufficient credits

### "Failed to extract content"
- Check your internet connection
- Verify OpenAI service status

### "Screenshot not received"
- Make sure the visual-agent extension is loaded
- Check browser console for connection errors
- Verify WebSocket connection on port 41899

## 📋 **Next Steps**

1. Set up your OpenAI API key
2. Test with simple visual tasks
3. Try complex browser automation tasks like:
   - "search for gold price on google"
   - "find the login button and click it"
   - "fill out this form with test data"

The system is now optimized and ready for reliable visual browser automation! 🎉