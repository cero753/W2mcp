/**
 * w2mcp HUB — one MCP endpoint that fronts EVERY registered API.
 *
 * Connect any agent (Claude Desktop, Cursor, MCP Inspector, `w2mcp ask`) to this ONE server and it
 * instantly sees the tools of ALL registered APIs, namespaced `<server>__<tool>`, and can call them.
 * Plus two management tools so an agent can grow its own toolbox:
 *   • w2mcp__list_servers                 — what APIs are wired in
 *   • w2mcp__create  {name, source}       — turn ANY docs URL / OpenAPI / Swagger into a new MCP and register it
 *
 * Downstream servers are the ones w2mcp generated (registry.json → server.ts). The hub spawns each as a
 * stdio subprocess via the official MCP client and proxies calls — so the hub is itself a standard MCP client
 * AND a standard MCP server. Transport: stdio by default, `MCP_TRANSPORT=http` for hosting (Streamable HTTP).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { crawlSmart } from "./crawl.js";
import { extractDocs } from "./extract.js";
import { generateServer } from "./generate.js";
import { specToApiModel } from "./openapi.js";
import YAML from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = process.env.W2MCP_REGISTRY || join(ROOT, "registry.json");
const SEP = "__"; // namespace separator — tool names must match ^[a-zA-Z0-9_-]+$, so no dots.

type Registry = Record<string, string>; // api name → generated server.ts path
function loadRegistry(): Registry {
  try { return JSON.parse(readFileSync(REGISTRY, "utf8")); } catch { return {}; }
}
function saveRegistry(r: Registry) { writeFileSync(REGISTRY, JSON.stringify(r, null, 2)); }

// ── downstream connections (one persistent stdio MCP client per registered API) ──
interface Down { client: Client; tools: any[]; }
const downstream = new Map<string, Down>();

async function connectDownstream(name: string, path: string): Promise<Down> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", resolve(ROOT, path)],
    env: { ...process.env, MCP_TRANSPORT: "", W2MCP_EMBEDDED: "" } as Record<string, string>,
  });
  const client = new Client({ name: "w2mcp-hub", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  const down = { client, tools };
  downstream.set(name, down);
  return down;
}

/** Flattened tool list: every downstream tool namespaced, plus the two management tools. */
function aggregateTools() {
  const out: any[] = [];
  for (const [name, d] of downstream) {
    for (const t of d.tools) {
      out.push({
        name: `${name}${SEP}${t.name}`,
        description: `[${name}] ${t.description || ""}`.slice(0, 400),
        inputSchema: t.inputSchema || { type: "object", properties: {} },
      });
    }
  }
  out.push({
    name: "w2mcp__list_servers",
    description: "List the APIs wired into this hub and how many tools each exposes.",
    inputSchema: { type: "object", properties: {} },
  });
  out.push({
    name: "w2mcp__create",
    description: "Turn ANY API into a new MCP and register it in this hub. Accepts HTML docs URL(s), an OpenAPI/Swagger URL, or a pasted OpenAPI/Swagger JSON/YAML. Returns the new tool names. (Reconnect to use them as native tools.)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "short id for the new server, e.g. 'stripe'" },
        source: { type: "string", description: "docs URL, OpenAPI/Swagger URL, or pasted spec text" },
      },
      required: ["name", "source"],
    },
  });
  return out;
}

// ── source → ApiModel (docs / OpenAPI / Swagger — anything) ──
function parseSpec(txt: string): any { try { return JSON.parse(txt); } catch {} try { return YAML.parse(txt); } catch {} return null; }
async function sourceToModel(source: string) {
  const t = source.trim();
  const isUrl = /^https?:\/\//i.test(t);
  // pasted spec
  if (!isUrl) { const j = parseSpec(t); if (j && (j.openapi || j.swagger)) return specToApiModel(j); throw new Error("pasted text is not an OpenAPI/Swagger spec"); }
  // spec URL
  if (/\.(json|ya?ml)(\?|$)|openapi|swagger|api-docs|\/spec/i.test(t)) {
    try { const r = await fetch(t, { headers: { Accept: "application/json, text/yaml, */*" } }); const j = parseSpec(await r.text()); if (j && (j.openapi || j.swagger)) return specToApiModel(j, t); } catch {}
  }
  // HTML docs → crawl (entry + a few related pages, to capture base_url) + LLM extract (entry-only fallback)
  const pages = await crawlSmart(t, { render: true, maxPages: 3 });
  return extractDocs(pages, t);
}

async function createServerFromSource(name: string, source: string): Promise<{ dir: string; tools: string[]; api: string }> {
  const model = await sourceToModel(source);
  const dir = join(ROOT, "out", name.replace(/[^\w-]+/g, "-"));
  mkdirSync(dir, { recursive: true });
  for (const [f, content] of Object.entries(generateServer(model))) writeFileSync(join(dir, f), content);
  const reg = loadRegistry();
  reg[name] = `./out/${name.replace(/[^\w-]+/g, "-")}/server.ts`;
  saveRegistry(reg);
  const down = await connectDownstream(name, reg[name]); // wire it in live (visible on next tools/list)
  return { dir, tools: down.tools.map((t) => `${name}${SEP}${t.name}`), api: model.api_name };
}

// ── the hub MCP server ──
function buildHub() {
  const server = new Server({ name: "w2mcp-hub", version: "0.1.0" }, { capabilities: { tools: { listChanged: true } } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: aggregateTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    if (name === "w2mcp__list_servers") {
      const rows = [...downstream.entries()].map(([n, d]) => ({ server: n, tools: d.tools.length }));
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
    if (name === "w2mcp__create") {
      const { name: newName, source } = (args ?? {}) as any;
      if (!newName || !source) return { isError: true, content: [{ type: "text", text: "need { name, source }" }] };
      try {
        const r = await createServerFromSource(newName, source);
        try { server.sendToolListChanged(); } catch {} // best-effort; clients honor this inconsistently
        return { content: [{ type: "text", text: `created "${r.api}" as '${newName}' — ${r.tools.length} tools:\n${r.tools.join("\n")}\n\n(reconnect the client to use them as native tools)` }] };
      } catch (e: any) { return { isError: true, content: [{ type: "text", text: "create failed: " + (e?.message ?? e) }] }; }
    }

    // namespaced passthrough → route to the right downstream server
    const i = name.indexOf(SEP);
    if (i < 0) return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
    const srv = name.slice(0, i), tool = name.slice(i + SEP.length);
    const d = downstream.get(srv);
    if (!d) return { isError: true, content: [{ type: "text", text: `no server '${srv}'` }] };
    try {
      const res = await d.client.callTool({ name: tool, arguments: (args ?? {}) as any });
      return res as any;
    } catch (e: any) { return { isError: true, content: [{ type: "text", text: `${srv}${SEP}${tool} failed: ${e?.message ?? e}` }] }; }
  });

  return server;
}

// ── boot: wire up every registered server, then serve ──
async function boot() {
  const reg = loadRegistry();
  const names = Object.keys(reg);
  for (const n of names) { try { await connectDownstream(n, reg[n]); console.error(`  ✓ ${n} (${downstream.get(n)!.tools.length} tools)`); } catch (e: any) { console.error(`  ✗ ${n}: ${e?.message ?? e}`); } }
  const total = [...downstream.values()].reduce((s, d) => s + d.tools.length, 0);
  const server = buildHub();

  if (process.env.MCP_TRANSPORT === "http") {
    const { createServer: createHttpServer } = await import("node:http");
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const port = Number(process.env.PORT) || 9090;
    createHttpServer(async (req: any, res: any) => {
      if (!req.url?.startsWith("/mcp")) { res.writeHead(404).end("not found"); return; }
      if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end("POST /mcp only"); return; }
      try {
        let data = ""; req.on("data", (c: any) => (data += c));
        await new Promise((r) => req.on("end", r));
        const body = data ? JSON.parse(data) : undefined;
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) { if (!res.headersSent) res.writeHead(500).end(String(e)); }
    }).listen(port, () => console.error(`w2mcp hub (Streamable HTTP) on :${port}/mcp — ${names.length} servers, ${total} tools`));
  } else {
    console.error(`w2mcp hub (stdio) — ${names.length} servers, ${total} tools`);
    await server.connect(new StdioServerTransport());
  }
}

boot().catch((e) => { console.error("hub failed: " + (e?.message ?? e)); process.exit(1); });
