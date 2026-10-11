/**
 * Production curriculum bootstrap, verified offline.
 *
 * No test here opens a database connection or makes a network request. The
 * client is an in-memory fake, and every test asserts how far the fake was
 * reached: a refused run must never touch it, and an approved run must touch it
 * only with creates.
 *
 * Run: npm run test:production-seed
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import * as Boot from '../tools/production-curriculum/curriculum-bootstrap.js';
import * as Content from '../tools/production-curriculum/curriculum-content.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const BACKEND = path.resolve(HERE, '..', '..');
const read = (file: string) => readFileSync(file, 'utf8');

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

/** Placeholder credentials and the real endpoint identifiers from the repository. */
const APPROVED_URL = `postgresql://placeholder:placeholder@${Boot.APPROVED_PRODUCTION_ENDPOINT}-pooler.c-3.example.test/edplatform?sslmode=require`;
const DEVELOPMENT_URL = `postgresql://placeholder:placeholder@${Boot.DEVELOPMENT_ENDPOINT}.c-3.example.test/edplatform?sslmode=require`;
const OTHER_URL = 'postgresql://placeholder:placeholder@ep-other-placeholder.c-3.example.test/edplatform?sslmode=require';

const GOOD_ENV = (url: string): Record<string, string> => ({
  [Boot.ALLOW_ENV]: '1',
  [Boot.URL_ENV]: url,
  [Boot.ENDPOINT_ENV]: Boot.APPROVED_PRODUCTION_ENDPOINT
});
const CONFIRMED = [Boot.CONFIRM_FLAG];

const MAP = read(path.resolve(REPO, 'docs', 'curriculum-map.md'));
const PLAN = Boot.planCurriculum(MAP);

const FINISHED = Boot.EXPECTED_MIGRATIONS.map((name) => ({
  migration_name: name,
  finished_at: new Date('2026-10-01T00:00:00Z'),
  rolled_back_at: null
}));

const EMPTY_SNAPSHOT: Boot.ExistingSnapshot = {
  ownerId: 'owner-1',
  courseSlugs: [],
  moduleKeys: [],
  chapterLessonSlugs: [],
  hostQuizCount: 0
};

/** Throws if the given function does not throw, and returns the error text. */
async function expectRefusal(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('the call was accepted but should have been refused');
}

/** Legacy row counts the fakes report. They never change during a run. */
const LEGACY = { users: 27, enrollments: 3, lessonProgress: 3, quizAttempts: 11, quizAnswers: 44, tutorSessions: 56, tutorMessages: 190 };
const LEGACY_OPTION_IDS = ['option-legacy-1', 'option-legacy-2'];
const STABLE_DIGEST = 'digest-of-legacy-options';

/** The read delegates a legacy baseline needs, recording each call. */
function baselineDelegates(calls: string[]) {
  const count = (label: string, value: number) => ({
    count: async () => {
      calls.push(`${label}.count`);
      return value;
    }
  });
  return {
    user: count('user', LEGACY.users),
    enrollment: count('enrollment', LEGACY.enrollments),
    lessonProgress: count('lessonProgress', LEGACY.lessonProgress),
    quizAttempt: count('quizAttempt', LEGACY.quizAttempts),
    quizAnswer: count('quizAnswer', LEGACY.quizAnswers),
    tutorSession: count('tutorSession', LEGACY.tutorSessions),
    tutorMessage: count('tutorMessage', LEGACY.tutorMessages),
    quizOption: {
      findMany: async () => {
        calls.push('quizOption.findMany');
        return LEGACY_OPTION_IDS.map((id) => ({ id }));
      }
    }
  };
}

/** A fake client that records every call, and throws if asked to connect. */
function fakeClient(options: {
  migrations?: unknown[];
  snapshot?: Partial<{
    owner: { id: string } | null;
    courses: { slug: string }[];
    modules: { sortOrder: number; course: { slug: string } }[];
    chapter: { id: string } | null;
    lessons: { slug: string }[];
    quizzes: number;
  }>;
}) {
  const calls: string[] = [];
  const snap = options.snapshot ?? {};
  const base = baselineDelegates(calls);
  const client = {
    calls,
    async $queryRaw(strings: TemplateStringsArray) {
      const sql = strings.join(' ');
      calls.push(sql.includes('_prisma_migrations') ? '$queryRaw:migrations' : '$queryRaw:digest');
      if (sql.includes('_prisma_migrations')) return options.migrations ?? FINISHED;
      return [{ digest: STABLE_DIGEST }];
    },
    user: {
      ...base.user,
      async findUnique() {
        calls.push('user.findUnique');
        return snap.owner === undefined ? { id: 'owner-1' } : snap.owner;
      }
    },
    enrollment: base.enrollment,
    lessonProgress: base.lessonProgress,
    quizAttempt: base.quizAttempt,
    quizAnswer: base.quizAnswer,
    tutorSession: base.tutorSession,
    tutorMessage: base.tutorMessage,
    quizOption: base.quizOption,
    course: {
      async findMany() {
        calls.push('course.findMany');
        return snap.courses ?? [];
      }
    },
    module: {
      async findMany() {
        calls.push('module.findMany');
        return snap.modules ?? [];
      },
      async findFirst() {
        calls.push('module.findFirst');
        return snap.chapter === undefined ? null : snap.chapter;
      }
    },
    lesson: {
      async findMany() {
        calls.push('lesson.findMany');
        return snap.lessons ?? [];
      }
    },
    quiz: {
      async count() {
        calls.push('quiz.count');
        return snap.quizzes ?? 0;
      }
    },
    async $transaction(work: (tx: unknown) => Promise<unknown>) {
      calls.push('$transaction');
      return work(writerFor(calls));
    },
    async $disconnect() {
      calls.push('$disconnect');
    }
  };
  return client;
}

/** A transaction client: the same reads, plus the creates. Each call is recorded. */
function writerFor(calls: string[]) {
  let n = 0;
  const next = (kind: string) => {
    n += 1;
    return { id: `${kind}-${n}` };
  };
  const base = baselineDelegates(calls);
  return {
    ...base,
    $queryRaw: async () => {
      calls.push('$queryRaw:digest');
      return [{ digest: STABLE_DIGEST }];
    },
    course: {
      create: async () => {
        calls.push('course.create');
        return next('course');
      }
    },
    module: {
      create: async () => {
        calls.push('module.create');
        return next('module');
      }
    },
    lesson: {
      create: async () => {
        calls.push('lesson.create');
        return next('lesson');
      }
    },
    quiz: {
      create: async () => {
        calls.push('quiz.create');
        return next('quiz');
      }
    },
    quizQuestion: {
      create: async () => {
        calls.push('quizQuestion.create');
        return next('question');
      }
    },
    quizOption: {
      ...base.quizOption,
      createMany: async () => {
        calls.push('quizOption.createMany');
        return { count: 0 };
      }
    }
  };
}

const STABLE_BASELINE: Boot.LegacyBaseline = {
  users: 1, enrollments: 1, lessonProgress: 1, quizAttempts: 1, quizAnswers: 1, tutorSessions: 1, tutorMessages: 1,
  optionIds: [], optionDigest: ''
};

/** Plain in-memory store for the apply tests: snapshots state and restores it on failure. */
function memoryStore(failAt: number | null) {
  const state: { kind: string; slug?: string; parent?: string }[] = [];
  const calls: string[] = [];
  let created = 0;
  const bump = (kind: string, extra: Partial<(typeof state)[number]> = {}) => {
    created += 1;
    if (failAt !== null && created === failAt) throw new Error('injected failure');
    state.push({ kind, ...extra });
    return `${kind}-${state.length}`;
  };
  const store: Boot.CurriculumStore = {
    async transaction(work) {
      const before = state.slice();
      const beforeCreated = created;
      try {
        return await work({
          createCourse: async (d) => {
            calls.push('createCourse');
            return bump('course', { slug: d.slug });
          },
          createModule: async () => {
            calls.push('createModule');
            return bump('module');
          },
          createLesson: async (d) => {
            calls.push('createLesson');
            return bump('lesson', { slug: d.slug });
          },
          createQuiz: async () => {
            calls.push('createQuiz');
            return bump('quiz');
          },
          createQuestion: async () => {
            calls.push('createQuestion');
            return bump('question');
          },
          baseline: async () => STABLE_BASELINE,
          optionDigest: async () => STABLE_BASELINE.optionDigest,
          createOptions: async () => {
            calls.push('createOptions');
          }
        } as Boot.CurriculumWriter);
      } catch (err) {
        state.length = 0;
        state.push(...before);
        created = beforeCreated;
        throw err;
      }
    }
  };
  return { store, state, calls };
}

/** Text of a block from a start line to its end line, both inclusive. */
function blockBetween(lines: string[], start: (l: string) => boolean, end: string, after?: (l: string) => boolean) {
  const from = lines.findIndex(start);
  const searchFrom = after ? lines.findIndex(after) : from;
  let to = -1;
  for (let i = searchFrom; i < lines.length; i += 1) {
    if (lines[i] === end) {
      to = i;
      break;
    }
  }
  assert.ok(from >= 0 && to >= 0, 'a source block could not be located');
  return lines.slice(from, to + 1).join('\n');
}

const stripExport = (text: string) => text.replace(/^export /gm, '');

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🏗️  PRODUCTION CURRICULUM BOOTSTRAP SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. confirmation
  await check('Without the command-line confirmation flag nothing runs and no client is built', async () => {
    const client = fakeClient({});
    const message = await expectRefusal(() =>
      Boot.runProductionCurriculumBootstrap({
        argv: [],
        env: GOOD_ENV(APPROVED_URL),
        readMap: () => MAP,
        makeClient: () => client as unknown as PrismaClient
      })
    );
    assert.match(message, new RegExp(Boot.CONFIRM_FLAG));
    assert.equal(client.calls.length, 0, 'the database was reached');
  });

  await check('Without EDP_ALLOW_PRODUCTION_SEED=1 nothing runs, even with the flag', async () => {
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      const env = GOOD_ENV(APPROVED_URL);
      if (value === undefined) delete env[Boot.ALLOW_ENV];
      else env[Boot.ALLOW_ENV] = value;
      const client = fakeClient({});
      const message = await expectRefusal(() =>
        Boot.runProductionCurriculumBootstrap({
          argv: CONFIRMED,
          env,
          readMap: () => MAP,
          makeClient: () => client as unknown as PrismaClient
        })
      );
      assert.match(message, new RegExp(Boot.ALLOW_ENV));
      assert.equal(client.calls.length, 0, `reached the database with ${String(value)}`);
    }
  });

  await check('Both the flag and EDP_ALLOW_PRODUCTION_SEED=1 are needed, and both together pass', () => {
    assert.doesNotThrow(() => Boot.assertConfirmed(CONFIRMED, { [Boot.ALLOW_ENV]: '1' }));
    assert.throws(() => Boot.assertConfirmed([], { [Boot.ALLOW_ENV]: '1' }));
    assert.throws(() => Boot.assertConfirmed(CONFIRMED, {}));
  });

  await check('The connection string must be host-provided, never read from .env', async () => {
    const env = GOOD_ENV(APPROVED_URL);
    delete env[Boot.URL_ENV];
    const client = fakeClient({});
    const message = await expectRefusal(() =>
      Boot.runProductionCurriculumBootstrap({
        argv: CONFIRMED,
        env,
        readMap: () => MAP,
        makeClient: () => client as unknown as PrismaClient
      })
    );
    assert.match(message, /provided by the host/);
    assert.equal(client.calls.length, 0);
  });

  // ---------------------------------------------------------------- 2. endpoint
  await check('The development endpoint is refused as a production target', () => {
    const message = (() => {
      try {
        Boot.assertApprovedTarget(DEVELOPMENT_URL, GOOD_ENV(DEVELOPMENT_URL));
        return '';
      } catch (err) {
        return (err as Error).message;
      }
    })();
    assert.match(message, /development endpoint/);
  });

  await check('Any endpoint other than the approved production endpoint is refused', () => {
    assert.throws(() => Boot.assertApprovedTarget(OTHER_URL, GOOD_ENV(OTHER_URL)), /not the approved production endpoint/);
  });

  await check('The approved endpoint must also be named in the environment', () => {
    const env = GOOD_ENV(APPROVED_URL);
    delete env[Boot.ENDPOINT_ENV];
    assert.throws(() => Boot.assertApprovedTarget(APPROVED_URL, env), new RegExp(Boot.ENDPOINT_ENV));
    env[Boot.ENDPOINT_ENV] = Boot.DEVELOPMENT_ENDPOINT;
    assert.throws(() => Boot.assertApprovedTarget(APPROVED_URL, env), new RegExp(Boot.ENDPOINT_ENV));
  });

  await check('The approved production endpoint, named twice, is accepted', () => {
    assert.doesNotThrow(() => Boot.assertApprovedTarget(APPROVED_URL, GOOD_ENV(APPROVED_URL)));
  });

  await check('No endpoint or connection detail appears in any refusal message', () => {
    const cases: [string, Record<string, string>][] = [
      [DEVELOPMENT_URL, GOOD_ENV(DEVELOPMENT_URL)],
      [OTHER_URL, GOOD_ENV(OTHER_URL)],
      [APPROVED_URL, { [Boot.ENDPOINT_ENV]: 'wrong' }],
      ['not a url', GOOD_ENV('not a url')]
    ];
    for (const [url, env] of cases) {
      try {
        Boot.assertApprovedTarget(url, env);
        throw new Error('expected a refusal');
      } catch (err) {
        const message = (err as Error).message;
        for (const secret of ['placeholder', 'postgres', Boot.DEVELOPMENT_ENDPOINT, 'ep-other', url]) {
          assert.ok(!message.includes(secret), `a refusal printed "${secret}"`);
        }
      }
    }
  });

  // ---------------------------------------------------------------- 3. migrations
  await check('All seven migrations finished and none rolled back is accepted', () => {
    assert.doesNotThrow(() => Boot.assertMigrationsApplied(FINISHED));
  });

  await check('A missing migration is refused', () => {
    assert.throws(() => Boot.assertMigrationsApplied(FINISHED.slice(1)), /is not recorded/);
  });

  await check('An unfinished migration is refused, because it may have failed', () => {
    const rows = FINISHED.map((r, i) => (i === 4 ? { ...r, finished_at: null } : r));
    assert.throws(() => Boot.assertMigrationsApplied(rows), /has not finished/);
  });

  await check('A rolled-back migration is refused', () => {
    const rows = FINISHED.map((r, i) =>
      i === 5 ? { ...r, rolled_back_at: new Date('2026-10-02T00:00:00Z') } : r
    );
    assert.throws(() => Boot.assertMigrationsApplied(rows), /was rolled back/);
  });

  await check('An unexpected or duplicated migration is refused', () => {
    assert.throws(
      () => Boot.assertMigrationsApplied([...FINISHED, { migration_name: '20990101000000_unknown', finished_at: new Date(), rolled_back_at: null }]),
      /unexpected migration/
    );
    assert.throws(() => Boot.assertMigrationsApplied([...FINISHED, FINISHED[0]]), /recorded 2 times/);
  });

  await check('A pending migration stops the run before any write, and disconnects', async () => {
    const client = fakeClient({ migrations: FINISHED.slice(0, 6) });
    const message = await expectRefusal(() =>
      Boot.runProductionCurriculumBootstrap({
        argv: CONFIRMED,
        env: GOOD_ENV(APPROVED_URL),
        readMap: () => MAP,
        makeClient: () => client as unknown as PrismaClient
      })
    );
    assert.match(message, /migrations are not ready/);
    assert.ok(!client.calls.includes('$transaction'), 'a write was attempted');
    assert.equal(client.calls.at(-1), '$disconnect', 'the connection was not released');
  });

  // ---------------------------------------------------------------- 4. conflicts
  await check('A clean production snapshot has no conflicts', () => {
    assert.deepEqual(Boot.findConflicts(EMPTY_SNAPSHOT), []);
  });

  await check('A missing owner account is a conflict, and is never created', () => {
    const conflicts = Boot.findConflicts({ ...EMPTY_SNAPSHOT, ownerId: null });
    assert.ok(conflicts.some((c) => /does not exist/.test(c)));
  });

  await check('An existing course with a planned slug is a conflict', () => {
    const slug = PLAN.courses[0].slug;
    assert.ok(Boot.findConflicts({ ...EMPTY_SNAPSHOT, courseSlugs: [slug] }).some((c) => c.includes(slug)));
  });

  await check('An existing planned module, lesson or host quiz is each a conflict', () => {
    assert.ok(Boot.findConflicts({ ...EMPTY_SNAPSHOT, moduleKeys: ['class-6-science#1'] }).length === 1);
    assert.ok(Boot.findConflicts({ ...EMPTY_SNAPSHOT, chapterLessonSlugs: ['what-science-really-is'] }).length === 1);
    assert.ok(Boot.findConflicts({ ...EMPTY_SNAPSHOT, hostQuizCount: 1 }).length === 1);
  });

  await check('A conflict aborts the run before the transaction, and nothing is created', async () => {
    const client = fakeClient({ snapshot: { courses: [{ slug: PLAN.courses[0].slug }] } });
    const message = await expectRefusal(() =>
      Boot.runProductionCurriculumBootstrap({
        argv: CONFIRMED,
        env: GOOD_ENV(APPROVED_URL),
        readMap: () => MAP,
        makeClient: () => client as unknown as PrismaClient
      })
    );
    assert.match(message, /conflicts with the plan/);
    assert.ok(!client.calls.includes('$transaction'));
  });

  // ---------------------------------------------------------------- 5. plan and create-only behaviour
  await check('The plan holds 12 courses, the approved chapter content, and four attached briefs', () => {
    const c = PLAN.counts;
    assert.equal(c.courses, 12);
    assert.equal(c.lessons, 4);
    assert.equal(c.quizzes, 1);
    assert.equal(c.questions, 5);
    assert.equal(c.briefs, 4);
    assert.ok(c.modules > 0 && c.options >= 10, `modules ${c.modules}, options ${c.options}`);
  });

  await check('Every planned brief is for a new lesson in the chapter, and no other lesson gets one', () => {
    const topicSlugs = PLAN.lessons.map((l) => l.slug);
    for (const slug of PLAN.briefs.keys()) assert.ok(topicSlugs.includes(slug), `${slug} is not a chapter topic`);
    assert.equal(PLAN.briefs.size, 4);
  });

  await check('Applying the plan performs only creates, and creates exactly the planned counts', async () => {
    const { store, calls } = memoryStore(null);
    const created = await Boot.applyCurriculum(store, PLAN, 'owner-1');
    assert.deepEqual(created, PLAN.counts);
    for (const call of calls) assert.ok(call.startsWith('create'), `a non-create call ran: ${call}`);
  });

  await check('Quiz options are created with questions, never replaced or deleted', async () => {
    const { store, calls } = memoryStore(null);
    await Boot.applyCurriculum(store, PLAN, 'owner-1');
    assert.ok(!calls.some((c) => /delete|update|upsert|replace/i.test(c)));
  });

  await check('A failure partway through rolls the whole curriculum back', async () => {
    // The ninth create fails. Everything created before it must be rolled back.
    const failing = memoryStore(9);
    await assert.rejects(() => Boot.applyCurriculum(failing.store, PLAN, 'owner-1'), /injected failure/);
    assert.equal(failing.state.length, 0, 'partial curriculum was left behind');
  });

  await check('The runner source contains no update, upsert or delete call', () => {
    const files = [
      path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-bootstrap.ts'),
      path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-content.ts'),
      path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'cli.ts')
    ];
    const forbidden = /\.(update|updateMany|upsert|delete|deleteMany)\s*\(/;
    for (const file of files) {
      const source = read(file);
      assert.ok(!forbidden.test(source), `${path.basename(file)} contains a forbidden write`);
    }
  });

  await check('A full approved run against a fake client writes only creates, inside one transaction', async () => {
    const client = fakeClient({});
    const created = await Boot.runProductionCurriculumBootstrap({
      argv: CONFIRMED,
      env: GOOD_ENV(APPROVED_URL),
      readMap: () => MAP,
      makeClient: () => client as unknown as PrismaClient,
      log: () => undefined
    });
    assert.deepEqual(created, PLAN.counts);
    assert.equal(client.calls.filter((c) => c === '$transaction').length, 1, 'more than one transaction');
    const writes = client.calls.filter((c) => /\.(create|createMany)$/.test(c));
    assert.ok(writes.length > 0);
    for (const call of client.calls) {
      assert.ok(!/update|upsert|delete/i.test(call), `a forbidden call ran: ${call}`);
    }
    assert.equal(client.calls.at(-1), '$disconnect');
  });

  await check('Preflight reads, reports the plan, and never opens the transaction', async () => {
    const client = fakeClient({});
    const counts = await Boot.runProductionCurriculumBootstrap({
      argv: [...CONFIRMED, '--preflight'],
      env: GOOD_ENV(APPROVED_URL),
      readMap: () => MAP,
      makeClient: () => client as unknown as PrismaClient,
      log: () => undefined
    });
    assert.deepEqual(counts, PLAN.counts);
    assert.ok(!client.calls.includes('$transaction'), 'preflight wrote');
  });

  await check('Plan mode opens no connection, needs no confirmation, and writes nothing', async () => {
    let built = false;
    const counts = await Boot.runProductionCurriculumBootstrap({
      argv: ['--plan'],
      env: {},
      readMap: () => MAP,
      makeClient: () => {
        built = true;
        throw new Error('a client was built in plan mode');
      },
      log: () => undefined
    });
    assert.deepEqual(counts, PLAN.counts);
    assert.equal(built, false);
  });

  await check('The plan summary contains only counts and names, never a connection string', () => {
    const text = Boot.formatPlanSummary(PLAN).join('\n');
    assert.ok(!/postgres|@|https?:|placeholder/i.test(text), 'the summary printed a connection detail');
    assert.match(text, /courses to create\s*:\s*12/);
  });

  // ---------------------------------------------------------------- 6. drift against the reviewed sources
  await check('The copied parser matches the development seed it was taken from', () => {
    const seed = read(path.join(BACKEND, 'prisma', 'seed-curriculum.ts')).split(/\r?\n/);
    const from = seed.indexOf('// ---------------------------------------------------------------- parsing');
    const to = seed.indexOf('// ---------------------------------------------------------------- seeding');
    assert.ok(from >= 0 && to > from, 'the parser section could not be located');
    const block = seed.slice(from, to).join('\n').trimEnd();
    const copy = stripExport(read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-content.ts')));
    assert.ok(copy.includes(block), 'the copied parser differs from the development seed');
  });

  await check('The copied topics match the development lesson seed exactly', () => {
    const lessons = read(path.join(BACKEND, 'prisma', 'seed-curriculum-lessons.ts')).split(/\r?\n/);
    const block = blockBetween(lessons, (l) => l === 'interface TopicSeed {', '];', (l) => l.startsWith('const TOPICS'));
    assert.ok(stripExport(read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-content.ts'))).includes(block));
  });

  await check('The copied quiz matches the development quiz seed exactly', () => {
    const quiz = read(path.join(BACKEND, 'prisma', 'seed-curriculum-quiz.ts')).split(/\r?\n/);
    const block = blockBetween(quiz, (l) => l === 'const QUIZ = {', '];', (l) => l.startsWith('const QUESTIONS'));
    assert.ok(stripExport(read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-content.ts'))).includes(block));
  });

  await check('The copied briefs match the reviewed author source, with development row ids removed', () => {
    const author = read(path.join(BACKEND, 'scripts', 'author-ch1-teaching-briefs.mjs')).split(/\r?\n/);
    const block = blockBetween(author, (l) => l === 'const BRIEFS = [', '];')
      .split(/\r?\n/)
      .filter((l) => !/^\s*id: '/.test(l))
      .join('\n');
    assert.ok(stripExport(read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-content.ts'))).includes(block));
  });

  await check('The copied content is the same content the runner uses', () => {
    assert.equal(Content.TOPICS.length, 4);
    assert.equal(Content.QUESTIONS.length, 5);
    assert.equal(PLAN.lessons, Content.TOPICS);
  });

  // ---------------------------------------------------------------- 7. the development guards are untouched
  await check('The development seeds still refuse production and still pin the development endpoint', () => {
    for (const file of ['seed-curriculum.ts', 'seed-curriculum-lessons.ts', 'seed-curriculum-quiz.ts']) {
      const source = read(path.join(BACKEND, 'prisma', file));
      assert.ok(source.includes('REFUSING: target is the production endpoint'), `${file} lost its production refusal`);
      assert.ok(source.includes("const EXPECTED_ENDPOINT = 'ep-young-moon-azdhrnrr'"), `${file} lost its endpoint pin`);
    }
  });

  await check('No development seed imports the production runner, so the two paths stay separate', () => {
    for (const file of ['seed-curriculum.ts', 'seed-curriculum-lessons.ts', 'seed-curriculum-quiz.ts']) {
      assert.ok(!read(path.join(BACKEND, 'prisma', file)).includes('production-curriculum'));
    }
  });

  await check('The runner never loads a .env file or any configuration file', () => {
    for (const file of ['curriculum-bootstrap.ts', 'cli.ts']) {
      const source = read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', file));
      assert.ok(!/from ['"]dotenv['"]|\bdotenv\b|\.config\(\)/.test(source), `${file} loads configuration from a file`);
    }
  });

  await check('The mode is read from the command line, and plan is the default-safe mode', () => {
    assert.equal(Boot.modeFromArgv(['--plan']), 'plan');
    assert.equal(Boot.modeFromArgv(['--preflight']), 'preflight');
    assert.equal(Boot.modeFromArgv([]), 'apply');
    assert.equal(Boot.modeFromArgv(['--confirm-production-seed']), 'apply');
  });

  // ---------------------------------------------------------------- 8. preflight before the migrations
  const EARLY = Boot.EARLY_MIGRATIONS;
  const LATE = Boot.PENDING_ALLOWED_IN_PREFLIGHT;
  const FOUR = FINISHED.slice(0, 4);

  await check('Preflight accepts the first four migrations applied and the three later ones pending', () => {
    const state = Boot.checkMigrationRows(FOUR, 'preflight');
    assert.deepEqual(state.applied, [...EARLY]);
    assert.deepEqual(state.pending, [...LATE]);
    assert.equal(LATE.length, 3);
  });

  await check('Apply refuses the same state, because all seven must be applied first', () => {
    assert.throws(() => Boot.checkMigrationRows(FOUR, 'apply'), /is not recorded/);
  });

  await check('Preflight refuses when an early migration is missing', () => {
    assert.throws(() => Boot.checkMigrationRows(FINISHED.slice(1, 4), 'preflight'), /is not recorded/);
  });

  await check('Preflight refuses a failed pending migration, even though pending is allowed', () => {
    const rows = [...FOUR, { migration_name: LATE[0], finished_at: null, rolled_back_at: null }];
    assert.throws(() => Boot.checkMigrationRows(rows, 'preflight'), /has not finished/);
  });

  await check('Preflight refuses a rolled-back early migration', () => {
    const rows = FOUR.map((r, i) => (i === 2 ? { ...r, rolled_back_at: new Date() } : r));
    assert.throws(() => Boot.checkMigrationRows(rows, 'preflight'), /was rolled back/);
  });

  await check('Preflight refuses an unknown migration and a duplicated one', () => {
    assert.throws(
      () => Boot.checkMigrationRows([...FOUR, { migration_name: '20990101000000_unknown', finished_at: new Date(), rolled_back_at: null }], 'preflight'),
      /unexpected migration/
    );
    assert.throws(() => Boot.checkMigrationRows([...FOUR, FOUR[0]], 'preflight'), /recorded 2 times/);
  });

  await check('Preflight runs with the four applied, writes nothing, and reports what is deferred', async () => {
    const client = fakeClient({ migrations: FOUR });
    const lines: string[] = [];
    const counts = await Boot.runProductionCurriculumBootstrap({
      argv: [...CONFIRMED, '--preflight'],
      env: GOOD_ENV(APPROVED_URL),
      readMap: () => MAP,
      makeClient: () => client as unknown as PrismaClient,
      log: (line) => lines.push(line)
    });
    assert.deepEqual(counts, PLAN.counts);
    assert.ok(!client.calls.includes('$transaction'), 'preflight wrote');
    assert.equal(client.calls.at(-1), '$disconnect');
    const text = lines.join('\n');
    assert.match(text, /migrations pending\s*:\s*20261008180000_add_quizquestion_topic/);
    assert.match(text, /deferred until after the pending migrations/);
    assert.match(text, /legacy baseline/);
  });

  await check('Apply with the four applied is refused before any write', async () => {
    const client = fakeClient({ migrations: FOUR });
    const message = await expectRefusal(() =>
      Boot.runProductionCurriculumBootstrap({
        argv: CONFIRMED,
        env: GOOD_ENV(APPROVED_URL),
        readMap: () => MAP,
        makeClient: () => client as unknown as PrismaClient,
        log: () => undefined
      })
    );
    assert.match(message, /migrations are not ready/);
    assert.ok(!client.calls.includes('$transaction'));
  });

  // ---------------------------------------------------------------- 9. the legacy baseline
  await check('The legacy baseline holds when nothing changed, and names each field that did', () => {
    const before: Boot.LegacyBaseline = { ...STABLE_BASELINE, users: 5, optionIds: ['a'], optionDigest: 'd1' };
    assert.deepEqual(Boot.baselineChanges(before, { ...before }, 'd1'), []);
    assert.deepEqual(Boot.baselineChanges(before, { ...before, users: 6 }, 'd1'), ['users']);
    assert.deepEqual(Boot.baselineChanges(before, { ...before }, 'd2'), ['pre-existing quiz options']);
  });

  await check('An apply run whose legacy data changes rolls back, because the check is inside the transaction', async () => {
    const drifting: Boot.CurriculumStore = {
      async transaction(work) {
        let reads = 0;
        return work({
          baseline: async () => {
            reads += 1;
            return { ...STABLE_BASELINE, users: reads === 1 ? 5 : 6, optionIds: [], optionDigest: '' };
          },
          optionDigest: async () => '',
          createCourse: async () => 'course',
          createModule: async () => 'module',
          createLesson: async () => 'lesson',
          createQuiz: async () => 'quiz',
          createQuestion: async () => 'question',
          createOptions: async () => undefined
        } as Boot.CurriculumWriter);
      }
    };
    await assert.rejects(() => Boot.applyCurriculum(drifting, PLAN, 'owner-1'), /legacy data changed/);
  });

  // ---------------------------------------------------------------- 10. strict arguments
  await check('An unrecognised argument is refused, so a typo can never fall through to apply', () => {
    assert.throws(() => Boot.modeFromArgv(['--plann']), /unrecognised argument/);
    assert.throws(() => Boot.modeFromArgv(['--confirm-production-seed', '--yes']), /unrecognised argument/);
  });

  await check('Plan and preflight together are refused', () => {
    assert.throws(() => Boot.modeFromArgv(['--plan', '--preflight']), /not both/);
  });

  // ---------------------------------------------------------------- 11. the CLI runs, and exits honestly
  const TSX = path.resolve(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const CLI = path.resolve(BACKEND, 'src', 'tools', 'production-curriculum', 'cli.ts');
  const cliEnv = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('EDP_') || key.startsWith('DATABASE')) delete env[key];
    }
    // A deliberately unusable URL: any run that tried to connect would fail here.
    env.EDP_PRODUCTION_DATABASE_URL = 'postgresql://placeholder@invalid.example.test/none';
    return env;
  };
  const runCli = (args: string[]) =>
    spawnSync(process.execPath, [TSX, CLI, ...args], { cwd: BACKEND, env: cliEnv(), encoding: 'utf8', timeout: 180_000 });

  await check('The CLI in --plan mode prints the plan, exits 0, and opens no connection', () => {
    const result = runCli(['--plan']);
    assert.equal(result.status, 0, `exit ${String(result.status)}: ${result.stderr}`);
    assert.match(result.stdout, /courses to create\s*:\s*12/);
    assert.match(result.stdout, /plan only: no connection was opened/);
    assert.ok(!/REFUSING/.test(result.stdout + result.stderr), 'plan mode refused');
  });

  await check('The CLI in --preflight mode without confirmation exits non-zero and never connects', () => {
    const result = runCli(['--preflight']);
    assert.notEqual(result.status, 0, 'a preflight without confirmation exited as success');
    assert.match(result.stderr, /REFUSING/);
    assert.ok(!/preflight passed/.test(result.stdout), 'preflight reported success');
  });

  await check('The CLI in apply mode without arguments exits non-zero and never connects', () => {
    const result = runCli([]);
    assert.notEqual(result.status, 0, 'an apply without confirmation exited as success');
    assert.match(result.stderr, /REFUSING/);
  });

  await check('The CLI refuses a misspelt flag rather than running in apply mode', () => {
    const result = runCli(['--plann']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unrecognised argument/);
  });

  await check('The library has no entry point of its own, so importing it cannot start a run', () => {
    const library = read(path.join(BACKEND, 'src', 'tools', 'production-curriculum', 'curriculum-bootstrap.ts'));
    assert.ok(!/process\.argv/.test(library), 'the library reads the command line');
    assert.ok(!/pathToFileURL/.test(library), 'the library carries an entry-point guard');
  });

  // ---------------------------------------------------------------- summary
  console.log('\n====================================================');
  console.log('📊 PRODUCTION CURRICULUM BOOTSTRAP RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');
  if (failed > 0) process.exit(1);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
