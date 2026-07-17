# w2mcp — ON-STAGE CHEATSHEET  (localhost)

Demo key: `ak_demo_w2mcp_2026` · Web UI: `http://localhost:5173` · Gateway: `http://localhost:8080`
Everything runs locally — **no wifi/Fly dependency.** Paste in order; nothing typed from memory.

## 0. Bring the demo up (one command)
```powershell
powershell -ExecutionPolicy Bypass -File demo\start-demo.ps1
```
Opens the gateway (:8080) + web UI (:5173) in two windows and launches the browser. Claude Desktop already wired.
*(Manual equivalent, in Git-Bash:)*
```bash
cd /c/Users/karti/anymcp; set -a; source .env; set +a; unset DATABASE_URL
npx tsx src/gateway-cli.ts &      # gateway
npx tsx web/server.ts &           # web UI
```

## THE DEMO — three acts

### Act 1 — the product (browser)  → http://localhost:5173
"Your agent needs an API that has no MCP server and no spec — just HTML docs."

### Act 2 — the magic (live generation, in the browser)
Left panel → **Frankfurter** URL is pre-filled (generates clean: `api.frankfurter.dev`, `auth=none`, fast) → **Generate →**.
Watch **crawl → clean → extract → generate** stream live, then the generated server card appears (typed tools).
> *Note:* the **CoinGecko** example button also works, but its card shows the Pro base URL (`pro-api…`) — lead with Frankfurter for a clean card; CoinGecko is the "call it live" hero in Act 3.

### Act 3 — the payoff (call it live)
Right panel → server **coingecko** → tool **coin_price_by_ids_symbols_or_names** →
args pre-filled (`ids=bitcoin,ethereum`, `vs_currencies=usd`) → **▶ Call live** → real BTC/ETH prices.
Say: *"That call went through the hosted, multi-tenant gateway — the credential was injected server-side, encrypted at rest."*

### Act 2b (optional) — "and if they DO have a spec, we're even better"
Click **Spec: httpbin** → **Generate →**. Stages become **Load spec → Convert → Generate** (no LLM), card shows
**"◆ from OpenAPI spec · no LLM"** and 73 tools. Then in the right panel: server **httpbin** → tool **get_uuid** →
**▶ Call live** → real data. Line: *"Spec-required competitors stop at HTML docs; we're a **superset** — spec-optional."*

### Act 3b (optional) — a real agent uses it
Switch to **Claude Desktop** → ask: **"What's the price and 24h change of Bitcoin and Ethereum?"**
Claude calls `coingecko-local` and returns live numbers.

## Manual proof (if the browser/Claude Desktop misbehaves)
```bash
curl -s -X POST http://localhost:8080/mcp/coingecko \
  -H "Authorization: Bearer ak_demo_w2mcp_2026" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"coin_price_by_ids_symbols_or_names","arguments":{"ids":"bitcoin,ethereum","vs_currencies":"usd","include_24hr_change":true}}}'
```

## Fallback ladder
| Fails | Do |
|---|---|
| Live generation slow/stalls | click **Frankfurter** example, or show pre-baked `demo/coingecko` |
| Web UI down | run the curl above; show it returning live JSON |
| Claude Desktop won't connect | use the web UI's "Call live" panel instead |
| Everything | play the screen recording |

## Gotchas
- Gateway **403** → store not seeded with the same master key → `npx tsx demo/seed-store.mjs`.
- curl needs `Accept: application/json, text/event-stream`. Browser + Claude Desktop send it automatically.
- If Claude Desktop won't take a remote `url`, swap that entry to the `mcp-remote` bridge (see DEMO-RUNBOOK Phase E).
