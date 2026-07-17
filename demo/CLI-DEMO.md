# w2mcp — CLI / TERMINAL DEMO  (no Claude Code)

Show the **whole product in a terminal**: take an API the audience names, turn it into a real MCP server,
and then use it — both from your CLI and from a *foreign* agent. No Claude Code anywhere.

Two sentences to land:
1. **"No spec, no SDK — just a docs URL becomes a standard MCP server."**
2. **"Any MCP client can use it with zero custom code"** — Claude Desktop, Cursor, the MCP Inspector, or your CLI.

---

## THE TWO JOURNEYS (this is the story; the commands below act it out)

### Journey A — the CREATOR (someone building an MCP server with w2mcp)
> paste an API's docs URL → w2mcp crawls + reads the HTML → extracts a typed API model →
> generates a runnable MCP server (typed tools, auth, errors) → optionally hosts it.

- **Fast path (local, instant, works for ANY new API):** `w2mcp new <url>` → a server on disk, tools listed, ready to call. No registry, no seeding, no restart.
- **Hosted path (production):** register in `registry.json` + seed a credential + (re)start the gateway. The gateway reads `registry.json` at startup, so a *brand-new* API is hosted after a restart — for the live demo, host is best shown with the **pre-seeded** servers (coingecko/httpbin) and *new* APIs are shown via the instant local path.

### Journey B — the CONSUMER (an agent that wants to USE the server)
> point any MCP client at the server (a config paste, or `--dir` for local) → it lists the tools →
> the agent calls them to do real work.

Three ways to prove it, strongest first:
- **Cursor** (a real AI agent, not Claude Code) — `demo/cursor-mcp.json`.
- **MCP Inspector (CLI)** — the official protocol client, in your terminal.
- **`w2mcp ask`** — your own terminal agent (convenience, not interop proof; keep as fallback).

---

## 0. Setup (do once, before the room fills)

```powershell
cd C:\Users\karti\anymcp
# load secrets (Gemini key) into THIS shell, force the file store:
Get-Content .env | ? { $_ -match '^\s*[^#].*=' } | % { $kv=$_ -split '=',2; if ($kv[0].Trim() -ne 'DATABASE_URL'){ Set-Item Env:\$($kv[0].Trim()) $kv[1].Trim() } }; $env:DATABASE_URL=$null
# make `w2mcp` a real command in this terminal:
function w2mcp { npx tsx src\use-cli.ts @args }
# start the gateway in its own window (needed for the HOSTED acts):
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$PWD'; npx tsx src\gateway-cli.ts"
```
Pre-warm once so the first hosted click is instant: `w2mcp tools coingecko`.
Pre-run the Inspector once (first run downloads it): see Act 3.

---

## ACT 1 — CREATE: turn an API the audience names into an MCP server, live

**Constrain the ask without seeming to:** *"Give me any public API with online docs — no login required."*
Or offer a shortlist: *CoinGecko, Chuck Norris, Dog CEO, Open-Meteo, REST Countries.*

```
w2mcp new https://api.example.com/docs
```
- Renders JS docs by default; pass **multiple URLs** if the base URL lives on a separate intro/auth page:
  `w2mcp new https://api.example.com/docs https://api.example.com/authentication`
- Streams `crawl → clean → extract → generate`, then prints the typed tool list.

Say while it runs: *"It's reading the HTML like a developer would — there was never an OpenAPI spec."*

> **Safety net (rehearse this):** live generation crawls + calls a model (~15–30s of quiet, and arbitrary docs
> can surprise you). If it stalls or the base URL comes back `(none!)`, don't fight it —
> *"here's one I generated earlier"* and switch to a **pre-generated** server:
> - `./out/chuck-demo` (Chuck Norris — 4 tools, public, funny, reliable)
> - `demo/coingecko` (2 tools, live market data — also your hosted hero)
> - `demo/httpbin` (73 tools, generated **from an OpenAPI spec** — use to say "we're a *superset*: spec-optional")

---

## ACT 2 — USE IT (CONSUMER), in your terminal

### 2a. Call the server you just made — no gateway, no Claude Code
```
w2mcp tools --dir ./out/<the-new-api>
w2mcp call  --dir ./out/<the-new-api> <tool> key=value ...
```
Example (Chuck fallback): `w2mcp call --dir ./out/chuck-demo get_random_joke_by_category category=science`
Say: *"That's the **official MCP client** spawning the generated server over stdio — the exact protocol an agent runtime speaks."*

### 2b. The production story — through the hosted gateway
```
w2mcp servers
w2mcp tools coingecko
w2mcp call  coingecko coin_price_by_ids_symbols_or_names ids=bitcoin,ethereum vs_currencies=usd include_24hr_change=true
```
Say: *"Same protocol, now multi-tenant: the customer is authenticated, their API credential is fetched, decrypted, and injected server-side, and each API runs sandboxed in its own subprocess."*

---

## ACT 3 — PROVE INTEROP: a FOREIGN agent uses it (strongest evidence, still no Claude Code)

### 3a. MCP Inspector (CLI) — official protocol client, in the terminal
```
npx @modelcontextprotocol/inspector --cli node --import tsx ./out/chuck-demo/server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli node --import tsx ./out/chuck-demo/server.ts --method tools/call --tool-name get_joke_categories
```
Say: *"That's not my code — it's the reference MCP client. If it can drive our server, any agent can."*
(Pre-run once before the demo so it's cached.)

### 3b. Cursor — a real AI agent (not Claude Code) calling the tool
1. Copy `demo/cursor-mcp.json` into `%USERPROFILE%\.cursor\mcp.json` (or a project `.cursor/mcp.json`).
2. Cursor → Settings → MCP → toggle **coingecko-hosted** (gateway running) or **chuck-local** on.
3. In Cursor chat ask: *"What's the price of Bitcoin and Ethereum?"* → it calls the tool and answers.
Say: *"A mainstream AI IDE, zero custom integration — it just spoke MCP to the server we generated."*

---

## ACT 4 (optional) — an agent IN your terminal (`w2mcp ask`)

A convenience for a pure-terminal room. Honest framing: *this is our model driving the tools* — the interop
proof is Act 3; this shows the developer ergonomics.
```
w2mcp ask "What's the price of bitcoin and ethereum in USD?" coingecko
w2mcp ask "Tell me a Chuck Norris joke about science." --dir ./out/chuck-demo
```
If it hangs or misfires, drop instantly to the deterministic `w2mcp call` (Act 2). Don't debug on stage.

---

## Exact answer to "can I demo the whole product in a terminal without Claude Code?"

**Yes, fully.** Journey A: `w2mcp new <url>` turns any API into a standard MCP server, live. Journey B: use it
from your CLI (`call`/`tools`), from a foreign agent (Inspector/Cursor), or from a terminal agent (`ask`).
Claude Code/Desktop are just *examples* of MCP clients; your CLI and Cursor are others — the point is that ANY
of them works with zero custom code, which is the whole pitch.

## Fallback ladder
| Fails | Do |
|---|---|
| `w2mcp` not defined | `npm run use -- <args>` |
| `w2mcp new` stalls / base_url `(none!)` | pivot to a pre-generated server (chuck-demo / coingecko / httpbin) |
| `w2mcp new` extract fails | Gemini key not loaded → re-run the `.env` loader in step 0 |
| Hosted call 401/403 | gateway down or store unseeded → `npx tsx demo\seed-store.mjs`, restart gateway |
| `w2mcp ask` hangs | Ctrl-C, use `w2mcp call` (Act 2) |
| Cursor won't connect | use Inspector (3a) or the CLI (2) instead |
| Everything | browser demo (DEMO-RUNBOOK.md) |
