/**
 * The ONE LLM configuration for w2mcp. Any OpenAI-compatible chat-completions endpoint works:
 *
 *   LLM_API_KEY    required — your key for the endpoint below
 *   LLM_BASE_URL   optional — default https://api.openai.com/v1
 *                  e.g. Gemini      https://generativelanguage.googleapis.com/v1beta/openai/
 *                       OpenRouter  https://openrouter.ai/api/v1
 *                       Groq        https://api.groq.com/openai/v1
 *                       Ollama      http://localhost:11434/v1  (key can be any non-empty string)
 *   LLM_MODEL      optional — default gpt-4o-mini
 *
 * `w2mcp init` writes these into `.env`; `env.ts` loads that file automatically.
 */
import "./env.js";
import OpenAI from "openai";

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-4o-mini";

export interface LlmConfig { apiKey: string; baseURL: string; model: string; }

/** Read the config from env. Throws a short, actionable error when the key is missing. */
export function llmConfig(): LlmConfig {
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Run `w2mcp init` (or put LLM_API_KEY / LLM_BASE_URL / LLM_MODEL in .env). " +
      "Any OpenAI-compatible endpoint works — see .env.example.",
    );
  }
  const baseURL = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "") + "/";
  const model = (process.env.LLM_MODEL || DEFAULT_MODEL).trim();
  return { apiKey, baseURL, model };
}

export function llmClient(cfg: LlmConfig = llmConfig()): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
}

/** Human-readable "where + which model" for progress lines. Never throws (used before the key check). */
export function describeProvider(): string {
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  let host = "api.openai.com";
  try { host = new URL(process.env.LLM_BASE_URL || DEFAULT_BASE_URL).host; } catch { /* keep default */ }
  return `${host} · ${model}`;
}
