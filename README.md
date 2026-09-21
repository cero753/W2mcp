# w2mcp

**Turn any API's documentation URL into a working MCP server — no OpenAPI spec required. Bring your own LLM.**

Every other generator needs a `swagger.json`. `w2mcp` only needs a URL: it reads the API's
human-facing HTML docs the way a developer would, and emits a runnable
[MCP](https://modelcontextprotocol.io) server your AI agent can call immediately — typed tools,
auth, error handling, and response shaping included.

That unlocks the long tail of APIs that publish **HTML docs only** (fintech, real estate, HR,
internal/enterprise APIs) — the ones spec-based tools can't touch.

```
npx w2mcp new https://api.chucknorris.io/ --dir ./out/chuck
# [1/4] crawl  [2/4] clean  [3/4] extract (your LLM)  [4/4] generate
# ✓ Chuck Norris API — 4-tool MCP server → ./out/chuck
npx w2mcp call --dir ./out/chuck get_random_joke
```

## Quick start (2 minutes)

Requires Node ≥ 20.12 and an API key for **any OpenAI-compatible LLM endpoint**.

```bash
git clone https://github.com/cero753/anymcp.git w2mcp && cd w2mcp
npm install

npx w2mcp init            # asks for your LLM key, base URL, model → writes .env
npx w2mcp new https://api.chucknorris.io/ --dir ./out/chuck
npx w2mcp call --dir ./out/chuck get_random_joke
```

Want `w2mcp` as a global command? `npm link` once, then drop the `npx`.

## Bring your own LLM

w2mcp talks to one chat-completions endpoint, configured by three variables (`w2mcp init` writes
them to `.env`, which is loaded automatically):

| Variable | Meaning | Default |
|---|---|---|
| `LLM_API_KEY` | your key | *(required)* |
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `https://api.openai.com/v1` |
| `LLM_MODEL` | model name at that endpoint | `gpt-4o-mini` |

Any provider that speaks the OpenAI chat-completions format works:

| Provider | `LLM_BASE_URL` | example `LLM_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-5` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` (any key) |

The LLM does one job — read docs and emit a structured API model. Every other stage is
deterministic code, so a small, cheap model is enough; validation and retries are the backstop.

## Use the generated server

Every generated folder is a standard, self-contained MCP server (`server.ts` + `INSTALL.md`). Point
any MCP client at it:

**Claude Desktop** (`claude_desktop_config.json`) / **Cursor** (`.cursor/mcp.json`) / **Claude Code**:

```json
{
  "mcpServers": {
    "chuck": {
      "command": "node",
      "args": ["--import", "tsx", "C:/path/to/w2mcp/out/chuck/server.ts"],
      "env": { "CHUCK_NORRIS_API_TOKEN": "" }
    }
  }
}
```

APIs that need a key read it from `<API_NAME>_API_TOKEN` (the exact name is in the generated
`INSTALL.md`). Public APIs need nothing.

Remote/hosted: `MCP_TRANSPORT=http PORT=3000 node --import tsx out/chuck/server.ts` serves
Streamable HTTP at `POST /mcp`.

Or skip the client entirely and drive it from the terminal:

```bash
npx w2mcp tools --dir ./out/chuck                       # list tools
npx w2mcp call  --dir ./out/chuck search_jokes query=dev # call one
npx w2mcp ask "tell me a joke about code" --dir ./out/chuck   # let an LLM agent pick the tool
npx w2mcp verify ./out/chuck                            # live-probe the read endpoints
```

## CLI reference

| Command | What it does |
|---|---|
| `w2mcp init` | write `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` to `.env` (`--key --base-url --model` for scripts) |
| `w2mcp new <docs-url> [more-urls] [--dir out]` | crawl → clean → extract → generate, then list the tools. Follows a few related same-site pages so the base URL / auth page is captured; pass several URLs to control exactly what is read. `--no-render` skips the headless browser, `--no-follow` disables page-following |
| `w2mcp tools --dir <dir>` | list a generated server's tools over stdio |
| `w2mcp call --dir <dir> <tool> k=v ...` | call a tool; `true/false`/numbers are coerced, lists stay comma strings |
| `w2mcp ask "<q>" --dir <dir>` | terminal agent: your LLM reads the tools, calls the right one, answers |
| `w2mcp verify <dir>` | live-verify read endpoints (`<API>_API_TOKEN` if the API needs auth) |

Docs sites that are JS-rendered are handled by Playwright (render is on by default; run
`npx playwright install chromium` once if it complains).

Have an OpenAPI/Swagger spec? `npx tsx src/import-cli.ts <spec-url-or-file> --out ./out/x`
converts it deterministically — no LLM call at all.

## How it works

```
URL(s) ─▶ crawl ─▶ clean ─▶ extract ─▶ generate ─▶ MCP server
         (fetch/    (HTML→md)  (LLM reads   (typed tools, auth,
          Playwright)           docs→model)   shaping, errors)
```

1. **crawl** — fetch the page (or render it headless); optionally follow 1–2 related pages
   (auth / getting-started / reference) on the same site.
2. **clean** — strip nav/boilerplate, convert to Markdown, budget long supplements.
3. **extract** — the LLM turns the docs into a strict `ApiModel` (base URL, auth scheme, endpoints,
   params, error codes, response noise). Output is validated with zod; on failure the *exact*
   validation error is fed back and the model repairs its output (up to 3 attempts). Multi-page
   input that overflows falls back to the entry page alone, so following pages can never make a
   working extract fail.
4. **generate** — deterministic templates emit `server.ts` (MCP SDK, stdio + Streamable HTTP),
   typed zod tool schemas, auth header injection, error mapping, and a response shaper that
   strips verbose metadata so agents get compact results.

## Verification

`w2mcp verify` reports three honest statuses — it never calls something "verified" without a real call:

- **live-verified** — read endpoint actually called, returned 2xx + data
- **unverified-write** — write endpoint, flagged, validated against the doc example only
- **structurally-checked** — no creds / needs args we can't synthesize (a guardrail, not proof)

`w2mcp drift <dir>` (`npm run drift`) re-derives the model from the live docs and diffs it
against the generated baseline (added / removed / changed endpoints), `--fix` regenerates.

## Project layout

| Path | What |
|---|---|
| `bin/w2mcp.mjs` | the `w2mcp` command |
| `src/use-cli.ts` | CLI: `init · new · tools · call · ask · verify` |
| `src/llm.ts` · `src/env.ts` | the single LLM config (`LLM_*`) and `.env` loading |
| `src/{crawl,clean,extract,generate}.ts` | the four pipeline stages |
| `src/model.ts` | the `ApiModel` (structured intermediate) |
| `src/openapi.ts` · `import-cli.ts` | spec fast-path (Swagger 2 / OpenAPI 3, JSON or YAML) |
| `src/verify.ts` · `verify-cli.ts` · `drift-cli.ts` | live/structural verification, drift detection |
| `src/templates/shape.ts` | response shaper (emitted into every server) |
| `src/hub.ts` | optional meta-MCP: one endpoint fronting every server in `registry.json` |
| `src/gateway*.ts` · `store.ts` · `web/` | hosted multi-tenant gateway + demo web UI (see below) |

## Hosted version (roadmap)

The CLI and every server it generates are free and MIT-licensed. The same repo contains the
foundation of a hosted product: a multi-tenant gateway that runs each generated server in an
isolated subprocess, stores customer credentials encrypted (AES-256-GCM, Postgres), injects them
per request, plus a hub that exposes all your APIs through one MCP connection. That hosted layer,
drift maintenance, and a verified-knowledge cache that improves generation over time are the paid
service. `demo/` holds the pitch, runbooks and deploy notes.

## License

MIT.
