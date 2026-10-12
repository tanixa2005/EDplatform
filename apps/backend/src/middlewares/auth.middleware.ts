import { SafeUser } from '@edplatform/shared';
import { AUTH_COOKIE_NAME } from '../config/cookie.config.js';
import { verifyToken } from '../utils/jwt.util.js';
import { prisma } from '../config/prisma.config.js';
import { resolveClerkUser, verifyClerkSessionToken } from '../services/clerk-identity.service.js';
import { authenticateWith, optionalAuthenticateWith, type AuthSources } from './auth-resolution.js';

/**
 * Authentication during the Clerk migration. The decision logic is in
 * auth-resolution.ts, which is tested offline. This file supplies the real
 * credential sources: the Clerk verifier and resolver, and the legacy JWT lookup.
 *
 * Both are kept deliberately: the legacy path stays available until the Clerk
 * flow is verified end to end, so an in-flight session is never broken by a
 * deploy. Legacy auth is removed in a follow-up once Clerk is confirmed live.
 */

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

const sources: AuthSources = {
  cookieName: AUTH_COOKIE_NAME,
  verifyClerk: verifyClerkSessionToken,
  resolveClerk: resolveClerkUser,
  legacyUser: resolveLegacyCookieUser
};

export const authenticate = authenticateWith(sources);

export const optionalAuthenticate = optionalAuthenticateWith(sources);
