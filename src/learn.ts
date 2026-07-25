/**
 * Self-improving knowledge cache (guardrailed). w2mcp accumulates VERIFIED facts per API host and
 * reuses them to make future extractions of the same/similar API more accurate.
 *
 * Guardrails (deliberate — this feeds the LLM extraction hot-path):
 *   1. OFF by default. Everything here no-ops unless W2MCP_LEARN=1  (kill switch, no redeploy needed).
 *   2. WRITE only from live-verified generations (recordLearning is called by `verify` after a real 2xx).
 *   3. Hints are ADVISORY — injected as "previously verified, trust the docs if they disagree", never as
 *      an override. The OpenAPI/Swagger spec path never consults this (it's deterministic — must stay pure).
 *   4. Host-keyed cache of concrete facts (base_url, auth), NOT a model/weights. Honest name: knowledge cache.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const enabled = () => process.env.W2MCP_LEARN === "1";
const storePath = () => process.env.W2MCP_LEARN_PATH || resolve(process.cwd(), "w2mcp-learnings.json");

export interface HostLearning {
  base_url?: string | null;
  auth_type?: string;
  auth_location?: string | null;
  auth_header?: string | null;
  endpoints?: string[];
  verified_count: number;
  updated: string;
}
interface LearnStore { hosts: Record<string, HostLearning>; }

function hostOf(url: string): string | null { try { return new URL(url).host; } catch { return null; } }
function load(): LearnStore { try { return JSON.parse(readFileSync(storePath(), "utf8")); } catch { return { hosts: {} }; } }
function save(s: LearnStore) { writeFileSync(storePath(), JSON.stringify(s, null, 2)); }

/** Advisory hint block for the extract prompt. Empty unless learning is ON and we have prior knowledge for this host. */
export function learnHint(sourceUrl: string): string {
  if (!enabled()) return "";
  const host = hostOf(sourceUrl);
  if (!host) return "";
  const h = load().hosts[host];
  if (!h) return "";
  const bits: string[] = [];
  if (h.base_url) bits.push(`base_url is very likely "${h.base_url}"`);
  if (h.auth_type) bits.push(`auth.type is likely "${h.auth_type}"${h.auth_location ? ` (in ${h.auth_location}${h.auth_header ? `, header "${h.auth_header}"` : ""})` : ""}`);
  if (!bits.length) return "";
  return `\n\nPREVIOUSLY VERIFIED knowledge for host "${host}" (advisory — if the docs clearly disagree, trust the docs):\n- ${bits.join("\n- ")}`;
}

/** Record verified facts for a host. Call ONLY after a live-verified generation. No-op unless learning is ON. */
export function recordLearning(sourceUrl: string, model: { base_url?: string | null; auth?: any; endpoints?: any[] }): string | null {
  if (!enabled()) return null;
  const host = hostOf(sourceUrl);
  if (!host) return null;
  const s = load();
  const prev = s.hosts[host] || { verified_count: 0, updated: "" };
  s.hosts[host] = {
    base_url: model.base_url ?? prev.base_url,
    auth_type: model.auth?.type ?? prev.auth_type,
    auth_location: model.auth?.location ?? prev.auth_location,
    auth_header: model.auth?.header_name ?? prev.auth_header,
    endpoints: (model.endpoints || []).map((e: any) => e.name),
    verified_count: prev.verified_count + 1,
    updated: new Date().toISOString(),
  };
  save(s);
  return host;
}

export function isLearningOn() { return enabled(); }
