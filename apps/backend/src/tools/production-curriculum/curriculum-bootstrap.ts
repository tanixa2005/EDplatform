/**
 * Production curriculum bootstrap. Creates the approved Class 6-8 curriculum
 * on the production database, once, and only when a person has said so.
 *
 * This is deliberately separate from the development seeds. Those refuse the
 * production endpoint and must keep doing so. This file is the only path that
 * writes to production, and it is built to refuse by default:
 *
 *   - it runs only with BOTH `--confirm-production-seed` and
 *     EDP_ALLOW_PRODUCTION_SEED=1 (a command that never has both does nothing);
 *   - the connection string comes from EDP_PRODUCTION_DATABASE_URL, set by the
 *     host. The root and backend .env files are never read;
 *   - the target must be the approved production endpoint, named twice (in the
 *     code and in EDP_APPROVED_PRODUCTION_ENDPOINT), and never the development
 *     endpoint;
 *   - all seven expected migrations must be recorded as finished and not rolled
 *     back, and no unknown migration may be recorded;
 *   - the platform owner account must already exist. Nothing creates a user;
 *   - any conflict with existing production curriculum aborts before a write;
 *   - every write is a create, in one transaction. Nothing is updated,
 *     upserted or deleted, and quiz options are never replaced. Existing courses,
 *     users, enrolments, attempts, answers, progress and sessions are not touched;
 *   - a write that does not produce exactly the planned counts rolls back.
 *
 * Modes:
 *   --plan        offline. Prints the intended counts. Opens no connection.
 *   --preflight   reads only. Runs every check above and writes nothing.
 *   (default)     apply. Runs the same checks, then creates the curriculum.
 *
 * Nothing here has been run against production. Running it is a separate,
 * approved operation: see the release notes for the exact command.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  BRIEFS,
  CHAPTER_TOPIC_SLUGS,
  QUESTIONS,
  QUIZ,
  TOPICS,
  buildPlan,
  parseCurriculumMap,
  type PlannedCourse,
  type QuestionSeed,
  type TopicSeed
} from './curriculum-content.js';

// ---------------------------------------------------------------- configuration

export const CONFIRM_FLAG = '--confirm-production-seed';
export const ALLOW_ENV = 'EDP_ALLOW_PRODUCTION_SEED';
export const URL_ENV = 'EDP_PRODUCTION_DATABASE_URL';
export const ENDPOINT_ENV = 'EDP_APPROVED_PRODUCTION_ENDPOINT';

/** The one production endpoint this file may write to. Changing it is a code review. */
export const APPROVED_PRODUCTION_ENDPOINT = 'ep-dark-flower-azql23vb';
/** The development endpoint. Refused even if it were somehow named as approved. */
export const DEVELOPMENT_ENDPOINT = 'ep-young-moon-azdhrnrr';

/** The owner account the curriculum is attached to. Must already exist. */
export const OWNER_EMAIL = 'instructor@edplatform.com';

/** The seven migrations this release expects, in order. */
export const EXPECTED_MIGRATIONS = [
  '20260930083002_init',
  '20260930090245_add_course_system_fields',
  '20260930093019_add_quiz_system',
  '20261006120000_phase1_student_profile_and_tutor_sessions',
  '20261008180000_add_quizquestion_topic',
  '20261009190000_add_tutorsession_chapter',
  '20261010120000_add_lesson_teaching_brief'
] as const;

const CHAPTER_COURSE_SLUG = 'class-6-science';
const CHAPTER_SORT_ORDER = 1;
const HOST_LESSON_SLUG = 'getting-good-at-science';
const SHORT_SUMMARY_SUFFIX = ' — CBSE curriculum (NCERT, NCF-SE 2023)';
const EXPECTED_COURSE_COUNT = 12;
const EXPECTED_TOPIC_COUNT = 4;

/** The curriculum map, relative to this file: src/tools/production-curriculum. */
const MAP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'curriculum-map.md'
);

// ---------------------------------------------------------------- types

export interface PlanCounts {
  courses: number;
  modules: number;
  lessons: number;
  quizzes: number;
  questions: number;
  options: number;
  briefs: number;
}

export interface CurriculumPlan {
  courses: PlannedCourse[];
  lessons: TopicSeed[];
  quiz: typeof QUIZ;
  questions: QuestionSeed[];
  /** Reviewed brief text, keyed by lesson slug. Attached to new lessons only. */
  briefs: Map<string, string>;
  counts: PlanCounts;
}

export interface MigrationRow {
  migration_name: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
}

/**
 * The rows the run must never change. Counted before and after the writes, and
 * the quiz options that existed beforehand are re-hashed to prove none changed.
 */
export interface LegacyBaseline {
  users: number;
  enrollments: number;
  lessonProgress: number;
  quizAttempts: number;
  quizAnswers: number;
  tutorSessions: number;
  tutorMessages: number;
  /** Ids of every option present when the baseline was taken. */
  optionIds: string[];
  /** Digest over those options' id, text and correctness. */
  optionDigest: string;
}

export interface ExistingSnapshot {
  /** The owner account's id, or null when it does not exist. */
  ownerId: string | null;
  /** Planned course slugs already present. Any entry is a conflict. */
  courseSlugs: string[];
  /** `${courseSlug}#${sortOrder}` for modules already present under planned courses. */
  moduleKeys: string[];
  /** Planned topic slugs already present in the chapter. */
  chapterLessonSlugs: string[];
  /** Quizzes already attached to the host lesson. */
  hostQuizCount: number;
}

/** What the runner needs from the database to check, and nothing else. */
export interface ProductionReader {
  migrations(): Promise<MigrationRow[]>;
  snapshot(plan: CurriculumPlan): Promise<ExistingSnapshot>;
  baseline(): Promise<LegacyBaseline>;
}

/**
 * What runs inside the transaction. The writes are creates only: there is no
 * update, upsert or delete on this interface, so none can be reached. The two
 * read methods exist so the transaction can prove legacy data was untouched.
 */
export interface CurriculumWriter {
  baseline(): Promise<LegacyBaseline>;
  optionDigest(optionIds: readonly string[]): Promise<string>;
  createCourse(data: Prisma.CourseUncheckedCreateInput): Promise<string>;
  createModule(data: Prisma.ModuleUncheckedCreateInput): Promise<string>;
  createLesson(data: Prisma.LessonUncheckedCreateInput): Promise<string>;
  createQuiz(data: Prisma.QuizUncheckedCreateInput): Promise<string>;
  createQuestion(data: Prisma.QuizQuestionUncheckedCreateInput): Promise<string>;
  createOptions(questionId: string, options: { text: string; isCorrect: boolean; sortOrder: number }[]): Promise<void>;
}

export interface CurriculumStore {
  transaction<T>(work: (writer: CurriculumWriter) => Promise<T>): Promise<T>;
}

export type BootstrapMode = 'plan' | 'preflight' | 'apply';

// ---------------------------------------------------------------- pure checks

/** The run must be explicitly confirmed on the command line AND in the environment. */
export function assertConfirmed(argv: readonly string[], env: Record<string, string | undefined>): void {
  if (!argv.includes(CONFIRM_FLAG)) {
    throw new Error(`REFUSING: pass ${CONFIRM_FLAG} to confirm this is a production operation`);
  }
  if (env[ALLOW_ENV] !== '1') {
    throw new Error(`REFUSING: set ${ALLOW_ENV}=1 to allow a production seed`);
  }
}

/** The endpoint identifier from a connection string, by string parsing only. */
export function endpointOf(url: string): string | null {
  const host = /@([^/]+)\//.exec(url)?.[1] ?? '';
  if (host === '') return null;
  const endpoint = host.split('.')[0].replace(/-pooler$/, '');
  return endpoint === '' ? null : endpoint;
}

/**
 * The target must be the approved production endpoint, named in both places.
 * Messages never include the URL or the endpoint value.
 */
export function assertApprovedTarget(url: string, env: Record<string, string | undefined>): void {
  const endpoint = endpointOf(url);
  if (endpoint === null) throw new Error(`REFUSING: ${URL_ENV} is not a parseable connection string`);
  if (endpoint === DEVELOPMENT_ENDPOINT) {
    throw new Error('REFUSING: the development endpoint is never a production target');
  }
  if (endpoint !== APPROVED_PRODUCTION_ENDPOINT) {
    throw new Error('REFUSING: the target is not the approved production endpoint');
  }
  if ((env[ENDPOINT_ENV] ?? '').trim() !== APPROVED_PRODUCTION_ENDPOINT) {
    throw new Error(`REFUSING: ${ENDPOINT_ENV} must name the approved production endpoint`);
  }
}

/** The first four migrations: preflight requires them applied before anything else. */
export const EARLY_MIGRATIONS = EXPECTED_MIGRATIONS.slice(0, 4);
/**
 * The three migrations that preflight allows to remain pending. Apply requires
 * all three to be applied first.
 */
export const PENDING_ALLOWED_IN_PREFLIGHT = EXPECTED_MIGRATIONS.slice(4);

export interface MigrationState {
  /** Expected migrations recorded, finished and not rolled back. */
  applied: string[];
  /** Expected migrations not recorded at all. */
  pending: string[];
}

/**
 * Checks the recorded migrations for one mode.
 *
 * Both modes reject: an unknown migration, a migration recorded twice, a
 * migration that has not finished (a failed one), a rolled-back one, and a
 * missing early migration. Apply additionally rejects any pending migration.
 * Preflight accepts exactly the three later migrations as pending, and nothing
 * else.
 */
export function checkMigrationRows(
  rows: readonly MigrationRow[],
  mode: 'preflight' | 'apply'
): MigrationState {
  const problems: string[] = [];
  for (const row of rows) {
    const name = row.migration_name;
    if (!(EXPECTED_MIGRATIONS as readonly string[]).includes(name)) {
      problems.push(`unexpected migration "${name}" is recorded`);
    } else if (row.finished_at === null) {
      problems.push(`migration "${name}" has not finished (it may have failed)`);
    } else if (row.rolled_back_at !== null) {
      problems.push(`migration "${name}" was rolled back`);
    }
  }
  for (const name of EXPECTED_MIGRATIONS) {
    const count = rows.filter((r) => r.migration_name === name).length;
    if (count > 1) problems.push(`migration "${name}" is recorded ${count} times`);
  }

  const applied = EXPECTED_MIGRATIONS.filter((name) =>
    rows.some((r) => r.migration_name === name && r.finished_at !== null && r.rolled_back_at === null)
  );
  const pending = EXPECTED_MIGRATIONS.filter((name) => !rows.some((r) => r.migration_name === name));

  // Apply needs every pending migration. Preflight needs only the early ones,
  // because the three later ones are the release's own pending schema change.
  for (const name of pending) {
    const required = mode === 'apply' || (EARLY_MIGRATIONS as readonly string[]).includes(name);
    if (required) problems.push(`migration "${name}" is not recorded`);
  }

  if (problems.length > 0) {
    throw new Error(`REFUSING: migrations are not ready: ${problems.join('; ')}`);
  }
  return { applied, pending };
}

/** Apply's rule: every expected migration recorded once, finished, and not rolled back. */
export function assertMigrationsApplied(rows: readonly MigrationRow[]): void {
  checkMigrationRows(rows, 'apply');
}

/**
 * Compares the baseline before the writes with the baseline after them, and
 * re-hashes the pre-existing options. Returns the fields that changed; an empty
 * list means legacy data survived the run.
 */
export function baselineChanges(
  before: LegacyBaseline,
  after: LegacyBaseline,
  optionDigestNow: string
): string[] {
  const changed: string[] = [];
  for (const field of [
    'users',
    'enrollments',
    'lessonProgress',
    'quizAttempts',
    'quizAnswers',
    'tutorSessions',
    'tutorMessages'
  ] as const) {
    if (before[field] !== after[field]) changed.push(field);
  }
  if (optionDigestNow !== before.optionDigest) changed.push('pre-existing quiz options');
  return changed;
}

/** Anything that already exists where the curriculum would go is a conflict. */
export function findConflicts(snapshot: ExistingSnapshot): string[] {
  const conflicts: string[] = [];
  if (snapshot.ownerId === null) {
    conflicts.push(`the owner account ${OWNER_EMAIL} does not exist; it is never created here`);
  }
  for (const slug of snapshot.courseSlugs) conflicts.push(`course "${slug}" already exists`);
  for (const key of snapshot.moduleKeys) conflicts.push(`module ${key} already exists`);
  for (const slug of snapshot.chapterLessonSlugs) {
    conflicts.push(`lesson "${slug}" already exists in the chapter`);
  }
  if (snapshot.hostQuizCount > 0) {
    conflicts.push(`the lesson "${HOST_LESSON_SLUG}" already has a quiz`);
  }
  return conflicts;
}

/** The same question rules the development quiz seed enforces. */
function assertQuestionsWellFormed(questions: readonly QuestionSeed[]): void {
  if (questions.length === 0) throw new Error('the quiz has no questions');
  const prompts = new Set<string>();
  for (const q of questions) {
    const label = q.prompt.slice(0, 40);
    if (prompts.has(q.prompt)) throw new Error(`duplicate question prompt: "${label}"`);
    prompts.add(q.prompt);
    if (!(CHAPTER_TOPIC_SLUGS as readonly string[]).includes(q.topicSlug)) {
      throw new Error(`"${label}": topicSlug "${q.topicSlug}" is not a Chapter 1 topic`);
    }
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (correct === 0) throw new Error(`"${label}": no correct option`);
    if (q.type === 'SINGLE_CHOICE' && correct !== 1) {
      throw new Error(`"${label}": SINGLE_CHOICE needs exactly 1 correct option`);
    }
    if (q.type === 'MULTIPLE_CHOICE' && correct < 2) {
      throw new Error(`"${label}": MULTIPLE_CHOICE needs 2 or more correct options`);
    }
    if (q.type === 'TRUE_FALSE' && (q.options.length !== 2 || correct !== 1)) {
      throw new Error(`"${label}": TRUE_FALSE needs exactly 2 options and 1 correct`);
    }
  }
}

/**
 * Builds the whole plan from the curriculum map and the reviewed content. Pure:
 * no connection, no file writes. Throws if anything is not what was approved.
 */
export function planCurriculum(markdown: string): CurriculumPlan {
  const courses = buildPlan(parseCurriculumMap(markdown));
  if (courses.length !== EXPECTED_COURSE_COUNT) {
    throw new Error(`expected ${EXPECTED_COURSE_COUNT} curriculum courses, the map yields ${courses.length}`);
  }

  const chapterCourse = courses.find((c) => c.slug === CHAPTER_COURSE_SLUG);
  const chapter = chapterCourse?.modules.find((m) => m.sortOrder === CHAPTER_SORT_ORDER);
  if (!chapter) throw new Error(`the map has no Chapter ${CHAPTER_SORT_ORDER} for ${CHAPTER_COURSE_SLUG}`);

  if (TOPICS.length !== EXPECTED_TOPIC_COUNT) {
    throw new Error(`expected ${EXPECTED_TOPIC_COUNT} Chapter 1 topics, found ${TOPICS.length}`);
  }
  const topicSlugs = TOPICS.map((t) => t.slug);
  for (const slug of CHAPTER_TOPIC_SLUGS) {
    if (!topicSlugs.includes(slug)) throw new Error(`the topic "${slug}" is missing from the reviewed content`);
  }
  if (!topicSlugs.includes(HOST_LESSON_SLUG)) {
    throw new Error(`the quiz host lesson "${HOST_LESSON_SLUG}" is not one of the topics`);
  }

  assertQuestionsWellFormed(QUESTIONS);

  const briefs = new Map<string, string>();
  for (const entry of BRIEFS) {
    if (!topicSlugs.includes(entry.slug)) {
      throw new Error(`a teaching brief names "${entry.slug}", which is not a Chapter 1 topic`);
    }
    briefs.set(entry.slug, entry.brief);
  }

  const modules = courses.reduce((n, c) => n + c.modules.length, 0);
  const options = QUESTIONS.reduce((n, q) => n + q.options.length, 0);
  return {
    courses,
    lessons: TOPICS,
    quiz: QUIZ,
    questions: QUESTIONS,
    briefs,
    counts: {
      courses: courses.length,
      modules,
      lessons: TOPICS.length,
      quizzes: 1,
      questions: QUESTIONS.length,
      options,
      briefs: briefs.size
    }
  };
}

/** The plan as printed lines. No connection string, no secret, only counts and names. */
export function formatPlanSummary(plan: CurriculumPlan): string[] {
  const c = plan.counts;
  return [
    `  courses to create   : ${c.courses}`,
    `  modules to create   : ${c.modules}`,
    `  lessons to create   : ${c.lessons} (Class 6 Science, Chapter ${CHAPTER_SORT_ORDER})`,
    `  quizzes to create   : ${c.quizzes} (on "${HOST_LESSON_SLUG}")`,
    `  questions to create : ${c.questions}`,
    `  options to create   : ${c.options}`,
    `  briefs to attach    : ${c.briefs} (to new lessons only)`,
    `  existing rows       : none are updated, replaced or deleted`
  ];
}

// ---------------------------------------------------------------- apply

/**
 * Creates the plan through the store, in one transaction. Only create
 * operations are called. Returns the counts actually created, which the caller
 * compares with the plan; a mismatch throws and rolls the transaction back.
 */
export async function applyCurriculum(
  store: CurriculumStore,
  plan: CurriculumPlan,
  ownerId: string
): Promise<PlanCounts> {
  return store.transaction(async (w) => {
    const before = await w.baseline();

    const counts: PlanCounts = {
      courses: 0,
      modules: 0,
      lessons: 0,
      quizzes: 0,
      questions: 0,
      options: 0,
      briefs: 0
    };

    let chapterModuleId: string | null = null;
    for (const course of plan.courses) {
      const courseId = await w.createCourse({
        title: course.title,
        slug: course.slug,
        description: course.description,
        shortSummary: `${course.title}${SHORT_SUMMARY_SUFFIX}`,
        instructorId: ownerId,
        isPublished: true,
        status: 'PUBLISHED',
        price: 0
      });
      counts.courses += 1;

      for (const mod of course.modules) {
        const moduleId = await w.createModule({
          courseId,
          title: mod.title,
          description: mod.description,
          sortOrder: mod.sortOrder
        });
        counts.modules += 1;
        if (course.slug === CHAPTER_COURSE_SLUG && mod.sortOrder === CHAPTER_SORT_ORDER) {
          chapterModuleId = moduleId;
        }
      }
    }
    if (chapterModuleId === null) throw new Error('the chapter module was not created');

    const topicIds = new Map<string, string>();
    for (const [index, topic] of plan.lessons.entries()) {
      const brief = plan.briefs.get(topic.slug) ?? null;
      const lessonId = await w.createLesson({
        moduleId: chapterModuleId,
        slug: topic.slug,
        title: topic.title,
        description: topic.objective,
        type: 'TEXT',
        content: topic.content,
        sortOrder: index + 1,
        isFreePreview: true,
        isPublished: true,
        teachingBrief: brief
      });
      topicIds.set(topic.slug, lessonId);
      counts.lessons += 1;
      if (brief !== null) counts.briefs += 1;
    }

    const hostId = topicIds.get(HOST_LESSON_SLUG);
    if (!hostId) throw new Error(`the quiz host lesson "${HOST_LESSON_SLUG}" was not created`);
    const quizId = await w.createQuiz({
      title: plan.quiz.title,
      description: plan.quiz.description,
      passingScore: plan.quiz.passingScore,
      timeLimitSeconds: plan.quiz.timeLimitSeconds,
      isPublished: true,
      lessonId: hostId
    });
    counts.quizzes += 1;

    for (const [index, q] of plan.questions.entries()) {
      const topicId = topicIds.get(q.topicSlug);
      if (!topicId) throw new Error(`no lesson was created for topic "${q.topicSlug}"`);
      const questionId = await w.createQuestion({
        quizId,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        explanation: q.explanation,
        sortOrder: index + 1,
        lessonId: topicId
      });
      counts.questions += 1;
      await w.createOptions(
        questionId,
        q.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, sortOrder: i + 1 }))
      );
      counts.options += q.options.length;
    }

    const after = await w.baseline();
    const digestNow = await w.optionDigest(before.optionIds);
    const changed = baselineChanges(before, after, digestNow);
    if (changed.length > 0) {
      // Thrown inside the transaction, so the curriculum rolls back with it.
      throw new Error(`legacy data changed during the run (${changed.join(', ')}); the transaction was rolled back`);
    }
    return counts;
  });
}

// ---------------------------------------------------------------- database adapters

/** Counts and digests the legacy tables. Read-only. */
export async function readBaseline(client: Prisma.TransactionClient): Promise<LegacyBaseline> {
  const [users, enrollments, lessonProgress, quizAttempts, quizAnswers, tutorSessions, tutorMessages, options] =
    await Promise.all([
      client.user.count(),
      client.enrollment.count(),
      client.lessonProgress.count(),
      client.quizAttempt.count(),
      client.quizAnswer.count(),
      client.tutorSession.count(),
      client.tutorMessage.count(),
      client.quizOption.findMany({ select: { id: true } })
    ]);
  const optionIds = options.map((o) => o.id);
  return {
    users,
    enrollments,
    lessonProgress,
    quizAttempts,
    quizAnswers,
    tutorSessions,
    tutorMessages,
    optionIds,
    optionDigest: await digestOptions(client, optionIds)
  };
}

/** A digest over the given options' id, text and correctness. Read-only. */
export async function digestOptions(client: Prisma.TransactionClient, optionIds: readonly string[]): Promise<string> {
  if (optionIds.length === 0) return '';
  const rows = await client.$queryRaw<{ digest: string | null }[]>`
    SELECT md5(string_agg("id" || '|' || "text" || '|' || "isCorrect"::text, ',' ORDER BY "id")) AS digest
    FROM "QuizOption" WHERE "id" = ANY(${[...optionIds]}::text[])`;
  return rows[0]?.digest ?? '';
}

/** Read-only checks against the database. Used by preflight and apply. */
export function prismaReader(prisma: PrismaClient): ProductionReader {
  return {
    async migrations() {
      return prisma.$queryRaw<MigrationRow[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    },
    async baseline() {
      return readBaseline(prisma);
    },
    async snapshot(plan) {
      const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
      const plannedSlugs = plan.courses.map((c) => c.slug);
      const courseSlugs = (
        await prisma.course.findMany({ where: { slug: { in: plannedSlugs } }, select: { slug: true } })
      ).map((c) => c.slug);
      const moduleRows = await prisma.module.findMany({
        where: { course: { slug: { in: plannedSlugs } } },
        select: { sortOrder: true, course: { select: { slug: true } } }
      });
      const moduleKeys = moduleRows.map((m) => `${m.course.slug}#${m.sortOrder}`);

      const chapter = await prisma.module.findFirst({
        where: { sortOrder: CHAPTER_SORT_ORDER, course: { slug: CHAPTER_COURSE_SLUG } },
        select: { id: true }
      });
      let chapterLessonSlugs: string[] = [];
      let hostQuizCount = 0;
      if (chapter) {
        chapterLessonSlugs = (
          await prisma.lesson.findMany({
            where: { moduleId: chapter.id, slug: { in: [...CHAPTER_TOPIC_SLUGS] } },
            select: { slug: true }
          })
        ).map((l) => l.slug);
        hostQuizCount = await prisma.quiz.count({
          where: { lesson: { is: { moduleId: chapter.id, slug: HOST_LESSON_SLUG } } }
        });
      }
      return {
        ownerId: owner?.id ?? null,
        courseSlugs,
        moduleKeys,
        chapterLessonSlugs,
        hostQuizCount
      };
    }
  };
}

/** The create-only store. Each method is one create; nothing else is reachable. */
export function prismaStore(prisma: PrismaClient): CurriculumStore {
  return {
    transaction: (work) =>
      prisma.$transaction(
        async (tx) =>
          work({
            baseline: () => readBaseline(tx),
            optionDigest: (ids) => digestOptions(tx, ids),
            createCourse: async (data) =>
              (await tx.course.create({ data, select: { id: true } })).id,
            createModule: async (data) =>
              (await tx.module.create({ data, select: { id: true } })).id,
            createLesson: async (data) =>
              (await tx.lesson.create({ data, select: { id: true } })).id,
            createQuiz: async (data) => (await tx.quiz.create({ data, select: { id: true } })).id,
            createQuestion: async (data) =>
              (await tx.quizQuestion.create({ data, select: { id: true } })).id,
            createOptions: async (questionId, options) => {
              await tx.quizOption.createMany({
                data: options.map((o) => ({ ...o, questionId }))
              });
            }
          }),
        { timeout: 120_000, maxWait: 10_000 }
      )
  };
}

// ---------------------------------------------------------------- orchestration

export interface BootstrapDeps {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  /** Reads the curriculum map. Replaceable so tests need no file. */
  readMap?: () => string;
  /** Builds the database client for an approved URL. Never called before every offline check passes. */
  makeClient?: (url: string) => PrismaClient;
  log?: (line: string) => void;
}

const KNOWN_ARGUMENTS = ['--plan', '--preflight', CONFIRM_FLAG] as const;

/**
 * Reads the mode. An unrecognised argument is refused rather than ignored, so a
 * misspelt flag can never fall through to apply, and `--plan` plus
 * `--preflight` together is refused too.
 */
export function modeFromArgv(argv: readonly string[]): BootstrapMode {
  const unknown = argv.filter((arg) => !(KNOWN_ARGUMENTS as readonly string[]).includes(arg));
  if (unknown.length > 0) {
    throw new Error(`REFUSING: unrecognised argument(s); allowed: ${KNOWN_ARGUMENTS.join(', ')}`);
  }
  const plan = argv.includes('--plan');
  const preflight = argv.includes('--preflight');
  if (plan && preflight) throw new Error('REFUSING: choose one of --plan or --preflight, not both');
  if (plan) return 'plan';
  if (preflight) return 'preflight';
  return 'apply';
}

/**
 * Runs one mode. Returns the counts it planned (plan and preflight) or created
 * (apply). Throws on any refusal, and nothing is written unless every check
 * has passed.
 */
export async function runProductionCurriculumBootstrap(deps: BootstrapDeps): Promise<PlanCounts> {
  const log = deps.log ?? (() => undefined);
  const mode = modeFromArgv(deps.argv);
  const readMap = deps.readMap ?? (() => readFileSync(MAP_PATH, 'utf8'));

  const plan = planCurriculum(readMap());
  log('Production curriculum bootstrap');
  log(`  mode                : ${mode}`);
  for (const line of formatPlanSummary(plan)) log(line);

  if (mode === 'plan') {
    log('  plan only: no connection was opened and nothing was written.');
    return plan.counts;
  }

  assertConfirmed(deps.argv, deps.env);
  const url = deps.env[URL_ENV];
  if (!url || url.trim() === '') {
    throw new Error(`REFUSING: ${URL_ENV} must be provided by the host; it is never read from .env`);
  }
  assertApprovedTarget(url.trim(), deps.env);

  if (!deps.makeClient) throw new Error('no database client factory was provided');
  const prisma = deps.makeClient(url.trim());
  try {
    const reader = prismaReader(prisma);

    const migrations = checkMigrationRows(await reader.migrations(), mode === 'apply' ? 'apply' : 'preflight');
    log(`  migrations applied  : ${migrations.applied.length} of ${EXPECTED_MIGRATIONS.length} (finished, none rolled back)`);
    if (migrations.pending.length > 0) {
      log(`  migrations pending  : ${migrations.pending.join(', ')}`);
    }

    const snapshot = await reader.snapshot(plan);
    const conflicts = findConflicts(snapshot);
    if (conflicts.length > 0) {
      throw new Error(`REFUSING: existing production data conflicts with the plan: ${conflicts.join('; ')}`);
    }
    log('  conflicts           : none');
    log('  owner account       : present (not created or changed)');

    const baseline = await reader.baseline();
    log(
      `  legacy baseline     : users ${baseline.users}, enrollments ${baseline.enrollments}, ` +
        `lesson progress ${baseline.lessonProgress}, quiz attempts ${baseline.quizAttempts}, ` +
        `quiz answers ${baseline.quizAnswers}, tutor sessions ${baseline.tutorSessions}, ` +
        `tutor messages ${baseline.tutorMessages}, quiz options ${baseline.optionIds.length} ` +
        `(digest ${baseline.optionDigest.slice(0, 12) || 'none'})`
    );

    if (mode === 'preflight') {
      log('  deferred until after the pending migrations (not checkable before them):');
      log('    - QuizQuestion.lessonId on legacy questions (20261008180000_add_quizquestion_topic)');
      log('    - TutorSession.moduleId on existing sessions (20261009190000_add_tutorsession_chapter)');
      log('    - Lesson.teachingBrief on existing lessons (20261010120000_add_lesson_teaching_brief)');
      log('    - the topic and brief links on the new questions and lessons, verified after apply');
      log('  preflight passed. Nothing was written.');
      return plan.counts;
    }

    const created = await applyCurriculum(prismaStore(prisma), plan, snapshot.ownerId as string);
    const mismatch = (Object.keys(plan.counts) as (keyof PlanCounts)[]).filter(
      (key) => created[key] !== plan.counts[key]
    );
    if (mismatch.length > 0) {
      throw new Error(`created counts differ from the plan for ${mismatch.join(', ')}; the transaction was rolled back`);
    }
    log('  created             : ' + JSON.stringify(created));
    return created;
  } finally {
    await prisma.$disconnect();
  }
}

// This file has no entry point. Running the CLI is cli.ts's job, so importing
// this module from a test can never start a run.
