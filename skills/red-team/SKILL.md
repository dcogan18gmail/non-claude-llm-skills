---
name: red-team
description: Send the same query to both Google Gemini and OpenAI Codex in parallel via subagents, then compare their responses side-by-side. Only invoked manually via /red-team.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, Write, Task
argument-hint: [your query, a file to review, or a question for both models]
---

# Red Team: Parallel Gemini + Codex Query

You are orchestrating a red-team query across Google Gemini and OpenAI Codex. Your job is lightweight coordination -- **all heavy lifting happens in subagents** to preserve the main session's context window.

Do NOT use any MCP tools. Do NOT read file contents or run model queries directly in the main session.

## Intent Detection

Classify the user's intent from $ARGUMENTS before doing anything else. This determines how the prep agent gathers context, how the model agents frame their prompts, and how you structure the final comparison.

### Review
Triggers: "review", file/PR/diff/commit references, or clearly evaluating existing code.

- Prep agent auto-gathers: referenced files, `git diff`, `git diff --cached`, or `git log -1 -p <sha>`.
- Model agents frame as code review: bugs, security issues, performance, readability, edge cases.
- Codex agent uses `codex review` instead of `codex exec` when reviewing diffs.
- Comparison organized by severity (critical > major > minor > nit). Flag anything only one model caught.

### Debate
Triggers: "debate", "argue", "pros and cons", "tradeoffs", architectural/design decisions.

- Model agents are each told to take a clear position and defend it -- not to be balanced.
- Comparison steelmans both sides, then gives a reasoned recommendation with explicit tradeoffs.

### Troubleshoot
Triggers: "debug", "troubleshoot", "fix", "broken", "error", "failing", stack traces.

- Prep agent auto-gathers: referenced files, error output, stack traces.
- Model agents frame as diagnostic: likely root causes and recommended fixes.
- Comparison highlights whether they agree on root cause. If divergent, assess plausibility.

### General
Fallback when no specific intent is detected. Query as-is, standard comparison.

## Step 1: Prep Agent

Launch a single `general-purpose` subagent (model: `opus`) that:

1. Reads the user's referenced files (using Read/Glob/Grep -- NOT cat).
2. For review intent: captures relevant diffs via Bash.
3. Writes everything to `/tmp/red-team-context.txt` with labeled separators:
   ```
   --- path/to/file.ts ---
   [file contents]
   ```
4. Writes the final framed prompt (adjusted for detected intent) to `/tmp/red-team-prompt.txt`.
5. Returns a SHORT summary (under 200 words) of: what files were gathered, what intent was detected, and the prompt that was written. Do NOT return file contents.

**Prep agent prompt template:**
```
You are preparing context for a red-team query across multiple AI models.

User query: [THE USER'S QUERY]
Detected intent: [review/debate/troubleshoot/general]
Working directory: [CWD]

Your tasks:
1. Read the files referenced in the query using the Read tool (not cat/Bash).
2. [If review intent] Also capture relevant git diffs via Bash.
3. Write all gathered file contents to /tmp/red-team-context.txt with "--- filename ---" separators between files.
4. Write the final prompt for the external models to /tmp/red-team-prompt.txt. This prompt should:
   - Include the user's original query
   - [If review] Frame as a code review asking for bugs, security issues, performance, readability, edge cases
   - [If debate] Ask the model to take a clear position and defend it with concrete reasoning
   - [If troubleshoot] Frame as a diagnostic asking for root causes and recommended fixes
   - [If general] Use the query as-is
5. Return a summary (under 200 words) of what you gathered and the prompt you wrote. Do NOT return file contents.
```

Wait for the prep agent to complete before proceeding to Step 2.

## Step 2: Model Agents (parallel)

Launch **two** `general-purpose` subagents (model: `opus`) **in the same message** so they run concurrently.

### Gemini Agent

```
You are calling Google Gemini and returning its response.

Do NOT use any MCP tools. Use only Bash and Read.

Model: gemini-3.1-pro-preview (thinking: high)
Script: node ~/.claude/tools/gemini-query.js

Steps:
1. Run the query:
   [If context exists]
   Bash (timeout 420000): node ~/.claude/tools/gemini-query.js --context-file /tmp/red-team-context.txt --prompt-file /tmp/red-team-prompt.txt
   [If no context]
   Bash (timeout 420000): node ~/.claude/tools/gemini-query.js --prompt-file /tmp/red-team-prompt.txt

2. Return the COMPLETE response text from Gemini. Do not summarize or truncate it. Prefix with: "GEMINI RESPONSE:"

IMPORTANT:
- NEVER pass file contents as a --context CLI argument. Always use --context-file.
- If the user specified a model override, pass it via --model.
- Timeout is 420000ms (7 minutes). If Bash times out, use TaskOutput with block: true and timeout: 300000 to wait.
```

### Codex Agent

```
You are calling OpenAI Codex and returning its response.

Do NOT use any MCP tools. Use only Bash and Read.

Model: gpt-5.2-codex (reasoning: high)
Tool: codex CLI

Steps:
1. Read /tmp/red-team-prompt.txt to get the prompt.
2. [If review intent with diffs] Run:
   Bash (timeout 420000): codex review --uncommitted -c model_reasoning_effort="high" "$(cat /tmp/red-team-prompt.txt)"
   Then return the terminal output.
   [Otherwise] Run:
   Bash (timeout 420000): codex exec --skip-git-repo-check -m gpt-5.2-codex -c model_reasoning_effort="high" -s read-only -o /tmp/codex-response.md "$(cat /tmp/red-team-prompt.txt)"
   Then read /tmp/codex-response.md.
   [If context file exists, add]: The context files are at /tmp/red-team-context.txt. Include them in the prompt or use -C as needed.

3. Return the COMPLETE response text from Codex. Do not summarize or truncate it. Prefix with: "CODEX RESPONSE:"

IMPORTANT:
- Always use -o /tmp/codex-response.md for codex exec and read the file afterward.
- Fallback model if gpt-5.2-codex errors: gpt-5.2
- Timeout is 420000ms (7 minutes). If Bash times out, use TaskOutput with block: true and timeout: 300000 to wait.
```

## Step 3: Present Results

Once both model agents return, present their responses in the main session:

```
---

**Gemini Response** (model: gemini-3.1-pro-preview, thinking: high)

[Complete Gemini response from the agent's return value]

---

**Codex Response** (model: gpt-5.2-codex, reasoning: high)

[Complete Codex response from the agent's return value]

---
```

If either agent failed or timed out, note it and present whatever is available.

## Step 4: Comparison

Add your own synthesis. You (Claude) are the tiebreaker and synthesizer. You have NOT seen the raw file contents -- you are comparing the two model responses on their own merits.

```
**Comparison** (Claude synthesis)

**Agreement:** [Key points where both models align]

**Divergence:** [Key points where they disagree or emphasize differently]

**Recommendation:** [Your assessment of which perspective is stronger on each divergence point, or a synthesized best answer drawing from both]
```

Adapt the comparison structure to the detected intent:
- **Review**: organize by severity, flag findings unique to one model
- **Debate**: steelman both sides, give a reasoned recommendation
- **Troubleshoot**: assess root cause agreement, recommend which diagnosis to pursue
- **General**: standard format

Keep it concise -- substantive differences only, not stylistic ones.

## Step 5: Write Report Artifact

After presenting the comparison, write the complete red-team report to a uniquely named file in a `red-team-reports/` subdirectory. Do NOT delegate this to a subagent -- you (the main session) have all the responses in context.

**Determine the file name** by running this Bash command:

```bash
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")" | tr '[:upper:]' '[:lower:]' | tr ' _' '-' | sed 's/[^a-z0-9-]//g') && echo "${PROJECT}-INTENT-$(date +%Y%m%d-%H%M)"
```

In the echoed output, replace `INTENT` with the detected intent from the Intent Detection phase (`review`, `debate`, `troubleshoot`, or `general`). The result is the filename (without `.md`).

**Create the directory and write the file:**

1. Bash: `mkdir -p red-team-reports`
2. Write tool: write to `red-team-reports/{filename}.md`

**File name examples:**
- `red-team-reports/my-api-project-review-20260222-1430.md`
- `red-team-reports/my-app-debate-20260222-0915.md`

**Report structure:**

```
# Red Team Report

| Field | Value |
|-------|-------|
| **Date** | [current date and time, YYYY-MM-DD HH:MM format] |
| **Intent** | [detected intent: review / debate / troubleshoot / general] |
| **Models** | Gemini (gemini-3.1-pro-preview, thinking: high), Codex (gpt-5.2-codex, reasoning: high) |
| **Files Reviewed** | [comma-separated list from prep agent summary, or "N/A" if none] |
| **Query** | [the user's original query from $ARGUMENTS] |

---

## Gemini Response

[Complete Gemini response -- copy the full text returned by the Gemini agent]

---

## Codex Response

[Complete Codex response -- copy the full text returned by the Codex agent]

---

## Claude Comparison

[Complete comparison/synthesis you wrote in Step 4]

---

[If review or troubleshoot intent, include the following section:]

## Action Items

Summarize all concrete findings from both model responses and your comparison into a checklist, organized by severity. Deduplicate -- if both models flagged the same issue, list it once but note "(both models)". If only one model flagged it, note which one.

- [ ] **[Critical]** description (source: Gemini / Codex / both)
- [ ] **[Major]** description (source: Gemini / Codex / both)
- [ ] **[Minor]** description (source: Gemini / Codex / both)
- [ ] **[Nit]** description (source: Gemini / Codex / both)

Omit any severity level that has no items. If no actionable findings exist, write "No action items identified."
```

After writing the file, tell the user:

```
Report written to: [absolute path to red-team-reports/{filename}.md]
```

If either model agent failed or timed out, still write the report with whatever is available. Note any missing sections with "[Model unavailable -- agent failed or timed out]".

For **debate** and **general** intents, omit the Action Items section entirely.

## User Query

$ARGUMENTS
