# Claude Code Model Query Skills

On-demand access to OpenAI Codex and Google Gemini from Claude Code via `/codex`, `/gemini`, and `/red-team` slash commands.

## Architecture

No MCP servers. Skills call CLIs directly via Bash — zero footprint when not in use.

```
/codex [query]   →  codex exec -m gpt-5.2-codex -c model_reasoning_effort="high" "query"
/gemini [query]  →  node gemini-query.js "query"  (thinkingLevel: high)
/red-team [query] →  both models in parallel via subagents, then Claude compares
```

## Prerequisites

### API Keys

Add to `~/.zshrc`:
```bash
export OPENAI_API_KEY="your-openai-key"
export GEMINI_API_KEY="your-gemini-ai-studio-key"
```

Then: `source ~/.zshrc`

### Codex CLI

```bash
npm install -g @openai/codex@latest
```

## Installation

```bash
# Install Gemini script dependencies
cd gemini/ && npm install

# Copy skills to Claude Code
cp -r skills/codex ~/.claude/skills/codex
cp -r skills/gemini ~/.claude/skills/gemini
cp -r skills/red-team ~/.claude/skills/red-team

# Copy Gemini query tool
mkdir -p ~/.claude/tools
cp gemini/gemini-query.js ~/.claude/tools/gemini-query.js
```

## Usage

```
/codex Review the current uncommitted changes
/codex What's the best way to handle errors in this codebase?
/gemini Review this file for potential bugs: src/index.ts
/gemini Compare React vs Svelte for this use case
/red-team Review the auth middleware for security issues
/red-team Debate: should we use REST or GraphQL for this API?
/red-team Debug the failing test in src/utils.test.ts
```

`/red-team` auto-detects intent (review, debate, troubleshoot, general) and adjusts context gathering, prompt framing, and comparison structure accordingly. All file reading and model calls run in subagents to preserve the main session's context window.

Reports are saved to `red-team-reports/` in the current directory with unique filenames: `{project}-{intent}-{topic}-{YYYYMMDD}-{HHMM}.md` (e.g., `honeymoon-ai-review-phase-3-plan-20260222-1430.md`).

## Models

| Skill | Model | Reasoning |
|-------|-------|-----------|
| `/codex` | gpt-5.2-codex | high |
| `/gemini` | gemini-3.1-pro-preview | thinkingLevel: high |
| `/red-team` | both (parallel) | high |
