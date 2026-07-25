/**
 * w2mcp drift <serverDir> [--source <url>] [--fix]
 *
 * Detects DRIFT: re-derives the API model from the current source and diffs it against the baseline
 * (apimodel.json) captured when the server was generated. Reports added / removed / changed endpoints
 * and base_url/auth changes. With --fix, regenerates the server from the current source.
 *
 * Source is taken from the server's manifest.json; override with --source. Docs sources re-crawl + re-extract
 * (LLM); OpenAPI/Swagger sources reload deterministically.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseApiModel, type ApiModel, type Endpoint } from "./model.js";
import { readManifest, writeManifest, hashSource } from "./manifest.js";
import { crawl } from "./crawl.js";
import { clean } from "./clean.js";
import { extract } from "./extract.js";
import { specToApiModel } from "./openapi.js";
import { generateServer } from "./generate.js";
import YAML from "yaml";

const c = { g: (s: string) => `\x1b[32m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m` };

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith("--"));
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const doFix = argv.includes("--fix");
if (!dir) { console.error("Usage: w2mcp drift <serverDir> [--source <url>] [--fix]"); process.exit(1); }

const baseline = parseApiModel(readFileSync(join(dir, "apimodel.json"), "utf8"));
const man = readManifest(dir);
const source = flag("--source") || man?.sources?.[0];
if (!source) { console.error(c.r("no source: pass --source <url> or generate with a manifest.json")); process.exit(1); }
const mode = man?.mode || (/\.(json|ya?ml)(\?|$)|openapi|swagger|api-docs|\/spec/i.test(source) ? "openapi" : "docs");

function parseSpec(t: string): any { try { return JSON.parse(t); } catch {} try { return YAML.parse(t); } catch {} return null; }

async function deriveCurrent(): Promise<{ model: ApiModel; sourceText: string }> {
  if (mode === "openapi") {
    const txt = /^https?:/.test(source!) ? await (await fetch(source!)).text() : readFileSync(source!, "utf8");
    return { model: specToApiModel(parseSpec(txt), source), sourceText: txt };
  }
  const { html } = await crawl(source!, { render: true });
  const md = clean(html);
  return { model: await extract(md, source!), sourceText: md };
}

// Match endpoints by method+path (stable), NOT by the LLM-generated tool name (varies run-to-run).
// Path params are normalized ({database_id} → {}) so a renamed param isn't seen as a new endpoint.
function key(e: Endpoint) { return `${e.method} ${(e.path || "").replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "").toLowerCase()}`; }
function paramCount(e: Endpoint) { return (e.path_params?.length || 0) + (e.query_params?.length || 0) + (e.body_params?.length || 0); }
function label(e: Endpoint) { return `${e.name} (${e.method} ${e.path})`; }

console.error(c.dim(`comparing ${dir} against current source (${mode}: ${source})…`));
const { model: current, sourceText } = await deriveCurrent();

const oldMap = new Map(baseline.endpoints.map((e) => [key(e), e]));
const newMap = new Map(current.endpoints.map((e) => [key(e), e]));

const added = [...newMap.keys()].filter((k) => !oldMap.has(k)).map((k) => label(newMap.get(k)!));
const removed = [...oldMap.keys()].filter((k) => !newMap.has(k)).map((k) => label(oldMap.get(k)!));
const changed: string[] = [];
for (const [k, ne] of newMap) {
  const oe = oldMap.get(k);
  if (!oe) continue;
  const diffs: string[] = [];
  if (paramCount(oe) !== paramCount(ne)) diffs.push(`params ${paramCount(oe)}→${paramCount(ne)}`);
  if (oe.name !== ne.name) diffs.push(`renamed ${oe.name}→${ne.name}`);
  if (diffs.length) changed.push(`${ne.method} ${ne.path} (${diffs.join(", ")})`);
}
const baseChanged = baseline.base_url !== current.base_url;
const authChanged = baseline.auth.type !== current.auth.type;
const hashChanged = man ? man.source_hash !== hashSource(sourceText) : true;

const drifted = added.length || removed.length || changed.length || baseChanged || authChanged;

console.log(c.b(`\nDrift report — ${baseline.api_name}`));
console.log(`  source ${hashChanged ? c.y("changed") : c.g("unchanged")} · endpoints ${baseline.endpoints.length} → ${current.endpoints.length}`);
if (baseChanged) console.log(c.y(`  base_url: ${baseline.base_url} → ${current.base_url}`));
if (authChanged) console.log(c.y(`  auth: ${baseline.auth.type} → ${current.auth.type}`));
for (const a of added) console.log(c.g(`  + added   ${a}`));
for (const r of removed) console.log(c.r(`  - removed ${r}`));
for (const ch of changed) console.log(c.y(`  ~ changed ${ch}`));
if (!drifted) console.log(c.g("  ✓ no drift — the generated server still matches the source."));

if (drifted && doFix) {
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(generateServer(current))) writeFileSync(join(dir, name), content);
  writeFileSync(join(dir, "apimodel.json"), JSON.stringify(current, null, 2));
  writeManifest(dir, { api_name: current.api_name, mode, sources: [source!], source_hash: hashSource(sourceText), endpoint_count: current.endpoints.length });
  console.log(c.g(`\n  ✓ --fix: regenerated ${dir} from the current source (${current.endpoints.length} tools).`));
}

// Set the code and let node drain (avoids a libuv teardown assertion from forcing exit while
// the render browser's handles are still closing).
process.exitCode = drifted ? 1 : 0;
