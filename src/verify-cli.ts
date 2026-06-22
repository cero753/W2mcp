/**
 * anymcp verify <serverDir>
 * Live-verifies a generated server. Set <API>_TOKEN (e.g. NOTION_API_TOKEN) or ANYMCP_TEST_TOKEN
 * to enable the live probe; without a token it falls back to structural checks only.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { verify } from "./verify.js";

const dir = process.argv[2];
if (!dir) { console.error("Usage: anymcp verify <serverDir>"); process.exit(1); }

const icon: Record<string, string> = {
  "live-verified": "✅", "unverified-write": "⚠️ ", "structurally-checked": "○",
  "live-failed": "❌", "structural-issue": "❌",
};

const report = await verify(dir);
const liveRan = report.endpoints.some((e) => e.status.startsWith("live"));
const mode = report.hadToken
  ? "token present via " + report.tokenEnv
  : liveRan
    ? "public API — live-probed without a token"
    : "no token → structural checks only";
console.log(`\nVerification — ${report.api}  (${mode})\n`);
for (const e of report.endpoints) console.log(`  ${icon[e.status] ?? "?"} ${e.status.padEnd(20)} ${e.name}  — ${e.detail}`);
console.log("\n  summary:", Object.entries(report.summary).map(([k, v]) => `${v} ${k}`).join(", "));

writeFileSync(join(dir, "verification.json"), JSON.stringify(report, null, 2));
console.log(`  report → ${join(dir, "verification.json")}`);

// Exit non-zero if anything actually failed (CI-friendly). Unverified/structural are not failures.
const failed = report.endpoints.some((e) => e.status === "live-failed" || e.status === "structural-issue");
process.exit(failed ? 1 : 0);
