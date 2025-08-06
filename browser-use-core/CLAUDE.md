# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-Use is an async Python library (>=3.11) that implements AI browser driver abilities using LLMs and Playwright. It enables AI agents to autonomously interact with the web by navigating pages, processing HTML, and deciding next actions.

## Key Commands

### Development Setup
```bash
# Create virtual environment and install dependencies
uv venv --python 3.11
source .venv/bin/activate
uv sync

# Install browser driver
playwright install chromium --with-deps --no-shell
```

### Running Tests
```bash
# Run all CI tests
uv run pytest tests/ci -vxs

# Run all tests with auto-parallelization
./bin/test.sh

# Run a specific test
uv run pytest tests/ci/test_specific.py -vxs
```

### Code Quality
```bash
# Run all linting and formatting (ruff, pyright, pre-commit)
./bin/lint.sh

# Or directly with pre-commit
uv run pre-commit run --all-files

# Run type checking only
uv run pyright

# Run ruff formatter/linter only
uv run ruff check . --fix
uv run ruff format .
```

## Code Architecture

### Core Components

1. **Agent** (`browser_use/agent/service.py`)
   - Main orchestrator that manages tasks and coordinates browser actions
   - Uses MessageManager for conversation management
   - Integrates with LLMs to decide next actions
   - Tracks history and generates outputs

2. **Browser** (`browser_use/browser/`)
   - Manages browser instances via Playwright/Patchright
   - Handles sessions, profiles, contexts, and page management
   - Supports headless/headful modes and various configurations

3. **Controller** (`browser_use/controller/service.py`)
   - Registry system for available browser actions
   - Handles action execution and result processing
   - Extensible via decorator-based action registration

4. **DOM Service** (`browser_use/dom/service.py`)
   - Extracts and processes page content for LLM understanding
   - Manages element detection and interaction
   - Handles history tree processing for context

5. **LLM Integration** (`browser_use/llm/`)
   - Supports multiple providers: OpenAI, Anthropic, Google, DeepSeek, Groq, Azure, Ollama
   - Unified interface via `BaseChatModel`
   - Handles serialization and structured outputs

### Key Design Patterns

- **Lazy imports**: Main module uses `__getattr__` for on-demand imports
- **Pydantic models**: All data structures use Pydantic v2 with strict validation
- **Event-driven**: Uses `bubus` event bus for decoupled communication
- **Service/View separation**: Business logic in `service.py`, data models in `views.py`

## Important Development Guidelines

### Code Style (from .cursor/rules/browser-use-rules.mdc)
- Use async Python throughout
- Use **tabs** for indentation in Python, not spaces
- Modern Python typing: `str | None` instead of `Optional[str]`
- Console logging in separate `_log_*` methods
- Pydantic v2 models with strict validation
- Runtime assertions for constraints
- Use `uuid7str` for new ID fields

### Testing
- Tests go in `tests/ci/` when passing
- Use pytest-httpserver for mock servers, never real URLs
- No mocks except for LLMs
- Modern pytest-asyncio: no `@pytest.mark.asyncio` needed
- Test assumptions before making changes

### Git Workflow
- Always run pre-commit before commits
- Never commit secrets or API keys
- Follow existing commit message style in the repo

## MCP (Model Context Protocol) Support

Browser-use can be used as an MCP server or connect to external MCP servers:
- Server mode: Exposes browser automation tools to Claude Desktop
- Client mode: Agents can use external MCP tools alongside browser actions

## Environment Variables

Key environment variables (see `browser_use/config.py`):
- `BROWSER_USE_LOGGING_LEVEL`: Logging level (default: info)
- `BROWSER_USE_CONFIG_DIR`: Config directory location
- `ANONYMIZED_TELEMETRY`: Enable/disable telemetry
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.: LLM provider keys
- `SKIP_LLM_API_KEY_VERIFICATION`: Skip API key checks (for testing)

## Common Workflows

### Adding a New Action
```python
from browser_use.controller import Controller, ActionResult

controller = Controller()

@controller.registry.action("Description of action")
async def my_action(param: str, page: Page):
    # Implementation
    return ActionResult(extracted_content=result)
```

### Creating an Agent
```python
from browser_use import Agent
from browser_use.llm import ChatOpenAI

agent = Agent(
    task="Your task description",
    llm=ChatOpenAI(model="gpt-4o"),
    controller=controller
)
history = await agent.run()
```