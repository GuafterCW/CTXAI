import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveApiKeyUser } from "@/lib/api-keys";

/**
 * Resolve the calling user for an API route: either a platform API key
 * (`Authorization: Bearer ctx_…`, used by MCP/REST clients) or the
 * browser session cookie.
 */
export async function requireApiUser() {
  const h = await headers();

  const bearer = h.get("authorization");
  if (bearer?.startsWith("Bearer ctx_")) {
    const user = await resolveApiKeyUser(bearer.slice("Bearer ".length));
    if (user) return user;
    throw NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const session = await auth.api.getSession({ headers: h });
  if (!session) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session.user;
}

/** Wrap a route handler body so thrown NextResponses become responses. */
export async function handling<T>(
  fn: () => Promise<T>,
): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof Response) return err as unknown as NextResponse;
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
