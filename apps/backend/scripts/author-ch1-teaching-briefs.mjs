/**
 * C13.5.4 - authors the four reviewed teaching briefs for Class 6 Science,
 * Chapter 1, "The Wonderful World of Science".
 *
 * WHY THIS EXISTS AS A FILE. The briefs are ED's own trusted teaching
 * material: they go into the system prompt ahead of the student's question,
 * and the prompt tells ED to teach from them. Content with that much reach
 * should be reviewable in version control rather than living only as four rows
 * somebody once typed into a database. The seed files deliberately do not
 * touch teachingBrief, so this script is the record of what was written and
 * the way to reapply it.
 *
 * WHAT IT WILL NOT DO. It writes nothing without --write, it refuses unless
 * the repository's own database guard passes, and it refuses to overwrite a
 * brief that already has content. It touches exactly four rows, matched on id
 * AND slug AND module AND course together, inside one transaction, and then
 * proves that nothing else in the database moved.
 *
 *   node scripts/author-ch1-teaching-briefs.mjs              # dry run
 *   node scripts/author-ch1-teaching-briefs.mjs --write
 *
 * Every brief below is original wording derived from the lesson's own stored
 * content. None of it is NCERT text, a quotation from the student's textbook,
 * or a claim about what any printed page says.
 */
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(HERE, '..');

/** The chapter these four topics belong to. Asserted, never assumed. */
const EXPECTED = {
  courseSlug: 'class-6-science',
  moduleId: '879f7886-b807-4f97-b590-71e7ff530a58',
  moduleTitle: 'The Wonderful World of Science',
  lessonsInModule: 4
};

const MIN_LENGTH = 300;
const MAX_LENGTH = 500;

/**
 * One brief per authored topic, keyed by the id AND slug that must both match.
 *
 * Each is structured the same way so ED reads them consistently: the idea, the
 * example the page in front of the student actually uses, the words that page
 * introduces, and the one confusion worth heading off.
 */
const BRIEFS = [
  {
    id: '6592f4b0-6e63-488b-8af7-8282f9bb366c',
    slug: 'what-science-really-is',
    brief: [
      'Core idea: science is a way of working things out, not facts to memorise - and curiosity is the real skill.',
      'Lesson example: ordinary things worth questioning - water vanishing from a glass, a cut apple browning, a shadow long at evening and short at noon.',
      'Key terms: noticing, curiosity, why-question.',
      'Likely misconception: that science only happens in labs, and that answers are fixed. Labs are a place, not the subject, and corrected ideas are science working properly.'
    ].join('\n')
  },
  {
    id: 'f8b7aa7a-f2c0-4a24-a75f-590a99bac1e2',
    slug: 'how-scientists-work-things-out',
    brief: [
      'Core idea: instead of thinking harder, follow a sequence - observe, ask, guess, test, check.',
      'Lesson example: a phone that will not charge. Guess: the socket is dead. Test: plug a lamp into that same socket. The lamp lights, so the guess was wrong and the next guess is a damaged cable.',
      'Key terms: observe, ask, guess, test, check.',
      'Likely misconception: that a wrong guess is failure. It rules a cause out, which is progress - and a guess is only tested if the test could have shown it was wrong.'
    ].join('\n')
  },
  {
    id: '40b1c0d5-79ea-41f5-b2fb-0945c52ba0dc',
    slug: 'you-already-think-like-a-scientist',
    brief: [
      'Core idea: a scientist is not a type of person - it is anyone asking a question and working out the answer properly, including outside school.',
      'Lesson example: a cook whose milk boiled over lowers the flame and watches; a jamming sewing machine gets a new needle first, the easiest thing to change.',
      'Key terms: change one thing at a time.',
      'Likely misconception: that changing two things at once still shows the cause - lower the flame and swap the pot, and you cannot know which one worked.'
    ].join('\n')
  },
  {
    id: '5e3151b7-474b-4f1a-bf82-b17c6fad51a1',
    slug: 'getting-good-at-science',
    brief: [
      'Core idea: three habits carry most of the work - observe in detail, keep asking why, and do not work alone.',
      'Lesson example: observing catches detail - a leaf greener on its upper side than underneath, air colder close to the window; detail is where questions come from.',
      'Key terms: observing versus looking, why-question.',
      "Likely misconception: that asking a teacher or friend is cheating, or that an unanswered why is failure. Scientists check each other's reasoning, and some questions stay open."
    ].join('\n')
  }
];

const WRITE = process.argv.includes('--write');

function die(message, ...details) {
  console.error(`\n  ✖ ${message}`);
  for (const d of details) console.error(`      ${d}`);
  process.exit(1);
}

/**
 * Reuses the repository's own guard rather than reimplementing host parsing.
 * It fails closed and prints the approved endpoint itself; if it exits non-zero
 * nothing here runs.
 */
function assertDevDatabase() {
  try {
    const out = execFileSync('node', [resolve(HERE, 'db-guard.mjs'), '--print'], {
      cwd: BACKEND_ROOT,
      encoding: 'utf8'
    });
    process.stdout.write(out);
  } catch (err) {
    die('the database guard refused this target - nothing was read or written', String(err.status));
  }
}

/** A stable fingerprint of every lesson, to prove only four rows moved. */
async function fingerprintLessons(prisma) {
  const rows = await prisma.lesson.findMany({
    select: { id: true, slug: true, updatedAt: true, teachingBrief: true, content: true },
    orderBy: { id: 'asc' }
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        slug: r.slug,
        updatedAt: r.updatedAt.toISOString(),
        briefLength: r.teachingBrief === null ? null : r.teachingBrief.length,
        contentLength: r.content === null ? 0 : r.content.length
      }
    ])
  );
}

/** Row counts for every table this script must not touch. */
async function tableCounts(prisma) {
  return {
    users: await prisma.user.count(),
    courses: await prisma.course.count(),
    modules: await prisma.module.count(),
    lessons: await prisma.lesson.count(),
    quizzes: await prisma.quiz.count(),
    questions: await prisma.quizQuestion.count(),
    options: await prisma.quizOption.count(),
    attempts: await prisma.quizAttempt.count(),
    answers: await prisma.quizAnswer.count(),
    progress: await prisma.lessonProgress.count(),
    sessions: await prisma.tutorSession.count(),
    messages: await prisma.tutorMessage.count()
  };
}

async function main() {
  console.log('\n  C13.5.4 - Chapter 1 teaching briefs');
  console.log(`  mode: ${WRITE ? 'WRITE' : 'dry run (pass --write to apply)'}\n`);

  // 1. Lengths, before anything touches a database.
  for (const b of BRIEFS) {
    if (b.brief.length < MIN_LENGTH || b.brief.length > MAX_LENGTH) {
      die(`${b.slug}: brief is ${b.brief.length} chars, outside ${MIN_LENGTH}-${MAX_LENGTH}`);
    }
    if (b.brief.trim() !== b.brief) die(`${b.slug}: brief has surrounding whitespace`);
  }
  const distinct = new Set(BRIEFS.map((b) => b.brief));
  if (distinct.size !== BRIEFS.length) die('two briefs are identical - each topic needs its own');

  // 2. The guard, immediately before connecting.
  assertDevDatabase();

  const prisma = new PrismaClient();
  try {
    // 3. The four rows, matched on every identifying field at once.
    const rows = await prisma.lesson.findMany({
      where: {
        id: { in: BRIEFS.map((b) => b.id) },
        slug: { in: BRIEFS.map((b) => b.slug) },
        moduleId: EXPECTED.moduleId,
        module: { title: EXPECTED.moduleTitle, course: { slug: EXPECTED.courseSlug } }
      },
      select: { id: true, slug: true, title: true, teachingBrief: true, isPublished: true }
    });

    if (rows.length !== BRIEFS.length) {
      die(
        `expected exactly ${BRIEFS.length} matching lessons, found ${rows.length}`,
        'the chapter, slugs or ids differ from what this script was written against'
      );
    }

    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    for (const b of BRIEFS) {
      const row = bySlug.get(b.slug);
      if (!row) die(`${b.slug}: no matching row in the expected chapter`);
      if (row.id !== b.id) die(`${b.slug}: id is ${row.id}, expected ${b.id}`);
      const existing = (row.teachingBrief ?? '').trim();
      if (existing !== '') {
        die(
          `${b.slug} already has a brief (${existing.length} chars) - refusing to overwrite`,
          'remove it deliberately, or edit this script, if replacing it is really intended'
        );
      }
    }

    // 4. The chapter is the whole chapter, so no authored topic is missed.
    const inModule = await prisma.lesson.count({ where: { moduleId: EXPECTED.moduleId } });
    if (inModule !== EXPECTED.lessonsInModule) {
      die(`the chapter holds ${inModule} lessons, expected ${EXPECTED.lessonsInModule}`);
    }

    // 5. Nothing anywhere else already carries a brief.
    const alreadyPopulated = await prisma.lesson.findMany({
      where: { teachingBrief: { not: null } },
      select: { slug: true }
    });
    const unexpected = alreadyPopulated.filter((l) => !BRIEFS.some((b) => b.slug === l.slug));
    if (unexpected.length > 0) {
      die(
        `${unexpected.length} other lesson(s) already carry a brief`,
        unexpected.map((l) => l.slug).join(', ')
      );
    }

    console.log('  preconditions passed:');
    console.log(`    4 rows matched in ${EXPECTED.moduleTitle} / ${EXPECTED.courseSlug}`);
    console.log('    all four briefs currently null or blank');
    console.log(`    chapter holds exactly ${inModule} lessons\n`);

    for (const b of BRIEFS) {
      const row = bySlug.get(b.slug);
      console.log(`  ${b.slug}  (${b.brief.length} chars, published=${row.isPublished})`);
      for (const line of b.brief.split('\n')) console.log(`      ${line}`);
      console.log();
    }

    if (!WRITE) {
      console.log('  dry run complete - nothing was written.\n');
      return;
    }

    // 6. Snapshot, write, verify.
    const beforeFingerprint = await fingerprintLessons(prisma);
    const beforeCounts = await tableCounts(prisma);

    await prisma.$transaction(async (tx) => {
      for (const b of BRIEFS) {
        const result = await tx.lesson.updateMany({
          // Every identifying field again, inside the transaction, so a row
          // that changed underneath us between the check and the write is not
          // updated at all.
          where: {
            id: b.id,
            slug: b.slug,
            moduleId: EXPECTED.moduleId,
            module: { title: EXPECTED.moduleTitle, course: { slug: EXPECTED.courseSlug } },
            OR: [{ teachingBrief: null }, { teachingBrief: '' }]
          },
          data: { teachingBrief: b.brief }
        });
        if (result.count !== 1) {
          throw new Error(`${b.slug}: updated ${result.count} rows, expected exactly 1 - rolled back`);
        }
      }
    });

    // 7. Read back only those four.
    const after = await prisma.lesson.findMany({
      where: { id: { in: BRIEFS.map((b) => b.id) } },
      select: { id: true, slug: true, teachingBrief: true },
      orderBy: { slug: 'asc' }
    });
    if (after.length !== BRIEFS.length) die(`read back ${after.length} rows, expected ${BRIEFS.length}`);
    console.log('  written and read back:');
    for (const row of after) {
      const expected = BRIEFS.find((b) => b.id === row.id);
      if (!expected) die(`unexpected row ${row.id} came back`);
      if (row.slug !== expected.slug) die(`${row.id}: slug is ${row.slug}`);
      if (row.teachingBrief !== expected.brief) die(`${row.slug}: stored text differs from the source`);
      console.log(`    ${row.slug}  ${row.teachingBrief.length} chars  ✔`);
    }

    // 8. Exactly these four, and nothing else in the database, changed.
    const populated = await prisma.lesson.findMany({
      where: { teachingBrief: { not: null } },
      select: { id: true, slug: true }
    });
    if (populated.length !== BRIEFS.length) {
      die(`${populated.length} lessons now carry a brief, expected ${BRIEFS.length}`);
    }
    for (const p of populated) {
      if (!BRIEFS.some((b) => b.id === p.id)) die(`an unintended lesson carries a brief: ${p.slug}`);
    }

    const afterFingerprint = await fingerprintLessons(prisma);
    if (afterFingerprint.size !== beforeFingerprint.size) {
      die(`lesson count changed: ${beforeFingerprint.size} -> ${afterFingerprint.size}`);
    }
    const targetIds = new Set(BRIEFS.map((b) => b.id));
    let untouched = 0;
    for (const [id, before] of beforeFingerprint) {
      const now = afterFingerprint.get(id);
      if (!now) die(`lesson ${id} disappeared`);
      if (now.slug !== before.slug) die(`lesson ${id} changed slug`);
      if (now.contentLength !== before.contentLength) die(`lesson ${before.slug} changed content`);
      if (targetIds.has(id)) continue;
      if (now.updatedAt !== before.updatedAt) die(`an untargeted lesson was written: ${before.slug}`);
      if (now.briefLength !== before.briefLength) die(`an untargeted brief changed: ${before.slug}`);
      untouched += 1;
    }

    const afterCounts = await tableCounts(prisma);
    for (const [table, before] of Object.entries(beforeCounts)) {
      if (afterCounts[table] !== before) {
        die(`${table} count changed: ${before} -> ${afterCounts[table]}`);
      }
    }

    console.log(`\n  verified: ${untouched} other lessons untouched, all table counts unchanged.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n  ✖ aborted:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
