/**
 * Stage 5 — GENERATE.  ApiModel  →  runnable MCP server files.
 * Deterministic (no LLM). This is what turns the spike's one-off server into a product:
 * the same generator runs for any API. Folds in the validated response shaper + verification flags.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ApiModel, Endpoint, Param } from "./model.js";

const __dir = dirname(fileURLToPath(import.meta.url));

/** Returns a map of { relativeFilePath: contents } for the generated server. */
export function generateServer(model: ApiModel): Record<string, string> {
  const slug = toSlug(model.api_name);
  const tokenEnv = toSnakeUpper(model.api_name) + "_TOKEN";
  return {
    "server.ts": serverFile(model, tokenEnv),
    "shape.ts": readFileSync(join(__dir, "templates", "shape.ts"), "utf8"),
    "INSTALL.md": installFile(model, slug, tokenEnv),
    "package.json": pkgFile(slug),
  };
}

// ── param → zod ────────────────────────────────────────────────────────────
function zodFor(p: Param): string {
  let base: string;
  const stringEnum = p.enum?.length && p.enum.every((v) => typeof v === "string");
  if (stringEnum) {
    base = `z.enum(${JSON.stringify(p.enum)} as [string, ...string[]])`;
  } else {
    switch (p.type) {
      case "string": base = "z.string()"; break;
      case "number":
      case "integer": base = "z.number()"; break;
      case "boolean": base = "z.boolean()"; break;
      case "string[]": base = "z.array(z.string())"; break;
      case "array": base = "z.array(z.record(z.any()))"; break;
      case "object": base = "z.record(z.any())"; break; // nested → open tier (phase-1-nested-params)
      default: base = "z.any()";
    }
  }
  let desc = p.description ?? "";
  if (p.example !== undefined) desc += (desc ? " " : "") + "Example: " + JSON.stringify(p.example);
  if (desc) base += `.describe(${JSON.stringify(desc)})`;
  if (!p.required) base += ".optional()";
  return base;
}

function inputShape(ep: Endpoint): string {
  const lines: string[] = [];
  for (const p of [...ep.path_params, ...ep.query_params, ...ep.body_params]) {
    lines.push(`    ${JSON.stringify(p.name)}: ${zodFor(p)},`);
  }
  if (ep.operation === "read") {
    lines.push(`    verbosity: z.enum(["compact", "full"]).optional().describe("Response detail level (default compact)."),`);
  }
  return `{\n${lines.join("\n")}\n  }`;
}

// ── one tool per endpoint ──────────────────────────────────────────────────
function toolBlock(ep: Endpoint): string {
  const pathNames = ep.path_params.map((p) => p.name);
  const queryNames = ep.query_params.map((p) => p.name);
  const reserved = [...pathNames, ...queryNames, "verbosity"];
  const writeFlag = ep.operation === "write" ? "[UNVERIFIED WRITE] " : "";
  const desc = writeFlag + (ep.summary || ep.name);
  const hasBody = ep.body_params.length > 0 || ep.method !== "GET";

  const ret =
    ep.operation === "read"
      ? `return { content: [{ type: "text", text: shapeResponse(raw, { verbosity: (args as any).verbosity, noiseFields: NOISE_FIELDS }) }] };`
      : `return { content: [{ type: "text", text: raw }] };`;

  return `server.tool(
  ${JSON.stringify(ep.name)},
  ${JSON.stringify(desc)},
  ${indent(inputShape(ep), 1)},
  async (args: any) => {
    let path = ${JSON.stringify(ep.path)};
    for (const k of ${JSON.stringify(pathNames)}) path = path.replace("{" + k + "}", encodeURIComponent(String(args[k])));
    const qs = buildQuery(args, ${JSON.stringify(queryNames)});
    const body = omit(args, ${JSON.stringify(reserved)});
    const raw = await call(${JSON.stringify(ep.method)}, path + qs${hasBody ? ", Object.keys(body).length ? body : undefined" : ""});
    ${ret}
  }
);`;
}

// ── full server file ───────────────────────────────────────────────────────
function serverFile(model: ApiModel, tokenEnv: string): string {
  const a = model.auth;
  const noAuth = a.type === "none";
  const headerName = a.header_name ?? "Authorization";
  const format = a.format ?? "Bearer {token}";
  const extra = a.extra_headers.map((h) => `      ${JSON.stringify(h.name)}: ${JSON.stringify(h.value)},`).join("\n");
  const errorMap = buildErrorMap(model);
  const noiseFields = mergeNoise(model);
  const tools = model.endpoints.map(toolBlock).join("\n\n");

  // Credential resolution: per-request (injected by the multi-tenant gateway via credentialContext)
  // OR from env (standalone single-tenant). Per-request keeps one customer's key out of a shared env.
  const authImport = noAuth ? "" : `\nimport { AsyncLocalStorage } from "node:async_hooks";`;
  const tokenBlock = noAuth
    ? `// No authentication required (public API).`
    : `export const credentialContext = new AsyncLocalStorage<string>();\n` +
      `function resolveToken(): string {\n` +
      `  const t = credentialContext.getStore() ?? process.env.${tokenEnv};\n` +
      `  if (!t) throw new Error("No credential for ${model.api_name}: set ${tokenEnv} or inject via the gateway.");\n` +
      `  return t;\n}`;
  const authHeader = noAuth ? "" : `      ${JSON.stringify(headerName)}: ${JSON.stringify(format)}.replace("{token}", resolveToken()),\n`;

  return `/**
 * ${model.api_name} MCP Server — GENERATED BY anymcp from spec-less docs. Do not hand-edit.
 * Source: ${model.api_name} API docs.  Auth: ${a.type} (confidence ${a.confidence}).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";${authImport}
import { z } from "zod";
import { shapeResponse } from "./shape.js";

const BASE_URL = ${JSON.stringify(model.base_url ?? "")};
${tokenBlock}

// Per-API response noise fields (verbose metadata) stripped from tool output by the shaper.
// From the extractor's response_noise + a small curated registry. Conservative by design.
const NOISE_FIELDS: string[] = ${JSON.stringify(noiseFields)};

const ERROR_MAP: Record<number, string> = {
${errorMap}
};

async function call(method: string, path: string, body?: unknown): Promise<string> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
${authHeader}${extra ? extra + "\n" : ""}      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(\`${model.api_name} \${res.status}: \${ERROR_MAP[res.status] ?? "error"} — \${text.slice(0, 300)}\`);
  return text;
}

function buildQuery(args: any, keys: string[]): string {
  const parts: string[] = [];
  for (const k of keys) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    for (const item of Array.isArray(v) ? v : [v]) parts.push(\`\${encodeURIComponent(k)}=\${encodeURIComponent(String(item))}\`);
  }
  return parts.length ? "?" + parts.join("&") : "";
}
function omit(args: any, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) if (!keys.includes(k) && v !== undefined) out[k] = v;
  return out;
}

export function createServer() {
  const server = new McpServer({ name: ${JSON.stringify(toSlug(model.api_name))}, version: "0.1.0" });

${tools}

  return server;
}

// Transport: stdio by default (local). MCP_TRANSPORT=http runs Streamable HTTP (hosting).
async function runStdio() {
  await createServer().connect(new StdioServerTransport());
}

async function runHttp(port: number) {
  const { createServer: createHttpServer } = await import("node:http");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const httpServer = createHttpServer(async (req: any, res: any) => {
    if (!req.url || !req.url.startsWith("/mcp")) { res.writeHead(404).end("not found"); return; }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end("stateless MCP: POST /mcp only"); return; }
    try {
      const body = await readJson(req);
      const handle = async () => {
        const server = createServer();               // fresh per request (stateless)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      };
      ${noAuth
        ? "await handle();"
        : "const cred = req.headers[\"x-anymcp-credential\"]; await (cred ? credentialContext.run(String(cred), handle) : handle()); // per-request credential injected by the gateway"}
    } catch (e) {
      if (!res.headersSent) res.writeHead(500).end(String(e));
    }
  });
  httpServer.listen(port, () => console.error(\`${toSlug(model.api_name)} MCP (Streamable HTTP) on :\${port}/mcp\`));
}

function readJson(req: any): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: any) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : undefined); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// Auto-run only when executed directly. When the gateway imports this module (ANYMCP_EMBEDDED=1)
// it drives the transport itself and injects per-request credentials via credentialContext.
if (!process.env.ANYMCP_EMBEDDED) {
  if (process.env.MCP_TRANSPORT === "http") await runHttp(Number(process.env.PORT) || 3000);
  else await runStdio();
}
`;
}

function buildErrorMap(model: ApiModel): string {
  const seen = new Map<number, string>();
  for (const ep of model.endpoints) for (const e of ep.error_codes) if (!seen.has(e.code)) seen.set(e.code, e.meaning);
  return [...seen.entries()].map(([c, m]) => `  ${c}: ${JSON.stringify(m)},`).join("\n");
}

// Small curated registry of known-safe response noise, keyed by host. Supplements the
// extractor's response_noise. Phase-2's verified library is where this gets fleshed out.
const NOISE_REGISTRY: Record<string, string[]> = {
  "api.notion.com": ["created_by", "last_edited_by", "annotations", "request_id"],
};
function mergeNoise(model: ApiModel): string[] {
  const host = (() => { try { return new URL(model.base_url ?? "").host; } catch { return ""; } })();
  return [...new Set([...(model.response_noise ?? []), ...(NOISE_REGISTRY[host] ?? [])])];
}

function installFile(model: ApiModel, slug: string, tokenEnv: string): string {
  const noAuth = model.auth.type === "none";
  const tools = model.endpoints.map((e) => `\`${slug}.${e.name}\`${e.operation === "write" ? " (write — flagged unverified)" : ""}`).join(", ");
  const envInline = noAuth ? "" : `${tokenEnv}=your_token  `;
  const envJson = noAuth ? "{}" : `{ ${JSON.stringify(tokenEnv)}: "your_token" }`;
  return `# ${slug}-mcp — install (generated by anymcp)
${noAuth ? "\n_Public API — no authentication required._\n" : ""}
\`\`\`bash
npm i @modelcontextprotocol/sdk zod
${envInline}node --loader tsx server.ts
\`\`\`

mcp.json (local / stdio):
\`\`\`json
{ "mcpServers": { ${JSON.stringify(slug)}: { "command": "node", "args": ["--loader","tsx","/path/to/server.ts"], "env": ${envJson} } } }
\`\`\`

Remote / hosted (Streamable HTTP) — agent connects to a URL instead of launching a process:
\`\`\`bash
MCP_TRANSPORT=http PORT=3000 ${envInline}node --loader tsx server.ts
# → POST http://<host>:3000/mcp   (stateless; ${noAuth ? "public API" : "single-tenant: token from env"})
\`\`\`

Tools: ${tools}
`;
}

const pkgFile = (slug: string) =>
  JSON.stringify(
    { name: `${slug}-mcp`, version: "0.1.0", type: "module", dependencies: { "@modelcontextprotocol/sdk": "^1.0.0", zod: "^3.24.0" } },
    null,
    2
  ) + "\n";

// ── helpers ────────────────────────────────────────────────────────────────
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const toSnakeUpper = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const indent = (s: string, n: number) => s.split("\n").map((l, i) => (i === 0 ? l : "  ".repeat(n) + l)).join("\n");
