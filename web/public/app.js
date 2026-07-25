const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

// ── Generate (SSE pipeline) ─────────────────────────────────────────────────
$("#gen").onclick = async () => {
  const urls = $("#urls").value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return;
  const render = $("#render").checked;
  const follow = $("#follow") ? $("#follow").checked : true;

  $("#pipe").classList.remove("hidden");
  $("#result").classList.add("hidden");
  $("#gen").disabled = true;
  $("#log").textContent = "";
  $("#barfill").style.width = "0%";
  document.querySelectorAll(".stg").forEach((s) => s.classList.remove("active", "done"));

  const resp = await fetch("/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, render, follow }),
  });
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!line.startsWith("data:")) continue;
      handleEvent(JSON.parse(line.slice(5).trim()));
    }
  }
  $("#gen").disabled = false;
};

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");
let STAGES = ["crawl", "clean", "extract", "generate"];
function setStages(labels) {
  STAGES = labels.map(slug);
  $(".stages").innerHTML = labels.map((l) => `<div class="stg" data-s="${slug(l)}">${l}</div>`).join("");
}
function handleEvent(ev) {
  if (ev.pct != null) $("#barfill").style.width = ev.pct + "%";
  if (ev.stage === "meta") { setStages(ev.stages); if (ev.msg) logline(ev.msg, ev.mode === "openapi" ? "#9fe6c8" : "#9fb4ff"); return; }
  const sl = ev.stage ? slug(ev.stage) : "";
  if (sl && STAGES.includes(sl)) {
    const idx = STAGES.indexOf(sl);
    STAGES.forEach((s, k) => {
      const node = document.querySelector(`.stg[data-s="${s}"]`);
      if (!node) return;
      node.classList.toggle("active", k === idx);
      node.classList.toggle("done", k < idx);
    });
  }
  if (ev.msg) logline(ev.msg);
  if (ev.stage === "done") { document.querySelectorAll(".stg").forEach((n) => n.classList.add("done")); renderResult(ev); }
  if (ev.stage === "error") logline("✗ " + ev.msg, "#ff9d9d");
}
function logline(msg, color) {
  const l = $("#log");
  if (color) l.innerHTML += `<span style="color:${color}">${msg}</span>\n`; else l.textContent += msg + "\n";
  l.scrollTop = l.scrollHeight;
}

function renderResult(ev) {
  const r = $("#result"); r.classList.remove("hidden"); r.innerHTML = "";
  const m = ev.model;
  const head = el("div", "srv-head");
  head.append(el("span", "srv-name", `${m.api_name}`));
  head.append(el("span", "pill ok", `${m.tool_count} tools`));
  head.append(el("span", "pill", `auth: ${m.auth}`));
  head.append(el("span", "pill", ev.mode === "openapi" ? "◆ from OpenAPI spec · no LLM" : "◆ from HTML docs"));
  if (ev.callableApi) { const b = el("button", "usebtn", "▶ Try it live →"); b.onclick = () => selectServer(ev.callableApi); head.append(b); }
  r.append(head);
  r.append(el("div", "meta", `GENERATED · base_url ${m.base_url || "(none)"} · files: ${ev.files.join(", ")}`));

  const many = ev.tools.length > 12;
  const wrap = el("div", many ? "tools-wrap scroll" : "tools-wrap");
  if (many) {
    const search = el("input", "toolsearch");
    search.type = "text"; search.placeholder = `Filter ${ev.tools.length} tools…`;
    const count = el("span", "toolcount", `${ev.tools.length} shown`);
    search.oninput = () => {
      const q = search.value.toLowerCase();
      let shown = 0;
      wrap.querySelectorAll(".tool").forEach((c) => { const hit = c.dataset.s.includes(q); c.style.display = hit ? "" : "none"; if (hit) shown++; });
      count.textContent = `${shown} shown`;
    };
    const bar = el("div", "toolbar"); bar.append(search, count); r.append(bar);
  }
  for (const t of ev.tools) {
    const card = el("div", "tool");
    card.dataset.s = `${t.name} ${t.description || ""} ${t.method || ""} ${t.path || ""}`.toLowerCase();
    card.append(el("div", null, `<span class="tool-n">${t.name}</span>${t.method ? `<span class="tool-m">${t.method} ${t.path || ""}</span>` : ""}`));
    if (t.description) card.append(el("div", "tool-d", t.description));
    if (t.params?.length) {
      const req = t.params.filter((p) => p.required).map((p) => p.name);
      card.append(el("div", "tool-p", `<b>${t.params.length}</b> params${req.length ? ` · required: <b>${req.join(", ")}</b>` : ""}`));
    }
    wrap.append(card);
  }
  r.append(wrap);
  if (ev.callableApi && $("#installServer")) { $("#installServer").value = ev.callableApi; renderInstall(); }
}

// ── examples ────────────────────────────────────────────────────────────────
document.querySelectorAll(".ex").forEach((b) => b.onclick = () => {
  $("#urls").value = b.dataset.urls.split("|").join("\n");
});

// ── Live call panel ─────────────────────────────────────────────────────────
let TOOLS = [];
let SERVER_PATHS = {};
async function loadServers() {
  const { servers, paths } = await (await fetch("/api/servers")).json();
  SERVER_PATHS = paths || {};
  const sel = $("#server"); sel.innerHTML = "";
  servers.forEach((s) => sel.append(el("option", null, s)));
  sel.onchange = () => loadTools(sel.value);
  const isel = $("#installServer"); isel.innerHTML = "";
  servers.forEach((s) => isel.append(el("option", null, s)));
  isel.onchange = renderInstall;
  renderInstall();
  if (servers.length) await loadTools(servers[0]);
}
async function selectServer(api) {
  $("#server").value = api; await loadTools(api);
  $("#server").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function loadTools(api) {
  const { tools } = await (await fetch("/api/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api }) })).json();
  TOOLS = tools || [];
  const sel = $("#tool"); sel.innerHTML = "";
  TOOLS.forEach((t) => sel.append(el("option", null, t.name)));
  sel.onchange = renderArgs; renderArgs();
}
function currentTool() { return TOOLS.find((t) => t.name === $("#tool").value); }
function renderArgs() {
  const t = currentTool(); const f = $("#argform"); f.innerHTML = "";
  if (!t) return;
  const props = t.inputSchema?.properties || {};
  const required = t.inputSchema?.required || [];
  // sensible demo defaults so a click "just works"
  const DEF = { vs_currencies: "usd", vs_currency: "usd", ids: "bitcoin,ethereum", base: "USD", quotes: "INR,EUR,AED", include_24hr_change: "true" };
  for (const [name, spec] of Object.entries(props)) {
    if (name === "verbosity") continue;
    const row = el("div", "argrow");
    row.append(el("label", null, `${name}${required.includes(name) ? ' <span class="req">*</span>' : ""} <span class="muted">${spec.description || ""}</span>`));
    const inp = el("input"); inp.type = "text"; inp.id = "arg_" + name; inp.dataset.name = name;
    if (DEF[name] != null) inp.value = DEF[name];
    inp.placeholder = spec.type || "";
    row.append(inp); f.append(row);
  }
}
$("#call").onclick = async () => {
  const t = currentTool(); if (!t) return;
  const args = {};
  document.querySelectorAll("#argform input").forEach((i) => {
    let v = i.value.trim(); if (v === "") return;
    if (v === "true") v = true; else if (v === "false") v = false;
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    args[i.dataset.name] = v;
  });
  const out = $("#callout");
  out.innerHTML = `<pre><span class="spin"></span> calling ${$("#server").value} · ${t.name} …</pre>`;
  const res = await (await fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api: $("#server").value, tool: t.name, args }) })).json();
  if (res.error) out.innerHTML = `<pre class="err">✗ ${res.error.message || JSON.stringify(res.error)}</pre>`;
  else out.innerHTML = `<pre>${JSON.stringify(res.data, null, 2)}</pre>`;
};

// ── Install / Connect ───────────────────────────────────────────────────────
const DEMO_KEY = "ak_demo_w2mcp_2026";
const GW = "http://localhost:8080";
let installClient = "Claude Desktop";
function installSnippet(api, client) {
  const url = `${GW}/mcp/${api}`;
  const cfg = { mcpServers: { [api]: { url, headers: { Authorization: `Bearer ${DEMO_KEY}` } } } };
  if (client === "Claude Desktop" || client === "Cursor") return JSON.stringify(cfg, null, 2);
  if (client === "Claude Code") return `claude mcp add --transport http ${api} ${url} \\\n  --header "Authorization: Bearer ${DEMO_KEY}"`;
  // Local (stdio) — client launches the generated server itself, no gateway
  const p = (SERVER_PATHS[api] || `./demo/${api}/server.ts`).replace(/^\.\//, "");
  return JSON.stringify({ mcpServers: { [api]: { command: "node", args: ["--import", "tsx", p] } } }, null, 2);
}
function installPath(client) {
  return ({
    "Claude Desktop": "→ %APPDATA%\\Claude\\claude_desktop_config.json   (restart Claude Desktop after saving)",
    "Cursor": "→ ~/.cursor/mcp.json   (or .cursor/mcp.json inside a project)",
    "Claude Code": "→ paste into your terminal",
    "Local (stdio)": "→ no gateway/network — the client spawns the server directly (set the API token via env if it needs auth)",
  })[client] || "";
}
function renderInstall() {
  const api = ($("#installServer") && $("#installServer").value) || "coingecko";
  $("#installcode").textContent = installSnippet(api, installClient);
  $("#pathHint").textContent = installPath(installClient);
}
document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  t.classList.add("active"); installClient = t.dataset.c; renderInstall();
});
$("#copy").onclick = async () => {
  try { await navigator.clipboard.writeText($("#installcode").textContent); } catch {}
  const b = $("#copy"); b.textContent = "Copied ✓"; b.classList.add("done");
  setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1500);
};

// ── Connector (the hub — one connection, every API) ─────────────────────────
const HUB_FILE = "C:\\Users\\karti\\anymcp\\src\\hub.ts";
let connectClient = "Claude Desktop";
function connectSnippet(client) {
  if (client === "HTTP (hosted)")
    return JSON.stringify({ mcpServers: { w2mcp: { url: "http://localhost:9090/mcp" } } }, null, 2);
  return JSON.stringify({ mcpServers: { w2mcp: { command: "node", args: ["--import", "tsx", HUB_FILE] } } }, null, 2);
}
function connectHint(client) {
  return ({
    "Claude Desktop": "→ %APPDATA%\\Claude\\claude_desktop_config.json   (restart Claude Desktop after saving)",
    "Cursor": "→ ~/.cursor/mcp.json   (or .cursor/mcp.json inside a project)",
    "HTTP (hosted)": "→ start it with:  MCP_TRANSPORT=http PORT=9090 npm run hub   then point any HTTP MCP client at /mcp",
  })[client] || "";
}
function renderConnect() {
  if (!$("#connectCode")) return;
  $("#connectCode").textContent = connectSnippet(connectClient);
  $("#connectHint").textContent = connectHint(connectClient);
}
document.querySelectorAll(".ctab").forEach((t) => t.onclick = () => {
  document.querySelectorAll(".ctab").forEach((x) => x.classList.remove("active"));
  t.classList.add("active"); connectClient = t.dataset.c; renderConnect();
});
if ($("#connectCopy")) $("#connectCopy").onclick = async () => {
  try { await navigator.clipboard.writeText($("#connectCode").textContent); } catch {}
  const b = $("#connectCopy"); b.textContent = "Copied ✓"; b.classList.add("done");
  setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1500);
};
renderConnect();

loadServers();
