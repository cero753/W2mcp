/**
 * Stage 2 — CLEAN. HTML → Markdown, strip noise. Shrinks tokens ~5-10× and removes
 * nav/scripts/styles that would confuse the extractor.
 */
import TurndownService from "turndown";

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export function clean(html: string): string {
  // Drop non-content elements before conversion.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  let md = td.turndown(stripped);
  // Collapse excessive blank lines.
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}
