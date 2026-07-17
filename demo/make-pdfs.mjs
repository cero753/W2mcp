// Render the pitch deck + the pitch script to PDF using the bundled Playwright chromium.
//   node demo/make-pdfs.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();

// 1) DECK → pitch-deck.pdf (print CSS shows every slide, one landscape page each)
{
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(HERE, "pitch-deck.html")).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: join(HERE, "pitch-deck.pdf"), width: "1280px", height: "720px", printBackground: true });
  console.log("✓ pitch-deck.pdf");
  await page.close();
}

// 2) SCRIPT → pitch-script.pdf (render PITCH.md via marked, styled for reading)
{
  const md = readFileSync(join(HERE, "PITCH.md"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body{font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:820px;margin:0 auto;padding:32px}
    h1{font-size:26px;border-bottom:2px solid #5b8cff;padding-bottom:8px}
    h2{font-size:20px;margin-top:26px;color:#1e3a8a;border-bottom:1px solid #ddd;padding-bottom:4px}
    h3{font-size:16px;margin-top:18px}
    code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:13px}
    pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;page-break-inside:avoid}
    pre code{background:none;color:inherit}
    blockquote{border-left:4px solid #f59e0b;margin:12px 0;padding:6px 14px;background:#fffbeb;color:#78350f}
    table{border-collapse:collapse;width:100%;font-size:13px}
    th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
    th{background:#f8fafc}
    strong{color:#0f172a}
    h2,h3,tr{page-break-inside:avoid}
  </style></head>
  <body><div id="out"></div>
  <script>document.getElementById('out').innerHTML = marked.parse(${JSON.stringify(md)}); window.__ready=true;</script>
  </body></html>`;
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__ready === true").catch(() => {});
  await page.pdf({ path: join(HERE, "pitch-script.pdf"), format: "A4", printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
  console.log("✓ pitch-script.pdf");
  await page.close();
}

await browser.close();
