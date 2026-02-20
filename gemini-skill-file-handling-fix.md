# Gemini Skill: File Handling Fix Notes

## Problem

When the `/gemini` skill needs to pass large file content (e.g., a 237KB JSON file) to the Gemini API, the current approach fails silently. The skill instructions suggest three methods -- CLI arg `--context`, stdin pipe, and shell variable -- but none reliably handle large content.

## What Failed and Why

### Attempt 1: Shell variable + `--context` CLI arg
```bash
CONTEXT=$(cat file1.json file2.md) node ~/.claude/tools/gemini-query.js --context "$CONTEXT" "prompt"
```
**Failure:** Shell argument length limits (typically ~256KB on macOS, but variable expansion + quoting overhead pushes large files past the limit). The `--context` value arrived as empty/truncated, causing Gemini to respond with "you didn't provide any content."

### Attempt 2: Stdin pipe
```bash
cat file1.json file2.md | node ~/.claude/tools/gemini-query.js "prompt"
```
**Failure:** The `gemini-query.js` script reads stdin as the **prompt** (not the context). So if you pipe file content via stdin AND pass a prompt as a CLI arg, the stdin is ignored (because `prompt` is already set from args). If you omit the CLI prompt, the file content becomes the prompt with no context framing.

### Attempt 3: Inline `node -e` with imports
```bash
node -e "import { readFileSync } from 'fs'; ..."
```
**Failure:** Shell escaping of `!` characters in the inline script (zsh interprets `!` as history expansion even inside double quotes).

## What Worked

Write a temporary `.mjs` file that:
1. Reads context from a file using `readFileSync`
2. Reads the prompt from a file using `readFileSync`
3. Imports the `@google/genai` package from its installed location (`~/.claude/tools/node_modules/@google/genai`) using `createRequire` (since the temp file is outside the tools directory and can't resolve the package normally)
4. Combines context + prompt and calls the Gemini API directly

### Working solution (step by step):

**Step 1:** Write context to a temp file:
```bash
cat file1.json > /tmp/gemini-context.txt
echo -e "\n\n--- file2.md ---\n\n" >> /tmp/gemini-context.txt
cat file2.md >> /tmp/gemini-context.txt
```

**Step 2:** Write the prompt to a temp file:
```bash
cat > /tmp/gemini-prompt.txt << 'EOF'
Your prompt here...
EOF
```

**Step 3:** Write a temp `.mjs` script:
```javascript
// /tmp/gemini-query-with-files.mjs
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { GoogleGenAI } = require('/Users/david.cogan@postman.com/.claude/tools/node_modules/@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const context = readFileSync('/tmp/gemini-context.txt', 'utf8');
const prompt = readFileSync('/tmp/gemini-prompt.txt', 'utf8');
const fullPrompt = '<context>\n' + context + '\n</context>\n\n' + prompt;

const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: 'gemini-3.1-pro-preview',
  contents: fullPrompt,
  config: { thinkingConfig: { thinkingLevel: 'high' } },
});
console.log(response.text || 'No response generated');
```

**Step 4:** Run it:
```bash
node /tmp/gemini-query-with-files.mjs
```

## Recommended Skill Updates

The skill instructions should be updated to handle file context properly. Key changes:

1. **Size check first:** Before choosing a method, check total file size with `wc -c`. If combined size is under ~100KB, the `--context` CLI arg approach is fine. If over 100KB, use the file-based approach.

2. **File-based approach as default for large content:** When files are involved, always write context to a temp file and use the file-reading wrapper script rather than trying to pass content through shell arguments or stdin.

3. **Update `gemini-query.js` itself (ideal fix):** Add a `--context-file` flag to the script that reads context from a file path instead of a CLI argument value. This would eliminate the need for the temp wrapper script entirely. Example addition:
   ```javascript
   } else if (args[i] === "--context-file" && args[i + 1]) {
     context = readFileSync(args[++i], 'utf8');
   }
   ```

4. **The `createRequire` pattern:** If running a temp `.mjs` file outside the tools directory, the `@google/genai` package won't resolve normally. The skill should know to use `createRequire(import.meta.url)` with the absolute path to the package.

## Summary

The root cause is that `gemini-query.js` only accepts context as a CLI argument string, which hits shell limits for large files. The simplest permanent fix is adding `--context-file <path>` support to `gemini-query.js`. Until then, the skill should default to the temp-file + wrapper-script approach when dealing with files over ~100KB.
