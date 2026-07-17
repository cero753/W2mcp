/**
 * w2mcp <url> [<more-urls>...] [--out <dir>] [--model-only]
 * Full pipeline: crawl → clean → extract → generate → write a runnable MCP server.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crawl } from "./crawl.js";
import { clean } from "./clean.js";
import { extract, describeProvider } from "./extract.js";
import { generateServer } from "./generate.js";

async function main() {
  const args = process.argv.slice(2);
  // Parse: any non-flag arg is a docs URL; --out <dir> sets output; --model-only stops before generate.
  const urls: string[] = [];
  let outDir = "./out/server";
  let modelOnly = false;
  let render = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") { outDir = args[++i] ?? outDir; continue; }
    if (a === "--model-only") { modelOnly = true; continue; }
    if (a === "--render") { render = true; continue; }
    if (a.startsWith("--")) continue;
    urls.push(a);
  }
  if (urls.length === 0) {
    console.error("Usage: w2mcp <docs-url> [<more-urls>...] [--out <dir>] [--model-only]");
    console.error("Tip: include the auth/intro page too — that's where the base URL usually lives.");
    process.exit(1);
  }

  console.error(`[1/4] crawl   ${urls.length} page(s)${render ? " (render mode)" : ""}`);
  const parts: string[] = [];
  for (const u of urls) {
    const { html } = await crawl(u, { render });
    parts.push(`# Source: ${u}\n\n${clean(html)}`);
    console.error(`        ✓ ${u} (${html.length} bytes)`);
  }
  const md = parts.join("\n\n---\n\n");
  console.error(`[2/4] clean   combined → ${md.length} chars markdown`);
  console.error(`[3/4] extract → ApiModel (${describeProvider()})`);
  const model = await extract(md, urls[0]);
  console.error(`        → ${model.api_name}: ${model.endpoints.length} endpoints, auth=${model.auth.type}, base_url=${model.base_url ?? "(none!)"}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "apimodel.json"), JSON.stringify(model, null, 2));
  if (modelOnly) {
    console.error(`✓ wrote apimodel.json → ${outDir} (--model-only)`);
    return;
  }

  console.error(`[4/4] generate → MCP server`);
  const files = generateServer(model);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  console.error(`\n✓ ${model.api_name} MCP server (${model.endpoints.length} tools) → ${outDir}`);
  console.error(`  next: see ${join(outDir, "INSTALL.md")}`);
}

main().catch((e) => {
  console.error("✗ " + (e?.message ?? e));
  process.exit(1);
});
