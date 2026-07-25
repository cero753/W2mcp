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
 * Assemble multiple crawled pages into one markdown blob for the extractor, under a size budget.
 * The FIRST page (the entry/primary docs page) keeps priority; each FOLLOWED page is truncated to a
 * smaller excerpt — enough to surface base_url/auth (which sit near the top of intro/auth/reference
 * pages) without letting big reference pages balloon the model's output past its token limit.
 */
export function assembleSources(
  pages: Array<{ url: string; html: string }>,
  opts: { entryBudget?: number; followBudget?: number } = {},
): string {
  const entryBudget = opts.entryBudget ?? 45_000;
  const followBudget = opts.followBudget ?? 8_000; // followed pages are for base_url/auth (top of page), not full endpoint dumps
  return pages
    .map((p, i) => {
      let md = clean(p.html);
      const budget = i === 0 ? entryBudget : followBudget;
      if (md.length > budget) md = md.slice(0, budget) + "\n\n…(truncated)";
      return `# Source: ${p.url}\n\n${md}`;
    })
    .join("\n\n---\n\n");
}
