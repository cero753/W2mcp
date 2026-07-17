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
