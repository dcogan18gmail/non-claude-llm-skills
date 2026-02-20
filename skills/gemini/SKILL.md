---
name: gemini
description: Query Google Gemini for code review, alternative perspectives, analysis, or a second AI opinion. Only invoked manually via /gemini.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
argument-hint: [your query, a file to review, or a question for Gemini]
---

# Google Gemini Query

You are routing a user query to Google's Gemini via a CLI script. Do NOT use any MCP tools. Use Bash to invoke the Gemini query script directly.

## Model Configuration

Default model: `gemini-3.1-pro-preview` (thinking level: high, set in script)

If the user specifies a different model (e.g., "use flash" or "use 2.5 pro"), pass it via `--model`:
- `gemini-3.1-pro-preview` — default, most capable
- `gemini-2.5-pro` — stable alternative
- `gemini-2.5-flash` — faster, lighter

## Context Gathering

Before calling Gemini, gather relevant context:

1. If the user references specific files in $ARGUMENTS, read them using the Read tool
2. Combine file contents into a context string to pass via `--context`
3. For large codebases, focus on the files most relevant to the query

## Execute Query

### Simple query (no file context):
```bash
node ~/.claude/tools/gemini-query.js "THE USER'S QUERY"
```

### Query with file context:
```bash
node ~/.claude/tools/gemini-query.js --context "FILE CONTENTS HERE" "THE USER'S QUERY"
```

### Query with model override:
```bash
node ~/.claude/tools/gemini-query.js --model gemini-2.5-flash "THE USER'S QUERY"
```

### For large context (use stdin):
```bash
cat file1.ts file2.ts | node ~/.claude/tools/gemini-query.js "Review these files for bugs"
```

## Present Results

Format the response clearly:

```
**Gemini Response** (model: gemini-3.1-pro-preview, thinking: high)

[response content]
```

## Comparative Analysis

If the user asks to compare Gemini's response with Claude's own analysis:
1. First show Gemini's response (via the script)
2. Then provide your own (Claude's) analysis
3. Highlight where the two agree and differ

## User Query

$ARGUMENTS
