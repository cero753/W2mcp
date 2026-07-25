# w2mcp Pricing Research & Recommendation

**Date:** 2026-07-17
**Product:** w2mcp — turns any API (HTML docs, OpenAPI, or Swagger; no spec required) into a working MCP server, plus a "hub" (one MCP connection giving an AI agent access to ALL wired-in APIs), plus multi-tenant hosting (credentials encrypted at rest, sandboxed), drift-maintenance (auto-detect API change → regenerate), and a self-improving extraction model.
**Buyers:** developers (self-serve) and enterprise platform teams wiring agents into Salesforce / Jira / Slack / internal APIs.

---

## 1. Comparables Table (2025–2026 published pricing)

Legend for **Source reliability**: **[V] = vendor-confirmed** (fetched directly from the vendor's own pricing page); **[3P] = third-party estimate** (aggregator/blog; all of these enterprise vendors are quote-only, so treat as directional).

| Tool | Category | Pricing model | Headline / self-serve price | Enterprise motion | Src |
|---|---|---|---|---|---|
| **Zapier** | iPaaS | Per-task (action step) + seats | Free (100 tasks); Pro from **$19.99/mo** (annual, 750 tasks); Team **$69/mo** (annual, 25 users, 2k tasks) | Enterprise custom / contact sales; ~33% annual discount | [3P] |
| **Make.com** | iPaaS | Credit/operation-based + seats | Free (1k credits); Core **~$9–10.59/mo**; Pro **~$16–18.82/mo**; Teams **~$29–34.12/mo** | Enterprise custom-quoted | [3P] |
| **Workato** | iPaaS (enterprise) | Annual platform fee + recipe packs + connectors | No public list; base workspace **~$10k/yr** | Enterprise **$50k–$200k+/yr**; Business ~$60–120k/yr | [3P] |
| **MuleSoft (Anypoint)** | iPaaS (enterprise) | Capacity-based (Mule Flows/Messages) | No public list | Median quote **~$210k/yr** for ~15–20 integrations; 1st-yr often 2–3× base | [3P] |
| **Boomi** | iPaaS (enterprise) | Connector/process-based | No public list | Median quote **~$95k/yr** for 15–20 integration processes | [3P] |
| **Tray.ai (Tray.io)** | iPaaS / embedded | Task-credit + workspaces (sales-led) | Pro **~$595/mo** (25k tasks); Team **~$1,500/mo** | Enterprise annual, **from ~$36k/yr**; Embedded bundle req. Enterprise; no free tier | [3P] |
| **Paragon** | Embedded iPaaS | Annual platform fee + per Connected User | No public list; ~$500–$3,000+/mo usage-based | Annual agreements **start five-figures/yr** even for startups; SSO/RBAC on Enterprise | [3P] |
| **Merge.dev** | Unified API | Per production Linked Account | Launch: **free for 3**, then **$650/mo** for up to 10, **+$65/account** after | Professional & Enterprise contract-based; annual commitments **typically $50k+** | **[V]** |
| **Composio** | AI-agent tool integrations | Per tool-call (bundled + overage) | Free (20k calls); Growth **$29/mo** (200k calls); Pro **$229/mo** (2M calls); overage **$0.249–$0.299/1k** | Enterprise custom (SOC-2, VPC/on-prem, custom SLA) | **[V]** |
| **Pipedream** | iPaaS / dev workflows | Credit-based compute + seats | Free (100 credits); Basic **$45/mo** (2k credits); Advanced **$74/mo** | Business/Enterprise quote-based, **~$200–$500/mo** small teams; SSO/RBAC/SLA on Business+ | [3P] |
| **Kong (Konnect)** | API gateway/mgmt | Per gateway service + per-request | Plus **~$105/mo per service** (1M req incl.; +$200/additional M) | Enterprise custom; **$30–50k/yr** small → **$50–120k mid** → **$150–300k+/yr** large | [3P] |
| **Apigee (Google)** | API management | PAYG per-call + env fee, or subscription | Std proxy **$20/M calls** (vol. discounts to $13/M); env fee **≥$365/mo/region** | Subscription tiers quote-only; large enterprises **$2k–$25k/mo** | [3P]/[V-docs] |
| **RapidAPI** | API marketplace / hub | Marketplace: 25% rev commission; consume: per-request | Consumer example: Free (1k req), Basic **$15/mo** (50k req) | Enterprise Hub (private white-label catalog) custom / contact sales | [3P] |
| **Postman** | API platform | Per-seat/mo | Basic **$19/user/mo**; Professional **$39/user/mo** | Enterprise **~$49/user/mo** (annual); SSO, audit logs, governance | [3P] |
| **LangSmith (LangChain)** | AI-agent observability | Per-seat + per-trace usage | Developer free (1 seat, 5k traces); Plus **$39/seat/mo** (10k traces; overage $2.50/1k) | Enterprise custom (SSO, retention, self-host, volume) | **[V]** |
| **Vercel (AI Cloud)** | AI/app platform | Per-seat + usage (token-metered agent) | Hobby free; Pro **$20/seat/mo** + usage; Agent (beta) **$0.25/M tokens** | Enterprise custom, **~$25k+/yr**, avg **~$60k/yr** | [3P] |
| **Glama** | MCP registry/gateway | Per-seat tiers | Free Starter; Pro **$26/mo**; Business **$80/mo** | Business tier = team features + expanded MCP allocations | [3P] |
| **Smithery** | MCP registry/hosting | Free registry + paid hosted usage | Registry/CLI free; paid tiers for hosted servers + higher usage | (early-stage; usage-based hosted) | [3P] |

**Sources:**
- Zapier — [zapier.com/pricing](https://zapier.com/pricing), [activepieces.com/blog/zapier-pricing](https://www.activepieces.com/blog/zapier-pricing), [withorb.com/blog/zapier-pricing](https://www.withorb.com/blog/zapier-pricing)
- Make — [make.com/en/pricing](https://www.make.com/en/pricing), [costbench.com/software/ai-automation/make](https://costbench.com/software/ai-automation/make/), [lindy.ai/blog/make-com-pricing](https://www.lindy.ai/blog/make-com-pricing)
- Workato — [workato.com/pricing](https://www.workato.com/pricing), [integrate.io/blog/workato-pricing](https://www.integrate.io/blog/workato-pricing/), [costbench.com/software/ai-automation/workato](https://costbench.com/software/ai-automation/workato/)
- MuleSoft — [salesforce.com/mulesoft/anypoint-platform/pricing](https://www.salesforce.com/mulesoft/anypoint-platform/pricing/), [integrate.io/blog/mulesoft-cost](https://www.integrate.io/blog/mulesoft-cost/)
- Boomi — [automationatlas.io/guides/boomi-vs-mulesoft-2026-comparison](https://automationatlas.io/guides/boomi-vs-mulesoft-2026-comparison/)
- Tray.ai — [tray.ai/pricing](https://tray.ai/pricing/), [integrate.io/blog/trayai-pricing](https://www.integrate.io/blog/trayai-pricing/), [automationatlas.io/answers/tray-io-pricing-explained-2026](https://automationatlas.io/answers/tray-io-pricing-explained-2026/)
- Paragon — [useparagon.com/pricing](https://www.useparagon.com/pricing), [nango.dev/blog/paragon-pricing](https://nango.dev/blog/paragon-pricing/), [merge.dev/blog/paragon-pricing](https://www.merge.dev/blog/paragon-pricing)
- Merge — [merge.dev/pricing/unified](https://www.merge.dev/pricing/unified) **(fetched)**, [getknit.dev](https://www.getknit.dev/blog/understanding-merge-dev-pricing-finding-the-right-unified-api-for-your-integration-needs)
- Composio — [composio.dev/pricing](https://composio.dev/pricing) **(fetched)**, [usagepricing.com/blueprint/composio](https://www.usagepricing.com/blueprint/composio)
- Pipedream — [pipedream.com/docs/pricing](https://pipedream.com/docs/pricing), [zapier.com/blog/pipedream-pricing](https://zapier.com/blog/pipedream-pricing/)
- Kong — [konghq.com/pricing](https://konghq.com/pricing), [api7.ai/blog/kong-konnect-pricing](https://api7.ai/blog/kong-konnect-pricing), [zuplo.com/learning-center/the-true-cost-of-kong-tco-analysis](https://zuplo.com/learning-center/the-true-cost-of-kong-tco-analysis)
- Apigee — [cloud.google.com/apigee/pricing](https://cloud.google.com/apigee/pricing), [apigatewaycost.com/apigee](https://apigatewaycost.com/apigee)
- RapidAPI — [rapidapi.com/products/pricing](https://rapidapi.com/products/pricing), [rapidapi.com/enterprise](https://rapidapi.com/enterprise/)
- Postman — [postman.com/pricing](https://www.postman.com/pricing/), [flexprice.io/blog/detailed-postman-pricing-guide](https://flexprice.io/blog/detailed-postman-pricing-guide)
- LangSmith — [langchain.com/pricing](https://www.langchain.com/pricing), [pecollective.com/blog/langsmith-pricing](https://pecollective.com/blog/langsmith-pricing/)
- Vercel — [vercel.com/pricing](https://vercel.com/pricing), [truefoundry.com/blog/understanding-vercel-ai-gateway-pricing](https://www.truefoundry.com/blog/understanding-vercel-ai-gateway-pricing)
- Glama / Smithery / MCP registries — [glama.ai](https://glama.ai/), [tooldirectory.ai/tools/smithery](https://tooldirectory.ai/tools/smithery), [truefoundry.com/blog/best-mcp-registries](https://www.truefoundry.com/blog/best-mcp-registries)

---

## 2. Key Pricing-Model Insights

### What axis to charge on
The market clusters on **three axes**, and the winning move for w2mcp is a **hybrid** of them — with the connector as the headline:

1. **Per wired-in API / connector (HEADLINE).** This is the unit of *engineering work w2mcp eliminates*, so it's the unit to charge on. Direct precedents: **Merge** (per Linked Account = one connection to one integration), **Boomi** (per process/connector), **Workato** (recipe/connector packs), **Paragon** (per Connected User). A "generated MCP server" in w2mcp = one wired-in API = the exact analogue of a Merge Linked Account. Charge on it.

2. **Per tool-call / usage meter (SCALING UNDERNEATH).** Precedents: **Composio** ($/1k tool calls — the closest AI-agent analogue), **Kong** ($/M requests), **Apigee** ($/M calls), **Zapier** (per task), **Pipedream** (per compute credit). w2mcp already runs a multi-tenant gateway/hub that sees every call, so metering hub/gateway tool-calls is natural and gives usage-based expansion revenue.

3. **Per seat (COLLABORATION ONLY).** Precedents: **Postman** ($19–49/user/mo), **LangSmith** ($39/seat), **Vercel** ($20/seat), **Glama** ($26–80). Seats are a *team-collaboration* lever, not the primary meter — dev-infra buyers resent paying per-seat for machine-driven usage. Use seats only to gate the Team tier, not as the main growth axis.

### Why w2mcp can price at or above these comps
- **The hub is a platform-fee justifier.** "One MCP connection → all your wired-in APIs" is architecturally what Enterprise buyers pay a platform fee for (cf. Kong Konnect, Apigee, MuleSoft platform fees). No pure-play competitor bundles *spec-less generation + hub + hosting + drift-maintenance*.
- **Drift-maintenance = recurring, not one-time.** Auto-detecting API changes and regenerating is why this is SaaS, not a one-time codegen sale. It's the same logic that lets iPaaS vendors charge annually: someone else owns "keeping the integration alive."
- **Spec-less extraction is the moat.** Competitors (Speakeasy, FastMCP, openapi-mcp-generator) require a `swagger.json`; w2mcp needs only a URL → it serves the long tail of HTML-only-docs APIs. That expands the addressable connector count (and therefore billable units) well beyond spec-gated tools.

### ROI anchor (this carries the premium)
A hand-built API integration / MCP server is roughly **1–4 engineer-weeks**. At a loaded US engineering cost (~$150k–250k/yr fully loaded ≈ $3k–5k/week), that's **~$3k–$15k of labor per integration** — *before* ongoing drift maintenance every time the upstream API changes. Therefore:

> Pricing a wired-in API at **~$3k–$8k/connector/year** inside an enterprise bundle is a *fraction* of the build-and-maintain cost it replaces. It also makes ACV legible: **20 internal/SaaS APIs × $5k = $100k**, which lands squarely inside the Kong/Workato/Boomi enterprise band while being trivially ROI-positive.

This is the discipline behind "be ambitious": **every w2mcp number below sits at or above a named comparable's equivalent unit, with the eng-time-saved ROI carrying the premium** — not asserted, anchored.

---

## 3. Recommended w2mcp Pricing Structure

Four tiers. Hybrid model: **per-connector headline + metered hub calls + seats for teams**; Enterprise = **platform fee + connectors + usage**.

### Tier 0 — Free (self-serve, local)
- **$0/mo.**
- **2 wired-in APIs**, local/stdio (run on your own machine via npx), **10k hub tool-calls/mo**, 1 seat, community support.
- **Purpose:** adoption, not revenue. Every comp has a free tier (Composio 20k calls, Merge free-for-3, LangSmith free dev seat, Pipedream 100 credits). The generous local mode showcases spec-less generation with zero infra cost to w2mcp.
- **Anchor:** Composio free = 20k calls; Merge free = 3 accounts. Ours (2 APIs / 10k calls) is deliberately enough to feel the product, tight enough to convert.

### Tier 1 — Developer
- **$49/mo** (or ~$39/mo billed annually).
- **Up to 5 wired-in APIs**, hosted gateway + hub, **100k hub tool-calls/mo** (overage **$0.30/1k**), drift-maintenance on hosted connectors, 1–2 seats, email support.
- **Justification (premium entry, credible):** sits **above Composio Growth ($29)**, **at/above LangSmith Plus ($39/seat)**, **just above Pipedream Basic ($45)**. Unlike those, this bundles *generation + hub + hosting*, not a single primitive. Overage rate matches Composio's $0.249–$0.299/1k.

### Tier 2 — Team / Pro
- **$399/mo** (annual; ~$479 monthly).
- **Up to 20 wired-in APIs**, **1M hub tool-calls/mo** (overage **$0.25/1k**), up to **5 seats** (+$40/seat after), shared workspace, drift-maintenance + regeneration alerts, RBAC-lite, priority support, self-serve OpenAPI/Swagger *and* spec-less docs generation.
- **Justification:** lands **between Pipedream Business (~$200–500/mo) and Merge Launch ($650 for 10 accounts) / Tray Pro (~$595/mo)**. At 20 connectors this is **~$20/connector/mo** — dramatically cheaper per-connector than Merge's $65/account, justified by w2mcp owning generation+hosting+drift rather than just normalized reads. This is the "platform team's first real deployment" tier and the primary self-serve revenue engine.

### Tier 3 — Enterprise (annual contract)
- **Platform fee: $2,500–$4,000/mo (~$30k–$48k/yr) base**, **+ per-connector + metered usage**.
- **Realistic ACV range: floor ~$50k; typical $75k–$150k; large multi-team up to $250k+.**
- **Includes:** unlimited seats; **self-hosted / VPC / on-prem** option; SSO + SCIM, audit logs, RBAC; sandboxed per-tenant isolation with credentials **encrypted at rest (AES-256-GCM)**; dedicated hub instance; SLA + uptime guarantee; drift-maintenance SLA (auto-regen on upstream change); dedicated success engineer / Slack channel; connector-count-based bundle (e.g., **20 APIs × ~$5k/connector/yr ≈ $100k**).
- **Justification (premium-but-inside-band):**
  - **Merge** enterprise annual commitments **typically $50k+** → our floor matches.
  - **Kong** mid deployments **$50k–120k/yr**; **Workato** **$50k–200k+/yr**; **Boomi** median **~$95k/yr**; **MuleSoft** median **~$210k/yr**; **Vercel** enterprise avg **~$60k/yr**; **Apigee** large **$24k–300k/yr**. Our typical **$75k–150k** sits inside this band — *premium vs. the AI-agent-native startups (Composio/Merge), value-priced vs. legacy iPaaS (MuleSoft/Boomi)*.
  - **ROI check:** at $5k/connector/yr, 20 wired-in APIs = $100k ACV replaces **$60k–$300k of eng build labor** (20 APIs × 1–4 weeks × ~$3–5k/wk) *plus* eliminates ongoing drift maintenance headcount. The buyer is net-positive in year one.
  - The **platform fee ($30k–48k/yr)** is the hub + hosting + isolation + drift-SLA — directly analogous to Kong/Apigee/MuleSoft platform fees and to Paragon/Tray/Workato's "annual platform fee + usage" structure.

### Summary table

| Tier | Price | Wired-in APIs | Hub tool-calls/mo | Seats | Motion |
|---|---|---|---|---|---|
| **Free** | $0 | 2 (local) | 10k | 1 | Self-serve |
| **Developer** | **$49/mo** | 5 (hosted) | 100k (+$0.30/1k) | 1–2 | Self-serve |
| **Team/Pro** | **$399/mo** | 20 | 1M (+$0.25/1k) | 5 (+$40/seat) | Self-serve → sales-assist |
| **Enterprise** | **$75k–$150k ACV** (floor $50k, up to $250k+); platform fee $30k–48k/yr + connectors + usage | Bundled (e.g. 20 × ~$5k/connector/yr) | Custom/committed | Unlimited | Annual contract, sales-led |

---

## 4. Assumptions & Sourcing Notes

**Vendor-confirmed [V]** (fetched directly from vendor pricing pages this session):
- **Merge.dev** — Launch: free for 3 Linked Accounts, then $650/mo up to 10, +$65/account. Pro/Enterprise contract-based.
- **Composio** — $0 (20k calls) / $29 (200k) / $229 (2M); overage $0.249–$0.299/1k; Enterprise custom. *(Note: Composio flagged a pricing change "August 15" — recheck before publishing anything that cites it as current.)*
- **LangSmith** — Developer free (5k traces, 1 seat); Plus $39/seat (10k traces, $2.50/1k overage); Enterprise custom.

**Third-party estimates [3P]** — every *enterprise* iPaaS/gateway vendor here (Workato, MuleSoft, Boomi, Kong, Apigee, Paragon, Tray, RapidAPI Enterprise Hub, Vercel Enterprise) is **quote-only with no published list price**. All enterprise ACV figures come from aggregators/blogs (costbench, checkthat.ai, integrate.io, zuplo, api7.ai, automationatlas, vendr), some of which may be partly LLM-generated. They **directionally agree** across independent sources, but should be treated as *ranges, not quotes*. Discounts of 35–67% off list are reportedly common in mid-market/multi-year iPaaS negotiations (Workato via Vendr data) — real ACVs often land below sticker.

**w2mcp recommendation is an estimate**, constructed by the discipline: *each figure sits at or above a named comparable's equivalent unit, with eng-time-saved ROI carrying the premium.* Specifically:
- **$49 Developer** — extrapolated from Composio $29 / LangSmith $39 / Pipedream $45 (estimate; no exact spec-less-MCP comparable exists — this is a *new category*, so the anchor is adjacent dev-infra entry prices).
- **$399 Team** — interpolated between Pipedream Business ($200–500) and Tray Pro ($595)/Merge Launch ($650) (estimate).
- **$5k/connector/yr and $75k–150k ACV** — derived from the ROI model (1–4 eng-weeks ≈ $3k–15k build cost/integration) cross-checked against the enterprise iPaaS/gateway band. The ROI labor figures assume US-loaded engineering cost (~$150k–250k/yr fully loaded); adjust down ~40–60% for India/UAE-loaded teams, which compresses the ROI argument but not the competitive-band argument.
- **Value metric risk:** if the hub drives very high call volumes, a pure per-connector headline may under-monetize heavy users — the metered tool-call overage is the safeguard. Conversely, per-connector could *over*-charge low-volume users with many APIs; monitor and consider a blended "active connector" definition (billed only when called) as Merge effectively does with production Linked Accounts.
- No direct comparable exists for **spec-less generation + hub + drift-maintenance as one bundle** — that bundling is precisely the pricing-power argument, and the reason w2mcp can sit at the premium end of each individual axis rather than racing to the bottom on any one of them.
