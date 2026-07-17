/**
 * w2mcp-import <spec-url-or-file> [--out <dir>] [--model-only]
 * Fast-path for APIs that DO publish an OpenAPI/Swagger spec: fetch the spec JSON, convert it
 * directly to an ApiModel (no LLM), and generate the MCP server. Complete + deterministic.
 *
 *   npx tsx src/import-cli.ts https://api.example.com/openapi.json --out ./out/example
 *   npx tsx src/import-cli.ts ./local-spec.json --out ./out/example
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { specToApiModel } from "./openapi.js";
import { generateServer } from "./generate.js";
import YAML from "yaml";

/** Parse JSON, falling back to YAML — supports both .json and .yaml/.yml specs. */
function parseSpec(txt: string): any {
  try { return JSON.parse(txt); } catch { return YAML.parse(txt); }
}
async function loadSpec(src: string): Promise<any> {
  if (existsSync(src)) return parseSpec(readFileSync(src, "utf8"));
  const res = await fetch(src, { headers: { "User-Agent": "w2mcp-import", Accept: "application/json, text/yaml, */*" } });
  if (!res.ok) throw new Error(`fetch ${src} → HTTP ${res.status}`);
  return parseSpec(await res.text());
}

async function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith("--"));
  let outDir = "./out/server";
  let modelOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") outDir = args[++i] ?? outDir;
    if (args[i] === "--model-only") modelOnly = true;
  }
  if (!src) {
    console.error("Usage: w2mcp-import <spec-url-or-file> [--out <dir>] [--model-only]");
    process.exit(1);
  }

  console.error(`[1/2] load spec  ${src}`);
  const spec = await loadSpec(src);
  const model = specToApiModel(spec, src);
  const reads = model.endpoints.filter((e) => e.operation === "read").length;
  console.error(
    `      → ${model.api_name}: ${model.endpoints.length} endpoints ` +
      `(${reads} read / ${model.endpoints.length - reads} write), auth=${model.auth.type}, base_url=${model.base_url ?? "(none!)"}`
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "apimodel.json"), JSON.stringify(model, null, 2));
  if (modelOnly) {
    console.error(`✓ wrote apimodel.json → ${outDir} (--model-only)`);
    return;
  }

  console.error(`[2/2] generate → MCP server`);
  const files = generateServer(model);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  console.error(`\n✓ ${model.api_name} MCP server (${model.endpoints.length} tools) → ${outDir}`);
  console.error(`  next: see ${join(outDir, "INSTALL.md")}`);
}

main().catch((e) => {
  console.error("✗ " + (e?.message ?? e));
  process.exit(1);
});
