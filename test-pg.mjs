/**
 * Live test for PgCredentialStore against your Supabase/Neon DATABASE_URL.
 * Run: node --env-file=.env --import tsx test-pg.mjs
 * Proves: table creation, encrypted round-trip, customer auth — all against real Postgres.
 */
import { PgCredentialStore } from "./src/store.ts";

const url = process.env.DATABASE_URL;
const keyHex = process.env.W2MCP_MASTER_KEY;
if (!url || url.includes("PASTE")) { console.error("Set DATABASE_URL in .env first (it still has the placeholder)."); process.exit(1); }
if (!keyHex) { console.error("W2MCP_MASTER_KEY missing from .env"); process.exit(1); }

console.log("connecting to Postgres:", url.replace(/:[^:@/]+@/, ":***@"));
const store = await PgCredentialStore.create(url, Buffer.from(keyHex, "hex"));
console.log("✓ connected + tables ensured");

await store.addCustomer("acme-pg", "ak_pg_test_key");
await store.putCredential("acme-pg", "notion", "downstream-secret-xyz");

const id = await store.authenticate("ak_pg_test_key");
const cred = await store.getCredential("acme-pg", "notion");
const bad = await store.authenticate("wrong-key");

console.log("authenticate(valid)   →", id, id === "acme-pg" ? "✓" : "✗");
console.log("getCredential decrypt →", cred === "downstream-secret-xyz" ? "✓ round-trip ok (AES-GCM)" : "✗ mismatch: " + cred);
console.log("authenticate(bad)     →", bad, bad === null ? "✓ rejected" : "✗ should be null");
console.log(id === "acme-pg" && cred === "downstream-secret-xyz" && bad === null ? "\n✓ PgCredentialStore works against live Postgres" : "\n✗ something is off");
process.exit(0);
