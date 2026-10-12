import { createClerkClient, verifyToken } from '@clerk/backend';
import type { SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { env, isClerkEnabled } from '../config/env.config.js';
import { UnauthorizedError } from '../errors/app.error.js';
import {
  linkOrCreateStudentCore,
  resolveClerkUserCore,
  type ClerkUserSnapshot,
  type IdentityDb,
  type LinkOrCreateStudentInput
} from './clerk-identity-core.js';

const clerkClient = isClerkEnabled
  ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  : null;

export interface VerifiedClerkToken {
  clerkUserId: string;
}

/**
 * Verifies a Clerk session token.
 *
 * Verification is cryptographic and local: the Clerk SDK fetches and caches the
 * instance JWKS, so there is no network round-trip to Clerk per request.
 * Returns null when the token is absent, malformed or expired, so the caller can
 * fall back to legacy auth instead of failing the request outright.
 */
export async function verifyClerkSessionToken(token: string): Promise<VerifiedClerkToken | null> {
  if (!isClerkEnabled) return null;

  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    if (!payload.sub) return null;
    return { clerkUserId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * The Prisma and Clerk adapters. The rules live in clerk-identity-core.ts, which
 * is tested offline with in-memory fakes.
 */
const identityDb: IdentityDb = {
  findByClerkUserId: (clerkUserId) => prisma.user.findUnique({ where: { clerkUserId } }),
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  // Compare-and-set: the row is updated only while it has no Clerk id.
  linkClerkUser: async (id, data) => {
    const { count } = await prisma.user.updateMany({ where: { id, clerkUserId: null }, data });
    return count === 1 ? prisma.user.findUnique({ where: { id } }) : null;
  },
  createStudent: async (data) => {
    try {
      return await prisma.user.create({ data: { ...data, role: 'STUDENT' } });
    } catch (err) {
      // P2002 is a unique-constraint refusal: another request won the race.
      if ((err as { code?: string }).code === 'P2002') return null;
      throw err;
    }
  }
};

function fetchFromClerk(clerkUserId: string): Promise<ClerkUserSnapshot> {
  if (!clerkClient) {
    throw new UnauthorizedError('Authentication is not configured on this server.');
  }
  return clerkClient.users.getUser(clerkUserId);
}

/**
 * Resolves a Clerk user id to the local student record, creating or linking it
 * when needed.
 *
 * The `user.created` webhook normally creates the row, but webhooks can lag by a
 * few seconds and a student must never hit an error on their very first request.
 * This is the lazy fallback: look up by Clerk id, else link an existing account
 * with a matching, verified email, else create a fresh student.
 */
export async function resolveClerkUser(clerkUserId: string): Promise<SafeUser> {
  return resolveClerkUserCore(identityDb, fetchFromClerk, clerkUserId);
}

export type { LinkOrCreateStudentInput };

/** Attaches a Clerk identity to an account, or creates one. Used by the webhook. */
export async function linkOrCreateStudent(input: LinkOrCreateStudentInput) {
  return linkOrCreateStudentCore(identityDb, input);
}

/**
 * Called from the Clerk `user.deleted` webhook. Cascades to the student profile,
 * tutor sessions and messages, enrollments, progress and quiz attempts via the
 * schema's onDelete rules.
 */
export async function deleteStudentByClerkId(clerkUserId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, authoredCourses: { select: { id: true }, take: 1 } }
  });

  if (!user) return;

  // Course.instructorId is onDelete: Restrict, so a legacy account that still
  // owns curriculum content cannot be hard-deleted. Deactivate it instead and
  // unlink the Clerk id so the row stops being reachable through Clerk.
  if (user.authoredCourses.length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, clerkUserId: null }
    });
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
}
