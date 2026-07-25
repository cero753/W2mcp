/**
 * w2mcp generic response shaper — emitted verbatim into every generated MCP server.
 * Structural, never silent: every elision leaves a marker. (See phase-1-response-shaping.md)
 * Validated on a live Notion response: maxDepth=8 preserves payload that maxDepth=6 ate.
 */
export interface ShapeOpts {
  maxChars?: number;
  arrayHead?: number;
  maxDepth?: number;
  maxString?: number;
  verbosity?: "compact" | "full";
  noiseFields?: string[];
}

const LINKAGE = new Set(["id", "next_cursor", "has_more", "object", "request_status", "type"]);
const DEFAULTS = { maxChars: 6000, arrayHead: 25, maxDepth: 8, maxString: 500 };

export function shapeResponse(raw: string, opts: ShapeOpts = {}): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cap = opts.maxChars ?? DEFAULTS.maxChars;
    return raw.length > cap ? raw.slice(0, cap) + `\n…[truncated ${kb(raw.length - cap)}]` : raw;
  }
  const full = opts.verbosity === "full";
  const o = {
    maxChars: opts.maxChars ?? (full ? DEFAULTS.maxChars * 4 : DEFAULTS.maxChars),
    arrayHead: opts.arrayHead ?? (full ? 200 : DEFAULTS.arrayHead),
    maxDepth: opts.maxDepth ?? (full ? 12 : DEFAULTS.maxDepth),
    maxString: opts.maxString ?? (full ? 5000 : DEFAULTS.maxString),
    noise: new Set(full ? [] : opts.noiseFields ?? []),
  };
  let out = JSON.stringify(walk(parsed, 0, o), null, 2);
  if (out.length > o.maxChars)
    out = out.slice(0, o.maxChars) + `\n…[truncated ${kb(out.length - o.maxChars)} — raise verbosity:full or page via next_cursor]`;
  return out;
}

function walk(v: unknown, depth: number, o: any): unknown {
  if (v === null) return null;
  if (typeof v === "string")
    return v.length > o.maxString ? v.slice(0, o.maxString) + `…[truncated ${kb(v.length - o.maxString)}]` : v;
  if (typeof v !== "object") return v;
  if (depth >= o.maxDepth) {
    const keys = Array.isArray(v) ? `${v.length} items` : Object.keys(v as object).slice(0, 6).join(",");
    return `[depth-capped: ${keys}]`;
  }
  if (Array.isArray(v)) {
    const head = v.slice(0, o.arrayHead).map((x) => walk(x, depth + 1, o));
    if (v.length > o.arrayHead)
      head.push({ _elided: v.length - o.arrayHead, _note: "re-query with verbosity:full or page via next_cursor" } as any);
    return head;
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (LINKAGE.has(k)) { out[k] = val; continue; }
    if (val === null) continue;
    if (o.noise.has(k)) continue;
    out[k] = walk(val, depth + 1, o);
  }
  return out;
}
const kb = (n: number) => (n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}KB`);
