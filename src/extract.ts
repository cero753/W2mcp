/**
 * Stage 3 — EXTRACT (the moat). Cleaned docs → validated ApiModel via an LLM.
 * Model-agnostic: talks to whatever OpenAI-compatible endpoint LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
 * point at (see llm.ts). Validates with zod, feeds the exact validation error back on retry.
 */
import { llmConfig, llmClient, describeProvider, type LlmConfig } from "./llm.js";
import { parseApiModel, type ApiModel } from "./model.js";

export { describeProvider };
import { assembleSources } from "./clean.js";
import { learnHint } from "./learn.js";

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
  // Advisory, verified-only, opt-in (W2MCP_LEARN=1). Empty otherwise — no effect on the default path.
  return `Docs source: ${url}\n\n<docs>\n${docs}\n</docs>\n\n${SCHEMA}${learnHint(url)}${repair}`;
}

const MAX_ATTEMPTS = 3;

/** Retry the model call on transient rate-limit / overload errors (429, 503) with exponential backoff. */
async function callWithBackoff(run: (u: string) => Promise<string>, prompt: string): Promise<string> {
  let delay = 2000;
  for (let i = 0; i < 4; i++) {
    try {
      return await run(prompt);
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode;
      const transient = status === 429 || status === 503 || /\b(429|503)\b|rate.?limit|quota|overloaded|too many requests/i.test(String(e?.message ?? e));
      if (!transient || i === 3) {
        if (transient) throw new Error(`model rate-limited (${status ?? "429"}) after retries — wait a minute and retry, use a spec URL (no LLM), or point LLM_API_KEY / LLM_BASE_URL / LLM_MODEL at another provider.`);
        throw e;
      }
      console.error(`        ⏳ model rate-limited (${status ?? "429"}); retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("unreachable");
}

/**
 * Extract from one or more crawled doc pages, with a safety net: if following extra pages makes the
 * model overflow/misfire, fall back to the entry page alone. This guarantees that smart-crawl's
 * page-following can only help — never turn a working single-page extract into a failure.
 */
export async function extractDocs(
  pages: Array<{ url: string; html: string }>,
  sourceUrl: string,
  opts: { followFrom?: number } = {},
): Promise<ApiModel> {
  try {
    return await extract(assembleSources(pages, opts), sourceUrl);
  } catch (e) {
    if (pages.length <= 1) throw e;
    console.error("        ↩ multi-page extract failed; retrying with the entry page only…");
    return await extract(assembleSources([pages[0]]), sourceUrl);
  }
}

export async function extract(docsMarkdown: string, sourceUrl: string): Promise<ApiModel> {
  const cfg = llmConfig(); // fails fast with a clear message if LLM_API_KEY is missing
  const run = (u: string) => openaiExtract(u, cfg);
  let feedback: string | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await callWithBackoff(run, userPrompt(docsMarkdown, sourceUrl, feedback));
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

/** Some OpenAI-compatible servers reject `response_format`; remember that per process and drop it. */
let jsonModeUnsupported = false;

async function openaiExtract(user: string, cfg: LlmConfig): Promise<string> {
  const client = llmClient(cfg);
  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: user },
  ];
  const call = (jsonMode: boolean) => client.chat.completions.create({
    model: cfg.model,
    max_tokens: 8000,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages,
  });
  try {
    const res = await call(!jsonModeUnsupported);
    return res.choices[0]?.message?.content ?? "";
  } catch (e: any) {
    // 400 mentioning response_format → endpoint doesn't support JSON mode; retry plain (extractJson tolerates prose/fences).
    if (!jsonModeUnsupported && e?.status === 400 && /response_format|json_object/i.test(String(e?.message ?? e))) {
      jsonModeUnsupported = true;
      const res = await call(false);
      return res.choices[0]?.message?.content ?? "";
    }
    throw e;
  }
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
