---
name: codex
description: Query OpenAI Codex for code review, alternative implementations, or a second opinion on coding tasks. Only invoked manually via /codex.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, Write
argument-hint: [your query about code, a file to review, or a coding task]
---

# OpenAI Codex Query

You are routing a user query to OpenAI's Codex via the Codex CLI. Do NOT use any MCP tools. Use Bash to invoke `codex exec` or `codex review` directly.

## Model Configuration

Use this model with high reasoning effort on every call:
- **Model**: `gpt-5.4` (latest and most capable)
- **Reasoning**: `-c model_reasoning_effort="high"`

If the model is unavailable or returns an error, fall back to `gpt-5.2-codex` (also supports high reasoning).

## Determine Query Type

Analyze the user's query from `$ARGUMENTS` to determine which Codex subcommand to use:

### Code Review Queries
If the user is asking to review code, changes, diffs, or commits, use `codex review`:

```bash
# Review uncommitted changes
codex review --uncommitted -c model_reasoning_effort="high" "INSTRUCTIONS"

# Review against a branch
codex review --base main -c model_reasoning_effort="high" "INSTRUCTIONS"

# Review a specific commit
codex review --commit SHA -c model_reasoning_effort="high" "INSTRUCTIONS"
```

### General Queries
For everything else, use `codex exec`:

```bash
codex exec --skip-git-repo-check -m gpt-5.4 -c model_reasoning_effort="high" -C "WORKING_DIR" -s read-only -o /tmp/codex-response.md "PROMPT"
```

Use `-s workspace-write` only if the user explicitly asks Codex to make file modifications.

## Context Gathering

Before calling Codex, determine how to pass context:

1. **Small files (<50KB)**: You may read them and include contents in the prompt string.
2. **Large files (>50KB) or many files**: Do NOT read and inline file contents. Instead, use `-C` to set the working directory and instruct Codex to read the files itself. Example:
   ```bash
   codex exec --skip-git-repo-check -m gpt-5.4 -c model_reasoning_effort="high" -C "/path/to/project" -s read-only -o /tmp/codex-response.md "Read prd.json and README.md in this directory and review them for completeness."
   ```
3. For code review, determine if the user wants to review uncommitted changes, a branch diff, or a specific commit.

## Execution

### Timeout

Codex with high reasoning on large contexts can take 3-7 minutes. Always set the Bash timeout to **420000ms (7 minutes)**:

```
timeout: 420000
```

If the command moves to background (timeout reached but still running), it is NOT failed — use TaskOutput with `block: true` and `timeout: 300000` to wait for completion. The task will finish; do not abandon it.

### Output Capture

Always use `-o /tmp/codex-response.md` to capture Codex's final response to a file. After execution completes, read `/tmp/codex-response.md` for the clean final answer. This avoids parsing through intermediate reasoning and tool-use output in the terminal.

Then read the output:
```bash
cat /tmp/codex-response.md
```

### Present Results

Format the response clearly:

```
**Codex Response** (model: gpt-5.4, reasoning: high)

[response content from /tmp/codex-response.md]
```

If Codex suggested code changes, format them with appropriate diff or code block formatting.

## User Query

$ARGUMENTS
