import { Request, Response, NextFunction } from 'express';
import { SafeUser } from '@edplatform/shared';
import { AUTH_COOKIE_NAME } from '../config/cookie.config.js';
import { verifyToken } from '../utils/jwt.util.js';
import { UnauthorizedError } from '../errors/app.error.js';
import { prisma } from '../config/prisma.config.js';
import { resolveClerkUser, verifyClerkSessionToken } from '../services/clerk-identity.service.js';

/**
 * Authentication during the Clerk migration.
 *
 * Two credentials are accepted, tried in this order:
 *
 *   1. `Authorization: Bearer <clerk session token>` - the new path. The token is
 *      verified locally against the cached Clerk JWKS, then mapped to the local
 *      student row by `clerkUserId`.
 *   2. The legacy HttpOnly `auth_token` cookie signed with JWT_SECRET.
 *
 * Both are kept deliberately: the legacy path stays available until the Clerk
 * flow is verified end to end, so an in-flight session is never broken by a
 * deploy. Legacy auth is removed in a follow-up once Clerk is confirmed live.
 */

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

async function resolveLegacyCookieUser(token: string): Promise<SafeUser | null> {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    clerkUserId: user.clerkUserId,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * Resolves whichever credential the request carries, or null when it carries none
 * that is valid. Never throws for a bad credential - callers decide whether an
 * anonymous request is acceptable.
 */
async function resolveRequestUser(req: Request): Promise<SafeUser | null> {
  const bearer = extractBearerToken(req);

  if (bearer) {
    const verified = await verifyClerkSessionToken(bearer);
    if (verified) {
      return resolveClerkUser(verified.clerkUserId);
    }
    // Not a Clerk token; it may still be a legacy JWT sent as a bearer token.
    const legacyFromHeader = await resolveLegacyCookieUser(bearer);
    if (legacyFromHeader) return legacyFromHeader;
  }

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) {
    return resolveLegacyCookieUser(cookieToken);
  }

  return null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveRequestUser(req);

    if (!user) {
      throw new UnauthorizedError('Authentication required. Please sign in to continue.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveRequestUser(req);
    if (user) {
      req.user = user;
    }
    next();
  } catch {
    // An unreadable credential must not block a public route.
    next();
  }
}
