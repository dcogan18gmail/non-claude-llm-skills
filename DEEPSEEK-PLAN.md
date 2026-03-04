# Plan: Add DeepSeek Skill + 3-Model Red Team

## Context

The project has `/gemini` and `/codex` standalone skills, plus `/red-team` which orchestrates both in parallel. We're adding:
1. A standalone `/deepseek` skill (same pattern as `/gemini` and `/codex`)
2. A `deepseek-query.js` CLI wrapper (mirrors `gemini-query.js`)
3. Expanding `/red-team` to 3 models by default, with natural-language model selection for 2-model subsets

**Key constraint**: Model config must be easy to swap in a single place (the `DEFAULT_MODEL` constant in `deepseek-query.js` and the model name in `skills/deepseek/SKILL.md`), since a newer DeepSeek model may be available by the time this ships.

---

## New Files to Create

### 1. `deepseek/package.json`

```json
{
  "name": "deepseek-query",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Minimal CLI to query DeepSeek from Claude Code skills",
  "main": "deepseek-query.js",
  "dependencies": {
    "openai": "^4.85.0"
  }
}
```

### 2. `deepseek/deepseek-query.js`

Mirrors `gemini/gemini-query.js` CLI interface. Uses OpenAI SDK with DeepSeek base URL.

```javascript
#!/usr/bin/env node

import { readFileSync } from "fs";
import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek-reasoner";  // <-- SINGLE PLACE to change default model

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("Error: DEEPSEEK_API_KEY environment variable is not set.");
  process.exit(1);
}

// Parse CLI args — identical interface to gemini-query.js
const args = process.argv.slice(2);
let model = DEFAULT_MODEL;
let context = null;
let prompt = null;
const promptParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model" && args[i + 1]) {
    model = args[++i];
  } else if (args[i] === "--context" && args[i + 1]) {
    context = args[++i];
  } else if (args[i] === "--context-file" && args[i + 1]) {
    context = readFileSync(args[++i], "utf8");
  } else if (args[i] === "--prompt-file" && args[i + 1]) {
    prompt = readFileSync(args[++i], "utf8").trim();
  } else {
    promptParts.push(args[i]);
  }
}

if (promptParts.length > 0) {
  prompt = promptParts.join(" ");
}

// Stdin handling — identical to gemini-query.js
if (!process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdinContent = Buffer.concat(chunks).toString().trim();
  if (stdinContent) {
    if (prompt) {
      context = context ? context + "\n\n" + stdinContent : stdinContent;
    } else {
      prompt = stdinContent;
    }
  }
}

if (!prompt) {
  console.error(
    "Usage: deepseek-query [--model MODEL] [--context TEXT] [--context-file PATH] [--prompt-file PATH] PROMPT"
  );
  process.exit(1);
}

// Build messages — deepseek-reasoner doesn't support system messages,
// so context goes in the user message for reasoner models.
const messages = [];
const isReasoner = model.includes("reasoner");

if (context && !isReasoner) {
  messages.push({ role: "system", content: `<context>\n${context}\n</context>` });
  messages.push({ role: "user", content: prompt });
} else if (context) {
  messages.push({ role: "user", content: `<context>\n${context}\n</context>\n\n${prompt}` });
} else {
  messages.push({ role: "user", content: prompt });
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.deepseek.com",
});

try {
  const response = await client.chat.completions.create({ model, messages });
  const choice = response.choices[0];

  // deepseek-reasoner returns chain-of-thought in reasoning_content
  if (choice.message.reasoning_content) {
    console.log("<reasoning>\n" + choice.message.reasoning_content + "\n</reasoning>\n");
  }

  console.log(choice.message.content || "No response generated");
} catch (error) {
  console.error(`Error from DeepSeek (${model}): ${error.message}`);
  process.exit(1);
}
```

**Key design decisions:**
- `DEFAULT_MODEL` is a single constant at the top — easy to swap when a new model drops
- `deepseek-reasoner` doesn't support system messages → context goes in user message for reasoner, system message for chat
- `reasoning_content` (R1's chain-of-thought) is output in `<reasoning>` tags before the final answer
- Identical CLI interface to `gemini-query.js`: `--model`, `--context`, `--context-file`, `--prompt-file`, stdin

### 3. `skills/deepseek/SKILL.md`

Full SKILL.md mirroring `skills/gemini/SKILL.md` structure:

```markdown
---
name: deepseek
description: Query DeepSeek for code review, alternative perspectives, analysis, or a second AI opinion. Only invoked manually via /deepseek.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, Write
argument-hint: [your query, a file to review, or a question for DeepSeek]
---

# DeepSeek Query

You are routing a user query to DeepSeek via a CLI script. Do NOT use any MCP tools. Use Bash to invoke the DeepSeek query script directly.

## Model Configuration

Default model: `deepseek-reasoner` (R1 reasoning model, deep chain-of-thought built in)

To change the default model, edit the `DEFAULT_MODEL` constant in `~/.claude/tools/deepseek-query.js`.

If the user specifies a different model (e.g., "use chat" or "use V3"), pass it via `--model`:
- `deepseek-reasoner` — default, R1 reasoning model with chain-of-thought
- `deepseek-chat` — V3 general-purpose model, faster

## Context Gathering

Before calling DeepSeek, gather relevant context:

1. If the user references specific files in $ARGUMENTS, read them using the Read tool
2. Determine total file size to choose the right method (see Execute Query below)
3. For large codebases, focus on the files most relevant to the query

## Execute Query

### Simple query (no file context):
```bash
node ~/.claude/tools/deepseek-query.js "THE USER'S QUERY"
```

### Query with file context (PREFERRED for any files — avoids shell arg limits):
Write context to a temp file, then use `--context-file`:
```bash
cat file1.ts file2.ts > /tmp/deepseek-context.txt
node ~/.claude/tools/deepseek-query.js --context-file /tmp/deepseek-context.txt "THE USER'S QUERY"
```

For multiple files with labels, build the context file with separators:
```bash
echo "--- file1.ts ---" > /tmp/deepseek-context.txt
cat file1.ts >> /tmp/deepseek-context.txt
echo -e "\n--- file2.ts ---" >> /tmp/deepseek-context.txt
cat file2.ts >> /tmp/deepseek-context.txt
node ~/.claude/tools/deepseek-query.js --context-file /tmp/deepseek-context.txt "Review these files for bugs"
```

### Stdin as context (alternative):
When a prompt is provided as a CLI arg, piped stdin becomes context:
```bash
cat file1.ts file2.ts | node ~/.claude/tools/deepseek-query.js "Review these files for bugs"
```

### Large prompt from file:
```bash
node ~/.claude/tools/deepseek-query.js --prompt-file /tmp/deepseek-prompt.txt --context-file /tmp/deepseek-context.txt
```

### Query with model override:
```bash
node ~/.claude/tools/deepseek-query.js --model deepseek-chat "THE USER'S QUERY"
```

## IMPORTANT: Always use --context-file for file content

Do NOT pass file contents as a `--context` CLI argument string. Shell argument length limits (~256KB on macOS) cause silent truncation for large files. Always write context to a temp file first and use `--context-file`.

## Reasoning Output

The `deepseek-reasoner` model returns its chain-of-thought reasoning wrapped in `<reasoning>` tags before the final answer. When presenting results:
- Show the final answer prominently
- Optionally include a summary of the reasoning if it contains useful insights
- Do not show the raw reasoning tags unless the user asks for them

## Present Results

Format the response clearly:

```
**DeepSeek Response** (model: deepseek-reasoner)

[response content — final answer only, unless user asks for reasoning]
```

## Comparative Analysis

If the user asks to compare DeepSeek's response with Claude's own analysis:
1. First show DeepSeek's response (via the script)
2. Then provide your own (Claude's) analysis
3. Highlight where the two agree and differ

## User Query

$ARGUMENTS
```

---

## Files to Modify

### 4. `skills/red-team/SKILL.md` — Major update

This is the most complex change. All modifications below are relative to the existing file.

**a) Frontmatter + title**

Replace frontmatter description and title:
```yaml
---
name: red-team
description: Send the same query to Google Gemini, OpenAI Codex, and DeepSeek in parallel via subagents, then compare their responses. Only invoked manually via /red-team.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, Write, Task
argument-hint: [your query, a file to review, or a question for all models]
---

# Red Team: Parallel Gemini + Codex + DeepSeek Query

You are orchestrating a red-team query across Google Gemini, OpenAI Codex, and DeepSeek. Your job is lightweight coordination -- **all heavy lifting happens in subagents** to preserve the main session's context window.

Do NOT use any MCP tools. Do NOT read file contents or run model queries directly in the main session.
```

**b) New section: "Model Selection" (insert after Intent Detection, before Step 1)**

```markdown
## Model Selection

By default, all three models run: Gemini, Codex, and DeepSeek. The user can narrow to any 2 by naming them in $ARGUMENTS.

**Parse model selection from $ARGUMENTS** before launching the prep agent:

### Detection rules
1. If the user mentions specific model names in a selection pattern, use ONLY those models
2. Selection patterns: "with X and Y", "using X and Y", "just X and Y", "only X and Y", "X+Y", "X and Y only"
3. If no model names are mentioned in a selection pattern, use ALL THREE
4. Incidental mentions don't count (e.g., "review Google auth" doesn't select Gemini)

### Model name aliases
- **Gemini**: "gemini", "google" (only in selection patterns)
- **Codex**: "codex", "openai", "gpt"
- **DeepSeek**: "deepseek", "r1"

### Examples
- "review auth.ts" → all three (no selection pattern)
- "review auth.ts with gemini and deepseek" → Gemini + DeepSeek
- "just codex and deepseek for this review" → Codex + DeepSeek
- "gemini+codex review the middleware" → Gemini + Codex

### Minimum
At least 2 models required. If user names only 1, direct them to the standalone skill (e.g., "Use /deepseek directly for single-model queries") and stop.

Strip model selection phrases from the query before passing to the prep agent.
```

**c) Step 1: Prep Agent — minor update**

Add to the prep agent prompt template (after "Working directory"):
```
Selected models: [list of selected models, e.g., "Gemini, Codex, DeepSeek"]
```

No other changes to prep agent behavior.

**d) Step 2: Model Agents — expand from 2 to 3**

Replace the Step 2 intro:
```markdown
## Step 2: Model Agents (parallel)

Launch subagents for each selected model **in the same message** so they run concurrently. With the default (all three), launch three `general-purpose` subagents (model: `opus`). If only two models were selected, launch two.
```

Keep existing Gemini Agent and Codex Agent sections unchanged. Add new DeepSeek Agent section:

```markdown
### DeepSeek Agent

```
You are calling DeepSeek and returning its response.

Do NOT use any MCP tools. Use only Bash and Read.

Model: deepseek-reasoner (R1 reasoning model)
Script: node ~/.claude/tools/deepseek-query.js

Steps:
1. Run the query:
   [If context exists]
   Bash (timeout 420000): node ~/.claude/tools/deepseek-query.js --context-file /tmp/red-team-context.txt --prompt-file /tmp/red-team-prompt.txt
   [If no context]
   Bash (timeout 420000): node ~/.claude/tools/deepseek-query.js --prompt-file /tmp/red-team-prompt.txt

2. The response may include <reasoning> tags with chain-of-thought before the final answer. Return BOTH the reasoning and the final answer -- the main session will decide what to show.

3. Return the COMPLETE response text from DeepSeek. Do not summarize or truncate it. Prefix with: "DEEPSEEK RESPONSE:"

IMPORTANT:
- NEVER pass file contents as a --context CLI argument. Always use --context-file.
- If the user specified a model override, pass it via --model.
- Timeout is 420000ms (7 minutes). If Bash times out, use TaskOutput with block: true and timeout: 300000 to wait.
```
```

**e) Step 3: Present Results — conditional sections**

Replace the Step 3 template to be conditional on selected models:

```markdown
## Step 3: Present Results

Once all model agents return, present their responses in the main session. Only include sections for models that were selected and ran:

```
---

[If Gemini was selected:]
**Gemini Response** (model: gemini-3.1-pro-preview, thinking: high)

[Complete Gemini response from the agent's return value]

---

[If Codex was selected:]
**Codex Response** (model: gpt-5.2-codex, reasoning: high)

[Complete Codex response from the agent's return value]

---

[If DeepSeek was selected:]
**DeepSeek Response** (model: deepseek-reasoner)

[Complete DeepSeek response — final answer section. Optionally include a brief summary of key reasoning insights if the <reasoning> content adds value, but do not dump the raw chain-of-thought.]

---
```

If any agent failed or timed out, note it and present whatever is available.
```

**f) Step 4: Comparison — adapt for variable model count**

Update the comparison section:

```markdown
## Step 4: Comparison

Add your own synthesis. You (Claude) are the tiebreaker and synthesizer. You have NOT seen the raw file contents -- you are comparing the model responses on their own merits.

```
**Comparison** (Claude synthesis)

**Agreement:** [Key points where the models align]

**Divergence:** [Key points where they disagree or emphasize differently. Note which model(s) hold each position.]

**Recommendation:** [Your assessment of which perspective is stronger on each divergence point, or a synthesized best answer drawing from all responses]
```

Adapt the comparison structure to the detected intent:
- **Review**: organize by severity, flag findings unique to one model. With 3 models, note "2-of-3 agreement" vs "sole finding" patterns.
- **Debate**: steelman all positions, give a reasoned recommendation
- **Troubleshoot**: assess root cause agreement, note convergence (3/3, 2/3, all different), recommend which diagnosis to pursue
- **General**: standard format

Keep it concise -- substantive differences only, not stylistic ones.
```

**g) Step 5: Report — updated format**

Update the metadata table Models row to be dynamic:
```markdown
| **Models** | [List each selected model with its config, e.g., "Gemini (gemini-3.1-pro-preview, thinking: high), Codex (gpt-5.2-codex, reasoning: high), DeepSeek (deepseek-reasoner)"] |
```

Update the report body to include conditional response sections:
```markdown
[For each selected model, include its section:]

## Gemini Response
[Complete Gemini response -- only if Gemini was selected]

---

## Codex Response
[Complete Codex response -- only if Codex was selected]

---

## DeepSeek Response
[Complete DeepSeek response -- only if DeepSeek was selected]

---

## Claude Comparison
[Complete comparison/synthesis from Step 4]
```

Update Action Items source attribution:
```markdown
- [ ] **[Critical]** description (source: Gemini / Codex / DeepSeek / all / 2-of-3)
- [ ] **[Major]** description (source: Gemini / Codex / DeepSeek / all / 2-of-3)
- [ ] **[Minor]** description (source: Gemini / Codex / DeepSeek / all / 2-of-3)
- [ ] **[Nit]** description (source: Gemini / Codex / DeepSeek / all / 2-of-3)
```

### 5. `README.md`

**Architecture diagram** — replace existing block:
```
/codex [query]    →  codex exec -m gpt-5.2-codex -c model_reasoning_effort="high" "query"
/gemini [query]   →  node gemini-query.js "query"  (thinkingLevel: high)
/deepseek [query] →  node deepseek-query.js "query"  (R1 reasoning)
/red-team [query] →  all 3 models in parallel (or select 2) via subagents, then Claude compares
```

**Prerequisites** — add to API Keys section:
```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
```

**Installation** — add:
```bash
# Install DeepSeek script dependencies
cd deepseek/ && npm install

# Copy DeepSeek query tool
cp deepseek/deepseek-query.js ~/.claude/tools/deepseek-query.js

# Copy DeepSeek skill
cp -r skills/deepseek ~/.claude/skills/deepseek
```

**Usage** — add examples:
```
/deepseek Review this authentication flow for vulnerabilities
/deepseek What are the tradeoffs of this caching strategy?
/red-team Review auth.ts with gemini and deepseek
/red-team Debate: REST or GraphQL? (just codex and deepseek)
```

Update red-team description paragraph to mention model selection.

**Models table** — replace:
```
| Skill | Model | Reasoning |
|-------|-------|-----------|
| `/codex` | gpt-5.2-codex | high |
| `/gemini` | gemini-3.1-pro-preview | thinkingLevel: high |
| `/deepseek` | deepseek-reasoner | built-in (R1) |
| `/red-team` | all 3 (or select 2) | high |
```

### 6. `RESEARCH.md`

Add new `## DeepSeek API` section (between Gemini and Claude Code Skills sections):

```markdown
## DeepSeek API

### API Compatibility
- OpenAI-compatible REST API
- Base URL: `https://api.deepseek.com`
- Uses standard OpenAI SDK with `baseURL` override
- Auth: Bearer token via `DEEPSEEK_API_KEY`

### Available Models (Feb 2026)
| Model | ID | Type | Notes |
|-------|----|------|-------|
| DeepSeek R1 | `deepseek-reasoner` | Reasoning | Chain-of-thought in `reasoning_content` |
| DeepSeek V3 | `deepseek-chat` | General | Fast, general purpose |

### Reasoning Behavior
- `deepseek-reasoner` (R1): Reasoning is built-in, no parameter to control effort level
- Returns `reasoning_content` field in addition to `content` in the response
- The reasoning content contains the chain-of-thought steps

### System Message Limitation
- `deepseek-reasoner` does NOT support system messages
- Context must be placed in the user message for reasoner models
- `deepseek-chat` supports system messages normally

### SDK Usage (openai package)
```javascript
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});
const response = await client.chat.completions.create({
  model: "deepseek-reasoner",
  messages: [{ role: "user", content: "prompt here" }],
});
// response.choices[0].message.reasoning_content — chain-of-thought
// response.choices[0].message.content — final answer
```
```

---

## Implementation Order

1. **Create** `deepseek/package.json` + `deepseek/deepseek-query.js`
2. **Run** `cd deepseek/ && npm install`
3. **Create** `skills/deepseek/SKILL.md`
4. **Update** `skills/red-team/SKILL.md`
5. **Update** `README.md` + `RESEARCH.md`
6. **Install** — copy to `~/.claude/` locations:
   ```bash
   mkdir -p ~/.claude/tools
   cp deepseek/deepseek-query.js ~/.claude/tools/deepseek-query.js
   cp -r skills/deepseek ~/.claude/skills/deepseek
   cp -r skills/red-team ~/.claude/skills/red-team
   ```

---

## Verification

1. **CLI wrapper**: Test `deepseek-query.js` with no args (usage msg), `--prompt-file`, `--context-file`, `--model deepseek-chat`, stdin piping
2. **Standalone `/deepseek`**: Simple query, query with file context
3. **Red team 3-model default**: `/red-team Review the README` — all 3 responses + comparison + report
4. **Red team 2-model selection**: `/red-team Review auth.ts with gemini and deepseek` — only those 2 run
5. **Error handling**: Missing API key → DeepSeek fails gracefully, other models still complete
6. **Report**: Verify metadata lists correct models, conditional sections match what ran

---

## Pre-Implementation Checklist

- [ ] Get DeepSeek API access approved by org
- [ ] Obtain API key from platform.deepseek.com
- [ ] Add `export DEEPSEEK_API_KEY="..."` to `~/.zshrc`
- [ ] Verify latest DeepSeek model — update `DEFAULT_MODEL` in `deepseek-query.js` if a newer model has launched
