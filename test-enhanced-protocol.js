#!/usr/bin/env node

// Simple WebSocket client to test enhanced protocol communication
// This will validate that Mac app can handle enhanced protocol messages

const WebSocket = require('ws');

console.log('🧪 Testing Enhanced WebSocket Protocol Communication');
console.log('====================================================');

const ws = new WebSocket('ws://localhost:41899');

ws.on('open', function open() {
  console.log('✅ Connected to Mac app WebSocket server');
  
  // Test 1: Legacy ping message (backward compatibility)
  console.log('\n📤 Test 1: Sending legacy ping message...');
  ws.send(JSON.stringify({
    type: 'ping',
    data: { source: 'test_client' }
  }));
  
  // Test 2: Enhanced protocol ping message
  setTimeout(() => {
    console.log('\n📤 Test 2: Sending enhanced protocol ping message...');
    ws.send(JSON.stringify({
      type: 'ping',
      version: '1.0',
      messageId: 'test_msg_' + Date.now(),
      timestamp: new Date().toISOString(),
      data: { source: 'test_client' }
    }));
  }, 1000);
  
  // Test 3: LLM Request (new enhanced message)
  setTimeout(() => {
    console.log('\n📤 Test 3: Sending LLM request message...');
    ws.send(JSON.stringify({
      type: 'llm_request',
      version: '1.0',
      messageId: 'test_llm_' + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'test_client',
        requestId: 'req_test_' + Date.now(),
        provider: 'openai',
        modelName: 'gpt-4',
        messages: [
          { role: 'user', content: 'Test message for protocol validation' }
        ],
        priority: 'medium'
      }
    }));
  }, 2000);
  
  // Test 4: Task Planning Request
  setTimeout(() => {
    console.log('\n📤 Test 4: Sending task planning request...');
    ws.send(JSON.stringify({
      type: 'task_planning_request',
      version: '1.0',
      messageId: 'test_planning_' + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'test_client',
        requestId: 'req_planning_' + Date.now(),
        userRequest: 'Test task: check my email',
        currentUrl: 'https://gmail.com',
        availableTabs: [
          {
            id: 1,
            url: 'https://gmail.com',
            title: 'Gmail',
            active: true,
            windowId: 1,
            pinned: false,
            loginStatus: 'loggedIn',
            pageType: 'email'
          }
        ],
        browserContext: {
          activeTabId: 1,
          windowCount: 1,
          totalTabs: 3
        }
      }
    }));
  }, 3000);
  
  // Test 5: Agent Progress Update
  setTimeout(() => {
    console.log('\n📤 Test 5: Sending agent progress update...');
    ws.send(JSON.stringify({
      type: 'agent_progress',
      version: '1.0',
      messageId: 'test_progress_' + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        source: 'test_client',
        stepId: 'step_1',
        agent: 'navigator',
        phase: 'thinking',
        progress: {
          action: 'locate_login_button',
          reasoning: 'Analyzing page structure to find login elements',
          progressPercent: 25,
          estimatedRemaining: 5000,
          elementFound: false,
          domAnalysisStatus: 'in_progress'
        },
        context: {
          taskId: 'task_test_' + Date.now(),
          description: 'Test task for protocol validation',
          currentStep: 1,
          totalSteps: 4,
          currentUrl: 'https://gmail.com',
          sessionId: 'session_test_' + Date.now()
        }
      }
    }));
  }, 4000);
  
  // Close connection after tests
  setTimeout(() => {
    console.log('\n🔌 Closing connection...');
    ws.close();
  }, 6000);
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    console.log('📨 Received response:', {
      type: parsed.type,
      version: parsed.version || 'legacy',
      hasData: !!parsed.data,
      source: parsed.data?.source || 'unknown'
    });
    
    // Check if it's an enhanced protocol message
    if (parsed.version && parsed.messageId && parsed.timestamp) {
      console.log('   ✅ Enhanced protocol format detected');
    } else {
      console.log('   ⚡ Legacy protocol format');
    }
  } catch (error) {
    console.log('📨 Received non-JSON message:', data.toString());
  }
});

ws.on('close', function close(code, reason) {
  console.log('\n🔌 Connection closed:', code, reason.toString());
  console.log('\n📊 Test Summary:');
  console.log('   - Legacy ping/pong: Should work (backward compatibility)');
  console.log('   - Enhanced ping/pong: Should work (new protocol)');
  console.log('   - LLM request: Should be forwarded to LLM service');
  console.log('   - Task planning: Should be forwarded to planning service');
  console.log('   - Agent progress: Should update UI components');
  console.log('\n✅ Enhanced protocol communication test completed!');
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
  console.log('\n💡 Make sure the Oniew Agent Mac app is running on port 41899');
  process.exit(1);
});

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n⏹️  Test interrupted by user');
  ws.close();
  process.exit(0);
});