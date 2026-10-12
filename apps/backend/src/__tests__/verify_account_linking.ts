/**
 * Clerk account linking and provisioning, verified offline.
 *
 * The database is an in-memory fake with the same compare-and-set and unique-key
 * behaviour as the real adapter. Every refusal is checked for three things: the
 * rejection, that the stored rows are unchanged, and that no write was recorded.
 *
 * The modules here import neither Prisma nor the environment, so this file reads
 * no configuration and opens no connection.
 *
 * Run: npm run test:account-linking
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UnauthorizedError } from '../errors/app.error.js';
import {
  activeOrNull,
  assertAccountActive,
  CLERK_ID_CONFLICT_CODE,
  DEACTIVATED_ACCOUNT_CODE,
  EMAIL_NOT_VERIFIED_CODE,
  PROVISIONING_REFUSAL_CODES
} from '../services/account-access.js';
import {
  linkOrCreateStudentCore,
  resolveClerkUserCore,
  type ClerkUserSnapshot,
  type IdentityDb,
  type IdentityRow
} from '../services/clerk-identity-core.js';
import { primaryFromClerkUser, primaryFromWebhook } from '../services/clerk-provisioning.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const read = (rel: string) => readFileSync(path.join(BACKEND, rel), 'utf8');

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

async function check(test: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: message });
    console.error(`  [FAIL] ${test}: ${message}`);
  }
}

const CREATED = new Date('2026-10-01T00:00:00Z');

function account(overrides: Partial<IdentityRow>): IdentityRow {
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

interface FakeOptions {
  /** Simulates another request linking this account between the read and the write. */
  raceLinkTo?: string;
  /** Simulates another request creating this email between the read and the write. */
  raceCreate?: boolean;
}

/**
 * In-memory store. Each write is recorded, and each read returns a copy. Linking is
 * a compare-and-set on the Clerk id, and creating respects the unique keys, as the
 * real adapter does.
 */
function fakeDb(seed: IdentityRow[], options: FakeOptions = {}) {
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
      assert.ok(row, 'linked a row that does not exist');
      if (options.raceLinkTo !== undefined && row.clerkUserId === null) {
        row.clerkUserId = options.raceLinkTo; // the other request wins the race
      }
      if (row.clerkUserId !== null) return null; // compare-and-set refused: nothing written
      writes.push(`link:${id}`);
      Object.assign(row, data);
      return { ...row };
    },
    async createStudent(data) {
      if (options.raceCreate) return null;
      const taken = rows.some((r) => r.email === data.email || r.clerkUserId === data.clerkUserId);
      if (taken) return null; // unique constraint refused: nothing written
      writes.push('create');
      const row = account({ id: `new-${rows.length + 1}`, ...data, bio: null, role: 'STUDENT', isActive: true, createdAt: CREATED, updatedAt: CREATED });
      rows.push(row);
      return { ...row };
    }
  };
  return { db, rows, writes };
}

/** A Clerk user as the SDK returns it, with a chosen primary verification status. */
function clerkUser(email: string, verified: boolean, extra: Partial<ClerkUserSnapshot> = {}): ClerkUserSnapshot {
  const address = { emailAddress: email, verification: { status: verified ? 'verified' : 'unverified' } };
  return {
    primaryEmailAddress: address,
    emailAddresses: [address],
    firstName: 'Sam',
    lastName: 'Lee',
    imageUrl: null,
    ...extra
  };
}

/** A webhook payload's user data, with the given primary address and verification. */
function webhookData(email: string, verified: boolean, extra: Record<string, unknown> = {}) {
  return {
    id: 'clerk-hook',
    primary_email_address_id: 'e1',
    email_addresses: [{ id: 'e1', email_address: email, verification: { status: verified ? 'verified' : 'unverified' } }],
    first_name: 'Sam',
    last_name: 'Lee',
    image_url: null,
    ...extra
  };
}

/**
 * The provisioning path of the webhook, as the controller runs it: pick the
 * primary address, then link or create with its verification.
 */
async function webhookProvision(db: IdentityDb, data: ReturnType<typeof webhookData>) {
  const provision = primaryFromWebhook(data);
  if (!provision) return 'no-email';
  return linkOrCreateStudentCore(db, {
    clerkUserId: data.id,
    email: provision.email,
    emailVerified: provision.verified,
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    avatarUrl: data.image_url ?? null
  });
}

/** Asserts the call refused with the given code, and returns the error. */
async function expectRefusal(promise: Promise<unknown>, code: string): Promise<UnauthorizedError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof UnauthorizedError, `expected an UnauthorizedError, got ${String(err)}`);
    assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
    return err;
  }
  throw new Error(`the call succeeded but should have refused with ${code}`);
}

const snapshot = (rows: IdentityRow[]) => JSON.stringify(rows);

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🔐 CLERK ACCOUNT LINKING AND PROVISIONING SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. active accounts: behaviour kept
  await check('An active, unlinked account with a verified email is linked, keeps its role, and is not demoted', async () => {
    const store = fakeDb([account({ id: 'acct-1', email: 'teacher@example.test', role: 'INSTRUCTOR' })]);
    const row = await linkOrCreateStudentCore(store.db, {
      clerkUserId: 'clerk-new', email: 'teacher@example.test', emailVerified: true, firstName: '', lastName: ''
    });
    assert.equal(row.clerkUserId, 'clerk-new');
    assert.equal(row.role, 'INSTRUCTOR', 'linking changed the role');
    assert.deepEqual(store.writes, ['link:acct-1']);
  });

  await check('Email matching ignores case and surrounding spaces, as before', async () => {
    const store = fakeDb([account({ email: 'student@example.test' })]);
    const row = await linkOrCreateStudentCore(store.db, {
      clerkUserId: 'clerk-new', email: '  STUDENT@Example.TEST ', emailVerified: true, firstName: '', lastName: ''
    });
    assert.equal(row.id, 'acct-1');
  });

  await check('A verified email with no account creates an active student', async () => {
    const store = fakeDb([]);
    const row = await linkOrCreateStudentCore(store.db, {
      clerkUserId: 'clerk-new', email: 'new@example.test', emailVerified: true, firstName: 'New', lastName: 'Student'
    });
    assert.equal(row.role, 'STUDENT');
    assert.equal(row.isActive, true);
    assert.deepEqual(store.writes, ['create']);
  });

  await check('A Clerk identity already linked to an active account is returned unchanged, with no write', async () => {
    const store = fakeDb([account({ clerkUserId: 'clerk-known' })]);
    const before = snapshot(store.rows);
    const row = await linkOrCreateStudentCore(store.db, {
      clerkUserId: 'clerk-known', email: 'student@example.test', emailVerified: true, firstName: '', lastName: ''
    });
    assert.equal(row.id, 'acct-1');
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A changed email on an already-linked Clerk identity never moves it to another account', async () => {
    const store = fakeDb([
      account({ id: 'acct-a', email: 'a@example.test', clerkUserId: 'clerk-1' }),
      account({ id: 'acct-b', email: 'b@example.test', clerkUserId: null })
    ]);
    const before = snapshot(store.rows);
    const row = await linkOrCreateStudentCore(store.db, {
      clerkUserId: 'clerk-1', email: 'b@example.test', emailVerified: true, firstName: '', lastName: ''
    });
    assert.equal(row.id, 'acct-a', 'the identity moved to a different account');
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  // ---------------------------------------------------------------- 2. conflicting Clerk identities
  await check('A matching email already linked to a DIFFERENT Clerk id is refused, and the Clerk id is not replaced', async () => {
    const store = fakeDb([account({ email: 'victim@example.test', clerkUserId: 'clerk-owner' })]);
    const before = snapshot(store.rows);
    await expectRefusal(
      linkOrCreateStudentCore(store.db, { clerkUserId: 'clerk-attacker', email: 'victim@example.test', emailVerified: true, firstName: '', lastName: '' }),
      CLERK_ID_CONFLICT_CODE
    );
    assert.equal(store.rows[0].clerkUserId, 'clerk-owner', 'the Clerk id was replaced');
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A conflicting Clerk id is refused through the lazy sign-in path as well', async () => {
    const store = fakeDb([account({ email: 'victim@example.test', clerkUserId: 'clerk-owner' })]);
    const before = snapshot(store.rows);
    await expectRefusal(
      resolveClerkUserCore(store.db, async () => clerkUser('victim@example.test', true), 'clerk-attacker'),
      CLERK_ID_CONFLICT_CODE
    );
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A race in which another request links the account first is refused, and nothing is written by this request', async () => {
    const store = fakeDb([account({ email: 'race@example.test' })], { raceLinkTo: 'clerk-winner' });
    await expectRefusal(
      linkOrCreateStudentCore(store.db, { clerkUserId: 'clerk-loser', email: 'race@example.test', emailVerified: true, firstName: '', lastName: '' }),
      CLERK_ID_CONFLICT_CODE
    );
    assert.equal(store.rows[0].clerkUserId, 'clerk-winner', 'the winning link was overwritten');
    assert.deepEqual(store.writes, []);
  });

  await check('A race in which another request creates the email first is refused, with no overwrite', async () => {
    const store = fakeDb([], { raceCreate: true });
    await expectRefusal(
      linkOrCreateStudentCore(store.db, { clerkUserId: 'clerk-new', email: 'new@example.test', emailVerified: true, firstName: '', lastName: '' }),
      CLERK_ID_CONFLICT_CODE
    );
    assert.deepEqual(store.writes, []);
  });

  // ---------------------------------------------------------------- 3. verified and unverified email
  await check('An unverified email refuses linking to an existing account, and nothing is written', async () => {
    const store = fakeDb([account({ email: 'student@example.test' })]);
    const before = snapshot(store.rows);
    await expectRefusal(
      linkOrCreateStudentCore(store.db, { clerkUserId: 'clerk-new', email: 'student@example.test', emailVerified: false, firstName: '', lastName: '' }),
      EMAIL_NOT_VERIFIED_CODE
    );
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('An unverified email does not create an account either, so it cannot squat on an address', async () => {
    const store = fakeDb([]);
    await expectRefusal(
      linkOrCreateStudentCore(store.db, { clerkUserId: 'clerk-new', email: 'squat@example.test', emailVerified: false, firstName: '', lastName: '' }),
      EMAIL_NOT_VERIFIED_CODE
    );
    assert.equal(store.rows.length, 0);
    assert.deepEqual(store.writes, []);
  });

  await check('The verification comes from the address used: an unverified primary is not vouched for by a verified second address', () => {
    const user = {
      primaryEmailAddress: { emailAddress: 'primary@example.test', verification: { status: 'unverified' } },
      emailAddresses: [
        { emailAddress: 'primary@example.test', verification: { status: 'unverified' } },
        { emailAddress: 'second@example.test', verification: { status: 'verified' } }
      ]
    };
    const chosen = primaryFromClerkUser(user);
    assert.deepEqual(chosen, { email: 'primary@example.test', verified: false });
  });

  await check('Only Clerk\'s status "verified" counts: transferable, failed, expired and missing verification do not', () => {
    for (const status of ['transferable', 'failed', 'expired', 'unverified']) {
      assert.equal(primaryFromClerkUser({ emailAddresses: [{ emailAddress: 'x@example.test', verification: { status } }] })?.verified, false, status);
    }
    assert.equal(primaryFromClerkUser({ emailAddresses: [{ emailAddress: 'x@example.test', verification: null }] })?.verified, false, 'null verification');
    assert.equal(primaryFromClerkUser({ emailAddresses: [{ emailAddress: 'x@example.test' }] })?.verified, false, 'missing verification');
  });

  // ---------------------------------------------------------------- 4. inactive accounts and the synthetic demo owner
  await check('A verified sign-in whose email matches an INACTIVE account is refused, with no session and no write', async () => {
    const store = fakeDb([account({ id: 'acct-off', email: 'former@example.test', isActive: false })]);
    const before = snapshot(store.rows);
    await expectRefusal(
      resolveClerkUserCore(store.db, async () => clerkUser('former@example.test', true), 'clerk-attacker'),
      DEACTIVATED_ACCOUNT_CODE
    );
    assert.equal(snapshot(store.rows), before, 'the inactive account changed');
    assert.deepEqual(store.writes, []);
  });

  await check('The synthetic demo owner cannot be linked: a verified Clerk sign-in on its email is refused and the owner is unchanged', async () => {
    const owner = account({ id: 'demo-owner', email: 'demo-owner@edplatform-demo.invalid', role: 'INSTRUCTOR', isActive: false, clerkUserId: null });
    const store = fakeDb([owner]);
    const before = snapshot(store.rows);
    await expectRefusal(
      resolveClerkUserCore(store.db, async () => clerkUser('demo-owner@edplatform-demo.invalid', true), 'clerk-takeover'),
      DEACTIVATED_ACCOUNT_CODE
    );
    assert.equal(snapshot(store.rows), before, 'the owner row changed');
    assert.equal(store.rows[0].role, 'INSTRUCTOR');
    assert.deepEqual(store.writes, []);
  });

  await check('The synthetic demo owner is refused as well when the email is unverified', async () => {
    const owner = account({ id: 'demo-owner', email: 'demo-owner@edplatform-demo.invalid', role: 'INSTRUCTOR', isActive: false });
    const store = fakeDb([owner]);
    const before = snapshot(store.rows);
    await assert.rejects(
      resolveClerkUserCore(store.db, async () => clerkUser('demo-owner@edplatform-demo.invalid', false), 'clerk-takeover')
    );
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('An inactive account already linked by Clerk id is refused, with no write', async () => {
    const store = fakeDb([account({ clerkUserId: 'clerk-old', isActive: false })]);
    const before = snapshot(store.rows);
    await expectRefusal(resolveClerkUserCore(store.db, async () => clerkUser('student@example.test', true), 'clerk-old'), DEACTIVATED_ACCOUNT_CODE);
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  // ---------------------------------------------------------------- 5. the lazy sign-in path
  await check('A lazy sign-in with a verified primary email links an active account, as before', async () => {
    const store = fakeDb([account({ email: 'student@example.test' })]);
    const user = await resolveClerkUserCore(store.db, async () => clerkUser('student@example.test', true), 'clerk-new');
    assert.equal(user.clerkUserId, 'clerk-new');
    assert.equal(user.isActive, true);
    assert.deepEqual(store.writes, ['link:acct-1']);
  });

  await check('A lazy sign-in with an unverified primary email is refused, with no write', async () => {
    const store = fakeDb([account({ email: 'student@example.test' })]);
    const before = snapshot(store.rows);
    await expectRefusal(resolveClerkUserCore(store.db, async () => clerkUser('student@example.test', false), 'clerk-new'), EMAIL_NOT_VERIFIED_CODE);
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A Clerk account with no email is still refused, as before, with no write', async () => {
    const store = fakeDb([]);
    await assert.rejects(resolveClerkUserCore(store.db, async () => ({ primaryEmailAddress: null, emailAddresses: [] }), 'clerk-x'), /no email address/);
    assert.deepEqual(store.writes, []);
  });

  // ---------------------------------------------------------------- 6. webhook-driven provisioning
  await check('A webhook user.created with a verified email creates an active student', async () => {
    const store = fakeDb([]);
    const row = await webhookProvision(store.db, webhookData('new@example.test', true));
    assert.notEqual(row, 'no-email');
    assert.equal((row as IdentityRow).clerkUserId, 'clerk-hook');
    assert.deepEqual(store.writes, ['create']);
  });

  await check('A webhook user.created with a verified email links an active existing account, without changing its role', async () => {
    const store = fakeDb([account({ email: 'student@example.test', role: 'INSTRUCTOR' })]);
    const row = (await webhookProvision(store.db, webhookData('student@example.test', true))) as IdentityRow;
    assert.equal(row.clerkUserId, 'clerk-hook');
    assert.equal(row.role, 'INSTRUCTOR');
    assert.deepEqual(store.writes, ['link:acct-1']);
  });

  await check('A webhook with an UNVERIFIED email changes nothing, for a new address and for an existing one', async () => {
    const store = fakeDb([account({ email: 'student@example.test' })]);
    const before = snapshot(store.rows);
    await expectRefusal(Promise.resolve().then(() => webhookProvision(store.db, webhookData('student@example.test', false))), EMAIL_NOT_VERIFIED_CODE);
    await expectRefusal(Promise.resolve().then(() => webhookProvision(store.db, webhookData('brand-new@example.test', false, { id: 'clerk-other' }))), EMAIL_NOT_VERIFIED_CODE);
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A webhook for an INACTIVE matching account is refused, and the account is unchanged', async () => {
    const store = fakeDb([account({ email: 'former@example.test', isActive: false })]);
    const before = snapshot(store.rows);
    await expectRefusal(Promise.resolve().then(() => webhookProvision(store.db, webhookData('former@example.test', true))), DEACTIVATED_ACCOUNT_CODE);
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A webhook for a conflicting Clerk id is refused, and the existing link is kept', async () => {
    const store = fakeDb([account({ email: 'victim@example.test', clerkUserId: 'clerk-owner' })]);
    const before = snapshot(store.rows);
    await expectRefusal(Promise.resolve().then(() => webhookProvision(store.db, webhookData('victim@example.test', true))), CLERK_ID_CONFLICT_CODE);
    assert.equal(snapshot(store.rows), before);
    assert.deepEqual(store.writes, []);
  });

  await check('A webhook uses the primary address named by its id, not whichever address is listed first', () => {
    const data = webhookData('primary@example.test', true, {
      primary_email_address_id: 'e2',
      email_addresses: [
        { id: 'e1', email_address: 'other@example.test', verification: { status: 'unverified' } },
        { id: 'e2', email_address: 'primary@example.test', verification: { status: 'verified' } }
      ]
    });
    assert.deepEqual(primaryFromWebhook(data), { email: 'primary@example.test', verified: true });
  });

  await check('A webhook with no addresses is acknowledged without a write', async () => {
    const store = fakeDb([]);
    assert.equal(await webhookProvision(store.db, webhookData('x@example.test', true, { email_addresses: [] })), 'no-email');
    assert.deepEqual(store.writes, []);
  });

  // ---------------------------------------------------------------- 7. helpers and rules
  await check('assertAccountActive returns an active account and refuses an inactive one with the deactivated code', () => {
    const active = account({});
    assert.equal(assertAccountActive(active), active);
    assert.throws(() => assertAccountActive(account({ isActive: false })), (err: unknown) => err instanceof UnauthorizedError && err.code === DEACTIVATED_ACCOUNT_CODE);
  });

  await check('activeOrNull treats an inactive account as no account, and passes an active one through', () => {
    const active = account({});
    assert.equal(activeOrNull(active), active);
    assert.equal(activeOrNull(account({ isActive: false })), null);
    assert.equal(activeOrNull(null), null);
  });

  await check('Every provisioning refusal code is one the webhook acknowledges', () => {
    for (const code of [DEACTIVATED_ACCOUNT_CODE, EMAIL_NOT_VERIFIED_CODE, CLERK_ID_CONFLICT_CODE]) {
      assert.ok(PROVISIONING_REFUSAL_CODES.includes(code), code);
    }
  });

  // ---------------------------------------------------------------- 8. source tripwires
  await check('The linking core never sets a role when it links an account', () => {
    const core = read('src/services/clerk-identity-core.ts');
    const start = core.indexOf('db.linkClerkUser(byEmail.id, {');
    assert.ok(start > 0, 'the link call was not found');
    const block = core.slice(start, core.indexOf('});', start));
    assert.ok(!/\brole\b/.test(block), 'the link call touches the role');
  });

  await check('The database link is a compare-and-set on a null Clerk id, so a non-null id is never replaced', () => {
    const service = read('src/services/clerk-identity.service.ts');
    assert.ok(service.includes('where: { id, clerkUserId: null }'), 'the link is not conditional on a null Clerk id');
  });

  await check('The webhook provisions only from a verified primary address and acknowledges every refusal', () => {
    const webhook = read('src/controllers/clerk-webhook-handler.ts');
    assert.ok(webhook.includes('primaryFromWebhook(event.data)'), 'the webhook does not read verification');
    assert.ok(webhook.includes('emailVerified: provision.verified'), 'the verification is not passed on');
    assert.ok(webhook.includes('PROVISIONING_REFUSAL_CODES.includes(error.code)'), 'refusals are not acknowledged');
  });

  await check('The Clerk middleware branch still returns the account only through activeOrNull', () => {
    const middleware = read('src/middlewares/auth-resolution.ts');
    assert.ok(middleware.includes('activeOrNull(await sources.resolveClerk(verified.clerkUserId))'));
  });

  console.log('\n====================================================');
  console.log('📊 CLERK ACCOUNT LINKING RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
