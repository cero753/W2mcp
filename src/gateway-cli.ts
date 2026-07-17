/**
 * Production entrypoint for the hosting gateway.
 * Env:
 *   ANYMCP_MASTER_KEY   64 hex chars (openssl rand -hex 32)   — credential encryption key
 *   DATABASE_URL        Postgres conn string (Supabase/Neon)  — omit to use a local file store
 *   ANYMCP_REGISTRY     path to registry.json {api: serverPath} (default ./registry.json)
 *   PORT                listen port (default 8080)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startGateway } from "./gateway.js";
import { makeStore, masterKeyFromEnv } from "./store.js";

const registryPath = process.env.ANYMCP_REGISTRY || "./registry.json";
const raw = JSON.parse(readFileSync(registryPath, "utf8")) as Record<string, string>;
const registry = Object.fromEntries(Object.entries(raw).map(([api, p]) => [api, resolve(p)])); // → absolute
const port = Number(process.env.PORT) || 8080;

const store = await makeStore(masterKeyFromEnv());
const gw = await startGateway({ store, registry, port, registryPath: resolve(registryPath) });
console.error(`registry: ${Object.keys(registry).join(", ") || "(empty)"} | store: ${process.env.DATABASE_URL ? "postgres" : "file"}`);

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { gw.close(); process.exit(0); });
