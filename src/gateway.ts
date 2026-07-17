/**
 * Multi-tenant hosting gateway WITH process isolation (sandboxing).
 *
 * Each API's generated server runs as its OWN subprocess (HTTP mode) — a crash, hang, or memory
 * blowup in generated code can't take down the gateway or other APIs. The gateway authenticates
 * the customer, fetches+decrypts THEIR credential, and proxies the MCP request to the right
 * subprocess, injecting the credential via the per-request `x-w2mcp-credential` header.
 *
 *   agent ─POST /mcp/<api> (Bearer <w2mcp-key>)→ gateway ─proxy +x-w2mcp-credential→ subprocess(<api>)
 *
 * (In production, run each subprocess in a container/VM with egress allow-listed to that API's host.)
 */
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Store } from "./store.js";

export interface GatewayConfig {
  store: Store;
  registry: Record<string, string>; // api name → generated server module path
  port: number;
  basePort?: number;                 // internal subprocess ports start here (default 41000)
  registryPath?: string;             // if set, re-read on a miss so APIs added at runtime host without a restart
}

interface Backend { port: number; child: ChildProcess; ready: Promise<void> }

export async function startGateway(cfg: GatewayConfig) {
  const basePort = cfg.basePort ?? 41000;
  const backends = new Map<string, Backend>();
  let nextPort = basePort;

  // Hot-reload: if an api isn't in the registry yet, re-read registry.json (APIs added by `w2mcp new`
  // or the hub's create tool at runtime become hostable without restarting the gateway).
  function resolvePath(api: string): string | undefined {
    if (cfg.registry[api]) return cfg.registry[api];
    if (cfg.registryPath) {
      try {
        const fresh = JSON.parse(readFileSync(cfg.registryPath, "utf8").replace(/^﻿/, "")) as Record<string, string>;
        for (const [k, v] of Object.entries(fresh)) if (!cfg.registry[k]) cfg.registry[k] = resolve(v);
      } catch {}
    }
    return cfg.registry[api];
  }

  function spawnBackend(api: string): Backend | null {
    const path = resolvePath(api);
    if (!path) return null;
    const port = nextPort++;
    const child = spawn(process.execPath, ["--import", "tsx", path], {
      env: { ...process.env, MCP_TRANSPORT: "http", PORT: String(port), W2MCP_EMBEDDED: "" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    const ready = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`backend ${api} did not start`)), 20000);
      child.stderr!.on("data", (d) => { if (String(d).includes("/mcp")) { clearTimeout(t); resolve(); } });
      child.on("exit", (c) => reject(new Error(`backend ${api} exited (${c})`)));
    });
    return { port, child, ready };
  }
  async function getBackend(api: string): Promise<Backend | null> {
    if (backends.has(api)) { const b = backends.get(api)!; await b.ready; return b; }
    const b = spawnBackend(api);
    if (!b) return null;
    backends.set(api, b);
    await b.ready;
    return b;
  }

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const m = req.url?.match(/^\/mcp\/([\w-]+)$/);
    if (!m) return end(res, 404, "not found");
    if (req.method !== "POST") return end(res, 405, "POST /mcp/<api> only");
    const api = m[1];

    // 1. Authenticate the customer.
    const auth = req.headers["authorization"];
    const key = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const customerId = await cfg.store.authenticate(key);
    if (!customerId) return end(res, 401, "invalid or missing w2mcp API key");

    // 2. Resolve THIS customer's credential for THIS api. A public API generated at runtime may have no
    //    stored credential yet — inject an empty string so it's callable immediately (public servers ignore it).
    const cred = (await cfg.store.getCredential(customerId, api)) ?? "";

    // 3. Ensure the sandboxed subprocess is running.
    let backend: Backend | null;
    try { backend = await getBackend(api); } catch (e) { return end(res, 502, "backend failed: " + (e as Error).message); }
    if (!backend) return end(res, 404, `no server registered for api "${api}"`);

    // 4. Proxy the request to the subprocess, injecting the credential per-request.
    const body = await readRaw(req);
    const proxyReq = httpRequest(
      { host: "127.0.0.1", port: backend.port, path: "/mcp", method: "POST",
        headers: {
          "content-type": req.headers["content-type"] ?? "application/json",
          "accept": req.headers["accept"] ?? "application/json, text/event-stream",
          "content-length": Buffer.byteLength(body),
          "x-w2mcp-credential": cred,                 // ← injected; never the customer's w2mcp key
        } },
      (proxyRes) => { res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as any); proxyRes.pipe(res); }
    );
    proxyReq.on("error", (e) => { if (!res.headersSent) end(res, 502, "proxy error: " + e.message); });
    proxyReq.end(body);
  });

  await new Promise<void>((resolve) => httpServer.listen(cfg.port, resolve));
  console.error(`w2mcp gateway on :${cfg.port}  (POST /mcp/<api>, Bearer <w2mcp-key>; subprocess-isolated)`);

  return {
    close() {
      for (const b of backends.values()) b.child.kill();
      httpServer.close();
    },
  };
}

function end(res: ServerResponse, code: number, msg: string) { res.writeHead(code, { "content-type": "text/plain" }).end(msg); }
function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
