import { NextResponse } from "next/server";
import type { ZodType, z } from "zod";
import { formatIssues } from "./validation";

// Client-facing error payload; `fields` carries per-field validation errors.
export function jsonError(status: number, message: string, fields?: string[]) {
  return NextResponse.json(
    fields && fields.length > 0 ? { error: message, fields } : { error: message },
    { status }
  );
}

// Unexpected failure: log the real error server-side, return a generic 500 —
// never echo internal error messages to the client.
export function serverError(error: unknown) {
  console.error("[api] unhandled error:", error);
  return jsonError(500, "Internal server error");
}

// Malformed JSON should be a 400, not an unhandled throw.
export async function readJsonBody(
  req: Request
): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: jsonError(400, "Invalid JSON body") };
  }
}

export function parseBody<S extends ZodType>(
  schema: S,
  body: unknown
): { success: true; data: z.infer<S> } | { success: false; res: NextResponse } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  return { success: false, res: jsonError(400, "Validation failed", formatIssues(result.error)) };
}
