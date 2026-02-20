# Research Notes

## OpenAI Codex CLI

### Current State
- Updated to v0.104.0 at `/Users/david.cogan@postman.com/.npm-global/bin/codex`
- Has `codex exec` (non-interactive), `codex review` (code review), `codex mcp-server` (MCP)

### Non-Interactive Mode (`codex exec`)
Key flags:
- `-m MODEL` — model selection
- `-c model_reasoning_effort="high"` — reasoning effort (minimal/low/medium/high/xhigh)
- `-C DIR` — working directory
- `-s read-only|workspace-write|danger-full-access` — sandbox policy
- `-o FILE` — write last message to file
- `--json` — JSONL event output
- `--skip-git-repo-check` — allow running outside git repos

### Code Review Mode (`codex review`)
- `--uncommitted` — review staged/unstaged/untracked changes
- `--base BRANCH` — review against base branch
- `--commit SHA` — review a specific commit
- Accepts same `-c` config overrides

### Available Models via API (Feb 20, 2026 — verified)
| Model | Type | Notes |
|-------|------|-------|
| `gpt-5.2-codex` | Coding | Highest codex-specific model available via API |
| `gpt-5.2` | General | Flagship thinking model |
| `gpt-5.1-codex-max` | Coding | Older, max reasoning variant |
| `gpt-5.1-codex` | Coding | Older stable |
| `codex-mini-latest` | Coding | Fine-tuned o4-mini, fast/cheap |

**NOT available via API:** `gpt-5.3-codex` — CLI accepts it without error but silently aliases to another model. Verified by checking `/v1/models` endpoint.

### Reasoning Effort
- Parameter: `model_reasoning_effort`
- Values: minimal, low, medium (default), high, xhigh
- Set via `-c model_reasoning_effort="high"` or in `~/.codex/config.toml`

---

## Google Gemini API

### Available Models (Feb 2026)
| Model | ID | Context | Released |
|-------|----|---------|----------|
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | 1M tokens | Feb 19, 2026 |
| Gemini 3 Pro | `gemini-3-pro-preview` | 1M tokens | Earlier |
| Gemini 2.5 Pro | `gemini-2.5-pro` | 1M tokens | Stable |
| Gemini 2.5 Flash | `gemini-2.5-flash` | 1M tokens | Budget |

### Thinking/Reasoning Config
- **Gemini 3.x models**: Use `thinkingConfig.thinkingLevel` (enum)
  - Values: minimal, low, medium, high
  - Default: high (already max)
- **Gemini 2.5 models**: Use `thinkingConfig.thinkingBudget` (number)
  - Range: 0-32768 tokens
  - Cannot mix with thinkingLevel

### SDK Usage (`@google/genai`)
```javascript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-3.1-pro-preview",
  contents: "prompt here",
  config: {
    thinkingConfig: { thinkingLevel: "high" }
  }
});
console.log(response.text);
```

---

## Claude Code Skills

### Format
YAML frontmatter + markdown body at `~/.claude/skills/<name>/SKILL.md`

### Key Frontmatter Fields
- `name` — becomes the `/slash-command`
- `description` — helps Claude decide when to auto-load
- `disable-model-invocation: true` — user-only, prevents auto-triggering
- `allowed-tools` — tools permitted without per-use approval
- `argument-hint` — autocomplete guidance

### Dynamic Context
- `$ARGUMENTS` — user input after skill name
- `!`command`` — shell command output injected at load time

---

## Decision: No MCP Servers

### Why Not MCP
1. No native "disabled by default" flag — servers are either on or off
2. No programmatic enable/disable mid-session (open feature request #10447)
3. Keeping servers enabled adds tool definitions to context even when unused
4. User requirement: zero footprint when not in use

### Why Direct CLI/API
1. Zero context cost — nothing loaded until skill is invoked
2. Codex CLI already has excellent non-interactive mode
3. Gemini script is ~50 lines using official SDK
4. Skills handle all routing, context gathering, and response formatting
5. Simpler architecture, fewer moving parts
