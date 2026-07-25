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

/**
 * Assemble multiple crawled pages into one markdown blob for the extractor.
 *
 * Pages before `followFrom` are PRIMARY (the entry page, or user-chosen multi-URL inputs) and kept
 * in full — this preserves the verified multi-URL flows. Pages from `followFrom` onward are
 * AUTO-FOLLOWED supplements: truncated to `followBudget` so a big reference page can only contribute
 * its top (where base_url/auth live), never dump an endpoint table that balloons the model's output.
 *
 * Default `followFrom: 1` = single entry page + followed pages. For explicit multi-URL, pass
 * `followFrom: pages.length` so every user-chosen page is treated as primary (uncapped).
 */
export function assembleSources(
  pages: Array<{ url: string; html: string }>,
  opts: { followFrom?: number; followBudget?: number } = {},
): string {
  const followFrom = opts.followFrom ?? 1;
  const followBudget = opts.followBudget ?? 8_000;
  return pages
    .map((p, i) => {
      let md = clean(p.html);
      if (i >= followFrom && md.length > followBudget) md = md.slice(0, followBudget) + "\n\n…(truncated)";
      return `# Source: ${p.url}\n\n${md}`;
    })
    .join("\n\n---\n\n");
}
