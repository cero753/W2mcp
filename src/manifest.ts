/**
 * Per-server manifest — the record of WHAT a generated server was built from, so we can detect drift
 * (the source API/docs changed) and re-learn. Written next to server.ts as manifest.json at gen time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export interface Manifest {
  api_name: string;
  mode: "docs" | "openapi";
  sources: string[];        // docs URL(s) or spec URL
  source_hash: string;      // hash of the fetched source text — cheap drift signal
  endpoint_count: number;
  generated_at: string;
}

export function hashSource(text: string | string[]): string {
  const s = Array.isArray(text) ? text.join("\0") : text;
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function writeManifest(dir: string, m: Omit<Manifest, "generated_at">) {
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...m, generated_at: new Date().toISOString() }, null, 2));
}

export function readManifest(dir: string): Manifest | null {
  try { return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { return null; }
}
