# Deploying the w2mcp hosting gateway

This deploys **`src/gateway-cli.ts`** — the multi-tenant gateway that fronts every server in
`registry.json`, authenticates customers by Bearer key, and injects each customer's decrypted
downstream credential per request. Once it's on a public URL, any MCP client (Claude Desktop,
Cursor, an agent) connects with just a URL + API key.

> **Status: scaffolded, not yet deployed.** Everything below is ready, but the final step needs
> **your** cloud account — I can't log into Render/Railway/Fly for you. Pick a path and run it.

---

## What you need first

1. A **GitHub repo** with this code (already: `github.com/cero753/anymcp`).
2. A **master key** for credential encryption: `openssl rand -hex 32` → 64 hex chars. Keep it secret.
3. *(Recommended for real use)* a **Postgres URL** (Supabase or Neon free tier). Without it the
   gateway uses an in-image **file store, which is ephemeral** — wiped on every redeploy/restart.

---

## Option A — Render (no CLI, browser only) ⭐ recommended

`render.yaml` (repo root) is a Blueprint; Render builds from the `Dockerfile`.

1. Push to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. Render reads `render.yaml`.
3. When prompted, set the two secrets:
   - `W2MCP_MASTER_KEY` = your 64-hex key
   - `DATABASE_URL` = your Postgres URL (leave blank to use the ephemeral file store)
4. Create → wait for build. Health check is `GET /healthz`.
5. Your gateway is at `https://w2mcp-gateway.onrender.com` → base path `POST /mcp/<api>`.

## Option B — Railway (no CLI, browser only)

Railway auto-detects the `Dockerfile`.
1. railway.app → **New Project → Deploy from GitHub repo** → this repo.
2. **Variables** tab: `PORT=8080`, `W2MCP_REGISTRY=./registry.json`, `W2MCP_MASTER_KEY=…`, `DATABASE_URL=…`.
3. Deploy → grab the generated domain. Health path `/healthz`.

## Option C — Fly.io (CLI)

`fly.toml` is present. Note: your Fly login was broken previously — fix that first.
```bash
fly launch --no-deploy                                  # creates the app (keeps this fly.toml)
fly secrets set W2MCP_MASTER_KEY=$(openssl rand -hex 32)
fly secrets set DATABASE_URL="postgres://…"             # optional
fly deploy
```
`fly.toml` currently pins `min_machines_running = 1` (left over from demo day). For cheap idle,
set it back to `0` for scale-to-zero once you're past demos.

---

## Environment variables

| Var                | Required | Meaning |
|--------------------|----------|---------|
| `W2MCP_MASTER_KEY` | **yes**  | 64 hex chars. Encrypts stored credentials (AES-256-GCM). |
| `DATABASE_URL`     | no       | Postgres conn string. Omit → ephemeral file store (dev only). |
| `W2MCP_REGISTRY`   | no       | Path to `registry.json` (default `./registry.json`). |
| `PORT`             | no       | Listen port (default 8080). Platforms set this for you. |

## After it's up: register a customer + credentials

The gateway refuses any request without a registered customer **and** a stored credential for the
api. Seed one (adapt `demo/seed-store.mjs` — point `W2MCP_STORE_PATH`/`DATABASE_URL` at prod, set a
real Bearer key and real downstream tokens):

```bash
W2MCP_MASTER_KEY=… DATABASE_URL=… npx tsx demo/seed-store.mjs
```

Then any client connects:
```jsonc
{ "mcpServers": { "coingecko": {
  "url": "https://<your-domain>/mcp/coingecko",
  "headers": { "Authorization": "Bearer <that-key>" } } } }
```

## Notes / gotchas

- **`tsx` is a runtime dependency** (moved out of devDependencies) — the container runs `npx tsx`.
  The Dockerfile also uses `npm ci --include=dev` so a `NODE_ENV=production` platform can't drop it.
- **Generated servers ship in the image.** `registry.json` points at `./demo/*` and `./out/*`
  server files; they're `COPY . .`'d in. Adding an API later means committing its files + registry
  entry and redeploying (or the gateway's runtime registry re-read picks it up on a miss).
- **Sandboxing today** = one subprocess per API. Real prod isolation (container/VM + egress
  allow-list per API) is still a TODO — see the project memory.
- **Hub** (`src/hub.ts`) can be deployed the same way with `MCP_TRANSPORT=http PORT=9090` as the
  start command if you want the one-connection-every-API endpoint hosted too.
