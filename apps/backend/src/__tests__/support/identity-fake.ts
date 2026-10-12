import type { IdentityDb, IdentityRow } from '../../services/clerk-identity-core.js';

/**
 * An in-memory identity store for offline tests. Reads return copies, and every
 * write is recorded. Linking is a compare-and-set on a null Clerk id, and creating
 * respects the unique keys, as the real adapter does. Nothing here opens a
 * connection or reads an environment file.
 */

export const CREATED = new Date('2026-10-01T00:00:00Z');

export function account(overrides: Partial<IdentityRow>): IdentityRow {
  return {
    id: 'acct-1',
    email: 'student@example.test',
    clerkUserId: null,
    firstName: 'Asha',
    lastName: 'Rao',
    avatarUrl: null,
    bio: null,
    role: 'STUDENT',
    isActive: true,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides
  };
}

export interface FakeIdentityStore {
  db: IdentityDb;
  rows: IdentityRow[];
  writes: string[];
}

export function fakeIdentityStore(seed: IdentityRow[]): FakeIdentityStore {
  const rows: IdentityRow[] = seed.map((row) => ({ ...row }));
  const writes: string[] = [];
  const db: IdentityDb = {
    async findByClerkUserId(clerkUserId) {
      const row = rows.find((r) => r.clerkUserId === clerkUserId);
      return row ? { ...row } : null;
    },
    async findByEmail(email) {
      const row = rows.find((r) => r.email === email);
      return row ? { ...row } : null;
    },
    async linkClerkUser(id, data) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.clerkUserId !== null) return null;
      writes.push(`link:${id}`);
      Object.assign(row, data);
      return { ...row };
    },
    async createStudent(data) {
      const taken = rows.some((r) => r.email === data.email || r.clerkUserId === data.clerkUserId);
      if (taken) return null;
      writes.push('create');
      const row = account({ id: `new-${rows.length + 1}`, ...data, bio: null, role: 'STUDENT', isActive: true, createdAt: CREATED, updatedAt: CREATED });
      rows.push(row);
      return { ...row };
    }
  };
  return { db, rows, writes };
}

/** A stable text form of the rows, to compare before and after a refused operation. */
export const snapshot = (rows: IdentityRow[]): string => JSON.stringify(rows);
