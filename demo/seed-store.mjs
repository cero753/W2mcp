/**
 * Seed the file-based credential store for the demo.
 *
 * The gateway (src/gateway.ts) refuses any request without a registered customer AND a stored
 * credential for that api — even for public/no-auth APIs. So we register one demo customer with a
 * fixed w2mcp key and store a dummy credential per demo api (the generated servers for public APIs
 * ignore the injected credential). For a real auth'd API, replace "public-no-auth" with the token.
 *
 * Run:  set -a; source .env; set +a; unset DATABASE_URL   # force file store
 *       npx tsx demo/seed-store.mjs
 */
import { FileCredentialStore, masterKeyFromEnv } from "../src/store.ts";

const key = masterKeyFromEnv(); // W2MCP_MASTER_KEY (64 hex) from env
const store = new FileCredentialStore(process.env.W2MCP_STORE_PATH || "./w2mcp-store.json", key);

const W2MCP_KEY = "ak_demo_w2mcp_2026"; // the Bearer token Claude Desktop / curl use
await store.addCustomer("demo", W2MCP_KEY);

const APIS = ["coingecko", "frankfurter", "openmeteo", "httpbin"];
for (const api of APIS) {
  await store.putCredential("demo", api, "public-no-auth");
}

console.log(`seeded: customer=demo  key=${W2MCP_KEY}  apis=${APIS.join(",")}`);
