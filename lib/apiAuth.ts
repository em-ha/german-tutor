/**
 * Shared secret auth for Next.js API routes.
 *
 * The secret is baked into the frontend bundle at build time via
 * NEXT_PUBLIC_API_SECRET. It won't stop a determined attacker who
 * inspects the bundle, but it blocks all casual / automated abuse.
 *
 * Set NEXT_PUBLIC_API_SECRET in:
 *   - .env.local (local dev)
 *   - Railway environment variables for the german-tutor service (production)
 */

/** Header name used on every API request from the frontend. */
export const API_SECRET_HEADER = "x-api-secret";

/**
 * Returns the headers object to include on every fetch() call to /api/*.
 * Usage: fetch("/api/token", { headers: apiHeaders() })
 *        fetch("/api/tts",   { method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, ... })
 */
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const secret = process.env.NEXT_PUBLIC_API_SECRET ?? "";
  return {
    [API_SECRET_HEADER]: secret,
    ...extra,
  };
}

/**
 * Call this at the top of every API route handler.
 * Returns a 401 Response if the secret is missing or wrong, otherwise null.
 *
 * Usage:
 *   const authError = checkApiSecret(req);
 *   if (authError) return authError;
 */
export function checkApiSecret(req: Request): Response | null {
  const expected = process.env.NEXT_PUBLIC_API_SECRET;
  // If no secret is configured, skip the check (dev fallback — logs a warning).
  if (!expected) {
    console.warn("[API] NEXT_PUBLIC_API_SECRET is not set — endpoint is unprotected");
    return null;
  }
  const provided = req.headers.get(API_SECRET_HEADER);
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
