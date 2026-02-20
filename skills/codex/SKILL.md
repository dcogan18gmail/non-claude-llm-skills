---
name: codex
description: Query OpenAI Codex for code review, alternative implementations, or a second opinion on coding tasks. Only invoked manually via /codex.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
argument-hint: [your query about code, a file to review, or a coding task]
---

# OpenAI Codex Query

You are routing a user query to OpenAI's Codex via the Codex CLI. Do NOT use any MCP tools. Use Bash to invoke `codex exec` or `codex review` directly.

## Model Configuration

Use this model with high reasoning effort on every call:
- **Model**: `gpt-5.2-codex` (latest and most capable)
- **Reasoning**: `-c model_reasoning_effort="high"`

If the model is unavailable or returns an error, fall back to `gpt-5.2` (general-purpose, also supports high reasoning).

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
codex exec -m gpt-5.2-codex -c model_reasoning_effort="high" -C "WORKING_DIR" -s read-only "PROMPT"
```

Use `-s workspace-write` only if the user explicitly asks Codex to make file modifications.

## Context Gathering

Before calling Codex, gather relevant context to enrich the prompt:

1. If the user references specific files, read them and include their contents in the prompt
2. Use the current working directory as `-C` parameter
3. For code review, determine if the user wants to review uncommitted changes, a branch diff, or a specific commit

## Execute and Present

1. Run the appropriate Codex command via Bash
2. The `-o /tmp/codex-response.md` flag can capture output to a file if the response is large
3. Present the response clearly:

```
**Codex Response** (model: gpt-5.2-codex, reasoning: high)

[response content]
```

If Codex suggested code changes, format them with appropriate diff or code block formatting.

## User Query

$ARGUMENTS
