/**
 * Verification layer — turns "generated a server" into "generated a TRUSTWORTHY server".
 * Opt-in (w2mcp verify <dir>), kept OUT of generate so generation stays pure + cred-free.
 *
 * Three HONEST statuses (never call a thing "verified" unless a real call happened):
 *   live-verified       read endpoint actually called → 2xx + non-empty   (strong proof)
 *   unverified-write    write endpoint, flagged, validated vs doc example only
 *   structurally-checked no creds / needs args we can't synthesize — guardrail, NOT proof
 * Plus failures: live-failed, structural-issue.
 *
 * Live probe is viable because the dev running w2mcp uses the API they're wiring → has its key.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseApiModel, type ApiModel, type Endpoint } from "./model.js";

export type Status = "live-verified" | "unverified-write" | "structurally-checked" | "live-failed" | "structural-issue";
export interface EndpointReport { name: string; status: Status; detail: string; }
export interface VerifyReport { api: string; tokenEnv: string; hadToken: boolean; endpoints: EndpointReport[]; summary: Record<string, number>; }

const toSnakeUpper = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function verify(dir: string): Promise<VerifyReport> {
  const model = parseApiModel(readFileSync(join(dir, "apimodel.json"), "utf8"));
  const tokenEnv = toSnakeUpper(model.api_name) + "_TOKEN";
  const token = process.env[tokenEnv] || process.env.W2MCP_TEST_TOKEN;

  const reports: EndpointReport[] = [];

  // 1. Structural + example checks (no network) — a guardrail against over-strict/broken models.
  const structural = new Map<string, EndpointReport>();
  for (const ep of model.endpoints) structural.set(ep.name, structuralCheck(model, ep));

  // 2. Live probe — when we have a token OR the API is public (no auth). Launch the real server,
  //    call safe read endpoints.
  const noAuth = model.auth.type === "none";
  let live = new Map<string, EndpointReport>();
  if (token || noAuth) {
    try {
      live = await liveProbe(dir, model, tokenEnv, token);
    } catch (e) {
      // Server failed to launch at all → everything degrades to structural.
      reports.push({ name: "(server launch)", status: "structural-issue", detail: "server failed to start: " + String((e as Error)?.message ?? e) });
    }
  }

  // 3. Merge: live result wins when present; else structural/write status.
  for (const ep of model.endpoints) {
    const s = structural.get(ep.name)!;
    if (s.status === "structural-issue") { reports.push(s); continue; }
    const l = live.get(ep.name);
    if (l) { reports.push(l); continue; }
    if (ep.operation === "write") reports.push({ name: ep.name, status: "unverified-write", detail: "write op — not live-tested; validated vs doc example only" });
    else reports.push({ name: ep.name, status: "structurally-checked", detail: (token || noAuth) ? "needs args we can't synthesize — not live-probed" : "no token — set " + tokenEnv + " to live-verify" });
  }

  const summary: Record<string, number> = {};
  for (const r of reports) summary[r.status] = (summary[r.status] ?? 0) + 1;
  return { api: model.api_name, tokenEnv, hadToken: !!token, endpoints: reports, summary };
}

function structuralCheck(model: ApiModel, ep: Endpoint): EndpointReport {
  const issues: string[] = [];
  if (!model.base_url) issues.push("base_url missing (server can't call the host)");
  if (!ep.path.startsWith("/")) issues.push(`path "${ep.path}" doesn't start with /`);
  // path params in the URL template must each have a declared param
  for (const m of ep.path.matchAll(/\{(\w+)\}/g)) {
    if (!ep.path_params.some((p) => p.name === m[1])) issues.push(`path var {${m[1]}} has no declared path_param`);
  }
  // example_request should satisfy required body params (catches under-specified models)
  if (ep.example_request && typeof ep.example_request === "object") {
    for (const p of ep.body_params) {
      if (p.required && !(p.name in (ep.example_request as object))) issues.push(`required body param "${p.name}" absent from example_request`);
    }
  }
  if (issues.length) return { name: ep.name, status: "structural-issue", detail: issues.join("; ") };
  return { name: ep.name, status: "structurally-checked", detail: "structure ok" };
}

/** Launch the generated server over MCP and call read endpoints that need no required args. */
async function liveProbe(dir: string, model: ApiModel, tokenEnv: string, token?: string): Promise<Map<string, EndpointReport>> {
  const out = new Map<string, EndpointReport>();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  if (token) env[tokenEnv] = token; // public APIs need no token
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(dir, "server.ts")],
    env,
  });
  const client = new Client({ name: "w2mcp-verify", version: "0.1.0" });
  await client.connect(transport);
  try {
    for (const ep of model.endpoints) {
      if (ep.operation === "write") continue; // never auto-call writes
      const requiredArgs = [...ep.path_params, ...ep.body_params, ...ep.query_params].filter((p) => p.required);
      if (requiredArgs.length > 0) continue; // can't synthesize valid args → leave to structural
      try {
        const res: any = await client.callTool({ name: ep.name, arguments: {} });
        const text = res?.content?.[0]?.text ?? "";
        if (res?.isError) out.set(ep.name, { name: ep.name, status: "live-failed", detail: String(text).slice(0, 200) });
        else if (!text) out.set(ep.name, { name: ep.name, status: "live-failed", detail: "empty response" });
        else out.set(ep.name, { name: ep.name, status: "live-verified", detail: `2xx, ${text.length} chars returned` });
      } catch (e) {
        out.set(ep.name, { name: ep.name, status: "live-failed", detail: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }
  } finally {
    await client.close();
  }
  return out;
}
