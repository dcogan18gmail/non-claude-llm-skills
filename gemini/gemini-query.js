#!/usr/bin/env node

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
const promptParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model" && args[i + 1]) {
    model = args[++i];
  } else if (args[i] === "--context" && args[i + 1]) {
    context = args[++i];
  } else {
    promptParts.push(args[i]);
  }
}

// Read from stdin if no prompt args and stdin is piped
let prompt = promptParts.join(" ");
if (!prompt && !process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  prompt = Buffer.concat(chunks).toString().trim();
}

if (!prompt) {
  console.error("Usage: gemini-query [--model MODEL] [--context CONTEXT] PROMPT");
  console.error("       echo PROMPT | gemini-query [--model MODEL] [--context CONTEXT]");
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
