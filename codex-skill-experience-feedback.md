# Codex Skill: Experience Feedback and Improvement Notes

## Overview

This documents the experience of using the `/codex` skill to run a large-scale PRD review via OpenAI's Codex CLI. The goal is to identify friction points, error handling gaps, and optimization opportunities for the skill.

## What Worked Well

1. **Model selection and reasoning config**: `gpt-5.2-codex` with `-c model_reasoning_effort="high"` produced thorough, well-structured output. The model read files, ran jq/node commands to parse the 237KB JSON, and produced a categorized review with story IDs.

2. **Read-only sandbox**: Using `-s read-only` was appropriate for a review task. Codex could read files and run analysis commands without risk of modifying anything.

3. **Automatic file exploration**: Codex autonomously ran `ls`, `cat`, `jq`, and `node` commands to explore the project. It handled the large prd.json by using jq to extract specific stories rather than trying to read the whole file at once.

## Errors Encountered

### 1. Git repo check failure (blocking)

**Error:**
```
Not inside a trusted directory and --skip-git-repo-check was not specified.
```

**Context:** The project directory was not a git repo. Codex requires `--skip-git-repo-check` for non-git directories.

**Impact:** Required a retry with the additional flag.

**Skill fix:** The skill should always include `--skip-git-repo-check` when invoking `codex exec`, OR check if the directory is a git repo first and conditionally add the flag. Since the flag is harmless when inside a git repo, always including it is the simplest fix:
```bash
codex exec --skip-git-repo-check -m gpt-5.2-codex ...
```

### 2. Background execution and timeout

**What happened:** The `codex exec` command ran for over 5 minutes (the Bash tool's default timeout is 2 minutes, extended to 5 for this call). The command was automatically moved to background execution. A subsequent `TaskOutput` call with a 5-minute timeout also timed out. A third `TaskOutput` call eventually retrieved the completed result.

**Impact:** Required multiple polling attempts. Not a failure, but added latency and extra tool calls to the conversation.

**Skill fix considerations:**
- The skill should set a generous initial timeout (e.g., `timeout: 300000` or even `timeout: 600000`) when calling Bash, since Codex with high reasoning on large contexts routinely takes 3-7 minutes.
- Alternatively, the skill could proactively use `run_in_background: true` and then poll with `TaskOutput` at intervals.
- Consider adding retry/polling logic guidance: "If the command moves to background, poll with TaskOutput every 60 seconds up to 10 minutes before considering it failed."

### 3. No python available

**What happened (inside Codex):** Codex tried `python -c ...` to parse JSON and got `command not found: python`. It fell back to `node -e` and `jq`.

**Impact:** None for the skill itself (this is Codex's internal behavior), but worth noting that the environment only has Node.js and standard Unix tools, not Python.

**Skill fix:** Not actionable from the skill side, but if the skill ever needs to pre-process files before passing to Codex, use Node.js or jq, not Python.

## Bottlenecks

### 1. Large file handling

The 237KB prd.json was the main bottleneck. Codex handled it well internally by using jq to extract specific stories, but the initial prompt couldn't include the file contents inline (too large for CLI args). The `-C` working directory flag was the right approach -- Codex read the files itself.

**Skill improvement:** The skill instructions should explicitly state: "For large files, do NOT try to pass file contents via the prompt string. Instead, use `-C` to set the working directory and instruct Codex to read the files itself." The current skill instructions don't mention this pattern.

### 2. Token consumption

Codex reported 151,438 tokens used for this review. This is significant. For cost-conscious users:

**Skill improvement:** Consider adding guidance about when to use `gpt-5.2-codex` vs `gpt-5.2` (or even a lighter model). For simple reviews, `gpt-5.2` may suffice. Reserve `gpt-5.2-codex` with high reasoning for complex multi-file analysis tasks.

### 3. Output truncation

The full Codex output was truncated when read via `TaskOutput` (the output file was very large due to all the intermediate thinking/exec steps). The final answer was at the end.

**Skill improvement:** Consider using `-o /tmp/codex-response.md` to capture just the final output to a file, then reading that file. This avoids having to parse through all the intermediate tool-use output. The skill instructions already mention this flag but don't recommend it as a default.

## Recommended Skill Updates

### Always include `--skip-git-repo-check`

Add to all `codex exec` and `codex review` commands:
```bash
codex exec --skip-git-repo-check -m gpt-5.2-codex ...
```

### Use generous timeouts

Default Bash timeout should be at least 300 seconds (5 min) for Codex calls:
```
timeout: 300000
```

### Add file-handling guidance

Add to the skill instructions:
```
## Large File Handling
- If the user references files larger than ~50KB, do NOT include file contents in the prompt string.
- Instead, use `-C <directory>` to set the working directory and instruct Codex to read the files itself.
- Example: codex exec -C "/path/to/project" "Read prd.json and CLAUDE.md in this directory and review them."
```

### Add output capture guidance

Add to the skill instructions:
```
## Output Capture
- For complex tasks that may produce long output, use `-o /tmp/codex-output.md` to capture the final response.
- Then read the output file rather than parsing the full terminal output.
- Example: codex exec -o /tmp/codex-review.md ... && cat /tmp/codex-review.md
```

### Add timeout/retry guidance

Add to the skill instructions:
```
## Timeout Handling
- Codex with high reasoning on large contexts can take 3-7 minutes.
- Set Bash timeout to at least 300000ms (5 minutes).
- If the command moves to background, use TaskOutput with block=true and timeout=300000 to wait.
- If TaskOutput times out, retry once more with the same timeout before reporting failure.
- Maximum total wait: 10 minutes.
```

### Consider `codex review` for PRD-style reviews

The current skill only suggests `codex review` for code diffs/commits. But `codex review` could also work for document review if the files are committed. Consider expanding the guidance:
```
## Review Types
- `codex review --uncommitted`: Review code changes
- `codex exec -s read-only`: Review documents, plans, architecture (non-code)
```

## Summary

The main friction points were: (1) the git repo check failing on non-git directories, (2) timeout handling requiring multiple polling attempts, and (3) no explicit guidance on large file handling. All are easily fixable in the skill instructions. The Codex CLI itself performed well -- the model's ability to autonomously explore files via jq and node was impressive and required no hand-holding.
