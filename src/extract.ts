/**
 * Stage 3 — EXTRACT (the moat). Cleaned docs → validated ApiModel via an LLM.
 * Provider-pluggable: uses OpenAI if OPENAI_API_KEY is set, else Anthropic/Claude.
 * Validates with zod, retries once on invalid JSON.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { parseApiModel, type ApiModel } from "./model.js";

const SYSTEM = `You are an API documentation extractor. You convert human-written API docs into a strict, machine-readable API model. You NEVER invent endpoints, parameters, or fields. If the docs do not state something, mark it accordingly and lower confidence. You output ONLY valid JSON. Accuracy and honesty about uncertainty are the entire job.`;

const SCHEMA = `Extract an ApiModel as JSON with EXACTLY this shape:
{
  "api_name": string,
  "base_url": string | null,
  "auth": {
    "type": "none" | "bearer" | "api_key" | "oauth2" | "basic" | "unknown",   // "none" = public/no auth
    "location": "header" | "query" | null,
    "header_name": string | null,
    "format": string | null,            // e.g. "Bearer {token}" — use {token} placeholder
    "extra_headers": [{ "name": string, "value": string }],  // required version headers etc.
    "confidence": number                 // 0..1
  },
  "endpoints": [{
    "name": string,                      // snake_case tool name, e.g. "query_database"
    "summary": string,
    "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE",
    "path": string,                      // e.g. "/v1/databases/{database_id}/query"
    "operation": "read" | "write",       // write = creates/updates/deletes state
    "path_params":  [{ "name": string, "type": string, "required": boolean, "description": string }],
    "query_params": [{ "name": string, "type": string, "required": boolean, "description": string }],
    "body_params":  [{ "name": string, "type": string, "required": boolean, "description": string, "enum"?: any[], "example"?: any }],
    "example_request": object | null,
    "error_codes": [{ "code": number, "meaning": string }],
    "confidence": number,
    "notes": string
  }],
  "response_noise": [string]               // response field names that are verbose metadata
}

Rules:
- type is one of: "string","number","boolean","object","array","string[]". Use "object"/"array" for nested shapes.
- operation = "write" for anything creating/updating/deleting (these get flagged, not live-tested).
- Required version/Content headers -> auth.extra_headers.
- auth.type = "none" if the API requires NO authentication (public API, no key/token in the docs).
- If confidence in a param shape is low, keep type coarse ("object") and say so in notes.
- response_noise: from response examples in the docs, list field names that are clearly verbose
  metadata an agent rarely needs (audit fields like created_by/last_edited_by, formatting like
  annotations, request ids). BE CONSERVATIVE — never list a field that could carry real data. [] if unsure.
- Output JSON only. No prose, no markdown fences.`;

function userPrompt(docs: string, url: string, errorFeedback?: string): string {
  const repair = errorFeedback
    ? `\n\nYOUR PREVIOUS OUTPUT FAILED VALIDATION. Fix exactly these problems and output ONLY corrected JSON:\n${errorFeedback}`
    : "";
  return `Docs source: ${url}\n\n<docs>\n${docs}\n</docs>\n\n${SCHEMA}${repair}`;
}

/** Provider is chosen by which key is present: Gemini → OpenAI → Anthropic. */
interface Provider { kind: "openai-compat" | "anthropic"; apiKey?: string; baseURL?: string; model: string; }
function pickProvider(): Provider {
  const m = process.env.W2MCP_MODEL;
  if (process.env.GEMINI_API_KEY)
    return { kind: "openai-compat", apiKey: process.env.GEMINI_API_KEY, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: m || "gemini-2.5-flash" };
  if (process.env.OPENAI_API_KEY)
    return { kind: "openai-compat", apiKey: process.env.OPENAI_API_KEY, model: m || "gpt-4o" };
  return { kind: "anthropic", model: m || "claude-opus-4-8" };
}

export function describeProvider(): string {
  const p = pickProvider();
  return `${process.env.GEMINI_API_KEY ? "gemini" : p.kind === "anthropic" ? "anthropic" : "openai"}: ${p.model}`;
}

const MAX_ATTEMPTS = 3;

export async function extract(docsMarkdown: string, sourceUrl: string): Promise<ApiModel> {
  const p = pickProvider();
  const run = p.kind === "anthropic" ? anthropicExtract : (u: string) => openaiExtract(u, p);
  let feedback: string | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await run(userPrompt(docsMarkdown, sourceUrl, feedback));
    try {
      return parseApiModel(extractJson(text));
    } catch (e) {
      lastErr = e;
      // Feed the SPECIFIC failure back so the model knows what to fix (not a vague "try again").
      feedback = String((e as Error)?.message ?? e).slice(0, 1500);
      if (attempt < MAX_ATTEMPTS) console.error(`        ⟳ extract attempt ${attempt} invalid, repairing…`);
    }
  }
  throw new Error(`extract: no valid ApiModel after ${MAX_ATTEMPTS} attempts.\nLast error:\n` + String(lastErr));
}

async function openaiExtract(user: string, p: Provider): Promise<string> {
  const client = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL });
  const res = await client.chat.completions.create({
    model: p.model,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

async function anthropicExtract(user: string): Promise<string> {
  const client = new Anthropic();
  const model = process.env.W2MCP_MODEL || "claude-opus-4-8";
  const msg = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  return msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
}

/** Pull the first JSON object out of model output (tolerates stray prose or fences). */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in model output");
  return candidate.slice(start, end + 1);
}
