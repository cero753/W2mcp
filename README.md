# anymcp

**Turn any API's documentation URL into a working MCP server — no OpenAPI spec required.**

Every other generator needs a `swagger.json`. `anymcp` only needs a URL: it reads the API's
human-facing HTML docs the way a developer would, and emits a runnable [MCP](https://modelcontextprotocol.io)
server your AI agent can call immediately — typed tools, auth, error handling, and response shaping included.

That unlocks the huge long tail of APIs that publish **HTML docs only** (fintech, real-estate,
internal/enterprise APIs) — the ones spec-based tools can't touch.

```bash
anymcp https://developers.notion.com/reference/intro \
       https://developers.notion.com/reference/post-search \
       --out ./out/notion
# → crawl → clean → extract (LLM) → generate → a working Notion MCP server
```

## How it works

```
URL(s) ─▶ crawl ─▶ clean ─▶ extract ─▶ generate ─▶ MCP server
         (fetch/    (HTML→md)  (LLM reads   (typed tools, auth,
          Playwright)           docs→model)   shaping, errors)
```

Five of six stages are deterministic; the LLM only does comprehension (docs → structured model),
so the engine is **model-pluggable** (Gemini / OpenAI / Anthropic) and provider-agnostic.

## Quick start

```bash
npm install

# Generate a server from docs (set ONE provider key):
GEMINI_API_KEY=...  npx tsx src/cli.ts <docs-url> [<more-urls>] --out ./out/myapi
#   also supports OPENAI_API_KEY or ANTHROPIC_API_KEY; pick the model with ANYMCP_MODEL
#   add --render to use Playwright for JS-rendered doc sites

# Verify the generated server (live-probes read endpoints with your creds):
MYAPI_TOKEN=...  npx tsx src/verify-cli.ts ./out/myapi
```

The generated server runs two transports:

```bash
node --import tsx out/myapi/server.ts                 # stdio (local)
MCP_TRANSPORT=http PORT=3000 node --import tsx ...     # Streamable HTTP (remote/hosted)
```

## Verification

`anymcp verify` reports three honest statuses — it never calls something "verified" without a real call:

- **live-verified** — read endpoint actually called, returned 2xx + data
- **unverified-write** — write endpoint, flagged, validated against the doc example only
- **structurally-checked** — no creds / needs args we can't synthesize (a guardrail, not proof)

## Hosting (multi-tenant gateway)

`src/gateway.ts` fronts the generated servers for hosted, multi-tenant use:

- each API server runs as an **isolated subprocess** (a bad generated server can't crash the gateway)
- customers authenticate with an anymcp API key; the gateway fetches **their** downstream
  credential from an **encrypted store** (AES-256-GCM at rest) and injects it **per request**
- credentials persist in Postgres (Supabase / Neon) via `DATABASE_URL`, or a local file for dev

```bash
ANYMCP_MASTER_KEY=$(openssl rand -hex 32) \
DATABASE_URL=postgres://...  \
npx tsx src/gateway-cli.ts
# POST /mcp/<api>  with  Authorization: Bearer <anymcp-key>
```

Deploy with the included `Dockerfile` + `fly.toml`.

## Project layout

| Path | What |
|---|---|
| `src/cli.ts` | the `anymcp <url>` pipeline |
| `src/{crawl,clean,extract,generate}.ts` | the four pipeline stages |
| `src/model.ts` | the `ApiModel` (structured intermediate) |
| `src/verify.ts` · `verify-cli.ts` | live/structural verification |
| `src/gateway.ts` · `gateway-cli.ts` | multi-tenant hosting gateway |
| `src/store.ts` | encrypted credential store (file + Postgres) |
| `src/templates/shape.ts` | response shaper (emitted into every server) |

## Status

Working MVP: docs URL → generated server → verified → multi-tenant hosted, proven end-to-end
with live API calls (Notion, Frankfurter). Not yet production-hardened (subprocess sandboxing is
process-level; no quotas/customer UI yet).

## License

UNLICENSED — all rights reserved (for now).
