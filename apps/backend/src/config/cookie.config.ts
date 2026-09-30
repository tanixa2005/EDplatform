import { CookieOptions } from 'express';
import { env } from './env.config.js';

export const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Returns environment-aware cookie configuration options for session/auth tokens.
 * Automatically adapts secure, sameSite, and domain attributes between
 * local development (HTTP localhost) and production deployments (HTTPS / custom domains).
 */
export function getAuthCookieOptions(customMaxAgeMs?: number): CookieOptions {
  const isProduction = env.NODE_ENV === 'production';

  // Secure flag: true in production, or if explicitly enabled via env
  const secure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : isProduction;

  // SameSite: 'lax' provides good CSRF protection while permitting top-level navigation.
  // Can be configured to 'none' if API and frontend are on completely separate domains with HTTPS.
  let sameSite: 'lax' | 'strict' | 'none' = env.COOKIE_SAME_SITE;

  // In production with cross-origin deployments (e.g. Vercel frontend + Render backend on different domains),
  // cookies MUST use SameSite=none and Secure=true; otherwise browsers block cookies on cross-origin fetch().
  // If COOKIE_SAME_SITE was not explicitly set in process.env, default to 'none' in production.
  if (isProduction && !process.env.COOKIE_SAME_SITE) {
    sameSite = 'none';
  }

  // SameSite=none strictly requires Secure=true in all modern browsers (RFC 6265bis)
  const effectiveSecure = sameSite === 'none' ? true : secure;

  // Domain: Leave undefined for host-only cookies (e.g., localhost), or set for shared subdomains
  const domain = env.COOKIE_DOMAIN || undefined;

  // Default max age: 7 days in milliseconds
  const maxAge = customMaxAgeMs ?? 7 * 24 * 60 * 60 * 1000;

  return {
    httpOnly: true, // Prevents client-side scripts from reading the cookie
    secure: effectiveSecure,
    sameSite,
    domain,
    path: '/',
    maxAge
  };
}

/**
 * Returns cookie options to clear/invalidate the authentication cookie upon logout.
 */
export function getClearAuthCookieOptions(): CookieOptions {
  const options = getAuthCookieOptions(0);
  return {
    ...options,
    maxAge: 0
  };
}
