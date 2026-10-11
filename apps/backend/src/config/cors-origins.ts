import cors from 'cors';

/**
 * Who may call this API from a browser, and how that decision is made.
 *
 * The bug this file fixes: with exactly one origin configured, the server
 * returned that same origin for every request. A browser on any other origin
 * then saw a header naming a different site and refused the response, even
 * though the origin was legitimate. Each request is now checked against the
 * list, and the origin that matched is echoed back.
 *
 * Rules:
 *   - CORS_ORIGIN lists origins separated by commas. Each must be an origin
 *     only: scheme and host, no path. A trailing slash is accepted and removed.
 *   - A wildcard (*) is refused. With credentials it is not allowed by browsers
 *     anyway, and it would be a shortcut past the allowlist.
 *   - A request is allowed only when its origin is on the list, compared exactly
 *     after normalising it. Nothing is matched by pattern.
 *   - A request with no Origin header is not a browser cross-origin request, so
 *     no CORS decision applies to it.
 */

export class CorsConfigError extends Error {}

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With'];

/** One configured entry, normalised to the form a browser sends: `scheme://host[:port]`. */
export function normaliseOrigin(raw: string): string {
  const candidate = raw.trim().replace(/\/+$/, '');
  if (candidate === '*') {
    throw new CorsConfigError('"*" is not allowed in CORS_ORIGIN; list each frontend origin explicitly');
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CorsConfigError(`"${candidate}" is not a valid origin (for example https://app.example.com)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CorsConfigError(`"${candidate}" must start with https:// (http:// is for local development only)`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new CorsConfigError(`"${candidate}" must be an origin only: scheme and host, with no path`);
  }
  return url.origin;
}

/** Parses the whole CORS_ORIGIN value. Throws if any entry is unsafe or none is given. */
export function parseAllowedOrigins(raw: string): string[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) {
    throw new CorsConfigError('CORS_ORIGIN must list at least one frontend origin');
  }
  return [...new Set(entries.map(normaliseOrigin))];
}

/**
 * The allowed origin that matches this request, or null. Returns the canonical
 * form, which is what the browser compares against.
 */
export function matchAllowedOrigin(requestOrigin: string | undefined, allowed: readonly string[]): string | null {
  if (!requestOrigin) return null;
  let origin: string;
  try {
    origin = new URL(requestOrigin).origin;
  } catch {
    // "null" and anything else that is not an origin never matches.
    return null;
  }
  return allowed.includes(origin) ? origin : null;
}

/** The CORS middleware for a given allowlist. The server and the tests use this same function. */
export function createCorsMiddleware(allowed: readonly string[]) {
  return cors({
    origin: (requestOrigin, callback) => {
      // A disallowed or unknown origin gets `false`: no allow-origin header is
      // sent, so the browser refuses to expose the response to that page.
      callback(null, matchAllowedOrigin(requestOrigin, allowed) ?? false);
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS
  });
}
