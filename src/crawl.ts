/**
 * Stage 1 — CRAWL. Fetch the docs page(s).
 * Default: plain fetch (covers static/SSR docs — proven on Notion). Opt-in: Playwright render
 * (`--render`) for JS-rendered doc sites. Playwright is lazy-imported so fetch-only users don't
 * need the browser installed.
 */
export interface CrawlOpts { render?: boolean }

export async function crawl(url: string, opts: CrawlOpts = {}): Promise<{ url: string; html: string }> {
  return opts.render ? crawlRendered(url) : crawlFetch(url);
}

async function crawlFetch(url: string): Promise<{ url: string; html: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "w2mcp/0.1 (+docs reader)", Accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`crawl: ${url} returned ${res.status}`);
  const html = await res.text();
  if (html.length < 200) throw new Error(`crawl: ${url} returned ${html.length} bytes — likely JS-rendered; retry with --render.`);
  return { url, html };
}

async function crawlRendered(url: string): Promise<{ url: string; html: string }> {
  // Lazy import: only required when --render is used. Needs `npx playwright install chromium`.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: "w2mcp/0.1 (+docs reader)" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500); // let client-side docs hydrate
    const html = await page.content();
    return { url, html };
  } finally {
    await browser.close();
  }
}

/**
 * Smart crawl — a single docs URL often puts the endpoints on one page but the `base_url`
 * (and auth details) on a separate intro/auth/reference page, so single-page extraction misses
 * base_url (a documented failure mode). This fetches the entry page, then follows a FEW related
 * same-origin doc pages (auth / getting-started / reference / overview) that tend to carry base_url.
 *
 * Deliberately conservative — only pages whose URL/link-text hit a hint keyword, capped at
 * `maxPages` total — so a clean single-page API (e.g. Chuck Norris) still yields just its one page
 * and doesn't get polluted by about/blog links. Link discovery runs on the returned HTML, which for
 * `--render` is the hydrated DOM (page.content()), so JS-built nav is covered too.
 */
export async function crawlSmart(
  entryUrl: string,
  opts: CrawlOpts & { maxPages?: number } = {},
): Promise<Array<{ url: string; html: string }>> {
  const maxPages = Math.max(1, opts.maxPages ?? 3); // entry + up to (maxPages-1) followed pages
  const entry = await crawl(entryUrl, opts);
  if (maxPages <= 1) return [entry];
  const follow = rankFollowLinks(extractLinks(entry.html, entry.url), entry.url).slice(0, maxPages - 1);
  const pages = [entry];
  for (const u of follow) {
    try { pages.push(await crawl(u, opts)); } catch { /* dead/blocked link — skip, entry still stands */ }
  }
  return pages;
}

/**
 * Link text/paths that tend to carry base_url or auth details. High-signal only — bare `api`/`rest`
 * were dropped because they match hostnames in example-call links (e.g. api.example.com/foo), which
 * would follow sample endpoints instead of the doc pages we want.
 */
const FOLLOW_HINTS: Array<[RegExp, number]> = [
  [/auth(enticat)?/i, 3],
  [/getting[-_ ]?started|get[-_ ]?started|quick[-_ ]?start/i, 3],
  [/api[-_ ]?reference|\breference\b/i, 3],
  [/introduction|overview|\bintro\b/i, 2],
  [/\bendpoints?\b/i, 2],
  [/base[-_ ]?url|\busage\b/i, 2],
];

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

/** Pull same-origin, doc-ish <a> links (with their anchor text) out of a page's HTML. */
function extractLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  let base: URL;
  try { base = new URL(baseUrl); } catch { return out; }
  const re = /<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    let u: URL;
    try { u = new URL(raw, base); } catch { continue; }
    if (u.origin !== base.origin) continue; // same-origin only — don't wander off the docs site
    if (/\.(png|jpe?g|gif|svg|css|js|pdf|zip|ico|woff2?|mp4)($|\?)/i.test(u.pathname)) continue;
    u.hash = "";
    out.push({ url: u.toString(), text: stripTags(m[2]).slice(0, 120) });
  }
  return out;
}

/** Rank candidate links by hint keywords; only links that hit a hint are followed (score > 0). */
function rankFollowLinks(links: Array<{ url: string; text: string }>, entryUrl: string): string[] {
  const entry = new URL(entryUrl);
  const entryKey = entry.pathname.replace(/\/+$/, "");
  const section = "/" + entryKey.split("/").filter(Boolean).slice(0, 1).join("/"); // top-level docs section
  const seen = new Set<string>([entryKey]);
  const scored: Array<{ url: string; score: number }> = [];
  for (const { url, text } of links) {
    const u = new URL(url);
    const key = u.pathname.replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    // Strip full URLs out of the anchor text so an example-call link's host/path can't trip a hint.
    const cleanText = text.replace(/https?:\/\/\S+/gi, " ");
    const hay = `${u.pathname} ${cleanText}`.toLowerCase();
    let score = 0;
    for (const [re, w] of FOLLOW_HINTS) if (re.test(hay)) score += w;
    if (score > 0 && section.length > 1 && key.startsWith(section)) score += 1; // prefer same docs section
    if (score > 0) scored.push({ url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}
