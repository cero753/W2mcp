# w2mcp — Pricing

**How we charge:** per **wired-in API** (the unit of engineering work we eliminate) + metered **hub tool-calls** (usage) — seats only where teams collaborate. Enterprise = platform fee + connectors + usage on an annual contract. This mirrors how Merge (per Linked Account), Composio (per tool-call), and Workato/Paragon (platform fee + usage) charge — we bundle *all three* plus spec-less generation, hosting, and drift-maintenance, which no single competitor does.

Full sourcing & competitor benchmarks: [PRICING-RESEARCH.md](./PRICING-RESEARCH.md).

---

## Plans

| | **Free** | **Developer** | **Team / Pro** | **Enterprise** |
|---|---|---|---|---|
| **Price** | $0 | **$49/mo** ($39 annual) | **$399/mo** annual | **From ~$10k/yr** · [Request a quote](#enquiry) |
| **Wired-in APIs** | 2 (local/stdio) | 5 (hosted) | 20 | Custom (bundled) |
| **Hub tool-calls/mo** | 10k | 100k (+$0.30/1k) | 1M (+$0.25/1k) | Committed / custom |
| **Seats** | 1 | 1–2 | 5 (+$40/seat) | Unlimited |
| **Generation** | docs + spec | docs + spec | docs + spec | docs + spec |
| **Hosting (gateway + hub)** | local only | ✓ | ✓ | Dedicated / VPC / on-prem |
| **Drift-maintenance** | manual | on hosted | + regen alerts | Auto-regen **SLA** |
| **Security** | — | encrypted at rest | RBAC-lite | SSO+SCIM, audit logs, per-tenant sandbox, AES-256-GCM |
| **Support** | community | email | priority | Success engineer + SLA |
| **Motion** | self-serve | self-serve | self-serve → sales-assist | annual, sales-assisted |

\* **Enterprise is tentative and quote-based — start around $10k/yr** and scale with connector count and usage
(typical **~$10k–$30k/yr**; larger multi-team rollouts more). Deliberately accessible: we'd rather land teams
early and expand than gate them behind a six-figure contract. <a id="enquiry"></a>**Not sure which fits? →
[Request a quote / talk to us](mailto:hello@w2mcp.dev?subject=w2mcp%20enterprise%20enquiry).**

---

## Why these numbers (not cheap — and here's why that's right)

**Every tier sits at or above a named competitor's equivalent unit, with ROI carrying the premium — not anchored low.**

- **Developer $49** is above Composio Growth ($29) and LangSmith Plus ($39), just over Pipedream Basic ($45) — and unlike any of them it bundles *generation + hub + hosting*, not one primitive.
- **Team $399** lands between Pipedream Business (~$200–500) and Merge Launch ($650)/Tray Pro (~$595). At 20 connectors that's ~$20/connector/mo — far below Merge's $65/account.
- **Enterprise from ~$10k/yr** is deliberately **below** the legacy iPaaS/gateway band (Kong $50–120k, Workato $50–200k, Boomi ~$95k, MuleSoft ~$210k). We're not trying to extract a six-figure contract on day one — we price to **land the team, prove ROI, then expand** with connector count and usage. Quote-based with an easy enquiry, so the number fits the customer, not the other way around.

**The ROI that makes even this an easy yes:** a hand-built API integration is **1–4 engineer-weeks ≈ $3k–15k of labor** each — *before* ongoing drift maintenance every time the upstream API changes. So a **~$10k/yr entry that covers a handful of connectors pays for itself against a single integration you didn't have to build or maintain.** Expansion revenue comes as they wire in more APIs and drive more hub calls — not from a big upfront gate.

**What makes it recurring (not a one-time codegen sale):**
1. **The hub** — one connection → all their APIs. That's the platform-fee justifier (cf. Kong/Apigee/MuleSoft platform fees).
2. **Drift-maintenance** — we own "keeping the integration alive" as the upstream API changes. Same logic that lets iPaaS charge annually.
3. **Spec-less generation** — competitors need a `swagger.json`; we read HTML docs, so we cover the long tail of APIs they can't — expanding billable connector count.

*(Figures are recommendations benchmarked against 2025–26 comparables; enterprise iPaaS list prices are quote-only, treat ACVs as ranges. ROI labor assumes US-loaded eng cost — compress ~40–60% for India/UAE teams.)*
