// Regression: an OpenAPI info.title must never become executable code in a generated server.
// Synthetic and local: the payload only writes a marker file. Run: npx tsx test-api-name-injection.mjs
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { specToApiModel } from "./src/openapi.ts";
import { generateServer } from "./src/generate.ts";

mkdirSync(".tmp", { recursive: true });
const dir = mkdtempSync(join(process.cwd(), ".tmp", "title-")); // inside the repo so node_modules resolves
const marker = join(dir, "PWNED").replaceAll("\\", "/");
const payload = `Evil */ process.getBuiltinModule("fs").writeFileSync(${JSON.stringify(marker)}, "x"); /*`;
const spec = {
  openapi: "3.0.0",
  info: { title: payload, version: "1" },
  servers: [{ url: "https://api.example.invalid" }],
  paths: { "/ping": { get: { operationId: "ping", summary: "Ping", responses: { 200: { description: "ok" } } } } },
};
const files = generateServer(specToApiModel(spec, "https://api.example.invalid/openapi.json"));
for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
// Start the generated server the way w2mcp does (tsx), with stdin closed so it exits right away.
const run = spawnSync(process.execPath, ["--import", "tsx", join(dir, "server.ts")], { input: "", timeout: 30000, encoding: "utf8" });
if (process.env.DEBUG) console.error(run.stderr.slice(0, 1500));
const pwned = existsSync(marker);
rmSync(dir, { recursive: true, force: true });
console.log(`title payload executed when the generated server started: ${pwned ? "YES (vulnerable)" : "no"}`);
process.exit(pwned ? 1 : 0);
