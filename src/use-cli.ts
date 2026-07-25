/**
 * w2mcp client CLI — list and call the tools of a generated MCP server, straight from a terminal.
 * No Claude Code, no browser, no desktop app. Two modes:
 *
 *   Local (stdio) — spawns a freshly-generated server.ts directly via the official MCP client.
 *                   Works for ANY server you just generated (no registry, no gateway, no seeding).
 *       w2mcp tools --dir ./out/myapi
 *       w2mcp call  --dir ./out/myapi <tool> key=value ...
 *
 *   Hosted (gateway) — talks to the multi-tenant gateway; credential injected server-side.
 *       w2mcp servers
 *       w2mcp tools coingecko
 *       w2mcp call  coingecko <tool> ids=bitcoin,ethereum vs_currencies=usd
 *
 * Env: W2MCP_GATEWAY (default http://localhost:8080), W2MCP_KEY (default demo key).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { crawl, crawlSmart } from "./crawl.js";
import { assembleSources } from "./clean.js";
import { extractDocs, describeProvider } from "./extract.js";
import { generateServer } from "./generate.js";
import { writeManifest, hashSource } from "./manifest.js";
import OpenAI from "openai";

const GATEWAY = process.env.W2MCP_GATEWAY || "http://localhost:8080";
const KEY = process.env.W2MCP_KEY || "ak_demo_w2mcp_2026";

// ── small helpers ────────────────────────────────────────────────────────────
const c = { dim: (s: string) => `\x1b[2m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`,
  g: (s: string) => `\x1b[32m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m` };

/** Coerce a `key=value` CLI arg. true/false → bool, plain number → number, else string (comma-lists stay strings). */
function coerce(v: string): any {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function parseArgs(pairs: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const p of pairs) {
    const i = p.indexOf("=");
    if (i < 0) { console.error(c.r(`  ignoring "${p}" — expected key=value`)); continue; }
    out[p.slice(0, i)] = coerce(p.slice(i + 1));
  }
  return out;
}
function extractText(res: any): string {
  const content = res?.content ?? res?.result?.content ?? [];
  return Array.isArray(content) ? content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") : "";
}
function printResult(res: any) {
  const text = extractText(res);
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
  catch { console.log(text || JSON.stringify(res, null, 2)); }
}
/** JSON Schema → a shape the openai-compat function-calling accepts (object with properties; no exotic keywords). */
function sanitizeSchema(s: any): any {
  if (!s || typeof s !== "object" || s.type !== "object") return { type: "object", properties: {} };
  return { type: "object", properties: s.properties ?? {}, ...(Array.isArray(s.required) ? { required: s.required } : {}) };
}
/** One interface over local-stdio, the hub, and hosted-gateway so `ask` doesn't branch per call. */
interface Runner { list(): Promise<any[]>; call(name: string, args: any): Promise<any>; }
async function withRunner<T>(dir: string | undefined, hosted: string | null, hub: boolean, fn: (r: Runner) => Promise<T>): Promise<T> {
  if (hub || dir) {
    const file = hub ? resolve(process.cwd(), "src/hub.ts") : serverPath(dir!);
    return withStdioFile(file, (cl) => fn({ list: async () => (await cl.listTools()).tools, call: (n, a) => cl.callTool({ name: n, arguments: a }) }));
  }
  const server = hosted!;
  return fn({ list: async () => (await gatewayCall(server, "tools/list")).tools, call: (n, a) => gatewayCall(server, "tools/call", { name: n, arguments: a }) });
}

// ── local (stdio) mode: official MCP client spawns the generated server ────────
function serverPath(dir: string): string {
  const d = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  return join(d, "server.ts");
}
function withStdio<T>(dir: string, fn: (client: Client) => Promise<T>): Promise<T> { return withStdioFile(serverPath(dir), fn); }
async function withStdioFile<T>(serverFile: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", serverFile],
    env: { ...process.env, MCP_TRANSPORT: "", W2MCP_EMBEDDED: "" } as Record<string, string>,
  });
  const client = new Client({ name: "w2mcp-cli", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}

// ── hosted (gateway) mode: raw Streamable-HTTP JSON-RPC (stateless, like the proven curl) ──
async function gatewayCall(server: string, method: string, params?: any): Promise<any> {
  const res = await fetch(`${GATEWAY}/mcp/${server}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`gateway ${res.status}: ${raw.slice(0, 200)}`);
  // Response may be SSE (event: message\ndata: {...}) or plain JSON.
  const dataLines = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.replace(/^data:\s*/, "")).join("");
  const json = JSON.parse(dataLines || raw);
  if (json.error) throw new Error(`${json.error.message} (${json.error.code})`);
  return json.result;
}

function registryNames(): string[] {
  try { return Object.keys(JSON.parse(readFileSync(resolve(process.cwd(), "registry.json"), "utf8"))); }
  catch { return []; }
}

// ── commands ───────────────────────────────────────────────────────────────
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const dir = flag(argv, "--dir");
  const hub = argv.includes("--hub");
  const rest = argv.slice(1).filter((a, i, arr) => a !== "--dir" && a !== "--hub" && arr[i - 1] !== "--dir");

  if (cmd === "new") {
    // Generate a server from ANY docs URL(s), then immediately list its tools — the live brand-new-API flow.
    // Render ON by default (JS-rendered docs are common); --no-render to disable. Pass multiple URLs so the
    // base URL (often on the intro/auth page, not the endpoint page) is captured.
    const noRender = argv.includes("--no-render");
    const noFollow = argv.includes("--no-follow");
    const urls = rest.filter((a) => /^https?:\/\//.test(a));
    const outDir = dir || `./out/${(urls[0] || "server").replace(/^https?:\/\//, "").replace(/[^\w]+/g, "-").slice(0, 40)}`;
    if (!urls.length) { console.error(c.r("usage: w2mcp new <docs-url> [<more-urls>...] [--dir <out>] [--no-render] [--no-follow]")); process.exit(1); }
    // Single URL: auto-follow a few related pages so base_url (often on a separate auth/intro page)
    // is captured — unless --no-follow. Multiple URLs: crawl exactly what was given.
    const doFollow = !noFollow && urls.length === 1;
    console.error(c.dim(`[1/4] crawl   ${doFollow ? "+ related pages" : `${urls.length} page(s)`}${noRender ? "" : " (render)"}`));
    const pages = doFollow
      ? await crawlSmart(urls[0], { render: !noRender, maxPages: 3 })
      : await Promise.all(urls.map((u) => crawl(u, { render: !noRender })));
    for (const p of pages) console.error(c.dim(`      ✓ ${p.url} (${p.html.length} bytes)`));
    console.error(c.dim(`[2/4] clean   → markdown`));
    console.error(c.dim(`[3/4] extract → ApiModel (${describeProvider()})`));
    // Only auto-followed pages get budget-truncated; explicit multi-URL inputs are all primary.
    const followFrom = doFollow ? 1 : pages.length;
    const md = assembleSources(pages, { followFrom }); // for the drift baseline hash
    const model = await extractDocs(pages, urls[0], { followFrom });
    console.error(c.dim(`      → ${model.api_name}: ${model.endpoints.length} endpoints, auth=${model.auth.type}, base=${model.base_url ?? c.r("(none!)")}`));
    console.error(c.dim(`[4/4] generate → ${outDir}`));
    mkdirSync(outDir, { recursive: true });
    for (const [name, content] of Object.entries(generateServer(model))) writeFileSync(join(outDir, name), content);
    writeFileSync(join(outDir, "apimodel.json"), JSON.stringify(model, null, 2));
    writeManifest(outDir, { api_name: model.api_name, mode: "docs", sources: urls, source_hash: hashSource(md), endpoint_count: model.endpoints.length });
    console.log(c.g(`\n✓ ${model.api_name} — ${model.endpoints.length}-tool MCP server → ${outDir}`));
    const tools = await withStdio(outDir, async (cl) => (await cl.listTools()).tools);
    console.log(c.b(`\n${tools.length} tools ready:`));
    for (const t of tools) console.log(`  ${c.g(t.name)}${t.description ? "  " + c.dim(String(t.description).split("\n")[0].slice(0, 70)) : ""}`);
    console.log(c.dim(`\nnow call one:  w2mcp call --dir ${outDir} <tool> key=value ...`));
    return;
  }

  if (cmd === "servers") {
    const names = registryNames();
    console.log(c.b("hosted servers (registry.json):"));
    for (const n of names) console.log(`  ${c.g(n)}   ${c.dim(`w2mcp tools ${n}`)}`);
    console.log(c.dim(`\ngateway ${GATEWAY} · key ${KEY.slice(0, 12)}…`));
    console.log(c.dim(`local:  w2mcp tools --dir ./out/<yourapi>`));
    return;
  }

  if (cmd === "tools") {
    const tools = dir
      ? await withStdio(dir, async (cl) => (await cl.listTools()).tools)
      : (await gatewayCall(rest[0], "tools/list")).tools;
    const where = dir ? `local · ${dir}` : `hosted · ${rest[0]}`;
    console.log(c.b(`${tools.length} tools  `) + c.dim(where));
    for (const t of tools) {
      console.log(`  ${c.g(t.name)}`);
      if (t.description) console.log(`    ${c.dim(String(t.description).split("\n")[0].slice(0, 100))}`);
    }
    return;
  }

  if (cmd === "ask") {
    // Terminal agent: an LLM reads the server's tools, calls the right one(s), and answers in plain language.
    // NOTE (demo): this is your-model-driving-your-server — a convenience, NOT proof of standard MCP interop.
    // For interop proof use MCP Inspector or Cursor. Keep `w2mcp call` as the instant fallback if this stalls.
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      console.error(c.r("w2mcp ask needs GEMINI_API_KEY or OPENAI_API_KEY (openai-compat). Falling back: use `w2mcp call`.")); process.exit(1);
    }
    const question = rest[0];
    const hosted = (hub || dir) ? null : rest[1];
    if (!question) { console.error(c.r('usage: w2mcp ask "<question>" <server>   |   w2mcp ask "<question>" --dir <dir>   |   w2mcp ask "<question>" --hub')); process.exit(1); }
    const gemini = !!process.env.GEMINI_API_KEY;
    const llm = new OpenAI({ apiKey: (gemini ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)!, baseURL: gemini ? "https://generativelanguage.googleapis.com/v1beta/openai/" : undefined });
    const llmModel = process.env.W2MCP_MODEL || (gemini ? "gemini-2.5-flash" : "gpt-4o");

    await withRunner(dir, hosted, hub, async (run) => {
      const tools = await run.list();
      const oaiTools = tools.map((t: any) => ({ type: "function" as const, function: { name: t.name, description: String(t.description || "").slice(0, 300), parameters: sanitizeSchema(t.inputSchema) } }));
      console.error(c.dim(`→ agent (${llmModel}) has ${tools.length} tools from ${hub ? "the hub" : dir ? dir : hosted}`));
      const messages: any[] = [
        { role: "system", content: "You are an agent with access to tools from an API. Use them to answer the user. Call tools with correct arguments; then answer concisely from the results." },
        { role: "user", content: question },
      ];
      for (let turn = 0; turn < 5; turn++) {
        const resp = await llm.chat.completions.create({ model: llmModel, messages, tools: oaiTools, tool_choice: "auto" });
        const msg = resp.choices[0].message;
        messages.push(msg);
        const calls = (msg.tool_calls || []).filter((t: any) => t.type === "function") as any[];
        if (!calls.length) { console.log("\n" + c.b("answer: ") + (msg.content || "(no answer)")); return; }
        for (const tc of calls) {
          const name = tc.function.name;
          let a: any = {}; try { a = JSON.parse(tc.function.arguments || "{}"); } catch {}
          console.error(c.dim(`  ⚙ ${c.g(name)}(${JSON.stringify(a)})`));
          let out: string;
          try { out = extractText(await run.call(name, a)); } catch (e: any) { out = "ERROR: " + (e?.message ?? e); }
          messages.push({ role: "tool", tool_call_id: tc.id, content: out.slice(0, 4000) });
        }
      }
      console.log("\n" + c.y("agent hit the turn cap — try `w2mcp call` directly."));
    });
    return;
  }

  if (cmd === "call") {
    const tool = dir ? rest[0] : rest[1];
    const argPairs = dir ? rest.slice(1) : rest.slice(2);
    const toolArgs = parseArgs(argPairs);
    const target = dir ? `local · ${dir}` : `hosted · ${rest[0]}`;
    console.error(c.dim(`→ calling ${c.b(tool)} on ${target}  ${JSON.stringify(toolArgs)}`));
    const res = dir
      ? await withStdio(dir, (cl) => cl.callTool({ name: tool, arguments: toolArgs }))
      : await gatewayCall(rest[0], "tools/call", { name: tool, arguments: toolArgs });
    printResult(res);
    return;
  }

  console.log(`w2mcp — generate and use MCP servers from your terminal

  ${c.b("w2mcp new <docs-url> [more-urls...]")}     generate a server from ANY API docs, then list its tools
                                          (render ON by default; --no-render to disable; --dir <out>)

  ${c.b("w2mcp servers")}                          list hosted servers
  ${c.b("w2mcp tools <server>")}                   list a hosted server's tools
  ${c.b("w2mcp call <server> <tool> k=v ...")}     call a hosted tool (via gateway)

  ${c.b("w2mcp tools --dir <dir>")}                list tools of a freshly-generated server (stdio)
  ${c.b("w2mcp call --dir <dir> <tool> k=v ...")}  call it directly — no gateway, no Claude Code

  ${c.b('w2mcp ask "<question>" <server>')}        let an LLM agent answer by calling the tools
  ${c.b('w2mcp ask "<question>" --dir <dir>')}     (same, against a local generated server)
  ${c.b('w2mcp ask "<question>" --hub')}           (same, but the agent gets EVERY API via the hub)

env: W2MCP_GATEWAY (${GATEWAY}) · W2MCP_KEY · GEMINI_API_KEY (for ask)`);
}

main().catch((e) => { console.error(c.r("✗ " + (e?.message ?? e))); process.exit(1); });
