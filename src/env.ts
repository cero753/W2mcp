/**
 * Load `.env` from the current working directory (if present) without overriding variables that are
 * already set in the shell. Imported by every entrypoint so a fresh user only has to run `w2mcp init`.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(file = ".env"): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  try {
    // Node >= 20.12 — parses KEY=value lines, ignores comments, does not override existing env.
    process.loadEnvFile(path);
  } catch {
    /* unreadable or malformed .env: ignore — the caller will report a missing key clearly */
  }
}

loadEnv();
