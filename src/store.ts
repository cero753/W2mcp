/**
 * Credential store for the hosted gateway. We hold customers' downstream API keys, so they are
 * ENCRYPTED AT REST (AES-256-GCM, app-layer) and customer auth keys stored only as SHA-256 hashes.
 *
 * Two backends behind one async interface:
 *   FileCredentialStore  — local/dev (JSON file)
 *   PgCredentialStore    — production (Postgres: Supabase / Neon / any). App-layer encryption still
 *                          applies, so the DB only ever sees ciphertext.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface Sealed { iv: string; tag: string; ct: string }
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function seal(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}
function open(key: Buffer, s: Sealed): string {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.ct, "base64")), d.final()]).toString("utf8");
}

export interface Store {
  addCustomer(customerId: string, apiKey: string): Promise<void>;
  authenticate(apiKey: string): Promise<string | null>;
  putCredential(customerId: string, api: string, secret: string): Promise<void>;
  getCredential(customerId: string, api: string): Promise<string | null>;
}

// ── File backend (local/dev) ────────────────────────────────────────────────
interface FileData { customers: Record<string, string>; credentials: Record<string, Sealed> }

export class FileCredentialStore implements Store {
  private data: FileData;
  constructor(private path: string, private key: Buffer) {
    if (key.length !== 32) throw new Error("master key must be 32 bytes (ANYMCP_MASTER_KEY = 64 hex chars).");
    this.data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { customers: {}, credentials: {} };
  }
  private save() { writeFileSync(this.path, JSON.stringify(this.data, null, 2)); }

  async addCustomer(customerId: string, apiKey: string) { this.data.customers[sha256(apiKey)] = customerId; this.save(); }
  async authenticate(apiKey: string): Promise<string | null> {
    if (!apiKey) return null;
    const h = sha256(apiKey);
    for (const [stored, id] of Object.entries(this.data.customers))
      if (stored.length === h.length && timingSafeEqual(Buffer.from(stored), Buffer.from(h))) return id;
    return null;
  }
  async putCredential(customerId: string, api: string, secret: string) { this.data.credentials[`${customerId}::${api}`] = seal(this.key, secret); this.save(); }
  async getCredential(customerId: string, api: string): Promise<string | null> {
    const s = this.data.credentials[`${customerId}::${api}`];
    return s ? open(this.key, s) : null;
  }
}

// ── Postgres backend (production: Supabase / Neon / any) ─────────────────────
export class PgCredentialStore implements Store {
  private constructor(private pool: any, private key: Buffer) {}

  static async create(connectionString: string, key: Buffer): Promise<PgCredentialStore> {
    if (key.length !== 32) throw new Error("master key must be 32 bytes (ANYMCP_MASTER_KEY = 64 hex chars).");
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anymcp_customers (api_key_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS anymcp_credentials (customer_id TEXT NOT NULL, api TEXT NOT NULL, sealed JSONB NOT NULL, PRIMARY KEY (customer_id, api));
    `);
    return new PgCredentialStore(pool, key);
  }

  async addCustomer(customerId: string, apiKey: string) {
    await this.pool.query(
      `INSERT INTO anymcp_customers (api_key_hash, customer_id) VALUES ($1,$2) ON CONFLICT (api_key_hash) DO UPDATE SET customer_id=$2`,
      [sha256(apiKey), customerId]);
  }
  async authenticate(apiKey: string): Promise<string | null> {
    if (!apiKey) return null;
    const r = await this.pool.query(`SELECT customer_id FROM anymcp_customers WHERE api_key_hash=$1`, [sha256(apiKey)]);
    return r.rows[0]?.customer_id ?? null;
  }
  async putCredential(customerId: string, api: string, secret: string) {
    await this.pool.query(
      `INSERT INTO anymcp_credentials (customer_id, api, sealed) VALUES ($1,$2,$3)
       ON CONFLICT (customer_id, api) DO UPDATE SET sealed=$3`,
      [customerId, api, JSON.stringify(seal(this.key, secret))]);
  }
  async getCredential(customerId: string, api: string): Promise<string | null> {
    const r = await this.pool.query(`SELECT sealed FROM anymcp_credentials WHERE customer_id=$1 AND api=$2`, [customerId, api]);
    return r.rows[0] ? open(this.key, r.rows[0].sealed) : null;
  }
}

/** Factory: Postgres if DATABASE_URL is set (Supabase/Neon), else a local file store. */
export async function makeStore(key: Buffer): Promise<Store> {
  if (process.env.DATABASE_URL) return PgCredentialStore.create(process.env.DATABASE_URL, key);
  return new FileCredentialStore(process.env.ANYMCP_STORE_PATH || "./anymcp-store.json", key);
}

/** Master key from env (64 hex chars). Generate with: openssl rand -hex 32 */
export function masterKeyFromEnv(): Buffer {
  const hex = process.env.ANYMCP_MASTER_KEY;
  if (!hex) throw new Error("set ANYMCP_MASTER_KEY to 64 hex chars (openssl rand -hex 32)");
  return Buffer.from(hex, "hex");
}
