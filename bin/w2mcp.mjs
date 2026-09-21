#!/usr/bin/env node
// `w2mcp` command — registers the TypeScript loader, then runs the CLI. Works via `npx w2mcp`
// inside the repo or globally after `npm link`, on Windows / macOS / Linux.
import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register();
const here = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(here, "..", "src", "use-cli.ts")).href);
