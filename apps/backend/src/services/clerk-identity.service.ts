import { createClerkClient, verifyToken } from '@clerk/backend';
import type { SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { env, isClerkEnabled } from '../config/env.config.js';
import { UnauthorizedError } from '../errors/app.error.js';

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

function toSafeUser(user: {
  id: string;
  email: string;
  clerkUserId: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: SafeUser['role'];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
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
 * Resolves a Clerk user id to the local student record, creating or linking it
 * when needed.
 *
 * The `user.created` webhook normally creates the row, but webhooks can lag by a
 * few seconds and a student must never hit an error on their very first request.
 * This is the lazy fallback: look up by Clerk id, else link an existing account
 * with a matching email, else create a fresh student.
 */
export async function resolveClerkUser(clerkUserId: string): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({ where: { clerkUserId } });

  if (existing) {
    if (!existing.isActive) {
      throw new UnauthorizedError('This account has been deactivated.');
    }
    return toSafeUser(existing);
  }

  if (!clerkClient) {
    throw new UnauthorizedError('Authentication is not configured on this server.');
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    throw new UnauthorizedError('Your Clerk account has no email address on file.');
  }

  const linked = await linkOrCreateStudent({
    clerkUserId,
    email,
    firstName: clerkUser.firstName ?? '',
    lastName: clerkUser.lastName ?? '',
    avatarUrl: clerkUser.imageUrl ?? null
  });

  return toSafeUser(linked);
}

export interface LinkOrCreateStudentInput {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

/**
 * Links a Clerk identity onto an existing local account with the same email, or
 * creates a new student. Shared by the lazy fallback above and the Clerk webhook.
 */
export async function linkOrCreateStudent(input: LinkOrCreateStudentInput) {
  const normalizedEmail = input.email.toLowerCase().trim();
  // Clerk requires a name at sign-up, but social providers can omit it.
  const firstName = input.firstName.trim() || normalizedEmail.split('@')[0] || 'Student';
  const lastName = input.lastName.trim() || '';

  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (byEmail) {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        clerkUserId: input.clerkUserId,
        // Only backfill names that are missing; never overwrite what the student set.
        firstName: byEmail.firstName || firstName,
        lastName: byEmail.lastName || lastName,
        avatarUrl: byEmail.avatarUrl ?? input.avatarUrl ?? null,
        // Every Clerk-provisioned account is a student. EDplatform has no other role.
        role: 'STUDENT'
      }
    });
  }

  return prisma.user.create({
    data: {
      clerkUserId: input.clerkUserId,
      email: normalizedEmail,
      firstName,
      lastName,
      avatarUrl: input.avatarUrl ?? null,
      role: 'STUDENT'
    }
  });
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
