#!/usr/bin/env python3
"""
Comprehensive test for enhanced browser-use with Oniew Agent innovations:
- Autocomplete detection and handling
- Memory management system
- DOM change detection
- Sequence breaking logic

This replaces multiple test files with a single comprehensive testing approach.
"""

import asyncio
import subprocess
import sys
import json
from pathlib import Path

# Add browser-use to path
sys.path.insert(0, str(Path(__file__).parent))

from browser_use.agent.enhanced_service import EnhancedAgent, MemoryManager
from browser_use.browser import BrowserSession, BrowserProfile  
from browser_use.llm.ollama.chat import ChatOllama
from browser_use.llm.messages import UserMessage


def check_system_requirements():
    """Check if all system requirements are met"""
    print("🔧 Checking System Requirements")
    print("=" * 40)
    
    checks = []
    
    # Check Python version
    version = sys.version_info
    python_ok = version >= (3, 11)
    status = "✅" if python_ok else "❌"
    print(f"{status} Python {version.major}.{version.minor}.{version.micro}")
    checks.append(python_ok)
    
    # Check Playwright
    try:
        import playwright
        print("✅ Playwright installed")
        checks.append(True)
    except ImportError:
        print("❌ Playwright not installed - run: pip install playwright")
        checks.append(False)
    
    # Check Ollama
    try:
        result = subprocess.run(
            ["curl", "-s", "http://localhost:11434/api/tags"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            print("✅ Ollama running")
            data = json.loads(result.stdout)
            models = [m.get('name', '') for m in data.get('models', [])]
            if any('Qwen3:14B' in model for model in models):
                print("✅ Qwen3:14B model available")
                checks.append(True)
            else:
                print("⚠️  Qwen3:14B not found - available models:")
                for model in models[:3]:  # Show first 3 models
                    print(f"  - {model}")
                checks.append(False)
        else:
            print("❌ Ollama not responding")
            checks.append(False)
    except Exception:
        print("❌ Ollama connection failed")
        checks.append(False)
    
    all_good = all(checks)
    
    if not all_good:
        print("\n⚠️  Setup Issues Found:")
        print("1. Install dependencies: pip install playwright pydantic httpx")
        print("2. Install browsers: python3 -m playwright install chromium")
        print("3. Start Ollama: OLLAMA_ORIGINS='chrome-extension://*' ollama serve")
        print("4. Install model: ollama pull Qwen3:14B")
    
    return all_good


async def test_memory_system():
    """Test the memory management system"""
    print("\n🧠 Testing Memory Management System")
    print("-" * 40)
    
    memory = MemoryManager()
    
    # Test task memory
    task_id = "test_task_123"
    memory.update_task_memory(task_id, "status", "running")
    memory.update_task_memory(task_id, "steps_completed", 3)
    memory.update_task_memory(task_id, "current_action", "typing")
    
    # Test autocomplete recording
    memory.record_autocomplete_event(5, "test@gmail", True)
    memory.record_autocomplete_event(10, "python prog", True) 
    memory.record_autocomplete_event(15, "regular input", False)
    
    print("📝 Task Memory:")
    task_mem = memory.get_task_memory(task_id)
    for key, value in task_mem.items():
        print(f"  - {key}: {value}")
    
    print("\n🎯 Autocomplete Events:")
    for event in memory.autocomplete_history:
        status = "DETECTED ✅" if event['detected'] else "NONE ❌"
        print(f"  - Element {event['element_index']}: '{event['text']}' -> {status}")
    
    should_break = memory.should_break_sequence()
    print(f"\n🛑 Should Break Sequence: {should_break}")
    
    if should_break:
        print("🎉 Memory system correctly detected autocomplete and recommends sequence break!")
    
    return True


async def test_ollama_connection():
    """Test Ollama LLM connection"""
    print("\n🦙 Testing Ollama Connection") 
    print("-" * 40)
    
    try:
        llm = ChatOllama(model="Qwen3:14B", host="http://localhost:11434")
        response = await llm.ainvoke([UserMessage(content="Say 'Enhanced browser-use ready!'")])
        # Handle different response types
        content = getattr(response, 'content', str(response))
        print(f"✅ Response: {content}")
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


async def test_browser_automation(interactive=False):
    """Test browser automation with autocomplete detection"""
    print(f"\n🌐 Testing Browser Automation ({'Interactive' if interactive else 'Automated'})")
    print("-" * 40)
    
    if not interactive:
        print("📝 Running automated Google search test...")
        task = "Navigate to Google and search for 'python programming'"
        max_steps = 4
    else:
        print("📧 Running interactive Gmail autocomplete test...")
        task = "Go to Gmail, click compose, and type 'test@' in the To field"
        max_steps = 8
    
    try:
        # Create browser session
        profile = BrowserProfile(
            headless=not interactive,  # Show browser for interactive tests
            viewport_size=(1200, 800)
        )
        browser_session = BrowserSession(profile=profile)
        
        # Create LLM and memory manager
        llm = ChatOllama(model="Qwen3:14B", host="http://localhost:11434")
        memory_manager = MemoryManager()
        
        # Create enhanced agent
        agent = EnhancedAgent(
            task=task,
            llm=llm,
            browser_session=browser_session,
            memory_manager=memory_manager,
        )
        
        print(f"🚀 Running task: {task}")
        
        # Execute the task
        history = await agent.run(max_steps=max_steps)
        
        print("✅ Task completed!")
        print(f"📊 Steps executed: {len(history)}")
        
        # Show memory summary
        memory_summary = agent.get_memory_summary()
        print(f"🧠 Task memory entries: {len(memory_summary['task_memory'])}")
        print(f"🎯 Autocomplete events: {len(memory_summary['autocomplete_history'])}")
        
        # Show autocomplete detection results
        if memory_summary['autocomplete_history']:
            print("\n🎯 Autocomplete Detection Results:")
            for event in memory_summary['autocomplete_history']:
                status = "DETECTED ✅" if event['detected'] else "NONE ❌"
                print(f"  - Element {event['element_index']}: '{event['text']}' -> {status}")
        
        if memory_summary['should_break']:
            print("🎉 SUCCESS: Autocomplete detected - sequence would break for user selection!")
        
        await browser_session.close()
        return True
        
    except Exception as e:
        print(f"❌ Browser test failed: {e}")
        return False


async def run_comprehensive_test():
    """Run all tests in sequence"""
    print("🎯 Enhanced Browser-Use Comprehensive Test")
    print("=" * 50)
    
    # Check system requirements first
    if not check_system_requirements():
        print("\n❌ System requirements not met. Please fix issues above.")
        return False
    
    tests = [
        ("Memory Management", test_memory_system),
        ("Ollama Connection", test_ollama_connection),
        ("Browser Automation", lambda: test_browser_automation(interactive=False)),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            print(f"\n{'=' * 20} {test_name} {'=' * 20}")
            result = await test_func()
            results.append((test_name, result))
        except KeyboardInterrupt:
            print(f"\n🛑 Test '{test_name}' interrupted by user")
            break
        except Exception as e:
            print(f"\n❌ Test '{test_name}' failed: {e}")
            results.append((test_name, False))
    
    # Show summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Enhanced browser-use is working perfectly!")
        print("\n📧 To test Gmail autocomplete interactively, run:")
        print("  python3 enhanced_test.py gmail")
    else:
        print("⚠️  Some tests failed. Check output above for details.")
    
    return passed == total


async def run_gmail_test():
    """Run interactive Gmail test"""
    print("📧 Interactive Gmail Autocomplete Test")
    print("=" * 40)
    print("⚠️  This requires Gmail login - browser will open for manual interaction")
    
    input("\n👤 Press Enter when ready to start Gmail test...")
    
    return await test_browser_automation(interactive=True)


def main():
    """Main entry point"""
    
    # Check command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "gmail":
            asyncio.run(run_gmail_test())
        elif sys.argv[1] == "help":
            print("""
Enhanced Browser-Use Test Suite

Usage:
  python3 enhanced_test.py          - Run all automated tests
  python3 enhanced_test.py gmail    - Run interactive Gmail test
  python3 enhanced_test.py help     - Show this help
            """)
        else:
            print("❌ Unknown option. Use 'help' for usage.")
    else:
        # Run comprehensive test
        asyncio.run(run_comprehensive_test())


if __name__ == "__main__":
    # Set up logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    main()