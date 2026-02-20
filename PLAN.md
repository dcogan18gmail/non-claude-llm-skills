# /codex and /gemini Skills for Claude Code

## Goal

On-demand access to OpenAI Codex and Google Gemini from within Claude Code via `/codex` and `/gemini` slash commands. Zero footprint when not in use — no MCP servers, no tool definitions, nothing running.

## Architecture

```
/codex [query]  →  SKILL.md  →  Bash  →  codex exec -m MODEL -c model_reasoning_effort="high" "query"
/gemini [query]  →  SKILL.md  →  Bash  →  node gemini-query.js "query"  (thinkingLevel: "high")
```

Skills call CLIs directly via Bash. No MCP servers needed.

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Codex CLI | `@openai/codex` (npm global) | OpenAI's official CLI, has `codex exec` non-interactive mode |
| Gemini script | `~/.claude/tools/gemini-query.js` | Custom ~50-line Node.js script using `@google/genai` SDK |
| `/codex` skill | `~/.claude/skills/codex/SKILL.md` | Routes queries to Codex CLI with project context |
| `/gemini` skill | `~/.claude/skills/gemini/SKILL.md` | Routes queries to Gemini script with project context |

## Model Configuration

### Codex (OpenAI)
- Primary: `gpt-5.2-codex` (highest codex-specific model available via API)
- Fallback: `gpt-5.2` (general-purpose)
- Reasoning: `model_reasoning_effort="high"` (default is `medium`)
- Note: `gpt-5.3-codex` is NOT available via API as of Feb 20, 2026. The CLI silently accepts it without error but likely aliases to an older model.

### Gemini (Google)
- Model: `gemini-3.1-pro-preview` (released Feb 19, 2026)
- Thinking: `thinkingLevel: "high"` (max for 3.x models)

## Setup

1. Set `OPENAI_API_KEY` and `GEMINI_API_KEY` in `~/.zshrc`
2. Update Codex CLI: `npm install -g @openai/codex@latest`
3. Install Gemini deps: `cd gemini/ && npm install`
4. Copy skills to `~/.claude/skills/`
5. Copy gemini-query.js to `~/.claude/tools/`
