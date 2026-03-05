#!/bin/bash
# Deploy skills and tools from this repo to ~/.claude/ (user-level Claude Code config)

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DEST="$HOME/.claude/skills"
TOOLS_DEST="$HOME/.claude/tools"

# Deploy skills
for skill_dir in "$REPO_DIR"/skills/*/; do
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$SKILLS_DEST/$skill_name"
    cp "$skill_dir"SKILL.md "$SKILLS_DEST/$skill_name/SKILL.md"
    echo "Deployed skill: $skill_name"
done

# Deploy gemini tool (query script + deps)
if [ -d "$REPO_DIR/gemini" ]; then
    mkdir -p "$TOOLS_DEST"
    cp "$REPO_DIR/gemini/gemini-query.js" "$TOOLS_DEST/gemini-query.js"
    cp "$REPO_DIR/gemini/package.json" "$TOOLS_DEST/package.json"
    # Only run npm install if node_modules is missing or package.json changed
    if [ ! -d "$TOOLS_DEST/node_modules" ] || ! diff -q "$REPO_DIR/gemini/package.json" "$TOOLS_DEST/package.json" > /dev/null 2>&1; then
        (cd "$TOOLS_DEST" && npm install --silent)
    fi
    echo "Deployed tool: gemini-query.js"
fi

echo "Done. All skills and tools deployed to ~/.claude/"
