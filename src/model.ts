/**
 * ApiModel — the structured intermediate the whole pipeline keys off.
 * Stage 3 (extract) produces it from cleaned docs; stage 5 (generate) consumes it.
 *
 * v1 uses a flat param shape (type as a string). The nested TypeNode form
 * (phase-1-nested-params.md) is reserved for later; `type` already accepts the common cases.
 */
import { z } from "zod";

export const ParamSchema = z.object({
  name: z.string(),
  type: z.string(), // "string" | "number" | "boolean" | "object" | "array" | "string[]" | ...
  required: z.boolean().default(false),
  description: z.string().default(""),
  enum: z.array(z.any()).optional(),
  example: z.any().optional(),
});
export type Param = z.infer<typeof ParamSchema>;

export const EndpointSchema = z.object({
  name: z.string(), // snake_case tool name
  summary: z.string().default(""),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  operation: z.enum(["read", "write"]).default("read"),
  path_params: z.array(ParamSchema).default([]),
  query_params: z.array(ParamSchema).default([]),
  body_params: z.array(ParamSchema).default([]),
  example_request: z.any().optional(),
  error_codes: z.array(z.object({ code: z.number(), meaning: z.string() })).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  notes: z.string().default(""),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const AuthSchema = z.object({
  type: z.enum(["none", "bearer", "api_key", "oauth2", "basic", "unknown"]).default("unknown"),
  location: z.enum(["header", "query"]).nullable().default("header"),
  header_name: z.string().nullable().default("Authorization"),
  format: z.string().nullable().default("Bearer {token}"),
  extra_headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type Auth = z.infer<typeof AuthSchema>;

export const ApiModelSchema = z.object({
  api_name: z.string(),
  base_url: z.string().nullable(),
  auth: AuthSchema,
  endpoints: z.array(EndpointSchema),
  // Response field names that are verbose metadata (audit/formatting/ids) safe to strip from
  // tool output. Conservative — only clearly-non-core fields. Fed to the response shaper.
  response_noise: z.array(z.string()).default([]),
});
export type ApiModel = z.infer<typeof ApiModelSchema>;

/** Validate raw JSON (string or object) into a typed ApiModel; throws with a readable message. */
export function parseApiModel(raw: string | unknown): ApiModel {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  const r = ApiModelSchema.safeParse(obj);
  if (!r.success) {
    throw new Error("Invalid ApiModel:\n" + JSON.stringify(r.error.format(), null, 2));
  }
  return r.data;
}
