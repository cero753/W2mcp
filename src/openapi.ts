/**
 * OpenAPI fast-path — when an API DOES publish a spec (Swagger/OpenAPI 2/3), skip the LLM
 * extract stage and convert the spec directly into the same ApiModel the rest of the pipeline
 * consumes. Deterministic, complete, free. This is the "spec one URL away" case the plan flagged:
 * many "HTML-only" doc sites are really a Swagger UI whose spec JSON is one fetch away.
 *
 * Only INPUT shapes matter for tool generation (path/query/body params + auth), so we resolve
 * $refs lazily to the depth we need and keep nested shapes coarse — same contract as extract.ts.
 */
import { parseApiModel, type ApiModel, type Auth, type Endpoint, type Param } from "./model.js";

type Json = Record<string, any>;
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Resolve a JSON Pointer $ref ("#/components/schemas/X") against the root spec. */
function deref(spec: Json, node: any, seen = new Set<string>()): any {
  if (!node || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return {}; // circular guard
    seen.add(node.$ref);
    const parts = node.$ref.replace(/^#\//, "").split("/");
    let cur: any = spec;
    for (const p of parts) cur = cur?.[p.replace(/~1/g, "/").replace(/~0/g, "~")];
    return deref(spec, cur, seen);
  }
  return node;
}

/** OpenAPI schema → w2mcp coarse type string (the flat v1 param model). */
function schemaType(spec: Json, schemaIn: any): { type: string; enum?: any[] } {
  const s = deref(spec, schemaIn) || {};
  const enumVals = Array.isArray(s.enum) ? s.enum : undefined;
  // Compose keywords (oneOf/anyOf/allOf) → treat as open object unless obviously scalar.
  const t = s.type ?? (s.properties ? "object" : s.items ? "array" : undefined);
  switch (t) {
    case "integer":
    case "number": return { type: "number", enum: enumVals };
    case "boolean": return { type: "boolean", enum: enumVals };
    case "string": return { type: "string", enum: enumVals };
    case "array": {
      const it = deref(spec, s.items) || {};
      return { type: it.type === "string" ? "string[]" : "array" };
    }
    case "object": return { type: "object" };
    default: return { type: "string", enum: enumVals };
  }
}

function toParam(spec: Json, raw: any, forceRequired?: boolean): Param {
  const p = deref(spec, raw);
  const src = p.schema ? deref(spec, p.schema) : p; // param has .schema (OAS3) or is inline (OAS2)
  const { type, enum: en } = schemaType(spec, p.schema ?? p);
  const example = p.example ?? src.example ?? (Array.isArray(src.examples) ? undefined : undefined);
  return {
    name: String(p.name),
    type,
    required: forceRequired ?? !!p.required,
    description: String(p.description ?? src.description ?? ""),
    ...(en && en.length ? { enum: en } : {}),
    ...(example !== undefined ? { example } : {}),
  };
}

/** Body schema (application/json) → flat list of top-level body params. */
function bodyParams(spec: Json, requestBody: any): { params: Param[]; example?: any } {
  const rb = deref(spec, requestBody);
  const media = rb?.content?.["application/json"] ?? rb?.content?.["application/*+json"];
  if (!media?.schema) return { params: [] };
  const schema = deref(spec, media.schema);
  const example = media.example ?? schema.example;
  if (schema.type !== "object" || !schema.properties) {
    // Non-object body (array/scalar/unknown) — expose one opaque `body` arg rather than drop it.
    return { params: [{ name: "body", type: schemaType(spec, schema).type, required: !!rb.required, description: "Request body." }], example };
  }
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const params: Param[] = Object.entries(schema.properties).map(([name, propIn]) => {
    const prop = deref(spec, propIn);
    const { type, enum: en } = schemaType(spec, prop);
    return {
      name,
      type,
      required: required.includes(name),
      description: String(prop.description ?? ""),
      ...(en && en.length ? { enum: en } : {}),
      ...(prop.example !== undefined ? { example: prop.example } : {}),
    };
  });
  return { params, example };
}

function mapAuth(spec: Json): Auth {
  // OAS3 components.securitySchemes, OAS2 securityDefinitions.
  const schemes: Json = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
  const first = Object.values(schemes)[0] as Json | undefined;
  if (!first) return { type: "none", location: null, header_name: null, format: null, extra_headers: [], confidence: 1 };
  const t = String(first.type ?? "").toLowerCase();
  const scheme = String(first.scheme ?? "").toLowerCase();
  if (t === "http" && scheme === "basic")
    return { type: "basic", location: "header", header_name: "Authorization", format: "Basic {token}", extra_headers: [], confidence: 1 };
  if (t === "http") // bearer (or unspecified http → assume bearer)
    return { type: "bearer", location: "header", header_name: "Authorization", format: "Bearer {token}", extra_headers: [], confidence: 1 };
  if (t === "oauth2")
    return { type: "oauth2", location: "header", header_name: "Authorization", format: "Bearer {token}", extra_headers: [], confidence: 1 };
  if (t === "apikey") {
    const loc = first.in === "query" ? "query" : "header";
    return { type: "api_key", location: loc, header_name: String(first.name ?? "X-API-Key"), format: "{token}", extra_headers: [], confidence: 1 };
  }
  return { type: "unknown", location: "header", header_name: "Authorization", format: "Bearer {token}", extra_headers: [], confidence: 0.5 };
}

// operationId (or method+path) → unique snake_case tool name, ≤64 chars.
function makeName(op: Json, method: string, path: string, used: Set<string>): string {
  let base = op.operationId
    ? String(op.operationId)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")      // camelCase → camel_Case
        .replace(/[^a-zA-Z0-9]+/g, "_")
    : `${method}_${path}`.replace(/[^a-zA-Z0-9]+/g, "_");
  base = base.toLowerCase().replace(/^_+|_+$/g, "").slice(0, 60) || "op";
  let name = base, i = 2;
  while (used.has(name)) name = `${base}_${i++}`.slice(0, 64);
  used.add(name);
  return name;
}

/** Convert a parsed OpenAPI/Swagger spec object into a validated ApiModel. */
export function specToApiModel(spec: Json, sourceUrl?: string): ApiModel {
  const api_name = String(spec.info?.title ?? "API").trim() || "API";
  // Base URL: OAS3 servers[0].url, OAS2 schemes+host+basePath, else the docs origin.
  let base_url: string | null = spec.servers?.[0]?.url ?? null;
  if (!base_url && spec.host) base_url = `${(spec.schemes?.[0]) ?? "https"}://${spec.host}${spec.basePath ?? ""}`;
  // Specs often use a RELATIVE server URL (e.g. "/api/v3") — resolve it against the spec's source
  // origin so the generated server can actually call the API. Falls back to the source origin.
  if (sourceUrl && (!base_url || base_url.startsWith("/"))) {
    try { base_url = new URL(base_url ?? "", new URL(sourceUrl).origin).toString(); } catch { /* keep as-is */ }
  }
  if (base_url) base_url = base_url.replace(/\/$/, "");

  const auth = mapAuth(spec);
  const used = new Set<string>();
  const endpoints: Endpoint[] = [];

  for (const [path, itemIn] of Object.entries(spec.paths ?? {})) {
    const item = deref(spec, itemIn) as Json;
    const sharedParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of HTTP_METHODS) {
      const op = item[method] as Json | undefined;
      if (!op) continue;
      const allParams = [...sharedParams, ...(op.parameters ?? [])].map((p) => deref(spec, p));
      const path_params = allParams.filter((p) => p.in === "path").map((p) => toParam(spec, p, true));
      const query_params = allParams.filter((p) => p.in === "query").map((p) => toParam(spec, p));
      const { params: body_params, example } = op.requestBody ? bodyParams(spec, op.requestBody) : { params: [], example: undefined };

      const error_codes = Object.entries(op.responses ?? {})
        .map(([code, r]) => ({ code: Number(code), meaning: String((deref(spec, r) as Json)?.description ?? "") }))
        .filter((e) => Number.isFinite(e.code) && e.code >= 400);

      endpoints.push({
        name: makeName(op, method, path, used),
        summary: String(op.summary ?? op.description ?? "").split("\n")[0].slice(0, 300),
        method: method.toUpperCase() as Endpoint["method"],
        path,
        operation: method === "get" ? "read" : "write",
        path_params,
        query_params,
        body_params,
        ...(example !== undefined ? { example_request: example } : {}),
        error_codes,
        confidence: 1, // straight from the spec — not inferred
        notes: op.tags?.length ? `tags: ${op.tags.join(", ")}` : "",
      });
    }
  }

  const model = parseApiModel({ api_name, base_url, auth, endpoints, response_noise: [] });
  assertNoRefsLeak(model);
  return model;
}

/** Safety net: no unresolved $ref may survive into the ApiModel (would mean a silently-broken tool). */
function assertNoRefsLeak(model: ApiModel): void {
  const s = JSON.stringify(model);
  if (s.includes("$ref") || s.includes("#/components")) {
    throw new Error("openapi import: unresolved $ref leaked into the ApiModel — resolver missed a node.");
  }
}
