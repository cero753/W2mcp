# ChatNoir guided first review: agent permissions (w2mcp)

**Bottom line:** content the app pulls in (an OpenAPI spec title, docs text, tool results) can lead to code running on the host, and nothing in the code asks the user before it happens. I found three confirmed issues, two unresolved candidates and four dismissals. Every result comes from reading the source; nothing was run or reproduced.

**Setup:** ChatNoir 0.4.1 on Python 3.14.3, target `C:\Users\karti\anymcp` at `7672f5d`. The read-only preflight passed (123 files inventoried, 15 skipped). Before running the helper I checked it: it only calls `git` (with fsmonitor off) and makes no network calls. I didn't run the baseline `scan`. Its agent rules only cover Python, so it can't say anything about this TypeScript code. Whether the working tree was dirty is "unknown" because git clean/process filters are configured.

**Path traced:** agent or user input → `hub.ts` (`w2mcp__create`), `use-cli.ts` (`new`, `ask`), `openapi.ts`, `crawl.ts`, `extract.ts` → `model.ts` validation → `generate.ts` → the code that runs the output (`hub.ts`, `use-cli.ts`, `verify.ts`, `gateway.ts`).

## Confirmed (3)

**1. A spec title or LLM output becomes code in the generated server, and that server is run with all host secrets. Severity: high.**
- **How the text gets in:** `generateServer` pastes `api_name` unescaped into the generated TypeScript in three places:
  - `src/generate.ts:114`, inside a `/** */` comment, where a `*/` breaks out at module top level.
  - `:109`, inside a `"…"` string.
  - `:142`, inside a template literal, where a backtick or `${` breaks out.
- **Why validation doesn't stop it:** `src/model.ts:47` only checks that `api_name` is a string.
- **Where the value comes from:** `src/openapi.ts:127` copies `info.title` verbatim, with no LLM involved. On the docs path, the LLM supplies it.
- **Where the output gets run straight away:**
  - `hub.ts:113` → `:43-47`, right after `w2mcp__create`.
  - `use-cli.ts:195`, right after `w2mcp new`.
  - `verify.ts:88-94`.
  - New registry entries spawned by the gateway (`gateway.ts:36-51`).
- **Why it's worse:** every one of those launches passes the full `process.env`, for example `gateway.ts:52` and `verify.ts:86`. In the deployed image, that environment includes `W2MCP_MASTER_KEY` and `DATABASE_URL` (`Dockerfile:19`).
- **Attack path:** someone controls a spec URL → its title carries code → `w2mcp__create` or `w2mcp-import` writes `server.ts` → the hub launches it → code runs with the host's secrets.

**2. Tool output can trigger actions, with no approval step. Severity: high. This is the core of the requested focus.**
- `w2mcp ask --hub` (`use-cli.ts:71, 243-256`) sends tool results back to the model as `role:"tool"` messages. It then runs whatever tool call the model proposes next, through `run.call(name, a)`. There's no allowlist, no confirmation, and no check against what the user originally asked.
- The tools that loop can reach include:
  - `w2mcp__create` (`hub.ts:130-137`), which fetches any URL, generates a server, registers it and runs it, with no restriction on the source.
  - Write endpoints. Their `[UNVERIFIED WRITE]` tag (`generate.ts:66`) is only text in the tool description; nothing enforces it.
- So an API response containing injected instructions can lead to finding 1 being exploited, or to a write call the user never asked for.
- **Not tested:** whether a real model actually follows injected text. What's confirmed is that no gate exists, so any proposal the model makes gets run.

**3. `w2mcp__create` silently replaces an existing server. Severity: medium.**
- `hub.ts:110-113` overwrites `reg[name]` and the live downstream connection without checking whether the name already exists.
- Any agent connected to the hub can swap out a trusted server such as `coingecko`, and that change persists in `registry.json`.

## Unresolved (2)

- **Credential theft through a replaced server (finding 3).** An attacker's spec sets `base_url` from `servers[0].url`, and its title decides which `*_TOKEN` env var the server reads. Still needed: proof that a matching token actually exists in the hub's environment in a real deployment.
- **Docs path (`w2mcp new <url>`) producing a malicious `api_name`.** This depends on the LLM following injected text in the page. Still needed: a test against a live model.
- **Related, not counted:** the learning cache (`learn.ts`, off by default) could be poisoned. A 2xx response from an attacker-chosen `base_url` counts as "verified" in `verify-cli.ts:35-41` and would be fed into future prompts.

## Dismissed (4)

- **Path traversal through the `create` name:** blocked by the `[^\w-]` sanitizer at `hub.ts:107`.
- **Injection through endpoint names, paths, params, extra headers, error meanings or noise fields:** all are passed through `JSON.stringify` (`generate.ts:53, 76, 80, 96, 127, 220`).
- **Injection through `tokenEnv`:** it is sanitized (`generate.ts:269`).
- **Injection through error codes:** they are validated as numbers (`model.ts:30`).

## Not tested / deferred

- No target code was run, there was no runtime reproduction, and no live LLM was tested.
- Out of scope for this focus (authentication):
  - The hub's HTTP mode has no auth (`hub.ts:163-179`). If it's ever deployed that way, finding 1 is reachable over the network with no agent involved.
  - The `web/server.ts` endpoints have no auth.
  - Generated HTTP servers fall back to the env token when no credential header is sent (`generate.ts:108, 191`).
- Not read: `drift-cli.ts`, `gen-cli.ts`, `store.ts`, `clean.ts`, `render.yaml`, `fly.toml`.
- No dependency or secret scanning.

## Smallest next action (not applied)

In `src/generate.ts`, emit `api_name` through `JSON.stringify` at lines 109, 114 and 142, or restrict it to a safe character set. That one change closes finding 1 for every entry path.

Then, as a separate change for the focus area: require explicit user confirmation before `w2mcp__create` and write tools run, keep `create` out of the `ask --hub` loop by default, and stop `create` from overwriting a name that already exists.

I haven't made any changes; say if you want me to apply either fix.
