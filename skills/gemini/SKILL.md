---
name: gemini
description: Query Google Gemini for code review, alternative perspectives, analysis, or a second AI opinion. Only invoked manually via /gemini.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, Write
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
2. Determine total file size to choose the right method (see Execute Query below)
3. For large codebases, focus on the files most relevant to the query

## Execute Query

### Simple query (no file context):
```bash
node ~/.claude/tools/gemini-query.js "THE USER'S QUERY"
```

### Query with small context (under ~100KB combined):
```bash
node ~/.claude/tools/gemini-query.js --context "FILE CONTENTS HERE" "THE USER'S QUERY"
```

### Query with file context (PREFERRED for any files — avoids shell arg limits):
Write context to a temp file, then use `--context-file`:
```bash
cat file1.ts file2.ts > /tmp/gemini-context.txt
node ~/.claude/tools/gemini-query.js --context-file /tmp/gemini-context.txt "THE USER'S QUERY"
```

For multiple files with labels, build the context file with separators:
```bash
echo "--- file1.ts ---" > /tmp/gemini-context.txt
cat file1.ts >> /tmp/gemini-context.txt
echo -e "\n--- file2.ts ---" >> /tmp/gemini-context.txt
cat file2.ts >> /tmp/gemini-context.txt
node ~/.claude/tools/gemini-query.js --context-file /tmp/gemini-context.txt "Review these files for bugs"
```

### Stdin as context (alternative):
When a prompt is provided as a CLI arg, piped stdin becomes context:
```bash
cat file1.ts file2.ts | node ~/.claude/tools/gemini-query.js "Review these files for bugs"
```

### Large prompt from file:
```bash
node ~/.claude/tools/gemini-query.js --prompt-file /tmp/gemini-prompt.txt --context-file /tmp/gemini-context.txt
```

### Query with model override:
```bash
node ~/.claude/tools/gemini-query.js --model gemini-2.5-flash "THE USER'S QUERY"
```

## IMPORTANT: Always use --context-file for file content

Do NOT pass file contents as a `--context` CLI argument string. Shell argument length limits (~256KB on macOS) cause silent truncation for large files. Always write context to a temp file first and use `--context-file`.

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
