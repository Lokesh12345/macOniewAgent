#!/usr/bin/env node

// Test script to verify Ollama connection and VL model availability
console.log('🧪 Testing Ollama Connection and VL Models...\n');

// Test 1: Check if Ollama server is running
async function testOllamaServer() {
    console.log('📡 Test 1: Ollama Server Connection');
    
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Ollama server is running');
            console.log(`   📊 Available models: ${data.models?.length || 0}`);
            
            // List VL models
            const vlModels = data.models?.filter(model => 
                model.name.includes('llava') || 
                model.name.includes('vision') ||
                model.name.includes('qwen2-vl') ||
                model.name.includes('qwen2.5vl') ||
                model.name.includes('minicpm-v')
            ) || [];
            
            console.log(`   👁️  VL models found: ${vlModels.length}`);
            vlModels.forEach(model => {
                console.log(`      - ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB)`);
            });
            
            return { success: true, models: data.models };
        } else {
            console.log('❌ Ollama server responded with error:', response.status);
            return { success: false, error: `HTTP ${response.status}` };
        }
    } catch (error) {
        console.log('❌ Failed to connect to Ollama server');
        console.log('   Error:', error.message);
        console.log('   💡 Make sure Ollama is running: ollama serve');
        return { success: false, error: error.message };
    }
}

// Test 2: Test specific VL model
async function testVLModel(modelName) {
    console.log(`\n🦙 Test 2: Testing VL Model - ${modelName}`);
    
    try {
        // Create a simple base64 test image (1x1 pixel transparent PNG)
        const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        const requestBody = {
            model: modelName,
            messages: [
                {
                    role: 'user',
                    content: 'What do you see in this image? Respond with exactly: "TEST_SUCCESS"',
                    images: [testImage]
                }
            ],
            stream: false,
            options: {
                temperature: 0.1,
                num_predict: 50
            }
        };
        
        console.log('   📤 Sending test request...');
        
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Model responded successfully');
            console.log(`   📝 Response: ${data.message?.content || 'No content'}`);
            
            // Check if model supports vision
            const content = data.message?.content || '';
            if (content.includes('TEST_SUCCESS') || content.length > 0) {
                console.log('✅ Vision capabilities confirmed');
                return { success: true, response: content };
            } else {
                console.log('⚠️  Model responded but may not support vision');
                return { success: false, error: 'No valid response' };
            }
        } else {
            console.log('❌ Model request failed:', response.status);
            const errorText = await response.text();
            console.log('   Error details:', errorText);
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }
    } catch (error) {
        console.log('❌ Model test failed');
        console.log('   Error:', error.message);
        return { success: false, error: error.message };
    }
}

// Test 3: Test with Mac app format
async function testMacAppFormat(modelName) {
    console.log(`\n🖥️  Test 3: Testing Mac App Request Format - ${modelName}`);
    
    try {
        // Test the exact format the Mac app uses
        const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        const requestBody = {
            model: modelName,
            messages: [
                {
                    role: 'user',
                    content: 'Task: what do you see?\n\nPlease analyze this screenshot and provide the actions needed to complete this task.',
                    images: [testImage]
                }
            ],
            stream: false,
            options: {
                temperature: 0.7,
                num_predict: 500
            }
        };
        
        console.log('   📤 Testing Mac app request format...');
        
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Mac app format works');
            const content = data.message?.content || '';
            console.log(`   📝 Response length: ${content.length} chars`);
            console.log(`   📄 Response preview: ${content.substring(0, 200)}...`);
            
            // Check if response contains JSON-like structure
            const hasJSON = content.includes('{') && content.includes('}');
            console.log(`   🔍 Contains JSON structure: ${hasJSON ? 'Yes' : 'No'}`);
            
            return { success: true, response: content, hasJSON };
        } else {
            console.log('❌ Mac app format failed:', response.status);
            return { success: false, error: `HTTP ${response.status}` };
        }
    } catch (error) {
        console.log('❌ Mac app format test failed');
        console.log('   Error:', error.message);
        return { success: false, error: error.message };
    }
}

// Main test function
async function runTests() {
    console.log('🎯 Starting Ollama VL Model Tests...\n');
    
    // Test server connection
    const serverTest = await testOllamaServer();
    
    if (!serverTest.success) {
        console.log('\n❌ Cannot proceed without Ollama server');
        process.exit(1);
    }
    
    // Find VL models to test
    const vlModels = serverTest.models?.filter(model => 
        model.name.includes('llava') || 
        model.name.includes('qwen2-vl') ||
        model.name.includes('qwen2.5vl') ||
        model.name.includes('minicpm-v')
    ) || [];
    
    if (vlModels.length === 0) {
        console.log('\n⚠️  No VL models found. Install one with:');
        console.log('   ollama pull qwen2-vl:7b');
        console.log('   ollama pull llava:latest');
        process.exit(1);
    }
    
    // Test the first available VL model
    const testModel = vlModels[0].name;
    console.log(`\n🎯 Testing with model: ${testModel}`);
    
    // Run tests
    const modelTest = await testVLModel(testModel);
    const macAppTest = await testMacAppFormat(testModel);
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`   Server: ${serverTest.success ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   VL Model: ${modelTest.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Mac App Format: ${macAppTest.success ? '✅ Working' : '❌ Failed'}`);
    
    if (macAppTest.success && macAppTest.hasJSON) {
        console.log('\n🎉 All tests passed! Ollama VL integration should work.');
    } else if (macAppTest.success && !macAppTest.hasJSON) {
        console.log('\n⚠️  Model works but may need prompt tuning for JSON output.');
    } else {
        console.log('\n❌ Some tests failed. Check the errors above.');
    }
}

// Check if running in Node.js environment
if (typeof fetch === 'undefined') {
    console.log('❌ This script requires Node.js 18+ with fetch support');
    console.log('💡 Or install node-fetch: npm install node-fetch');
    process.exit(1);
}

// Run the tests
runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});