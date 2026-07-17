/**
 * Seed the file-based credential store for the demo.
 *
 * The gateway (src/gateway.ts) refuses any request without a registered customer AND a stored
 * credential for that api — even for public/no-auth APIs. So we register one demo customer with a
 * fixed anymcp key and store a dummy credential per demo api (the generated servers for public APIs
 * ignore the injected credential). For a real auth'd API, replace "public-no-auth" with the token.
 *
 * Run:  set -a; source .env; set +a; unset DATABASE_URL   # force file store
 *       npx tsx demo/seed-store.mjs
 */
import { FileCredentialStore, masterKeyFromEnv } from "../src/store.ts";

const key = masterKeyFromEnv(); // ANYMCP_MASTER_KEY (64 hex) from env
const store = new FileCredentialStore(process.env.ANYMCP_STORE_PATH || "./anymcp-store.json", key);

const ANYMCP_KEY = "ak_demo_w2mcp_2026"; // the Bearer token Claude Desktop / curl use
await store.addCustomer("demo", ANYMCP_KEY);

const APIS = ["coingecko", "frankfurter", "openmeteo", "httpbin"];
for (const api of APIS) {
  await store.putCredential("demo", api, "public-no-auth");
}

console.log(`seeded: customer=demo  key=${ANYMCP_KEY}  apis=${APIS.join(",")}`);
