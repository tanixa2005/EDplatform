/**
 * The Clerk webhook handler, verified offline through its real logic.
 *
 * The handler runs with the real provisioning core (linkOrCreateStudentCore)
 * against the in-memory store. The signature check is a stub that accepts one
 * known signature, and deletion is a spy. Nothing here imports svix, Prisma, the
 * environment, or the network.
 *
 * Policy under test: a refused link (inactive, unverified or conflicting) is
 * acknowledged with a 200 and changes nothing. Any other failure reaches next()
 * unchanged.
 *
 * Run: npm run test:webhook-handler
 */
import assert from 'node:assert/strict';
import { BadRequestError, UnauthorizedError } from '../errors/app.error.js';
import { handleClerkWebhook, type WebhookDeps } from '../controllers/clerk-webhook-handler.js';
import { linkOrCreateStudentCore } from '../services/clerk-identity-core.js';
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

const VALID_SIGNATURE = 'valid-signature';
const SECRET = 'whsec_test_placeholder_not_real';

interface Harness {
  deps: WebhookDeps;
  store: ReturnType<typeof fakeIdentityStore>;
  deleted: string[];
  verified: number;
}

interface HarnessOptions {
  seed?: ReturnType<typeof account>[];
  secret?: string;
  /** Replaces the provisioning step, to simulate an unexpected failure. */
  provisionOverride?: WebhookDeps['provision'];
  deleteOverride?: WebhookDeps['deleteByClerkId'];
}

function harness(options: HarnessOptions = {}): Harness {
  const store = fakeIdentityStore(options.seed ?? []);
  const deleted: string[] = [];
  const state = { verified: 0 };
  const deps: WebhookDeps = {
    webhookSecret: options.secret ?? SECRET,
    verify(rawBody, headers) {
      state.verified += 1;
      if (headers['svix-signature'] !== VALID_SIGNATURE) throw new Error('signature mismatch');
      return JSON.parse(rawBody);
    },
    provision: options.provisionOverride ?? ((input) => linkOrCreateStudentCore(store.db, input)),
    async deleteByClerkId(clerkUserId) {
      if (options.deleteOverride) return options.deleteOverride(clerkUserId);
      deleted.push(clerkUserId);
    }
  };
  return {
    deps,
    store,
    deleted,
    get verified() {
      return state.verified;
    }
  } as Harness;
}

interface Outcome {
  responses: { code: number; body: unknown }[];
  nextCalls: { error?: unknown }[];
}

/** Runs one webhook delivery, with the given body and signature, and records what happened. */
async function deliver(
  h: Harness,
  body: unknown,
  options: { signature?: string; headers?: Record<string, string | undefined> } = {}
): Promise<Outcome> {
  const outcome: Outcome = { responses: [], nextCalls: [] };
  const headerValues: Record<string, string | undefined> = {
    'svix-id': 'msg_test',
    'svix-timestamp': '1700000000',
    'svix-signature': options.signature ?? VALID_SIGNATURE,
    ...(options.headers ?? {})
  };
  const req = {
    body,
    header: (name: string) => headerValues[name]
  };
  const res = {
    status: (code: number) => ({
      json: (responseBody: unknown) => {
        outcome.responses.push({ code, body: responseBody });
        return responseBody;
      }
    })
  };
  const next = (error?: unknown) => {
    outcome.nextCalls.push({ error });
  };
  await handleClerkWebhook(h.deps, req, res, next as never);
  return outcome;
}

const rawEvent = (event: unknown) => Buffer.from(JSON.stringify(event), 'utf8');

function userEvent(type: 'user.created' | 'user.updated', id: string, email: string, verified: boolean, extra: Record<string, unknown> = {}) {
  return {
    type,
    data: {
      id,
      primary_email_address_id: 'e1',
      email_addresses: [{ id: 'e1', email_address: email, verification: { status: verified ? 'verified' : 'unverified' } }],
      first_name: 'Sam',
      last_name: 'Lee',
      image_url: null,
      ...extra
    }
  };
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🪝 CLERK WEBHOOK HANDLER SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. the normal, verified path
  await check('A valid, verified user.created for a new email follows the provisioning path and creates a student', async () => {
    const h = harness();
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'new@example.test', true)));
    assert.equal(out.nextCalls.length, 0, 'next() was called on a successful delivery');
    assert.deepEqual(out.responses, [{ code: 200, body: { success: true, data: { received: 'user.created' } } }]);
    assert.deepEqual(h.store.writes, ['create']);
    assert.equal(h.store.rows[0].clerkUserId, 'clerk-new');
    assert.equal(h.store.rows[0].role, 'STUDENT');
  });

  await check('A valid, verified user.created for an existing active account links it and keeps its role', async () => {
    const h = harness({ seed: [account({ id: 'acct-1', email: 'teacher@example.test', role: 'INSTRUCTOR' })] });
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'teacher@example.test', true)));
    assert.equal(out.nextCalls.length, 0);
    assert.equal(out.responses[0].code, 200);
    assert.deepEqual(h.store.writes, ['link:acct-1']);
    assert.equal(h.store.rows[0].clerkUserId, 'clerk-new');
    assert.equal(h.store.rows[0].role, 'INSTRUCTOR', 'the webhook changed the role');
  });

  await check('A user.updated for an already-linked identity changes nothing', async () => {
    const h = harness({ seed: [account({ id: 'acct-1', email: 'same@example.test', clerkUserId: 'clerk-known' })] });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.updated', 'clerk-known', 'same@example.test', true)));
    assert.equal(out.responses[0].code, 200);
    assert.equal(snapshot(h.store.rows), before);
    assert.deepEqual(h.store.writes, []);
  });

  // ---------------------------------------------------------------- 2. unverified email
  await check('An unverified email for a new address is acknowledged safely: 200, nothing created or modified', async () => {
    const h = harness();
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'squat@example.test', false)));
    assert.equal(out.nextCalls.length, 0, 'the unverified event was treated as a failure');
    assert.equal(out.responses[0].code, 200);
    assert.equal(h.store.rows.length, 0, 'an account was created from an unverified email');
    assert.deepEqual(h.store.writes, []);
  });

  await check('An unverified email for an existing account acknowledges with 200 and leaves the account unchanged', async () => {
    const h = harness({ seed: [account({ email: 'student@example.test' })] });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'student@example.test', false)));
    assert.equal(out.responses[0].code, 200);
    assert.equal(snapshot(h.store.rows), before);
    assert.deepEqual(h.store.writes, []);
  });

  // ---------------------------------------------------------------- 3. conflicting Clerk identity
  await check('A conflicting Clerk identity is acknowledged with 200, and the existing link is not replaced', async () => {
    const h = harness({ seed: [account({ email: 'victim@example.test', clerkUserId: 'clerk-owner' })] });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-attacker', 'victim@example.test', true)));
    assert.equal(out.nextCalls.length, 0);
    assert.equal(out.responses[0].code, 200);
    assert.equal(h.store.rows[0].clerkUserId, 'clerk-owner', 'the Clerk id was replaced');
    assert.equal(snapshot(h.store.rows), before);
    assert.deepEqual(h.store.writes, []);
  });

  await check('An inactive matching account is acknowledged with 200 and left unchanged', async () => {
    const h = harness({ seed: [account({ email: 'former@example.test', isActive: false })] });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-hook', 'former@example.test', true)));
    assert.equal(out.responses[0].code, 200);
    assert.equal(snapshot(h.store.rows), before);
    assert.deepEqual(h.store.writes, []);
  });

  await check('The synthetic demo owner cannot be provisioned: a verified event on its email is acknowledged and the owner is unchanged', async () => {
    const owner = account({ id: 'demo-owner', email: 'demo-owner@edplatform-demo.invalid', role: 'INSTRUCTOR', isActive: false });
    const h = harness({ seed: [owner] });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-takeover', 'demo-owner@edplatform-demo.invalid', true)));
    assert.equal(out.responses[0].code, 200);
    assert.equal(snapshot(h.store.rows), before);
    assert.equal(h.store.rows[0].role, 'INSTRUCTOR');
    assert.deepEqual(h.store.writes, []);
  });

  await check('A user.updated that moves an identity to another email never moves it to another account', async () => {
    const h = harness({
      seed: [
        account({ id: 'acct-a', email: 'a@example.test', clerkUserId: 'clerk-1' }),
        account({ id: 'acct-b', email: 'b@example.test', clerkUserId: null })
      ]
    });
    const before = snapshot(h.store.rows);
    const out = await deliver(h, rawEvent(userEvent('user.updated', 'clerk-1', 'b@example.test', true)));
    assert.equal(out.responses[0].code, 200);
    assert.equal(snapshot(h.store.rows), before);
    assert.deepEqual(h.store.writes, []);
  });

  // ---------------------------------------------------------------- 4. other events and inputs
  await check('user.deleted is passed to the deletion step, and acknowledged', async () => {
    const h = harness({ seed: [account({ clerkUserId: 'clerk-gone' })] });
    const out = await deliver(h, rawEvent({ type: 'user.deleted', data: { id: 'clerk-gone' } }));
    assert.deepEqual(h.deleted, ['clerk-gone']);
    assert.deepEqual(out.responses, [{ code: 200, body: { success: true, data: { received: 'user.deleted' } } }]);
  });

  await check('An unknown event type is acknowledged and ignored', async () => {
    const h = harness();
    const out = await deliver(h, rawEvent({ type: 'session.created', data: { id: 'x' } }));
    assert.equal(out.responses[0].code, 200);
    assert.deepEqual(h.store.writes, []);
    assert.deepEqual(h.deleted, []);
  });

  await check('A user event with no email addresses is acknowledged without a provisioning attempt', async () => {
    const h = harness();
    const out = await deliver(h, rawEvent({ type: 'user.created', data: { id: 'clerk-x', email_addresses: [] } }));
    assert.equal(out.responses[0].code, 200);
    assert.deepEqual(h.store.writes, []);
  });

  // ---------------------------------------------------------------- 5. refusals before any work
  await check('An invalid signature is refused with a 401, and nothing is provisioned or deleted', async () => {
    const h = harness();
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'new@example.test', true)), { signature: 'forged' });
    assert.ok(out.nextCalls[0].error instanceof UnauthorizedError);
    assert.equal((out.nextCalls[0].error as UnauthorizedError).message, 'Invalid Clerk webhook signature');
    assert.equal(out.responses.length, 0);
    assert.deepEqual(h.store.writes, []);
  });

  await check('A deletion with an invalid signature cannot remove anything', async () => {
    const h = harness({ seed: [account({ clerkUserId: 'clerk-keep' })] });
    const out = await deliver(h, rawEvent({ type: 'user.deleted', data: { id: 'clerk-keep' } }), { signature: 'forged' });
    assert.ok(out.nextCalls[0].error instanceof UnauthorizedError);
    assert.deepEqual(h.deleted, []);
  });

  await check('Webhooks with no configured secret are refused before the signature is even checked', async () => {
    const h = harness({ secret: '' });
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'new@example.test', true)));
    assert.ok(out.nextCalls[0].error instanceof UnauthorizedError);
    assert.match((out.nextCalls[0].error as UnauthorizedError).message, /not configured/);
    assert.equal(h.verified, 0, 'the signature was checked without a secret');
    assert.deepEqual(h.store.writes, []);
  });

  await check('A body that is not the raw bytes is refused with a 400', async () => {
    const h = harness();
    const out = await deliver(h, { type: 'user.created', data: {} });
    assert.ok(out.nextCalls[0].error instanceof BadRequestError);
    assert.deepEqual(h.store.writes, []);
  });

  // ---------------------------------------------------------------- 6. unexpected errors are not swallowed
  await check('An unexpected provisioning failure reaches next() unchanged and no response is sent', async () => {
    const failure = new Error('database unavailable');
    const h = harness({ provisionOverride: async () => Promise.reject(failure) });
    const out = await deliver(h, rawEvent(userEvent('user.created', 'clerk-new', 'new@example.test', true)));
    assert.equal(out.nextCalls.length, 1);
    assert.equal(out.nextCalls[0].error, failure, 'the error was replaced or swallowed');
    assert.equal(out.responses.length, 0, 'a success was reported for a failure');
  });

  await check('A database failure inside the real provisioning logic reaches next(), not a 200', async () => {
    const h = harness();
    const broken = { ...h.store.db, findByEmail: async () => { throw new Error('connection reset'); } };
    const harnessWithBroken: Harness = { ...h, deps: { ...h.deps, provision: (input) => linkOrCreateStudentCore(broken, input) } };
    const out = await deliver(harnessWithBroken, rawEvent(userEvent('user.created', 'clerk-new', 'new@example.test', true)));
    assert.equal((out.nextCalls[0].error as Error).message, 'connection reset');
    assert.equal(out.responses.length, 0);
  });

  await check('An unexpected deletion failure reaches next() unchanged', async () => {
    const failure = new Error('delete blocked');
    const h = harness({ deleteOverride: async () => Promise.reject(failure) });
    const out = await deliver(h, rawEvent({ type: 'user.deleted', data: { id: 'clerk-x' } }));
    assert.equal(out.nextCalls[0].error, failure);
    assert.equal(out.responses.length, 0);
  });

  console.log('\n====================================================');
  console.log('📊 WEBHOOK HANDLER RESULTS');
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
