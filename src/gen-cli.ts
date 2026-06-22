/**
 * gen-cli — run the GENERATE stage standalone on a saved ApiModel JSON.
 * Usage: tsx src/gen-cli.ts <apimodel.json> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseApiModel } from "./model.js";
import { generateServer } from "./generate.js";

const [, , modelPath, outDir] = process.argv;
if (!modelPath || !outDir) {
  console.error("Usage: tsx src/gen-cli.ts <apimodel.json> <outDir>");
  process.exit(1);
}

const model = parseApiModel(readFileSync(modelPath, "utf8"));
const files = generateServer(model);
mkdirSync(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content);
  console.log(`  wrote ${name} (${content.length} chars)`);
}
console.log(`\n✓ Generated ${model.api_name} MCP server (${model.endpoints.length} tools) → ${outDir}`);
