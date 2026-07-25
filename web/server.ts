/**
 * w2mcp — demo web app (frontend + backend).
 *
 *   GET  /                      → the single-page product UI
 *   POST /api/generate  (SSE)   → run the real pipeline (crawl→clean→extract→generate),
 *                                 streaming stage progress, then the generated ApiModel + tools
 *   GET  /api/servers           → hosted servers available to call (from registry.json)
 *   POST /api/tools   {api}     → tools/list for a hosted server (via the gateway)
 *   POST /api/call    {api,tool,args} → tools/call live (via the gateway)
 *
 * Backend reuses the exact library the CLI uses, and proxies live calls to the running gateway
 * (localhost:8080) so the "hosted, multi-tenant, encrypted" path is the same one shown in the demo.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { crawl, crawlSmart } from "../src/crawl.js";
import { assembleSources } from "../src/clean.js";
import { extractDocs, describeProvider } from "../src/extract.js";
import { generateServer } from "../src/generate.js";
import { specToApiModel } from "../src/openapi.js";
import YAML from "yaml";

const PORT = Number(process.env.WEB_PORT || 5173);
const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8080";
const DEMO_KEY = process.env.W2MCP_DEMO_KEY || "ak_demo_w2mcp_2026";
const PUBLIC = join(import.meta.dirname, "public");
const ROOT = join(import.meta.dirname, "..");

const MIME: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

// ── helpers ──────────────────────────────────────────────────────────────────
function readBody(req: any): Promise<string> {
  return new Promise((res) => { let b = ""; req.on("data", (c: any) => (b += c)); req.on("end", () => res(b)); });
}
function slugify(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function registryServers(): string[] {
  try { return Object.keys(JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"))); } catch { return []; }
}
/** matches a generated api_name to a registered gateway server, so generate→call connects. */
function matchRegistered(apiName: string): string | null {
  const servers = registryServers();
  const s = slugify(apiName);
  return servers.find((k) => s === k || s.startsWith(k) || k.startsWith(s.split("-")[0])) ?? null;
}

/** Call the gateway (Streamable HTTP → parse the `data:` SSE frame into JSON). */
async function gateway(api: string, method: string, params?: any) {
  const r = await fetch(`${GATEWAY}/mcp/${api}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEMO_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await r.text();
  // response may be a raw JSON body or an SSE `data: {...}` frame
  const frames = text.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  const payload = frames.length ? frames[frames.length - 1] : text.trim();
  try { return JSON.parse(payload); } catch { return { error: { message: `gateway: ${text.slice(0, 200)}` } }; }
}

/** Parse spec text as JSON, falling back to YAML. null on failure. */
function parseSpec(txt: string): any {
  try { return JSON.parse(txt); } catch { try { return YAML.parse(txt); } catch { return null; } }
}
/** Detect + load an OpenAPI/Swagger spec from a URL or pasted JSON/YAML. null → not a spec. */
async function loadSpec(input: string): Promise<{ spec: any; source?: string } | null> {
  const t = input.trim();
  const isUrl = /^https?:\/\//i.test(t);
  if (!isUrl) { const j = parseSpec(t); return j && (j.openapi || j.swagger) ? { spec: j } : null; } // pasted JSON/YAML
  // only probe URLs that look spec-ish, so ordinary docs URLs aren't double-fetched
  if (!/\.(json|ya?ml)(\?|$)|openapi|swagger|api-docs|\/spec/i.test(t)) return null;
  try {
    const r = await fetch(t, { headers: { Accept: "application/json, text/yaml, */*" } });
    const txt = await r.text();
    const j = parseSpec(txt);
    if (j && (j.openapi || j.swagger)) return { spec: j, source: t };
  } catch {}
  return null;
}

// ── server ───────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  // static
  if (req.method === "GET" && (path === "/" || !path.startsWith("/api"))) {
    const file = path === "/" ? "index.html" : path.slice(1);
    const full = join(PUBLIC, file);
    if (existsSync(full)) {
      res.writeHead(200, { "Content-Type": MIME[extname(full)] || "text/plain" });
      res.end(readFileSync(full));
    } else { res.writeHead(404); res.end("not found"); }
    return;
  }

  // list hosted servers (+ their source paths, for the stdio install snippet)
  if (req.method === "GET" && path === "/api/servers") {
    let paths: Record<string, string> = {};
    try { paths = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8")); } catch {}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ servers: registryServers(), paths }));
    return;
  }

  // remove a server from the registry (management). Keeps the generated files on disk — only
  // un-registers it. NOTE: a running gateway/hub caches downstreams at boot, so this takes effect on
  // the next gateway/hub (re)start, not for a live-serving process. registry.json stays BOM-free
  // (writeFileSync on a string adds none) — a BOM would break JSON.parse across gateway/hub.
  if (req.method === "POST" && path === "/api/registry/remove") {
    const { name } = JSON.parse(await readBody(req) || "{}");
    const regPath = join(ROOT, "registry.json");
    let reg: Record<string, string> = {};
    try { reg = JSON.parse(readFileSync(regPath, "utf8")); } catch {}
    const existed = Object.prototype.hasOwnProperty.call(reg, name);
    if (existed) { delete reg[name]; writeFileSync(regPath, JSON.stringify(reg, null, 2)); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: existed, servers: Object.keys(reg), paths: reg }));
    return;
  }

  // tools/list for a hosted server
  if (req.method === "POST" && path === "/api/tools") {
    const { api } = JSON.parse(await readBody(req) || "{}");
    const out = await gateway(api, "tools/list");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools: out.result?.tools ?? [], error: out.error }));
    return;
  }

  // tools/call live
  if (req.method === "POST" && path === "/api/call") {
    const { api, tool, args } = JSON.parse(await readBody(req) || "{}");
    const out = await gateway(api, "tools/call", { name: tool, arguments: args || {} });
    let data: any = out.result?.content?.[0]?.text ?? out.result ?? out.error;
    try { data = JSON.parse(data); } catch { /* leave as text */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data, error: out.error }));
    return;
  }

  // generate (SSE) — the live pipeline
  if (req.method === "POST" && path === "/api/generate") {
    const { urls, render, follow } = JSON.parse(await readBody(req) || "{}");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    const send = (o: any) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const list: string[] = (urls || []).filter(Boolean);
      if (!list.length) { send({ stage: "error", msg: "no URL provided" }); return res.end(); }

      // ── FAST-PATH: OpenAPI / Swagger spec (deterministic, no LLM) ──
      const specHit = list.length === 1 ? await loadSpec(list[0]) : null;
      if (specHit) {
        send({ stage: "meta", mode: "openapi", stages: ["Load spec", "Convert", "Generate"], pct: 20, msg: "OpenAPI/Swagger spec detected — no LLM needed." });
        send({ stage: "Load spec", pct: 40, msg: `Loaded ${specHit.spec.openapi ? "OpenAPI " + specHit.spec.openapi : "Swagger " + specHit.spec.swagger} spec` });
        send({ stage: "Convert", pct: 70, msg: "Converting spec → ApiModel (deterministic)…" });
        const model = specToApiModel(specHit.spec, specHit.source);
        send({ stage: "Convert", pct: 82, msg: `✓ ${model.api_name}: ${model.endpoints.length} endpoints, auth=${model.auth.type}` });
        send({ stage: "Generate", pct: 92, msg: "Generating the MCP server…" });
        const files = generateServer(model);
        const outDir = join(ROOT, "demo", "_web", slugify(model.api_name) || "server");
        mkdirSync(outDir, { recursive: true });
        for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content as string);
        const tools = model.endpoints.map((e: any) => ({
          name: e.name, method: e.method, path: e.path, description: e.summary || e.description || "",
          params: [...(e.path_params || []), ...(e.query_params || []), ...(e.body_params || [])].map((p: any) => ({ name: p.name, required: !!p.required, description: p.description || "" })),
        }));
        send({
          stage: "done", pct: 100, msg: `Done — ${tools.length} tools (from spec)`, mode: "openapi",
          model: { api_name: model.api_name, base_url: model.base_url, auth: model.auth?.type, tool_count: tools.length },
          tools, files: Object.keys(files), outDir: outDir.replace(ROOT, "."), callableApi: matchRegistered(model.api_name),
        });
        return res.end();
      }

      // ── DOCS-PATH: HTML docs → LLM extract ──
      send({ stage: "meta", mode: "docs", stages: ["Crawl", "Clean", "Extract", "Generate"], pct: 5, msg: "No spec — reading the HTML docs." });
      // A single docs URL often omits base_url (it lives on an auth/intro page). When `follow` is on
      // (default), fan out to a few related same-origin pages so base_url is captured. Multiple URLs
      // or follow:false → crawl exactly what was given.
      const doFollow = follow !== false && list.length === 1;
      send({ stage: "crawl", pct: 10, msg: doFollow ? `Crawling ${list[0]} + related pages${render ? " (rendered)" : ""}…` : `Crawling ${list.length} page(s)${render ? " (rendered)" : ""}…` });
      const pages = doFollow
        ? await crawlSmart(list[0], { render: !!render, maxPages: 3 })
        : await Promise.all(list.map(async (u) => await crawl(u, { render: !!render })));
      for (const p of pages) send({ stage: "crawl", pct: 25, msg: `✓ ${p.url} (${(p.html.length / 1000) | 0} KB)` });
      const md = assembleSources(pages);
      send({ stage: "clean", pct: 40, msg: `Cleaned → ${(md.length / 1000) | 0} KB of markdown` });

      send({ stage: "extract", pct: 55, msg: `Reading the docs with ${describeProvider()}…` });
      const model = await extractDocs(pages, list[0]);
      send({ stage: "extract", pct: 80, msg: `✓ ${model.api_name}: ${model.endpoints.length} endpoints, auth=${model.auth.type}` });

      send({ stage: "generate", pct: 92, msg: "Generating the MCP server…" });
      const files = generateServer(model);
      const outDir = join(ROOT, "demo", "_web", slugify(model.api_name) || "server");
      mkdirSync(outDir, { recursive: true });
      for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content as string);

      const tools = model.endpoints.map((e: any) => ({
        name: e.name, method: e.method, path: e.path, description: e.description || "",
        params: (e.params || []).map((p: any) => ({ name: p.name, required: !!p.required, description: p.description || "" })),
      }));
      send({
        stage: "done", pct: 100, msg: `Done — ${tools.length} tools`, mode: "docs",
        model: { api_name: model.api_name, base_url: model.base_url, auth: model.auth?.type, tool_count: tools.length },
        tools, files: Object.keys(files), outDir: outDir.replace(ROOT, "."),
        callableApi: matchRegistered(model.api_name),
      });
    } catch (e: any) {
      send({ stage: "error", msg: e?.message ?? String(e) });
    }
    res.end();
    return;
  }

  res.writeHead(404); res.end("not found");
});

server.listen(PORT, () => console.error(`w2mcp web UI → http://localhost:${PORT}  (gateway: ${GATEWAY})`));
