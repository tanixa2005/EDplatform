import type { NextFunction, Request, Response } from 'express';
import type { SafeUser } from '@edplatform/shared';
import { UnauthorizedError } from '../errors/app.error.js';
import { activeOrNull } from '../services/account-access.js';

/**
 * How a request is authenticated. The decision logic lives here, with every
 * credential source passed in, so it can be tested without a database, the
 * environment, or Clerk's network. auth.middleware.ts wires in the real sources.
 *
 * Two credentials are accepted, tried in this order:
 *   1. `Authorization: Bearer <token>`. A Clerk session token is tried first. If it
 *      is not a Clerk token, it is tried as a legacy JWT.
 *   2. The legacy HttpOnly cookie, signed with JWT_SECRET.
 *
 * A credential that does not resolve to an active account yields no user. It never
 * yields an authenticated session.
 */

export interface AuthSources {
  /** Name of the cookie that carries the legacy token. */
  cookieName: string;
  /** Verifies a Clerk session token. Returns null when the token is not a valid Clerk token. */
  verifyClerk(token: string): Promise<{ clerkUserId: string } | null>;
  /** Resolves a verified Clerk id to a local account. May throw. */
  resolveClerk(clerkUserId: string): Promise<SafeUser>;
  /** Resolves a legacy JWT to an active local account, or null. */
  legacyUser(token: string): Promise<SafeUser | null>;
}

/** The parts of a request that carry credentials. */
export interface CredentialCarrier {
  headers: { authorization?: string };
  cookies?: Record<string, string | undefined>;
}

export function extractBearerToken(req: Pick<CredentialCarrier, 'headers'>): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/**
 * Resolves whichever credential the request carries, or null when it carries none
 * that is valid. Never throws for a bad credential, so callers decide whether an
 * anonymous request is acceptable.
 */
export async function resolveRequestUser(
  sources: AuthSources,
  req: CredentialCarrier
): Promise<SafeUser | null> {
  const bearer = extractBearerToken(req);

  if (bearer) {
    const verified = await sources.verifyClerk(bearer);
    if (verified) {
      // An inactive account is treated as anonymous, never as a session. The
      // legacy credentials are not tried after a Clerk token has been recognised.
      return activeOrNull(await sources.resolveClerk(verified.clerkUserId));
    }
    // Not a Clerk token; it may still be a legacy JWT sent as a bearer token.
    const legacyFromHeader = await sources.legacyUser(bearer);
    if (legacyFromHeader) return legacyFromHeader;
  }

  const cookieToken = req.cookies?.[sources.cookieName];
  if (cookieToken) {
    return sources.legacyUser(cookieToken);
  }

  return null;
}

/** The required-authentication middleware, with its sources injected. */
export function authenticateWith(sources: AuthSources) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await resolveRequestUser(sources, req as unknown as CredentialCarrier);

      if (!user) {
        throw new UnauthorizedError('Authentication required. Please sign in to continue.');
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The optional-authentication middleware, with its sources injected. */
export function optionalAuthenticateWith(sources: AuthSources) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await resolveRequestUser(sources, req as unknown as CredentialCarrier);
      if (user) {
        req.user = user;
      }
      next();
    } catch {
      // An unreadable credential must not block a public route.
      next();
    }
  };
}
