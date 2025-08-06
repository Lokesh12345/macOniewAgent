#!/usr/bin/env python3
"""
Browser-Use Web GUI - Flask Application
Web-based interface for interacting with browser-use agent through prompts.
"""

import asyncio
import json
import os
import requests
import sys
import threading
import time
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add browser-use to path
sys.path.insert(0, str(Path(__file__).parent))

from browser_use.agent.service import Agent
from browser_use.browser import BrowserSession, BrowserProfile
from browser_use.llm.ollama.chat import ChatOllama
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.llm.anthropic.chat import ChatAnthropic
from browser_use.llm.google.chat import ChatGoogle
from browser_use.llm.deepseek.chat import ChatDeepSeek
from browser_use.llm.groq.chat import ChatGroq
from browser_use.agent.enhanced_service import MemoryManager

app = Flask(__name__)
app.config['SECRET_KEY'] = 'browser_use_secret_key_2024'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables for managing state
current_agent = None
current_browser_session = None
current_llm = None
memory_manager = MemoryManager()
is_task_running = False
task_thread = None
stop_task_requested = False
current_task_loop = None

# Settings file path
SETTINGS_FILE = Path(__file__).parent / 'gui_settings.json'

# Available LLM providers and models
def get_providers_config():
    """Get providers config with dynamic Ollama models"""
    return {
        'ollama': {
            'name': 'Ollama (Local)',
            'models': get_ollama_models(),  # Dynamic model detection
            'requires_api_key': False,
            'default_host': 'http://localhost:11434'
        },
        'openai': {
            'name': 'OpenAI',
            'models': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
            'requires_api_key': True,
            'env_key': 'OPENAI_API_KEY'
        },
        'anthropic': {
            'name': 'Anthropic',
            'models': ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
            'requires_api_key': True,
            'env_key': 'ANTHROPIC_API_KEY'
        },
        'google': {
            'name': 'Google Gemini',
            'models': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
            'requires_api_key': True,
            'env_key': 'GOOGLE_API_KEY'
        },
        'deepseek': {
            'name': 'DeepSeek',
            'models': ['deepseek-chat', 'deepseek-coder'],
            'requires_api_key': True,
            'env_key': 'DEEPSEEK_API_KEY'
        },
        'groq': {
            'name': 'Groq',
            'models': ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
            'requires_api_key': True,
            'env_key': 'GROK_API_KEY'  # Note: using GROK_API_KEY from .env
        }
    }

def get_available_providers():
    """Get providers with valid API keys or local availability"""
    available = {}
    providers_config = get_providers_config()
    
    for provider_id, config in providers_config.items():
        if not config.get('requires_api_key', False):
            # Local providers like Ollama
            available[provider_id] = config
        else:
            # Cloud providers - check if API key is available
            api_key = os.getenv(config['env_key'])
            if api_key and api_key.strip():
                available[provider_id] = config
                available[provider_id]['has_api_key'] = True
            else:
                # Still show provider but mark as needing API key
                available[provider_id] = config.copy()
                available[provider_id]['has_api_key'] = False
    
    return available


def get_ollama_models():
    """Get all available Ollama models from local installation"""
    try:
        response = requests.get('http://localhost:11434/api/tags', timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = []
            for model_info in data.get('models', []):
                model_name = model_info.get('name', '')
                if model_name:
                    # Clean up model name (remove :latest if present)
                    if ':latest' in model_name:
                        model_name = model_name.replace(':latest', '')
                    models.append(model_name)
            return sorted(models) if models else ['Qwen3:14B', 'llama3.2:3b']  # fallback
        else:
            web_logger.log('WARNING', '⚠️ Could not fetch Ollama models, using defaults')
            return ['Qwen3:14B', 'llama3.2:3b', 'mistral:7b']
    except Exception as e:
        web_logger.log('WARNING', f'⚠️ Ollama model detection failed: {e}')
        return ['Qwen3:14B', 'llama3.2:3b', 'mistral:7b']  # fallback models


def load_settings():
    """Load GUI settings from file"""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
                web_logger.log('INFO', f'📄 Settings loaded: {settings.get("provider", "none")} - {settings.get("model", "none")}')
                return settings
    except Exception as e:
        web_logger.log('WARNING', f'⚠️ Could not load settings: {e}')
    return {}


def save_settings(provider, model):
    """Save GUI settings to file"""
    try:
        settings = {
            'provider': provider,
            'model': model,
            'timestamp': datetime.now().isoformat()
        }
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        web_logger.log('INFO', f'💾 Settings saved: {provider} - {model}')
        return True
    except Exception as e:
        web_logger.log('ERROR', f'❌ Could not save settings: {e}')
        return False


def create_llm(provider, model, **kwargs):
    """Create LLM instance based on provider and model"""
    try:
        if provider == 'ollama':
            host = kwargs.get('host', 'http://localhost:11434')
            return ChatOllama(model=model, host=host)
        
        elif provider == 'openai':
            api_key = os.getenv('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OpenAI API key not found in environment")
            return ChatOpenAI(model=model, api_key=api_key)
        
        elif provider == 'anthropic':
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if not api_key:
                raise ValueError("Anthropic API key not found in environment")
            return ChatAnthropic(model=model, api_key=api_key)
        
        elif provider == 'google':
            api_key = os.getenv('GOOGLE_API_KEY')
            if not api_key:
                raise ValueError("Google API key not found in environment")
            return ChatGoogle(model=model, api_key=api_key)
        
        elif provider == 'deepseek':
            api_key = os.getenv('DEEPSEEK_API_KEY')
            if not api_key:
                raise ValueError("DeepSeek API key not found in environment")
            return ChatDeepSeek(model=model, api_key=api_key)
        
        elif provider == 'groq':
            api_key = os.getenv('GROK_API_KEY')
            if not api_key:
                raise ValueError("Groq API key not found in environment")
            return ChatGroq(model=model, api_key=api_key)
        
        else:
            raise ValueError(f"Unknown provider: {provider}")
            
    except Exception as e:
        raise Exception(f"Failed to create {provider} LLM: {e}")


class WebLogger:
    """Custom logger that emits to WebSocket"""
    
    def __init__(self, socketio):
        self.socketio = socketio
    
    def log(self, level, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_data = {
            'timestamp': timestamp,
            'level': level,
            'message': message
        }
        self.socketio.emit('log_message', log_data)
        print(f"[{timestamp}] {level}: {message}")

web_logger = WebLogger(socketio)


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/api/providers')
def get_providers():
    """Get available LLM providers and models"""
    return jsonify(get_available_providers())


@app.route('/api/saved_settings')
def get_saved_settings():
    """Get saved model settings"""
    settings = load_settings()
    return jsonify(settings)


@app.route('/api/status')
def get_status():
    """Get current system status"""
    # Check LLM connection
    llm_status = "connected" if current_llm else "disconnected"
    
    return jsonify({
        'llm_status': llm_status,
        'browser_status': 'ready' if not current_browser_session else 'running',
        'agent_status': 'running' if is_task_running else 'idle',
        'task_running': is_task_running,
        'current_model': getattr(current_llm, 'model', None) if current_llm else None
    })


@app.route('/api/memory')
def get_memory():
    """Get current memory state"""
    try:
        # Ensure memory manager exists
        if not memory_manager:
            return jsonify({
                'task_memory': {},
                'autocomplete_events': [],
                'should_break_sequence': False,
                'total_events': 0
            })
        
        # Get current task memory safely
        task_memory = {}
        try:
            task_memory = memory_manager.get_task_memory("current") or {}
        except:
            task_memory = {}
        
        # Get autocomplete events safely
        autocomplete_events = []
        try:
            if hasattr(memory_manager, 'autocomplete_history'):
                autocomplete_events = memory_manager.autocomplete_history[-10:]  # Last 10 events
        except:
            autocomplete_events = []
        
        # Get should break safely
        should_break = False
        try:
            should_break = memory_manager.should_break_sequence()
        except:
            should_break = False
        
        return jsonify({
            'task_memory': task_memory,
            'autocomplete_events': autocomplete_events,
            'should_break_sequence': should_break,
            'total_events': len(autocomplete_events)
        })
        
    except Exception as e:
        web_logger.log('ERROR', f'❌ Memory API error: {e}')
        # Return empty state instead of error to prevent UI issues
        return jsonify({
            'task_memory': {},
            'autocomplete_events': [],
            'should_break_sequence': False,
            'total_events': 0,
            'error': str(e)
        })


@app.route('/api/select_model', methods=['POST'])
def select_model():
    """Select LLM provider and model"""
    global current_llm
    
    data = request.json
    provider = data.get('provider')
    model = data.get('model')
    
    if not provider or not model:
        return jsonify({'error': 'Provider and model are required'}), 400
    
    try:
        # Create new LLM instance
        current_llm = create_llm(provider, model)
        
        # Test connection for cloud providers
        if provider != 'ollama':
            from browser_use.llm.messages import UserMessage
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                response = loop.run_until_complete(current_llm.ainvoke([UserMessage(content="test")]))
                web_logger.log('INFO', f'✅ {provider.title()} {model} connected successfully')
            except Exception as e:
                web_logger.log('ERROR', f'❌ {provider.title()} {model} test failed: {e}')
                return jsonify({'error': f'Model test failed: {e}'}), 400
            finally:
                loop.close()
        else:
            web_logger.log('INFO', f'✅ {provider.title()} {model} selected')
        
        # Save settings for persistence
        save_settings(provider, model)
        
        return jsonify({
            'message': f'Model selected: {provider} - {model}',
            'provider': provider,
            'model': model,
            'saved': True
        })
        
    except Exception as e:
        web_logger.log('ERROR', f'❌ Failed to select model: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/run_task', methods=['POST'])
def run_task():
    """Start running a browser automation task"""
    global task_thread, is_task_running
    
    if is_task_running:
        return jsonify({'error': 'Task already running'}), 400
    
    if not current_llm:
        return jsonify({'error': 'Please select a model first'}), 400
    
    data = request.json
    prompt = data.get('prompt', '').strip()
    max_steps = data.get('max_steps', 10)
    headless = data.get('headless', False)
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    # Start task in background thread
    task_thread = threading.Thread(
        target=run_browser_task_async,
        args=(prompt, max_steps, headless),
        daemon=True
    )
    task_thread.start()
    
    return jsonify({'message': 'Task started', 'prompt': prompt})


@app.route('/api/stop_task', methods=['POST'])
def stop_task():
    """Stop current running task"""
    global is_task_running, stop_task_requested, current_browser_session, current_agent
    
    if not is_task_running:
        return jsonify({'error': 'No task running'}), 400
    
    # Set stop flag
    stop_task_requested = True
    is_task_running = False
    
    web_logger.log('INFO', '🛑 Task stop requested - cleaning up...')
    
    # Force cleanup in background thread
    def cleanup_task():
        global current_browser_session, current_agent, current_task_loop
        try:
            # Cancel current event loop if exists
            if current_task_loop and not current_task_loop.is_closed():
                # Cancel all pending tasks in the loop
                for task in asyncio.all_tasks(current_task_loop):
                    if not task.done():
                        task.cancel()
            
            # Close browser session if exists
            if current_browser_session:
                try:
                    # Create a new loop just for cleanup
                    cleanup_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(cleanup_loop)
                    try:
                        cleanup_loop.run_until_complete(current_browser_session.close())
                        web_logger.log('INFO', '🔒 Browser session closed')
                    finally:
                        cleanup_loop.close()
                except Exception as e:
                    web_logger.log('ERROR', f'❌ Error closing browser: {e}')
                finally:
                    current_browser_session = None
            
            # Clear agent reference
            current_agent = None
            
            web_logger.log('INFO', '✅ Task cleanup completed')
            socketio.emit('task_stopped', {'message': 'Task stopped and cleaned up'})
            
        except Exception as e:
            web_logger.log('ERROR', f'❌ Cleanup error: {e}')
    
    # Run cleanup in background
    threading.Thread(target=cleanup_task, daemon=True).start()
    
    return jsonify({'message': 'Task stop requested - cleaning up...'})


def initialize_default_llm():
    """Initialize LLM from saved settings or use defaults"""
    global current_llm
    try:
        # First try to load from saved settings
        settings = load_settings()
        if settings and 'provider' in settings and 'model' in settings:
            provider = settings['provider']
            model = settings['model']
            try:
                web_logger.log('INFO', f'🔄 Loading saved model: {provider} - {model}')
                current_llm = create_llm(provider, model)
                web_logger.log('INFO', f'✅ Saved model loaded: {provider} - {model}')
                return
            except Exception as e:
                web_logger.log('WARNING', f'⚠️ Could not load saved model: {e}')
        
        # Fallback to Ollama with first available model
        try:
            web_logger.log('INFO', '🦙 Trying Ollama (default)...')
            ollama_models = get_ollama_models()
            if ollama_models:
                model = ollama_models[0]  # Use first available model
                current_llm = create_llm('ollama', model)
                web_logger.log('INFO', f'✅ Ollama {model} ready as default')
                # Save this as default
                save_settings('ollama', model)
                return
        except:
            pass
        
        # Try OpenAI if available
        if os.getenv('OPENAI_API_KEY'):
            try:
                web_logger.log('INFO', '🤖 Trying OpenAI (fallback)...')
                current_llm = create_llm('openai', 'gpt-4o-mini')
                web_logger.log('INFO', '✅ OpenAI gpt-4o-mini ready as default')
                save_settings('openai', 'gpt-4o-mini')
                return
            except:
                pass
        
        web_logger.log('INFO', '⚠️ No default LLM available - please select a model')
            
    except Exception as e:
        web_logger.log('ERROR', f'❌ Default LLM initialization failed: {e}')
        current_llm = None


def run_browser_task_async(prompt, max_steps, headless):
    """Run browser task asynchronously"""
    global current_agent, current_browser_session, is_task_running, stop_task_requested, current_task_loop
    
    is_task_running = True
    stop_task_requested = False
    socketio.emit('task_started', {'prompt': prompt})
    
    try:
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        current_task_loop = loop
        
        try:
            # Check for stop request before starting
            if stop_task_requested:
                web_logger.log('INFO', '🛑 Task stopped before execution')
                socketio.emit('task_stopped', {'message': 'Task stopped before execution'})
                return
                
            result = loop.run_until_complete(execute_browser_task(prompt, max_steps, headless))
            
            # Check if task was stopped during execution
            if stop_task_requested:
                web_logger.log('INFO', '🛑 Task was stopped during execution')
                socketio.emit('task_stopped', {'message': 'Task stopped during execution'})
            else:
                socketio.emit('task_completed', result)
                
        except asyncio.CancelledError:
            web_logger.log('INFO', '🛑 Task cancelled by stop request')
            socketio.emit('task_stopped', {'message': 'Task cancelled'})
        finally:
            if loop and not loop.is_closed():
                # Cancel any remaining tasks
                pending_tasks = [task for task in asyncio.all_tasks(loop) if not task.done()]
                if pending_tasks:
                    for task in pending_tasks:
                        task.cancel()
                    # Give tasks a moment to clean up
                    try:
                        loop.run_until_complete(asyncio.gather(*pending_tasks, return_exceptions=True))
                    except:
                        pass
                loop.close()
            current_task_loop = None
            
    except Exception as e:
        web_logger.log('ERROR', f'❌ Task execution failed: {e}')
        if not stop_task_requested:
            socketio.emit('task_failed', {'error': str(e)})
    finally:
        is_task_running = False
        stop_task_requested = False


async def execute_browser_task(prompt, max_steps, headless):
    """Execute the browser task with agent"""
    global current_agent, current_browser_session, stop_task_requested
    
    try:
        # Check for stop request
        if stop_task_requested:
            web_logger.log('INFO', '🛑 Task stopped at start')
            return {'success': False, 'stopped': True, 'message': 'Task stopped'}
            
        web_logger.log('INFO', f'🚀 Starting task: {prompt}')
        web_logger.log('INFO', f'⚙️ Settings - Max steps: {max_steps}, Headless: {headless}')
        
        # Create browser session
        profile = BrowserProfile(
            headless=headless,
            viewport_size=(1200, 800)
        )
        current_browser_session = BrowserSession(profile=profile)
        web_logger.log('INFO', '🌐 Browser session created')
        
        # Check for stop request
        if stop_task_requested:
            web_logger.log('INFO', '🛑 Task stopped after browser creation')
            await current_browser_session.close()
            return {'success': False, 'stopped': True, 'message': 'Task stopped'}
        
        # Create agent
        current_agent = Agent(
            task=prompt,
            llm=current_llm,
            browser_session=current_browser_session,
        )
        web_logger.log('INFO', '🤖 Agent created')
        
        # Update memory
        task_id = f"task_{int(time.time())}"
        memory_manager.update_task_memory(task_id, "prompt", prompt)
        memory_manager.update_task_memory(task_id, "status", "running")
        memory_manager.update_task_memory(task_id, "max_steps", max_steps)
        
        # Check for stop request
        if stop_task_requested:
            web_logger.log('INFO', '🛑 Task stopped before execution')
            return {'success': False, 'stopped': True, 'message': 'Task stopped'}
        
        # Execute task
        web_logger.log('INFO', f'▶️ Executing task (max {max_steps} steps)...')
        
        # Custom progress tracking with stop checks
        step_count = 0
        history = []
        
        try:
            # Create a task that can be cancelled
            task_execution = asyncio.create_task(current_agent.run(max_steps=max_steps))
            
            # Monitor for stop requests while running
            while not task_execution.done():
                if stop_task_requested:
                    web_logger.log('INFO', '🛑 Stop requested during task execution')
                    task_execution.cancel()
                    try:
                        await task_execution
                    except asyncio.CancelledError:
                        pass
                    return {'success': False, 'stopped': True, 'message': 'Task stopped during execution'}
                
                # Check every 500ms
                await asyncio.sleep(0.5)
            
            # Get the result
            history = task_execution.result()
            step_count = len(history)
            
            # Update memory
            memory_manager.update_task_memory(task_id, "status", "completed")
            memory_manager.update_task_memory(task_id, "steps_executed", step_count)
            
            # Simulate some autocomplete events for demo
            if "gmail" in prompt.lower():
                memory_manager.record_autocomplete_event(5, "test@gmail", True)
            if "search" in prompt.lower():
                memory_manager.record_autocomplete_event(10, prompt[:20], True)
            
            web_logger.log('INFO', f'✅ Task completed successfully!')
            web_logger.log('INFO', f'📊 Executed {step_count} steps')
            
            return {
                'success': True,
                'steps': step_count,
                'prompt': prompt,
                'history': len(history)
            }
            
        except Exception as e:
            web_logger.log('ERROR', f'❌ Task execution error: {e}')
            memory_manager.update_task_memory(task_id, "status", "failed")
            memory_manager.update_task_memory(task_id, "error", str(e))
            
            return {
                'success': False,
                'error': str(e),
                'steps': step_count
            }
            
    finally:
        # Clean up browser session
        if current_browser_session:
            try:
                await current_browser_session.close()
                web_logger.log('INFO', '🔒 Browser session closed')
            except Exception as e:
                web_logger.log('ERROR', f'❌ Error closing browser: {e}')
            current_browser_session = None


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    web_logger.log('INFO', '🔌 Client connected to WebSocket')
    emit('connected', {'message': 'Connected to Browser-Use Web GUI'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    web_logger.log('INFO', '🔌 Client disconnected from WebSocket')


@socketio.on('get_status')
def handle_get_status():
    """Handle status request via WebSocket"""
    status = {
        'llm_status': 'connected' if llm else 'disconnected',
        'browser_status': 'ready' if not current_browser_session else 'running',
        'agent_status': 'running' if is_task_running else 'idle',
        'task_running': is_task_running
    }
    emit('status_update', status)


if __name__ == '__main__':
    # Initialize default LLM in background
    threading.Thread(target=initialize_default_llm, daemon=True).start()
    
    print("🌐 Starting Browser-Use Web GUI...")
    print("📱 Access the interface at: http://localhost:8888")
    print("🛑 Press Ctrl+C to stop")
    
    # Run Flask app with WebSocket support
    socketio.run(app, host='0.0.0.0', port=8888, debug=False, allow_unsafe_werkzeug=True)