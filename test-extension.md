# Testing the Enhanced Visual Agent Extension

## 🔧 **Step 1: Reload the Extension**

1. **Go to Chrome Extensions:**
   ```
   chrome://extensions/
   ```

2. **Reload Visual Agent:**
   - Find "Visual Agent" extension
   - Click the reload button (🔄)

3. **Open Extension Console:**
   - Click "Inspect views: service worker"
   - This opens DevTools for the extension

## 🧪 **Step 2: Test Connection**

### **Mac App Console Should Show:**
```
🚀 WebSocket server listening on port 41899
✅ Extension connected successfully
🔗 Extension connection status updated
```

### **Extension Console Should Show:**
```
🚀 Visual Agent background script starting...
🔗 Visual Agent connected to Mac app
📤 Extension: Attempting to send message: connection_status
📤 Extension: Message sent successfully
```

## 🖼️ **Step 3: Test Screenshot**

1. **Open a simple website** (like google.com)

2. **In Mac app, type:** `"what's on the screen"`

3. **Mac App Console Should Show:**
```
🧠 Started new task session: what's on the screen
📤 VisualAgentManager: Requesting screenshot from extension
📤 Sending WebSocket message: {"type":"take_screenshot"...}
📸 Received screenshot from extension
📥 VisualAgentManager: Screenshot data length: XXXX characters
```

4. **Extension Console Should Show:**
```
📨 Extension received message: take_screenshot
📸 Extension: Starting screenshot capture...
📸 Extension: Found active tab: https://www.google.com
📸 Extension: Screenshot captured, size: XXXX characters
📤 Extension: Message sent successfully
```

## 🎯 **Expected Results**

- ✅ **Stable Connection:** No frequent disconnects
- ✅ **Screenshot Capture:** Image appears in Mac app
- ✅ **Vision Model:** qwen2.5vl:7b now detected as vision-capable
- ✅ **Memory System:** Task context preserved

## 🛠️ **If Still Not Working**

1. **Check Chrome Permissions:**
   - Extension has "Take screenshots" permission
   - No security restrictions on localhost

2. **Check Mac App:**
   - Settings → Select qwen2.5vl:7b model
   - Should show as vision-capable now

3. **Check Console Logs:**
   - Look for specific error messages
   - Note where the process stops

## 🎉 **Success Indicators**

You'll know it's working when:
- Screenshot appears in Mac app UI
- Connection stays stable
- Extension console shows successful screenshot capture
- Mac app shows "Screenshot received" messages