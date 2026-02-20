#!/usr/bin/env node

import { readFileSync } from "fs";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

// Parse CLI args
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

// Prompt from args takes priority, then --prompt-file
if (promptParts.length > 0) {
  prompt = promptParts.join(" ");
}

// If stdin is piped and we already have a prompt, treat stdin as context
// If stdin is piped and we have NO prompt, treat stdin as prompt
if (!process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdinContent = Buffer.concat(chunks).toString().trim();
  if (stdinContent) {
    if (prompt) {
      // Prompt already set via args — stdin becomes context
      context = context ? context + "\n\n" + stdinContent : stdinContent;
    } else {
      prompt = stdinContent;
    }
  }
}

if (!prompt) {
  console.error(
    "Usage: gemini-query [--model MODEL] [--context TEXT] [--context-file PATH] [--prompt-file PATH] PROMPT"
  );
  console.error(
    "       cat files... | gemini-query 'Review these files'  (stdin becomes context when prompt is provided)"
  );
  process.exit(1);
}

// Build full prompt with optional context
const fullPrompt = context
  ? `<context>\n${context}\n</context>\n\n${prompt}`
  : prompt;

const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
    config: {
      thinkingConfig: {
        thinkingLevel: "high",
      },
    },
  });

  const text = response.text || "No response generated";
  console.log(text);
} catch (error) {
  console.error(`Error from Gemini (${model}): ${error.message}`);
  process.exit(1);
}
