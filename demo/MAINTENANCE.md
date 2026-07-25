# w2mcp — Drift Maintenance & Self-Improving Generation

Two capabilities that make w2mcp a recurring platform, not a one-time code generator: it **keeps generated
servers correct as the upstream API changes**, and it **gets better at generation with every API it sees**.

---

## 1. Drift maintenance — "we keep the integration alive"

**The problem:** APIs change. A new endpoint appears, a param is renamed, an auth scheme changes — and a
hand-built (or one-shot generated) MCP server silently rots. Enterprises pay iPaaS vendors annually precisely
because *someone else owns keeping integrations alive*. w2mcp owns it.

**How it works (implemented today):**
- At generation time we write a **`manifest.json`** next to the server: the source URL(s), a hash of the fetched
  source, the mode (docs vs OpenAPI/Swagger), and the endpoint count — plus the `apimodel.json` baseline.
- **`w2mcp drift <serverDir>`** re-derives the model from the *current* source and diffs it against that baseline.
  It matches endpoints by **method + path** (stable), not by the generated tool name (which can vary), so a
  renamed param or tool isn't mistaken for a new endpoint. It reports:
  - `+ added` / `- removed` endpoints,
  - `~ changed` (param-count or rename), and
  - `base_url` / `auth` changes, plus whether the raw source hash moved.
- **`w2mcp drift <serverDir> --fix`** regenerates the server from the current source and rewrites the baseline.

```bash
w2mcp drift ./out/stripe          # report what changed upstream
w2mcp drift ./out/stripe --fix    # regenerate to match
```

**Product/enterprise framing:** run drift on a schedule (cron / CI) across every hosted connector; on drift,
alert + auto-regenerate (Enterprise gets an auto-regen SLA). OpenAPI/Swagger sources drift **exactly**
(deterministic); HTML-docs sources drift **approximately** (method+path matching keeps it meaningful).

---

## 2. Self-improving generation — "better with every MCP we create"

**The idea:** each API we successfully generate teaches us verified facts (its real base URL, its auth scheme).
We cache those per API host and feed them back as **hints** to future extractions of the same/similar API — so
generation quality compounds as the fleet grows.

**How it works (implemented today — `src/learn.ts`):** a host-keyed knowledge cache.
- **Write** happens *only* from a **live-verified** generation (`w2mcp verify` confirmed a real `2xx` against the
  API). We never learn from unverified output.
- **Read** injects an **advisory** hint into the extraction prompt (`"previously verified for this host: base_url
  likely …, auth likely …; trust the docs if they disagree"`) — never an authoritative override.
- It's **host-keyed concrete facts** (base_url, auth type/location/header), not a retrained model — so it's
  inspectable and correctable, and honest: it's a *verified-knowledge cache*, not a black-box "self-evolving model".

**Guardrails (deliberate — this touches the generation hot-path):**
1. **Off by default.** Everything no-ops unless `W2MCP_LEARN=1` — a kill switch, no redeploy needed.
2. **Verified-writes only** — the live probe is the "this was actually correct" signal.
3. **Advisory, never authoritative** — the docs always win if they disagree.
4. **Spec path never consults it** — OpenAPI/Swagger conversion stays deterministic and pure.

```bash
W2MCP_LEARN=1 w2mcp verify ./out/stripe   # on success: learns verified facts for the host
# a later generation of the same host is seeded with those hints (only when W2MCP_LEARN=1)
```

**Why it matters commercially:** the more APIs a customer (and the platform) wires in, the more accurate and
faster generation becomes — a data-compounding moat on top of the spec-less extraction advantage. The base_url
mistake that once needed a human fix becomes a fact the system carries forward.

---

## Roadmap (not yet built)
- Scheduled drift across the whole registry with a dashboard + auto-regen + Slack/email alerts.
- Cross-customer (anonymized, opt-in) learnings: verified base_url/auth patterns per well-known API.
- A few-shot example library of verified (docs → apimodel) pairs to raise first-pass extraction accuracy.
- Semantic diff in drift (detect behaviorally-breaking changes, not just structural).
