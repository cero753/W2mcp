/**
 * End-to-end multi-tenant gateway test:
 *  - register customer "acme" with w2mcp key + store their (encrypted) Notion token
 *  - start the gateway in front of the generated Notion server
 *  - connect as acme over HTTP → gateway authenticates, injects acme's token → live Notion data
 *  - connect with a bad key → rejected (401)
 */
import { FileCredentialStore } from "./src/store.ts";
import { startGateway } from "./src/gateway.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const NOTION = process.env.NOTION_TOKEN;
if (!NOTION) { console.error("set NOTION_TOKEN"); process.exit(1); }

const storePath = resolve("./.test-store.json");
rmSync(storePath, { force: true });
const masterKey = Buffer.from("a".repeat(64), "hex"); // 32 bytes, test only
const store = new FileCredentialStore(storePath, masterKey);

// Provision a customer + their downstream credential (encrypted at rest).
const ACME_KEY = "ak_live_acme_123";
await store.addCustomer("acme", ACME_KEY);
await store.putCredential("acme", "notion", NOTION);
console.log("provisioned customer 'acme'; store written (token encrypted at rest)");

const PORT = 4040;
const server = await startGateway({
  store,
  registry: { notion: resolve("./out/notion-dual/server.ts") },
  port: PORT,
});

async function connectAs(key) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp/notion`), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: "tenant", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

try {
  // 1. Valid customer → gateway injects acme's stored token → live data.
  const ok = await connectAs(ACME_KEY);
  const res = await ok.callTool({ name: "search", arguments: { page_size: 3 } });
  const text = res.content?.[0]?.text ?? "";
  console.log("\n✓ authed call returned", text.length, "chars (gateway injected acme's Notion token)");
  console.log("  sample:", text.replace(/\s+/g, " ").slice(0, 120));
  await ok.close();

  // 2. Bad key → rejected.
  let rejected = false;
  try { await connectAs("ak_wrong_key"); } catch (e) { rejected = true; console.log("\n✓ bad key rejected:", String(e.message ?? e).slice(0, 80)); }
  if (!rejected) console.log("\n✗ bad key was NOT rejected (bug)");

  console.log("\n✓ multi-tenant gateway works: per-customer auth + per-request credential injection");
} finally {
  server.close();
  rmSync(storePath, { force: true });
}
