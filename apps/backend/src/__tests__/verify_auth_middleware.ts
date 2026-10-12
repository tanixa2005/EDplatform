/**
 * The authentication middleware's real decision logic, verified offline.
 *
 * The middleware is built by authenticateWith and optionalAuthenticateWith, with
 * fake credential sources. The Clerk resolver is the real resolveClerkUserCore
 * running against the in-memory store, and its Clerk lookup is a stub that throws,
 * so no network call can succeed. Nothing here imports Prisma, reads an environment
 * file, or calls Clerk.
 *
 * Run: npm run test:auth-middleware
 */
import assert from 'node:assert/strict';
import { UnauthorizedError } from '../errors/app.error.js';
import { authenticateWith, optionalAuthenticateWith, type AuthSources } from '../middlewares/auth-resolution.js';
import { DEACTIVATED_ACCOUNT_CODE } from '../services/account-access.js';
import { resolveClerkUserCore, toSafeUser } from '../services/clerk-identity-core.js';
import { account, fakeIdentityStore, snapshot } from './support/identity-fake.js';

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

/** The Express-shaped middleware, typed loosely for the test's plain objects. */
type Middleware = (req: object, res: object, next: (err?: unknown) => void) => Promise<void>;

interface Outcome {
  nextCalls: number;
  error: unknown;
  req: { user?: unknown };
}

/** Runs one middleware call and reports what next() received, and the request afterwards. */
async function run(mw: Middleware, headers: Record<string, string>, cookies: Record<string, string> = {}): Promise<Outcome> {
  const req: { headers: Record<string, string>; cookies: Record<string, string>; user?: unknown } = { headers, cookies };
  const outcome: Outcome = { nextCalls: 0, error: undefined, req };
  await mw(req, {}, (err?: unknown) => {
    outcome.nextCalls += 1;
    outcome.error = err;
  });
  return outcome;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Which Clerk identity each test token verifies to. Anything else is not a Clerk token. */
const CLERK_TOKENS: Record<string, string> = {
  'token-good': 'clerk-good',
  'token-inactive': 'clerk-inactive',
  'token-unknown': 'clerk-unknown',
  'token-broken': 'clerk-broken'
};

interface Harness {
  sources: AuthSources;
  store: ReturnType<typeof fakeIdentityStore>;
  calls: { legacy: number; clerkLookups: number };
}

function harness(seed = [
  account({ id: 'acct-good', email: 'good@example.test', clerkUserId: 'clerk-good', role: 'INSTRUCTOR' }),
  account({ id: 'acct-inactive', email: 'former@example.test', clerkUserId: 'clerk-inactive', isActive: false }),
  account({ id: 'acct-legacy', email: 'legacy@example.test', clerkUserId: null })
]): Harness {
  const store = fakeIdentityStore(seed);
  const calls = { legacy: 0, clerkLookups: 0 };
  const sources: AuthSources = {
    cookieName: 'auth_token',
    async verifyClerk(token) {
      const clerkUserId = CLERK_TOKENS[token];
      return clerkUserId ? { clerkUserId } : null;
    },
    async resolveClerk(clerkUserId) {
      calls.clerkLookups += 1;
      if (clerkUserId === 'clerk-broken') throw new Error('Clerk lookup failed');
      // The real resolver. Its Clerk fetch throws, so an unknown identity cannot resolve.
      return resolveClerkUserCore(store.db, async () => {
        throw new Error('network is blocked in tests');
      }, clerkUserId);
    },
    async legacyUser(token) {
      calls.legacy += 1;
      if (token === 'legacy-good' || token === 'legacy-cookie-good') {
        const row = store.rows.find((r) => r.id === 'acct-legacy');
        return row ? toSafeUser(row) : null;
      }
      if (token === 'legacy-cookie-inactive') {
        return null; // the legacy lookup refuses an inactive account
      }
      return null;
    }
  };
  return { sources, store, calls };
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🔑 AUTHENTICATION MIDDLEWARE SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. an active Clerk-linked account
  await check('An active Clerk-linked account is accepted: next() is called with no error and the user is attached', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-good'));
    assert.equal(outcome.nextCalls, 1);
    assert.equal(outcome.error, undefined);
    const user = outcome.req.user as { id: string; clerkUserId: string; isActive: boolean };
    assert.equal(user.id, 'acct-good');
    assert.equal(user.clerkUserId, 'clerk-good');
    assert.equal(user.isActive, true);
  });

  // ---------------------------------------------------------------- 2. an inactive account
  await check('An inactive Clerk-linked account is rejected: a 401 reaches next(), and no user is attached', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-inactive'));
    assert.equal(outcome.nextCalls, 1);
    assert.ok(outcome.error instanceof UnauthorizedError, 'the rejection is not a 401');
    assert.equal((outcome.error as UnauthorizedError).code, DEACTIVATED_ACCOUNT_CODE);
    assert.equal(outcome.req.user, undefined, 'an inactive account was attached as a session');
  });

  await check('An inactive account is not rescued by the legacy credentials after a Clerk token has been recognised', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    await run(mw, bearer('token-inactive'), { auth_token: 'legacy-cookie-good' });
    assert.equal(h.calls.legacy, 0, 'the legacy credentials were tried after a Clerk token');
  });

  await check('A resolver that returns an inactive account is still treated as anonymous', async () => {
    const inactive = account({ id: 'acct-x', clerkUserId: 'clerk-good', isActive: false });
    const sources: AuthSources = {
      cookieName: 'auth_token',
      verifyClerk: async () => ({ clerkUserId: 'clerk-good' }),
      resolveClerk: async () => toSafeUser(inactive),
      legacyUser: async () => {
        throw new Error('the legacy path must not be consulted');
      }
    };
    const mw = authenticateWith(sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-good'));
    assert.ok(outcome.error instanceof UnauthorizedError);
    assert.equal(outcome.req.user, undefined);
  });

  // ---------------------------------------------------------------- 3. an unknown or unresolved identity
  await check('A bearer token that is neither a Clerk token nor a legacy token is not authenticated', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('garbage-token'));
    assert.ok(outcome.error instanceof UnauthorizedError);
    assert.equal(outcome.error.message, 'Authentication required. Please sign in to continue.');
    assert.equal(outcome.req.user, undefined);
  });

  await check('A valid Clerk token for an identity with no account is not authenticated, and no account is created', async () => {
    const h = harness();
    const before = snapshot(h.store.rows);
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-unknown'));
    assert.equal(outcome.nextCalls, 1);
    assert.ok(outcome.error instanceof Error, 'the unknown identity was accepted');
    assert.equal(outcome.req.user, undefined, 'an unknown identity was attached as a session');
    assert.equal(snapshot(h.store.rows), before, 'an account was created for an unknown identity');
    assert.deepEqual(h.store.writes, []);
  });

  await check('A Clerk lookup failure is passed on as an error, and the request is not treated as authenticated', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-broken'));
    assert.equal(outcome.error instanceof Error && outcome.error.message, 'Clerk lookup failed');
    assert.equal(outcome.req.user, undefined);
  });

  // ---------------------------------------------------------------- 4. the legacy path, unchanged in behaviour
  await check('A legacy cookie for an active account still authenticates', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, {}, { auth_token: 'legacy-cookie-good' });
    assert.equal(outcome.error, undefined);
    assert.equal((outcome.req.user as { id: string }).id, 'acct-legacy');
  });

  await check('A legacy cookie for an inactive account is refused', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, {}, { auth_token: 'legacy-cookie-inactive' });
    assert.ok(outcome.error instanceof UnauthorizedError);
    assert.equal(outcome.req.user, undefined);
  });

  await check('A legacy JWT sent as a bearer token still authenticates', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('legacy-good'));
    assert.equal(outcome.error, undefined);
    assert.equal((outcome.req.user as { id: string }).id, 'acct-legacy');
  });

  // ---------------------------------------------------------------- 5. the optional variant never blocks
  await check('The optional middleware lets an unknown credential through as anonymous, with no user attached', async () => {
    const h = harness();
    const mw = optionalAuthenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('garbage-token'));
    assert.equal(outcome.nextCalls, 1);
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.req.user, undefined);
  });

  await check('The optional middleware lets an inactive account through as anonymous, never as the account', async () => {
    const h = harness();
    const mw = optionalAuthenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-inactive'));
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.req.user, undefined);
  });

  await check('The optional middleware survives a failing Clerk lookup, as anonymous', async () => {
    const h = harness();
    const mw = optionalAuthenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-broken'));
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.req.user, undefined);
  });

  // ---------------------------------------------------------------- 6. nothing is changed by authenticating
  await check('Authenticating never changes an account: role, Clerk id and every other field are the same afterwards', async () => {
    const h = harness();
    const before = snapshot(h.store.rows);
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    await run(mw, bearer('token-good'));
    await run(mw, bearer('token-inactive'));
    await run(mw, bearer('token-unknown'));
    await run(mw, bearer('garbage-token'));
    assert.equal(snapshot(h.store.rows), before, 'an account changed during authentication');
    assert.deepEqual(h.store.writes, []);
  });

  await check('An active account keeps its role when it authenticates', async () => {
    const h = harness();
    const mw = authenticateWith(h.sources) as unknown as Middleware;
    const outcome = await run(mw, bearer('token-good'));
    assert.equal((outcome.req.user as { role: string }).role, 'INSTRUCTOR');
    assert.equal(h.store.rows.find((r) => r.id === 'acct-good')?.role, 'INSTRUCTOR');
  });

  console.log('\n====================================================');
  console.log('📊 AUTHENTICATION MIDDLEWARE RESULTS');
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
