/**
 * Shared CORS headers for all edge functions
 *
 * Provides consistent cross-origin request handling across the FrostGuard platform.
 *
 * SECURITY: In production, CORS_ORIGINS env var should be set to restrict origins.
 * Default allows all origins (*) for development convenience.
 */

// Allowed origins from environment (comma-separated) or default to wildcard for dev
const allowedOrigins = Deno.env.get("CORS_ORIGINS")?.split(",").map((o) => o.trim()) || [];

/**
 * Get CORS headers for a specific request origin
 * Returns the origin if it's in the allowed list, otherwise returns the first allowed origin
 * Falls back to "*" only if no CORS_ORIGINS is configured (development mode)
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  let origin = "*";

  if (allowedOrigins.length > 0) {
    // Production: only allow configured origins
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      origin = requestOrigin;
    } else {
      // Return first configured origin if request origin not in list
      origin = allowedOrigins[0];
    }
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-api-key",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Legacy static CORS headers for backward compatibility
 * DEPRECATED: Use getCorsHeaders(request.headers.get("origin")) instead for proper origin validation
 */
export const corsHeaders = getCorsHeaders();

/**
 * Handle CORS preflight request
 * Returns a proper 200 response with CORS headers
 * @param requestOrigin - The Origin header from the request
 */
export function handleCorsPreflightRequest(requestOrigin?: string | null): Response {
  return new Response(null, { status: 200, headers: getCorsHeaders(requestOrigin) });
}
