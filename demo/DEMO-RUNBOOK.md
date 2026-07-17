# w2mcp / w2mcp — Demo Runbook (Wednesday)

**Audience:** enterprise buyers + investors.
**Narrative:** Pain → Magic (URL → server) → Payoff (Claude calls it live, hosted & secure).
**Golden rule:** nothing typed live. Every command below is copy-paste. Every live step has a pre-baked fallback.

---

## 0. Pre-flight (do Tuesday, re-check Wednesday AM)

- [ ] LLM key set in `.env` (ONE of): `ANTHROPIC_API_KEY=` / `GEMINI_API_KEY=` / `OPENAI_API_KEY=`
- [ ] `npm install` clean, `node -v` = v24.x, `tsx` present
- [ ] Phone hotspot on standby (assume venue wifi fails)
- [ ] Full screen-recording of the whole demo saved as ultimate fallback
- [ ] Terminal font bumped to ~20pt, light theme for projector
- [ ] Browser tabs pre-opened: hero API docs page, fly.io dashboard, deck

---

## 1. The pipeline smoke test (Hour 0 Tuesday — the ONE thing that de-risks everything)

Confirm a full live generation works today. Run BOTH candidate heroes, keep whichever verifies greenest.

```bash
cd C:/Users/karti/anymcp

# PRIMARY hero — CoinGecko (public read endpoints, no key needed to call)
npx tsx src/cli.ts \
  https://docs.coingecko.com/reference/introduction \
  https://docs.coingecko.com/reference/coins-markets \
  https://docs.coingecko.com/reference/simple-price \
  --out ./demo/coingecko
npx tsx src/verify-cli.ts ./demo/coingecko      # want: get_coins_markets / simple_price = live-verified ✅

# BACKUP hero — Open-Meteo (zero-auth weather, bulletproof green)
npx tsx src/cli.ts \
  https://open-meteo.com/en/docs \
  --out ./demo/openmeteo
npx tsx src/verify-cli.ts ./demo/openmeteo
```

**Decision rule:** whichever hero returns the cleanest `live-verified` set becomes the demo hero.
Frankfurter (already green) stays as the guaranteed anchor. Commit the winning `out/` to git so it's frozen.

> If generation fails (key/SDK drift): STOP and fix now — do not proceed to deck. This is the load-bearing step.

---

## 2. Deploy the hosted gateway (Hours 2–4 Tuesday)

Use the local-file credential store — **do NOT** touch Supabase (the `28P01` password issue isn't worth an hour).

```bash
cd C:/Users/karti/anymcp

# fly.toml demo tweak already applied: min_machines_running = 1 (no cold-start stall on stage)

fly launch --no-deploy                                  # creates app 'w2mcp-gateway'
fly secrets set W2MCP_MASTER_KEY=$(openssl rand -hex 32)
# (no DATABASE_URL — file store is the demo default)
fly deploy
fly status                                              # confirm 1 machine RUNNING
```

Register the hero servers in `registry.json`:

```json
{
  "frankfurter": "./out/frankfurter-http/server.ts",
  "coingecko":   "./demo/coingecko/server.ts"
}
```

Smoke-test the hosted endpoint:

```bash
curl -X POST https://w2mcp-gateway.fly.dev/mcp/coingecko \
  -H "Authorization: Bearer <your-w2mcp-key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 3. Wire Claude Desktop to the hosted gateway (Hours 4–5 — this is Act 3, the money shot)

Add to Claude Desktop MCP config (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "coingecko-via-w2mcp": {
      "url": "https://w2mcp-gateway.fly.dev/mcp/coingecko",
      "headers": { "Authorization": "Bearer <your-w2mcp-key>" }
    }
  }
}
```

Restart Claude Desktop → confirm the tools appear → rehearse the exact prompt:

> "What's the current price and 24h change of Bitcoin and Ethereum?"

Claude should call `simple_price` / `coins_markets` on YOUR hosted server and return live data.
**Rehearse until boring.** This is the slide-4 payoff.

---

## 4. Demo click-path (the exact sequence Wednesday)

1. Deck slides 1–3 (pain → long-tail insight).
2. **Slide 4 → switch to terminal.** Run ONE live generation (paste the CoinGecko command). While it runs, narrate crawl→extract→generate.
   - *Fallback:* if it stalls, `cd ./demo/coingecko` — the pre-baked server is already there. "Here's one I generated earlier."
3. `npx tsx src/verify-cli.ts ./demo/coingecko` → show the ✅ live-verified lines. "Verified, not vibes."
4. **Switch to Claude Desktop.** Ask the Bitcoin/Ethereum prompt → Claude calls the hosted server live. **The payoff.**
5. Back to deck: hosted/multi-tenant/encrypted → moat → market → ask.

---

## 5. Fallback ladder (when things break)

| If this fails | Do this |
|---|---|
| Live generation stalls | `cd ./demo/coingecko` pre-baked output — "one I made earlier" |
| Hosted gateway unreachable | Run the server locally: `MCP_TRANSPORT=http PORT=3000 node --import tsx ./demo/coingecko/server.ts` |
| Claude Desktop won't connect | Show `verify-cli` green output + `curl tools/list` against hosted gateway |
| Venue wifi dead | Phone hotspot; CoinGecko/Frankfurter still need net → fall to screen recording |
| Total meltdown | Play the full screen recording from step 0 |

---

## 6. Cut line (do NOT build if short on time)
Web UI · Supabase/Postgres · subprocess sandboxing · signup UI · quotas. Terminal + Claude Desktop IS the demo.
