/**
 * C7: one quiz for the existing Class 6 Science Chapter 1 slice.
 *
 * PLACEMENT. Quiz can hang off either a Module or a Lesson. It is attached to
 * the LAST topic of Chapter 1 because Quiz.lessonId is the only relation a
 * student can actually reach: GET /lessons/:lessonId/quiz is the sole student
 * fetch path, and the whole existing quiz UI is lesson-scoped. A module-level
 * quiz would need a new endpoint, a new route and a new page, which is exactly
 * the "invent a new relationship" that C7 rules out. End of the chapter is also
 * where an end-of-chapter check belongs.
 *
 * TOPICS (C13.2). Hosting is not aboutness. The quiz hangs off topic 4, but it
 * assesses all four topics, and until C13.2 that meant every mistake sent the
 * student back to topic 4 whatever they had missed. Each question now also
 * carries topicSlug, written to QuizQuestion.lessonId, so the mistake handoff,
 * the "worth re-reading" line and the in-quiz hint can name the topic the
 * question is actually about. Quiz.lessonId is unchanged and remains the
 * routing and authorisation anchor.
 *
 * CONTENT ORIGIN: all five questions are written for ED. No NCERT question
 * wording is reproduced. Scope is Chapter 1 only - what science is, observing
 * and questioning, forming a guess, what makes a test a test, and reading the
 * result - and the scenarios reuse the ones ED's own lessons taught with
 * (charger, milk, fan), not the textbook's.
 *
 * Only question types the schema already has are used: SINGLE_CHOICE,
 * MULTIPLE_CHOICE, TRUE_FALSE. No new type, no new model.
 *
 * Safety: endpoint asserted in-process, idempotent, never deletes an attempt.
 *
 * Usage:
 *   EDP_SEED_DRY_RUN=1 npm run db:seed:quiz   inspect, write nothing
 *   npm run db:seed:quiz                      apply
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, '..', '..', '..');
const MAP_PATH = path.join(REPO_ROOT, 'docs', 'curriculum-map.md');

const PRODUCTION_ENDPOINT = 'ep-dark-flower-azql23vb';
const EXPECTED_ENDPOINT = 'ep-young-moon-azdhrnrr';

const COURSE_SLUG = 'class-6-science';
const CHAPTER_SORT_ORDER = 1;
/** The quiz hangs off the chapter's final topic. */
const HOST_LESSON_SLUG = 'getting-good-at-science';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.EDP_SEED_DRY_RUN === '1';

const QUIZ = {
  title: 'Quick check: The Wonderful World of Science',
  description:
    'Five questions on what science is and how scientists work things out. Nothing here needs memorising.',
  passingScore: 60,
  // Deliberately no time limit. A countdown on a Class 6 reading check adds
  // anxiety and measures nothing useful.
  timeLimitSeconds: null as number | null
};

interface OptionSeed {
  text: string;
  isCorrect: boolean;
}

/**
 * The four Chapter 1 topic slugs, in teaching order.
 *
 * Mirrors seed-curriculum-lessons.ts. Listed here so a typo in a question's
 * topicSlug fails before any connection is opened rather than silently
 * leaving that question unmapped.
 */
const CHAPTER_TOPIC_SLUGS = [
  'what-science-really-is',
  'how-scientists-work-things-out',
  'you-already-think-like-a-scientist',
  'getting-good-at-science'
] as const;

type TopicSlug = (typeof CHAPTER_TOPIC_SLUGS)[number];

interface QuestionSeed {
  /** Stable key for idempotent reruns. Questions have no natural unique column,
   *  so reruns match on prompt text, which is why these must not be edited
   *  casually - changing a prompt creates a new question rather than updating. */
  prompt: string;
  /**
   * C13.2: the topic this question actually assesses (QuizQuestion.lessonId).
   *
   * Distinct from HOST_LESSON_SLUG, which is where the quiz hangs
   * (Quiz.lessonId) and how a student reaches it. This quiz is a chapter
   * quick check, so its questions come from several topics; without this,
   * every mistake pointed the student at the host topic.
   *
   * Must name a topic in THIS chapter. The server independently refuses any
   * value outside the quiz's own module, so a wrong slug here degrades to the
   * old behaviour rather than sending a child to another chapter.
   */
  topicSlug: TopicSlug;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  points: number;
  explanation: string;
  options: OptionSeed[];
}

const QUESTIONS: QuestionSeed[] = [
  {
    prompt: 'Which of these is the closest to what science actually is?',
    // Restates topic 1's closing line: science is a way of asking and
    // answering questions, and the answers are allowed to improve. Both
    // wrong options are drawn from topic 1's own framing - "not a pile of
    // facts to memorise", "not just in a lab".
    topicSlug: 'what-science-really-is',
    type: 'SINGLE_CHOICE',
    points: 1,
    explanation:
      'Science is a way of asking and answering questions about the world. Facts are what comes out of it, not what it is - and the answers are allowed to improve when somebody finds out more.',
    options: [
      { text: 'A way of asking questions about the world and working out the answers', isCorrect: true },
      { text: 'A fixed set of facts that have to be memorised correctly', isCorrect: false },
      { text: 'Work that can only be done inside a laboratory', isCorrect: false },
      { text: 'A list of rules that never change once they are written down', isCorrect: false }
    ]
  },
  {
    prompt:
      'You write down that a leaf is green. Your friend writes down that the leaf is green on top and paler underneath. What has your friend done that you have not?',
    // Topic 4 teaches this exact example: "Observing is noticing detail:
    // not just 'the leaf is green', but greener on top than underneath."
    // It appears nowhere else in the chapter.
    topicSlug: 'getting-good-at-science',
    type: 'SINGLE_CHOICE',
    points: 1,
    explanation:
      'They observed instead of just looking. Detail is where questions come from - "why is it paler underneath?" is something you can investigate, and "it is green" is not.',
    options: [
      { text: 'Observed the detail, which gives them something to ask about', isCorrect: true },
      { text: 'Used a scientific instrument', isCorrect: false },
      { text: 'Written a longer answer, which is always better', isCorrect: false },
      { text: 'Already worked out the explanation', isCorrect: false }
    ]
  },
  {
    prompt:
      'The milk boiled over. You ask yourself why it happened. According to the sequence scientists follow, what comes next?',
    // The milk scenario is borrowed from topic 3, but what is assessed is
    // the observe/ask/guess/test/check sequence and the Guess step, which
    // only topic 2 teaches.
    topicSlug: 'how-scientists-work-things-out',
    type: 'SINGLE_CHOICE',
    points: 1,
    explanation:
      'Observe, ask, guess, test, check. Once you have a clear question, the next move is to suggest a possible answer - something like "maybe the flame was too high" - so that you have something you can go and test.',
    options: [
      { text: 'Suggest a possible explanation you could test', isCorrect: true },
      { text: 'Look up the answer and stop there', isCorrect: false },
      { text: 'Decide the question cannot be answered', isCorrect: false },
      { text: 'Change several things at once and see what happens', isCorrect: false }
    ]
  },
  {
    prompt:
      'Your phone is plugged in but not charging, and you think the socket might be dead. Which of these make your next move a real test? Select all that apply.',
    // Topic 2's own worked example, and its stated key idea: a guess only
    // counts as tested if the test could have proved you wrong. The second
    // correct option (change one thing at a time) is topic 3's, so this
    // question genuinely spans two topics; topic 2 owns the scenario and
    // the headline idea, so it is the primary topic.
    topicSlug: 'how-scientists-work-things-out',
    type: 'MULTIPLE_CHOICE',
    points: 1,
    explanation:
      'A test has to be able to go either way - plugging a lamp into that socket could show the socket is fine, which would mean your guess was wrong. And you change one thing at a time, or you will not know which change mattered. Being certain in advance, or swapping the cable and the socket together, both break it.',
    options: [
      { text: 'The result could show that your guess was wrong', isCorrect: true },
      { text: 'You change only one thing, so you know what caused the result', isCorrect: true },
      { text: 'You are already sure what the result will be before you start', isCorrect: false },
      { text: 'You swap the cable and the socket at the same time to save time', isCorrect: false }
    ]
  },
  {
    prompt:
      'True or false: if you test your guess and it turns out to be wrong, the test was a waste of time.',
    // Topic 2 states it directly: "Being wrong is not a dead end. You've
    // just ruled something out, which is real progress." The explanation
    // cites topic 3's ceiling fan as illustration only.
    topicSlug: 'how-scientists-work-things-out',
    type: 'TRUE_FALSE',
    points: 1,
    explanation:
      'False. Ruling something out is real progress - you now know one less place to look. The ceiling fan that is slow on every setting tells you something, even though it was not what you expected.',
    options: [
      { text: 'False', isCorrect: true },
      { text: 'True', isCorrect: false }
    ]
  }
];

// ---------------------------------------------------------------- helpers

function resolveDatabaseUrl(): string {
  const fromProcess = process.env.DATABASE_URL;
  if (fromProcess && fromProcess.trim() !== '') return fromProcess.trim();
  const parsed = dotenv.parse(readFileSync(path.join(scriptDir, '..', '.env'), 'utf8'));
  const url = parsed.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL could not be resolved');
  return url.trim();
}

function assertApprovedTarget(url: string): string {
  const host = (url.match(/@([^/]+)\//) ?? [])[1] ?? '';
  const endpoint = host.split('.')[0].replace(/-pooler$/, '');
  if (host.includes(PRODUCTION_ENDPOINT)) {
    throw new Error(`REFUSING: target is the production endpoint (${host})`);
  }
  if (endpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`REFUSING: unexpected endpoint "${endpoint}", expected "${EXPECTED_ENDPOINT}"`);
  }
  return endpoint;
}

/** Reads the official Class 6 Science Chapter 1 title out of the curriculum map. */
function officialChapterTitleFromMap(): string {
  const lines = readFileSync(MAP_PATH, 'utf8').split('\n');
  let inClass6 = false;
  let inScience = false;

  for (const line of lines) {
    if (/^## Class 6\s*$/.test(line)) inClass6 = true;
    else if (/^## Class [78]\s*$/.test(line)) inClass6 = false;

    if (inClass6 && /^### /.test(line)) inScience = /^### Science\s*$/.test(line);

    if (inClass6 && inScience) {
      const row = /^\|\s*1\s*\|\s*([^|]+?)\s*\|/.exec(line);
      if (row) return row[1].trim();
    }
  }
  throw new Error('Could not read Class 6 Science Chapter 1 title from docs/curriculum-map.md');
}

function assertSeedIsSane(): void {
  if (QUESTIONS.length === 0) throw new Error('no questions defined');

  for (const q of QUESTIONS) {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (correct === 0) throw new Error(`"${q.prompt.slice(0, 40)}": no correct option`);

    // The grader requires exactly one correct option for these two types, and
    // silently marks every answer wrong otherwise.
    if ((q.type === 'SINGLE_CHOICE' || q.type === 'TRUE_FALSE') && correct !== 1) {
      throw new Error(`"${q.prompt.slice(0, 40)}": ${q.type} needs exactly 1 correct option`);
    }
    if (q.type === 'MULTIPLE_CHOICE' && correct < 2) {
      throw new Error(`"${q.prompt.slice(0, 40)}": MULTIPLE_CHOICE needs 2 or more correct options`);
    }
    if (q.type === 'TRUE_FALSE' && q.options.length !== 2) {
      throw new Error(`"${q.prompt.slice(0, 40)}": TRUE_FALSE needs exactly 2 options`);
    }
  }

  const prompts = new Set(QUESTIONS.map((q) => q.prompt));
  if (prompts.size !== QUESTIONS.length) {
    throw new Error('duplicate prompts - reruns match on prompt, so they must be unique');
  }

  // Every question must name a topic, and it must be one of this chapter's.
  // Checked before any connection is opened.
  for (const q of QUESTIONS) {
    if (!CHAPTER_TOPIC_SLUGS.includes(q.topicSlug)) {
      throw new Error(`"${q.prompt.slice(0, 40)}": topicSlug "${q.topicSlug}" is not a Chapter 1 topic`);
    }
  }
}

/**
 * True when the stored options already match the seed exactly.
 *
 * Options are otherwise replaced wholesale, which mints new option ids - and
 * QuizAnswer.selectedOptionIds stores ids as JSON rather than as a foreign
 * key, so a rerun would leave every past attempt pointing at options that no
 * longer exist. The results page would stop showing what the student picked
 * and the mistake handoff would tell ED they chose "nothing".
 *
 * With 8 attempts and 34 answers already recorded, that is not acceptable, so
 * identical options are left untouched.
 */
function optionsAreUnchanged(
  stored: { text: string; isCorrect: boolean; sortOrder: number }[],
  seeded: OptionSeed[]
): boolean {
  if (stored.length !== seeded.length) return false;
  const byOrder = [...stored].sort((a, b) => a.sortOrder - b.sortOrder);
  return seeded.every(
    (o, i) => byOrder[i].text === o.text && byOrder[i].isCorrect === o.isCorrect
  );
}

// ---------------------------------------------------------------- main

async function main() {
  const url = resolveDatabaseUrl();
  const endpoint = assertApprovedTarget(url);
  const officialTitle = officialChapterTitleFromMap();
  assertSeedIsSane();

  const totalPoints = QUESTIONS.reduce((acc, q) => acc + q.points, 0);

  console.log('');
  console.log('  target endpoint  : ' + endpoint + (DRY_RUN ? '   [DRY RUN — no writes]' : ''));
  console.log('  course           : ' + COURSE_SLUG);
  console.log('  official chapter : "' + officialTitle + '"  (from docs/curriculum-map.md)');
  console.log('  attached to      : lesson "' + HOST_LESSON_SLUG + '"  (Quiz.lessonId)');
  console.log('  quiz             : "' + QUIZ.title + '"');
  console.log('  pass mark        : ' + QUIZ.passingScore + '%   time limit: none');
  console.log('  questions        : ' + QUESTIONS.length + '   total points: ' + totalPoints);
  QUESTIONS.forEach((q, i) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    console.log(
      `      ${i + 1}. [${q.type}] ${correct} correct of ${q.options.length} — ${q.prompt.slice(0, 58)}...`
    );
  });
  console.log('');
  console.log('  question -> topic  (QuizQuestion.lessonId)');
  QUESTIONS.forEach((q, i) => {
    console.log(`      Q${i + 1}  ->  ${q.topicSlug}`);
  });
  console.log('');

  if (DRY_RUN) {
    console.log('  dry run complete — nothing written');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const course = await prisma.course.findUnique({
      where: { slug: COURSE_SLUG },
      select: { id: true }
    });
    if (!course) {
      throw new Error(`Course ${COURSE_SLUG} not found — run npm run db:seed:curriculum first`);
    }

    const chapter = await prisma.module.findFirst({
      where: { courseId: course.id, sortOrder: CHAPTER_SORT_ORDER },
      select: { id: true, title: true }
    });
    if (!chapter) {
      throw new Error(`Chapter at sortOrder ${CHAPTER_SORT_ORDER} not found in ${COURSE_SLUG}`);
    }

    // Abort rather than attach a quiz to the wrong chapter if the seeded module
    // has drifted from the verified official record.
    if (chapter.title !== officialTitle) {
      throw new Error(
        `Chapter mismatch: module is "${chapter.title}" but the map says "${officialTitle}". Aborting.`
      );
    }

    const host = await prisma.lesson.findUnique({
      where: { moduleId_slug: { moduleId: chapter.id, slug: HOST_LESSON_SLUG } },
      select: { id: true, title: true }
    });
    if (!host) {
      throw new Error(
        `Lesson ${HOST_LESSON_SLUG} not found in Chapter 1 — run npm run db:seed:lessons first`
      );
    }

    console.log('  chapter verified : "' + chapter.title + '"');
    console.log('  host lesson      : "' + host.title + '"');
    console.log('');

    // Idempotency: one quiz per host lesson. A rerun updates that quiz rather
    // than adding a second one.
    const existingQuiz = await prisma.quiz.findFirst({
      where: { lessonId: host.id },
      select: { id: true, title: true }
    });

    let quizId: string;
    if (existingQuiz) {
      await prisma.quiz.update({
        where: { id: existingQuiz.id },
        data: {
          title: QUIZ.title,
          description: QUIZ.description,
          passingScore: QUIZ.passingScore,
          timeLimitSeconds: QUIZ.timeLimitSeconds,
          isPublished: true
        }
      });
      quizId = existingQuiz.id;
      console.log('  quiz             : updated in place (' + quizId + ')');
    } else {
      const created = await prisma.quiz.create({
        data: {
          title: QUIZ.title,
          description: QUIZ.description,
          passingScore: QUIZ.passingScore,
          timeLimitSeconds: QUIZ.timeLimitSeconds,
          isPublished: true,
          lessonId: host.id
        },
        select: { id: true }
      });
      quizId = created.id;
      console.log('  quiz             : created (' + quizId + ')');
    }

    // Resolve each topic slug to a lesson id INSIDE this chapter. Looking the
    // lessons up through moduleId_slug is what makes a cross-chapter or
    // cross-class topic impossible to seed by accident.
    const topicIds = new Map<string, string>();
    for (const slug of new Set(QUESTIONS.map((q) => q.topicSlug))) {
      const topic = await prisma.lesson.findUnique({
        where: { moduleId_slug: { moduleId: chapter.id, slug } },
        select: { id: true, title: true }
      });
      if (!topic) {
        throw new Error(`topic "${slug}" not found in chapter "${chapter.title}"`);
      }
      topicIds.set(slug, topic.id);
      console.log('  topic resolved   : ' + slug + '  ->  "' + topic.title + '"');
    }

    let qCreated = 0;
    let qUpdated = 0;
    let optionsRewritten = 0;

    for (const [index, q] of QUESTIONS.entries()) {
      const topicId = topicIds.get(q.topicSlug)!;

      const existing = await prisma.quizQuestion.findFirst({
        where: { quizId, prompt: q.prompt },
        select: {
          id: true,
          options: { select: { text: true, isCorrect: true, sortOrder: true } }
        }
      });

      if (existing) {
        await prisma.quizQuestion.update({
          where: { id: existing.id },
          data: {
            type: q.type,
            points: q.points,
            explanation: q.explanation,
            sortOrder: index + 1,
            lessonId: topicId
          }
        });
        // Options carry the answer key and are replaced wholesale when they
        // differ - but only then. Replacing mints new option ids, and
        // QuizAnswer.selectedOptionIds stores ids as JSON rather than as a
        // foreign key, so rewriting unchanged options would quietly detach
        // every past attempt from what the student actually picked.
        if (!optionsAreUnchanged(existing.options, q.options)) {
          await prisma.quizOption.deleteMany({ where: { questionId: existing.id } });
          await prisma.quizOption.createMany({
            data: q.options.map((o, i) => ({
              questionId: existing.id,
              text: o.text,
              isCorrect: o.isCorrect,
              sortOrder: i + 1
            }))
          });
          optionsRewritten += 1;
        }
        qUpdated += 1;
      } else {
        await prisma.quizQuestion.create({
          data: {
            quizId,
            prompt: q.prompt,
            type: q.type,
            points: q.points,
            explanation: q.explanation,
            sortOrder: index + 1,
            lessonId: topicId,
            options: {
              create: q.options.map((o, i) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                sortOrder: i + 1
              }))
            }
          }
        });
        qCreated += 1;
      }
    }

    const finalCount = await prisma.quizQuestion.count({ where: { quizId } });
    const attemptCount = await prisma.quizAttempt.count({ where: { quizId } });

    const mapped = await prisma.quizQuestion.count({
      where: { quizId, lessonId: { not: null } }
    });

    console.log('  questions        : ' + qCreated + ' created, ' + qUpdated + ' updated');
    console.log('  questions now    : ' + finalCount + '   with a topic: ' + mapped);
    console.log(
      '  options          : ' +
        optionsRewritten +
        ' rewritten (unchanged options are left alone so past answers keep their option ids)'
    );
    console.log('  existing attempts: ' + attemptCount + ' (untouched)');
    console.log('');
    console.log('  done');

    await prisma.$disconnect();
  } catch (err) {
    await prisma.$disconnect();
    throw err;
  }
}

main().catch((err) => {
  console.error('');
  console.error('  SEED FAILED: ' + (err instanceof Error ? err.message : String(err)));
  console.error('');
  process.exit(1);
});
