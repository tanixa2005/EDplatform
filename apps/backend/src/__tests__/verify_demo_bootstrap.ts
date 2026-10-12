/**
 * Demo curriculum bootstrap, verified offline.
 *
 * Every database here is an in-memory fake. The tests fail if a refusal reaches
 * the client factory, if a write is attempted outside the create-only set, or if
 * a failed run leaves anything committed. No connection is opened.
 *
 * Run: npm run test:demo-bootstrap
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import {
  BACKUP_ENDPOINT,
  DENIED_ENDPOINTS,
  DEVELOPMENT_ENDPOINT,
  PRODUCTION_ENDPOINT
} from '../config/database-endpoints.js';
import {
  assertDemoTarget,
  DEMO_ALLOW_ENV,
  DEMO_CONFIRM_FLAG,
  DEMO_EXPECT_ENV,
  DEMO_URL_ENV,
  DemoRefusal
} from '../tools/demo-curriculum/demo-guard.js';
import {
  DEMO_OWNER,
  MUST_BE_EMPTY_TABLES,
  demoModeFromArgv,
  runDemoBootstrap
} from '../tools/demo-curriculum/demo-bootstrap.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const DEMO_DIR = path.join(BACKEND, 'src', 'tools', 'demo-curriculum');
const DEMO_ENDPOINT = 'ep-demo-approved-test1234';
const PLACEHOLDER_PASSWORD = 'placeholder-password-not-real';
const CONFIRMED = [DEMO_CONFIRM_FLAG];
const ENV_OK = { [DEMO_ALLOW_ENV]: '1', [DEMO_EXPECT_ENV]: DEMO_ENDPOINT, [DEMO_URL_ENV]: `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${DEMO_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` };

const FINISHED = [
  '20260930083002_init',
  '20260930090245_add_course_system_fields',
  '20260930093019_add_quiz_system',
  '20261006120000_phase1_student_profile_and_tutor_sessions',
  '20261008180000_add_quizquestion_topic',
  '20261009190000_add_tutorsession_chapter',
  '20261010120000_add_lesson_teaching_brief'
].map((migration_name) => ({ migration_name, finished_at: new Date('2026-10-10T00:00:00Z'), rolled_back_at: null }));

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

interface Op {
  op: string;
  args?: unknown;
}

const WRITE = /\.(create|createMany)$/;
const FORBIDDEN = /\.(update|updateMany|upsert|delete|deleteMany)$/;

/**
 * An in-memory client. Writes inside a transaction are committed only when the
 * transaction returns; a thrown error discards them, as Postgres would roll back.
 */
function fakeClient(options: { migrations?: unknown[]; counts?: Record<string, number>; failAtWrite?: number } = {}) {
  const calls: Op[] = [];
  const committed: Op[] = [];
  let writesInTransaction = 0;
  let disconnected = false;
  const counts = options.counts ?? {};

  const modelFor = (name: string, sink: (op: string, args?: unknown) => void) =>
    new Proxy({} as Record<string, unknown>, {
      get: (_target, method: string) => async (args?: unknown) => {
        const op = `${name}.${method}`;
        sink(op, args);
        if (method === 'count') return counts[name] ?? 0;
        if (method === 'findMany') return [];
        if (method === 'create') return { id: `${name}-${calls.length}` };
        if (method === 'createMany') return { count: (args as { data: unknown[] }).data.length };
        return undefined;
      }
    });

  const outside = (op: string, args?: unknown) => {
    calls.push({ op, args });
  };

  const client = {
    calls,
    committed,
    get disconnected() {
      return disconnected;
    },
    $queryRaw: async () => {
      calls.push({ op: '$queryRaw' });
      return options.migrations ?? FINISHED;
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      calls.push({ op: '$transaction' });
      const pending: Op[] = [];
      const sink = (op: string, args?: unknown) => {
        calls.push({ op, args });
        if (WRITE.test(op)) {
          writesInTransaction += 1;
          if (options.failAtWrite !== undefined && writesInTransaction === options.failAtWrite) {
            throw new Error('injected failure during the write');
          }
          pending.push({ op, args });
        }
      };
      const tx = new Proxy({} as Record<string, unknown>, {
        get: (_target, key: string) => {
          if (key === '$queryRaw') return async () => [{ digest: '' }];
          return modelFor(key, sink);
        }
      });
      const result = await work(tx);
      committed.push(...pending);
      return result;
    },
    $disconnect: async () => {
      disconnected = true;
    }
  };

  const proxied = new Proxy(client as unknown as Record<string, unknown>, {
    get: (target, key: string) => {
      if (key in target) return (target as Record<string, unknown>)[key];
      return modelFor(key, outside);
    }
  });
  // Typed as the client's own shape; any other key resolves to a fake model.
  return proxied as unknown as typeof client;
}

/** Runs the demo bootstrap with a fake client, and counts how often a client was requested. */
async function run(argv: string[], env: Record<string, string | undefined>, fake?: unknown) {
  let made = 0;
  const logs: string[] = [];
  const result = await runDemoBootstrap({
    argv,
    env,
    log: (line) => logs.push(line),
    makeClient: () => {
      made += 1;
      return (fake ?? fakeClient()) as unknown as PrismaClient;
    }
  }).catch((err: unknown) => {
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { clientsMade: made, logs });
  });
  return { result, clientsMade: made, logs };
}

async function expectRefusal(argv: string[], env: Record<string, string | undefined>, pattern: RegExp): Promise<number> {
  try {
    await run(argv, env);
  } catch (err) {
    const e = err as Error & { clientsMade?: number };
    assert.match(e.message, pattern);
    assert.ok(!e.message.includes(PLACEHOLDER_PASSWORD), 'the refusal printed the password');
    return e.clientsMade ?? 0;
  }
  throw new Error('the run was accepted but should have been refused');
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🧪 DEMO CURRICULUM BOOTSTRAP SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. the target guard, pure
  await check('The guard accepts the approved endpoint with every confirmation present', () => {
    assert.equal(assertDemoTarget(CONFIRMED, ENV_OK), DEMO_ENDPOINT);
  });

  await check('The guard refuses without the command-line confirmation', () => {
    assert.throws(() => assertDemoTarget([], ENV_OK), /--confirm-demo-seed/);
  });

  await check('The guard refuses without the environment confirmation, for every value other than exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_ALLOW_ENV]: value }), /EDP_ALLOW_DEMO_SEED=1/);
    }
  });

  await check('The guard refuses when no approved endpoint is named (fail closed)', () => {
    assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_EXPECT_ENV]: '' }), /must name the approved demo endpoint/);
  });

  await check('The guard refuses when the URL is missing', () => {
    assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: '' }), /must be provided by the host/);
  });

  await check('The guard refuses production, development and backup, as the approved endpoint itself', () => {
    for (const denied of DENIED_ENDPOINTS) {
      const url = `postgresql://u:${PLACEHOLDER_PASSWORD}@${denied}.c-3.ap-southeast-1.aws.neon.tech/db`;
      assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_EXPECT_ENV]: denied, [DEMO_URL_ENV]: url }), /denied/);
    }
  });

  await check('The guard refuses a URL on production, development or backup, in direct and pooled form', () => {
    for (const denied of [PRODUCTION_ENDPOINT, DEVELOPMENT_ENDPOINT, BACKUP_ENDPOINT]) {
      for (const host of [denied, `${denied}-pooler`]) {
        const url = `postgresql://u:${PLACEHOLDER_PASSWORD}@${host}.c-3.ap-southeast-1.aws.neon.tech/db`;
        assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: url }), /denied/, `${host} was not refused`);
      }
    }
  });

  await check('The guard refuses a URL whose endpoint disagrees with the approved endpoint', () => {
    const url = `postgresql://u:${PLACEHOLDER_PASSWORD}@ep-unapproved-zz99.c-3.ap-southeast-1.aws.neon.tech/db`;
    assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: url }), /does not match/);
  });

  await check('The guard refuses a URL with no readable Neon endpoint, such as localhost', () => {
    assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: 'postgresql://u:p@localhost:5432/db' }), /no readable Neon endpoint/);
  });

  await check('The guard refuses lookalike and forged-suffix hosts that start with the approved id', () => {
    for (const host of [
      `${DEMO_ENDPOINT}.attacker.example`,
      `${DEMO_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech.attacker.example`,
      `${DEMO_ENDPOINT}.evil.c-3.ap-southeast-1.aws.neon.tech`
    ]) {
      const url = `postgresql://u:${PLACEHOLDER_PASSWORD}@${host}/neondb`;
      assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: url }), /no readable Neon endpoint/, `${host} was accepted`);
    }
  });

  await check('The guard refuses an approved endpoint that is not a well-formed id', () => {
    assert.throws(() => assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_EXPECT_ENV]: `${DEMO_ENDPOINT}.evil` }), /not a well-formed Neon endpoint id/);
  });

  await check('The guard never echoes the URL or password in a refusal', () => {
    try {
      assertDemoTarget(CONFIRMED, { ...ENV_OK, [DEMO_URL_ENV]: `postgresql://u:${PLACEHOLDER_PASSWORD}@${PRODUCTION_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/db` });
      throw new Error('expected a refusal');
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(!message.includes(PLACEHOLDER_PASSWORD));
      assert.ok(!message.includes(PRODUCTION_ENDPOINT));
      assert.ok(!message.includes('postgresql://'));
      assert.ok(err instanceof DemoRefusal);
    }
  });

  // ---------------------------------------------------------------- 2. arguments and the no-connection modes
  await check('An unrecognised argument is refused before any connection', async () => {
    const clients = await expectRefusal(['--confirm-demo-seed', '--yes'], ENV_OK, /unrecognised argument/);
    assert.equal(clients, 0);
  });

  await check('Plan and preflight together are refused', () => {
    assert.throws(() => demoModeFromArgv(['--plan', '--preflight']), /not both/);
  });

  await check('Plan mode needs no environment and opens no connection, and returns the approved counts', async () => {
    const { result, clientsMade } = await run(['--plan'], {});
    assert.equal(clientsMade, 0);
    assert.equal(result.courses, 12);
    assert.equal(result.lessons, 4);
    assert.equal(result.quizzes, 1);
    assert.equal(result.questions, 5);
    assert.equal(result.briefs, 4);
  });

  // ---------------------------------------------------------------- 3. refusals that must never reach a client
  await check('A run without the confirmation never requests a client', async () => {
    const clients = await expectRefusal([], ENV_OK, /--confirm-demo-seed/);
    assert.equal(clients, 0);
  });

  await check('A run against the production endpoint never requests a client', async () => {
    const env = { ...ENV_OK, [DEMO_EXPECT_ENV]: PRODUCTION_ENDPOINT, [DEMO_URL_ENV]: `postgresql://u:${PLACEHOLDER_PASSWORD}@${PRODUCTION_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/db` };
    const clients = await expectRefusal(CONFIRMED, env, /denied/);
    assert.equal(clients, 0);
  });

  await check('A run against the development endpoint never requests a client', async () => {
    const env = { ...ENV_OK, [DEMO_EXPECT_ENV]: DEVELOPMENT_ENDPOINT, [DEMO_URL_ENV]: `postgresql://u:${PLACEHOLDER_PASSWORD}@${DEVELOPMENT_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/db` };
    const clients = await expectRefusal(CONFIRMED, env, /denied/);
    assert.equal(clients, 0);
  });

  await check('A run against the backup endpoint never requests a client', async () => {
    const env = { ...ENV_OK, [DEMO_EXPECT_ENV]: BACKUP_ENDPOINT, [DEMO_URL_ENV]: `postgresql://u:${PLACEHOLDER_PASSWORD}@${BACKUP_ENDPOINT}-pooler.c-3.ap-southeast-1.aws.neon.tech/db` };
    const clients = await expectRefusal(CONFIRMED, env, /denied/);
    assert.equal(clients, 0);
  });

  await check('A run against an unapproved endpoint never requests a client', async () => {
    const env = { ...ENV_OK, [DEMO_URL_ENV]: `postgresql://u:${PLACEHOLDER_PASSWORD}@ep-unapproved-zz99.c-3.ap-southeast-1.aws.neon.tech/db` };
    const clients = await expectRefusal(CONFIRMED, env, /does not match/);
    assert.equal(clients, 0);
  });

  // ---------------------------------------------------------------- 4. the database checks before any write
  await check('A non-empty target is refused before any write, and the refusal names the table', async () => {
    const fake = fakeClient({ counts: { tutorMessage: 3 } });
    await assert.rejects(() => run(CONFIRMED, ENV_OK, fake), /not empty \(TutorMessage 3\)/);
    assert.ok(!fake.calls.some((c) => c.op === '$transaction'), 'a transaction opened on a non-empty target');
    assert.equal(fake.committed.length, 0);
  });

  await check('Every table the demo must find empty is checked', () => {
    for (const table of ['User', 'TutorMessage', 'QuizAttempt', 'QuizAnswer', 'Enrollment', 'LessonProgress', 'TutorSession', 'Course']) {
      assert.ok((MUST_BE_EMPTY_TABLES as readonly string[]).includes(table), `${table} is not checked`);
    }
  });

  await check('An incomplete migration history is refused before any write', async () => {
    const fake = fakeClient({ migrations: FINISHED.slice(0, 6) });
    await assert.rejects(() => run(CONFIRMED, ENV_OK, fake), /migrations are not ready/);
    assert.ok(!fake.calls.some((c) => c.op === '$transaction'));
  });

  await check('A failed or rolled-back migration is refused before any write', async () => {
    const failed = FINISHED.map((r, i) => (i === 3 ? { ...r, finished_at: null } : r));
    await assert.rejects(() => run(CONFIRMED, ENV_OK, fakeClient({ migrations: failed })), /has not finished/);
    const rolled = FINISHED.map((r, i) => (i === 4 ? { ...r, rolled_back_at: new Date() } : r));
    await assert.rejects(() => run(CONFIRMED, ENV_OK, fakeClient({ migrations: rolled })), /was rolled back/);
  });

  await check('Preflight reads, checks everything, and writes nothing', async () => {
    const fake = fakeClient();
    const { result, logs } = await run([...CONFIRMED, '--preflight'], ENV_OK, fake);
    assert.equal(result.courses, 12);
    assert.ok(!fake.calls.some((c) => c.op === '$transaction'), 'preflight opened a transaction');
    assert.ok(!fake.calls.some((c) => WRITE.test(c.op)), 'preflight attempted a write');
    assert.ok(logs.some((l) => /preflight passed/.test(l)));
  });

  // ---------------------------------------------------------------- 5. the apply run: create-only, one transaction
  await check('A clean, empty target is seeded in one transaction with exactly the approved create counts', async () => {
    const fake = fakeClient();
    const { result } = await run(CONFIRMED, ENV_OK, fake);
    assert.equal(result.courses, 12);
    assert.equal(result.modules, 140);
    assert.equal(result.lessons, 4);
    assert.equal(result.quizzes, 1);
    assert.equal(result.questions, 5);
    assert.equal(result.options, 18);
    assert.equal(result.briefs, 4);
    const txs = fake.calls.filter((c) => c.op === '$transaction');
    assert.equal(txs.length, 1, 'more than one transaction was opened');
    assert.equal(fake.disconnected, true, 'the connection was not released');
  });

  await check('Only create operations are committed, and no update, upsert or delete is ever called', async () => {
    const fake = fakeClient();
    await run(CONFIRMED, ENV_OK, fake);
    for (const call of fake.calls) {
      assert.ok(!FORBIDDEN.test(call.op), `a forbidden call ran: ${call.op}`);
    }
    for (const write of fake.committed) {
      assert.ok(WRITE.test(write.op), `a non-create write was committed: ${write.op}`);
    }
  });

  await check('The owner record is the synthetic, non-login instructor, and is the only user created', async () => {
    const fake = fakeClient();
    await run(CONFIRMED, ENV_OK, fake);
    const userCreates = fake.committed.filter((c) => c.op === 'user.create');
    assert.equal(userCreates.length, 1, 'more than one user was created');
    const data = (userCreates[0].args as { data: Record<string, unknown> }).data;
    assert.equal(data.email, DEMO_OWNER.email);
    assert.equal(data.role, 'INSTRUCTOR', 'the owner must not be an administrator');
    assert.equal(data.isActive, false, 'the owner must be inactive so no login path accepts it');
    assert.equal(data.passwordHash, null, 'the owner must have no password');
    assert.equal(data.clerkUserId, null, 'the owner must have no Clerk identity');
  });

  await check('The owner email uses the reserved .invalid domain, so it can never receive mail or match a real account', () => {
    assert.ok(DEMO_OWNER.email.endsWith('.invalid'));
    assert.notEqual(DEMO_OWNER.role, 'ADMIN');
  });

  await check('A failure partway through rolls the whole demo back: nothing is committed', async () => {
    const fake = fakeClient({ failAtWrite: 9 });
    await assert.rejects(() => run(CONFIRMED, ENV_OK, fake), /injected failure/);
    assert.equal(fake.committed.length, 0, 'partial data was committed');
    assert.equal(fake.disconnected, true);
  });

  await check('The demo runner reads only committed sources and never imports data from an existing database', () => {
    const files = ['demo-guard.ts', 'demo-bootstrap.ts', 'cli.ts', 'run.ts'];
    for (const file of files) {
      const source = readFileSync(path.join(DEMO_DIR, file), 'utf8');
      assert.ok(!/from ['"]dotenv['"]/.test(source), `${file} loads configuration from a file`);
      assert.ok(!/['"`]\.env['"`]/.test(source), `${file} refers to an environment file`);
      assert.ok(!/\.(update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source), `${file} contains a forbidden write`);
    }
  });

  // ---------------------------------------------------------------- summary
  console.log('\n====================================================');
  console.log('📊 DEMO CURRICULUM BOOTSTRAP RESULTS');
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
