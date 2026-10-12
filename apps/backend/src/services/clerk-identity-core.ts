import type { SafeUser } from '@edplatform/shared';
import { UnauthorizedError } from '../errors/app.error.js';
import {
  assertAccountActive,
  CLERK_ID_CONFLICT_CODE,
  EMAIL_NOT_VERIFIED_CODE
} from './account-access.js';
import { primaryFromClerkUser, type ClerkVerification } from './clerk-provisioning.js';

/**
 * Clerk identity linking and resolution, with the database and the Clerk lookup
 * passed in. The production service wires in Prisma and the Clerk SDK; the tests
 * wire in in-memory fakes. This module imports neither, so it loads without
 * reading any environment file or opening any connection.
 *
 * The rules, in the order they apply:
 *   1. Only a verified email may be used. An unverified one refuses everything.
 *   2. One Clerk identity is one local account. If this Clerk id is already
 *      linked, that account is returned (if active) and nothing is written. A
 *      changed or duplicated email never moves the identity to another account.
 *   3. An email that matches an existing account links only if that account is
 *      active and has no Clerk id yet. A non-null Clerk id is never replaced.
 *   4. A link is a compare-and-set: it succeeds only while the account still has
 *      no Clerk id, so a concurrent sign-in cannot overwrite it.
 *   5. Linking never grants or changes a role. A new account is a student.
 */

export interface IdentityRow {
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
}

export interface IdentityDb {
  findByClerkUserId(clerkUserId: string): Promise<IdentityRow | null>;
  findByEmail(email: string): Promise<IdentityRow | null>;
  /**
   * Links the Clerk id only while the account has none. Returns the updated row,
   * or null when the account already had a Clerk id (nothing was written).
   */
  linkClerkUser(
    id: string,
    data: {
      clerkUserId: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    }
  ): Promise<IdentityRow | null>;
  /** Creates a student. Returns null when a unique constraint refuses it (a concurrent sign-up). */
  createStudent(data: {
    clerkUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }): Promise<IdentityRow | null>;
}

/** The subset of a Clerk user this code reads. */
export interface ClerkUserSnapshot {
  primaryEmailAddress?: { emailAddress: string; verification?: ClerkVerification } | null;
  emailAddresses: { emailAddress: string; verification?: ClerkVerification }[];
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}

export interface LinkOrCreateStudentInput {
  clerkUserId: string;
  email: string;
  /** Must be true, from Clerk's own verification status, for anything to be written. */
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export function toSafeUser(user: IdentityRow): SafeUser {
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
 * Attaches a Clerk identity to a local account, or creates a student. Every
 * refusal happens before any write, so a refused call changes nothing.
 */
export async function linkOrCreateStudentCore(db: IdentityDb, input: LinkOrCreateStudentInput): Promise<IdentityRow> {
  // Rule 1: an unverified email refuses everything, before any read or write.
  if (!input.emailVerified) {
    throw new UnauthorizedError(
      'Verify your email address with your sign-in provider before using EDplatform.',
      EMAIL_NOT_VERIFIED_CODE
    );
  }

  // Rule 2: one Clerk identity is one account.
  const alreadyLinked = await db.findByClerkUserId(input.clerkUserId);
  if (alreadyLinked) {
    return assertAccountActive(alreadyLinked);
  }

  const normalizedEmail = input.email.toLowerCase().trim();
  // Clerk requires a name at sign-up, but social providers can omit it.
  const firstName = input.firstName.trim() || normalizedEmail.split('@')[0] || 'Student';
  const lastName = input.lastName.trim() || '';

  const byEmail = await db.findByEmail(normalizedEmail);

  if (byEmail) {
    // Rule 3: an inactive account is never linked, and a Clerk id is never replaced.
    assertAccountActive(byEmail);
    if (byEmail.clerkUserId !== null) {
      throw new UnauthorizedError(
        'This email address is already linked to another sign-in.',
        CLERK_ID_CONFLICT_CODE
      );
    }

    // Rule 4: the link succeeds only while the account still has no Clerk id.
    // Names are backfilled only where missing. The role is never touched.
    const linked = await db.linkClerkUser(byEmail.id, {
      clerkUserId: input.clerkUserId,
      firstName: byEmail.firstName || firstName,
      lastName: byEmail.lastName || lastName,
      avatarUrl: byEmail.avatarUrl ?? input.avatarUrl ?? null
    });
    if (linked === null) {
      throw new UnauthorizedError(
        'This email address was linked to another sign-in while you were signing in. Please try again.',
        CLERK_ID_CONFLICT_CODE
      );
    }
    return assertAccountActive(linked);
  }

  // Rule 5: a brand-new account is a student. A unique-constraint refusal (a race
  // with another sign-up) is reported, never turned into an overwrite.
  const created = await db.createStudent({
    clerkUserId: input.clerkUserId,
    email: normalizedEmail,
    firstName,
    lastName,
    avatarUrl: input.avatarUrl ?? null
  });
  if (created === null) {
    throw new UnauthorizedError(
      'This sign-in could not be completed because the account changed while you were signing in. Please try again.',
      CLERK_ID_CONFLICT_CODE
    );
  }
  return created;
}

/**
 * Resolves a Clerk user id to the local account. An existing account must be
 * active. Otherwise the email must be verified before anything is linked or
 * created.
 */
export async function resolveClerkUserCore(
  db: IdentityDb,
  fetchClerkUser: (clerkUserId: string) => Promise<ClerkUserSnapshot>,
  clerkUserId: string
): Promise<SafeUser> {
  const existing = await db.findByClerkUserId(clerkUserId);
  if (existing) {
    return toSafeUser(assertAccountActive(existing));
  }

  const clerkUser = await fetchClerkUser(clerkUserId);

  const primary = primaryFromClerkUser(clerkUser);
  if (!primary) {
    throw new UnauthorizedError('Your Clerk account has no email address on file.');
  }

  const linked = await linkOrCreateStudentCore(db, {
    clerkUserId,
    email: primary.email,
    emailVerified: primary.verified,
    firstName: clerkUser.firstName ?? '',
    lastName: clerkUser.lastName ?? '',
    avatarUrl: clerkUser.imageUrl ?? null
  });

  return toSafeUser(assertAccountActive(linked));
}
