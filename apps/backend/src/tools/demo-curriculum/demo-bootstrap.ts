import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  applyCurriculum,
  checkMigrationRows,
  digestOptions,
  formatPlanSummary,
  planCurriculum,
  readBaseline,
  type CurriculumPlan,
  type CurriculumStore,
  type CurriculumWriter,
  type MigrationRow,
  type PlanCounts
} from '../production-curriculum/curriculum-bootstrap.js';
import { assertDemoTarget, DEMO_URL_ENV, DemoRefusal } from './demo-guard.js';

/**
 * Creates the approved Class 6-8 curriculum in a new, empty demo database.
 *
 * Sources are committed repo files only. Nothing is read from any existing
 * database, so no accounts, credentials, Clerk IDs, messages, enrolments,
 * progress, attempts or answers can be imported.
 *
 * Writes are create-only and happen in one transaction. A conflict, a non-empty
 * target, an incomplete migration history, or a count mismatch stops the run
 * before any write, or rolls it back.
 *
 * Modes: --plan (offline, no connection), --preflight (reads only), and the
 * default apply, which also needs --confirm-demo-seed and EDP_ALLOW_DEMO_SEED=1.
 */

/**
 * The synthetic course owner. It cannot sign in: no password, no Clerk ID, and
 * inactive, which every login path refuses. The role is INSTRUCTOR, never ADMIN.
 * Inactive owners still display on the public catalog, because the catalog
 * filters only on course publication. See course.service.ts.
 */
export const DEMO_OWNER = {
  email: 'demo-owner@edplatform-demo.invalid',
  firstName: 'EDplatform',
  lastName: 'Demo Owner',
  role: 'INSTRUCTOR' as const,
  isActive: false,
  passwordHash: null,
  clerkUserId: null
};

/** Every table that must hold no rows before a demo write. */
export const MUST_BE_EMPTY_TABLES = [
  'User',
  'Category',
  'Course',
  'Module',
  'Lesson',
  'Quiz',
  'QuizQuestion',
  'QuizOption',
  'Enrollment',
  'LessonProgress',
  'QuizAttempt',
  'QuizAnswer',
  'TutorSession',
  'TutorMessage',
  'StudentProfile',
  'StudentSubject',
  'Certificate',
  'Report',
  'Resource'
] as const;

export type DemoMode = 'plan' | 'preflight' | 'apply';

const KNOWN_ARGUMENTS = ['--plan', '--preflight', '--confirm-demo-seed'] as const;

/** Strict like the production runner: an unknown argument is refused, never ignored. */
export function demoModeFromArgv(argv: readonly string[]): DemoMode {
  const unknown = argv.filter((arg) => !(KNOWN_ARGUMENTS as readonly string[]).includes(arg));
  if (unknown.length > 0) {
    throw new DemoRefusal(`refusing: unrecognised argument(s); allowed: ${KNOWN_ARGUMENTS.join(', ')}`);
  }
  const plan = argv.includes('--plan');
  const preflight = argv.includes('--preflight');
  if (plan && preflight) throw new DemoRefusal('refusing: choose one of --plan or --preflight, not both');
  if (plan) return 'plan';
  if (preflight) return 'preflight';
  return 'apply';
}

/** The read-only checks a demo target needs. Injected so tests use no database. */
export interface DemoReader {
  migrations(): Promise<MigrationRow[]>;
  /** Row counts for every table in MUST_BE_EMPTY_TABLES, keyed by table name. */
  counts(): Promise<Record<string, number>>;
}

export function demoReader(prisma: PrismaClient): DemoReader {
  return {
    migrations: () =>
      prisma.$queryRaw<MigrationRow[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`,
    async counts() {
      const [User, Category, Course, Module, Lesson, Quiz, QuizQuestion, QuizOption, Enrollment, LessonProgress, QuizAttempt, QuizAnswer, TutorSession, TutorMessage, StudentProfile, StudentSubject, Certificate, Report, Resource] =
        await Promise.all([
          prisma.user.count(),
          prisma.category.count(),
          prisma.course.count(),
          prisma.module.count(),
          prisma.lesson.count(),
          prisma.quiz.count(),
          prisma.quizQuestion.count(),
          prisma.quizOption.count(),
          prisma.enrollment.count(),
          prisma.lessonProgress.count(),
          prisma.quizAttempt.count(),
          prisma.quizAnswer.count(),
          prisma.tutorSession.count(),
          prisma.tutorMessage.count(),
          prisma.studentProfile.count(),
          prisma.studentSubject.count(),
          prisma.certificate.count(),
          prisma.report.count(),
          prisma.resource.count()
        ]);
      return {
        User, Category, Course, Module, Lesson, Quiz, QuizQuestion, QuizOption, Enrollment,
        LessonProgress, QuizAttempt, QuizAnswer, TutorSession, TutorMessage, StudentProfile,
        StudentSubject, Certificate, Report, Resource
      };
    }
  };
}

/**
 * A store whose writes run inside a transaction the caller already opened, so
 * the owner and the curriculum commit or roll back together.
 */
export function demoStoreFromTx(tx: Prisma.TransactionClient): CurriculumStore {
  const writer: CurriculumWriter = {
    baseline: () => readBaseline(tx),
    optionDigest: (ids) => digestOptions(tx, ids),
    createCourse: async (data) => (await tx.course.create({ data, select: { id: true } })).id,
    createModule: async (data) => (await tx.module.create({ data, select: { id: true } })).id,
    createLesson: async (data) => (await tx.lesson.create({ data, select: { id: true } })).id,
    createQuiz: async (data) => (await tx.quiz.create({ data, select: { id: true } })).id,
    createQuestion: async (data) => (await tx.quizQuestion.create({ data, select: { id: true } })).id,
    createOptions: async (questionId, options) => {
      await tx.quizOption.createMany({ data: options.map((o) => ({ ...o, questionId })) });
    }
  };
  return { transaction: async (work) => work(writer) };
}

const MAP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', '..', 'docs', 'curriculum-map.md'
);

export interface DemoDeps {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  readMap?: () => string;
  makeClient?: (url: string) => PrismaClient;
  log?: (line: string) => void;
}

/**
 * Runs one mode. Throws DemoRefusal on any refusal, and nothing is written
 * unless every check has passed. Returns the planned counts (plan and preflight)
 * or the created counts (apply).
 */
export async function runDemoBootstrap(deps: DemoDeps): Promise<PlanCounts> {
  const log = deps.log ?? (() => undefined);
  const mode = demoModeFromArgv(deps.argv);
  const readMap = deps.readMap ?? (() => readFileSync(MAP_PATH, 'utf8'));

  const plan: CurriculumPlan = planCurriculum(readMap());
  log('Demo curriculum bootstrap');
  log(`  mode                : ${mode}`);
  for (const line of formatPlanSummary(plan)) log(line);
  log(`  synthetic owner     : ${DEMO_OWNER.email} (no login, inactive)`);

  if (mode === 'plan') {
    log('  plan only: no connection was opened and nothing was written.');
    return plan.counts;
  }

  // Every target check runs before a client is built.
  assertDemoTarget(deps.argv, deps.env);
  const url = (deps.env[DEMO_URL_ENV] ?? '').trim();
  if (!deps.makeClient) throw new DemoRefusal('refusing: no database client factory was provided');

  const prisma = deps.makeClient(url);
  try {
    const reader = demoReader(prisma);

    // All seven migrations must be finished before any seed. Apply and preflight both need them.
    checkMigrationRows(await reader.migrations(), 'apply');
    log('  migrations          : all seven finished, none rolled back');

    const counts = await reader.counts();
    const nonEmpty = MUST_BE_EMPTY_TABLES.filter((table) => counts[table] > 0).map((table) => `${table} ${counts[table]}`);
    if (nonEmpty.length > 0) {
      throw new DemoRefusal(`refusing: the target database is not empty (${nonEmpty.join(', ')})`);
    }
    log('  target database     : empty');

    if (mode === 'preflight') {
      log('  preflight passed. Nothing was written.');
      return plan.counts;
    }

    const created = await prisma.$transaction(
      async (tx) => {
        // Re-checked inside the transaction, so a concurrent write cannot slip in.
        if ((await tx.user.count()) > 0) {
          throw new DemoRefusal('refusing: the target database became non-empty; rolled back');
        }
        const owner = await tx.user.create({ data: DEMO_OWNER, select: { id: true } });
        const result = await applyCurriculum(demoStoreFromTx(tx), plan, owner.id);
        const mismatch = (Object.keys(plan.counts) as (keyof PlanCounts)[]).filter(
          (key) => result[key] !== plan.counts[key]
        );
        if (mismatch.length > 0) {
          throw new DemoRefusal(`created counts differ from the plan for ${mismatch.join(', ')}; rolled back`);
        }
        return result;
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
    log('  created             : ' + JSON.stringify(created));
    return created;
  } finally {
    await prisma.$disconnect();
  }
}
