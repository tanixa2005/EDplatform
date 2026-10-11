/**
 * C5 vertical slice: the first real ED teaching topics, for ONE chapter only —
 * Class 6 Science (Curiosity), Chapter 1 "The Wonderful World of Science".
 *
 * The chapter title is read from docs/curriculum-map.md at run time, so it
 * cannot drift from the verified official record.
 *
 * CONTENT ORIGIN: every word of the lesson bodies below is written for ED. No
 * NCERT text is reproduced. The official chapter was read only to establish
 * SCOPE — what Chapter 1 actually teaches — and the examples here are
 * deliberately different from the textbook's (it uses a pen that stops writing,
 * spilled dal, a flat tyre and a dead bulb; these lessons use a charger, a
 * wilting plant, a slow fan and boiled-over milk).
 *
 * Safety: endpoint asserted in-process, idempotent by (moduleId, slug), never
 * deletes a row, touches exactly one module.
 *
 * Usage:
 *   EDP_SEED_DRY_RUN=1 npm run db:seed:lessons   inspect, write nothing
 *   npm run db:seed:lessons                      apply
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

const DRY_RUN = process.argv.includes('--dry-run') || process.env.EDP_SEED_DRY_RUN === '1';

interface TopicSeed {
  /** Stable identifier. Lesson.slug is unique per module, so reruns match on it. */
  slug: string;
  title: string;
  objective: string;
  content: string;
}

/**
 * Four teaching topics covering Chapter 1's actual scope:
 *   1. what science is                        -> topic 1
 *   2. the observe/question/guess/test cycle  -> topic 2
 *   3. ordinary people reasoning scientifically -> topic 3
 *   4. how to actually get good at it         -> topic 4
 * The chapter's "preview of the book" passage is a contents tour, not a
 * teachable concept, so it is deliberately not a topic.
 */
const TOPICS: TopicSeed[] = [
  {
    slug: 'what-science-really-is',
    title: 'What science really is',
    objective: 'Explain what science is, and why curiosity is the part that matters most.',
    content: `Science isn't a pile of facts to memorise. It's a way of working things out.

When you notice something, wonder about it, and then try to find out why — that's science. The subject in your timetable is just the organised version of something you've been doing since you were small.

## It starts with noticing

Most science begins with somebody paying attention to something ordinary.

Water left in a glass slowly disappears. A cut apple turns brown. Your shadow is long in the evening and short at noon. None of that is unusual, and that's the point — the interesting bit isn't the thing itself, it's asking **why** it happens.

Curiosity is the actual skill here. Everything else is technique.

## Science is everywhere, not just in a lab

You don't need equipment to do science. It's in the kitchen when something boils over, in the sky when it clouds up before rain, in your own body when you get tired after running.

People sometimes think science lives in white coats and laboratories. Labs are useful, but they're a *place*, not the subject.

## What we know can change

Here's the part students often find surprising: scientific knowledge gets corrected.

Our picture of the world is built from millions of small findings, and sometimes a new finding shows that an older idea was wrong or incomplete. When that happens, the idea gets changed. That's not science failing — it's science working properly.

**So:** science is a way of asking and answering questions about the world, and the answers are allowed to improve.

---

**Think about this:** You notice the floor near a window is warmer than the rest of the room. What question would you ask about it?`
  },
  {
    slug: 'how-scientists-work-things-out',
    title: 'How scientists work things out',
    objective: 'Follow the observe → question → guess → test → check cycle on a real problem.',
    content: `When scientists don't know something, they don't just think harder. They follow a sequence.

1. **Observe** — notice something.
2. **Ask** — turn it into a clear question.
3. **Guess** — suggest a possible answer.
4. **Test** — do something that would show whether the guess is right.
5. **Check** — look at what happened and decide.

## Walking through it

Your phone isn't charging.

- **Observe:** it's plugged in, but the battery icon isn't moving.
- **Ask:** why isn't it charging?
- **Guess:** maybe the socket isn't working.
- **Test:** plug a lamp into the same socket.
- **Check:** the lamp lights up. So the socket is fine — your guess was wrong.

Being wrong is not a dead end. You've just ruled something out, which is real progress. So you guess again: maybe the cable is damaged. Test it with a different cable. Keep going until something works.

## The bit that makes it a test

A guess only counts as tested if the test could have proved you **wrong**.

Staring at the phone and hoping isn't a test. Plugging a lamp into that socket is, because there were two possible outcomes and you didn't know which you'd get.

**The key idea:** a good test has an outcome that would change your mind.

---

**Think about this:** A plant on your windowsill is drooping. What would you guess is wrong, and what could you do to test that guess?`
  },
  {
    slug: 'you-already-think-like-a-scientist',
    title: 'You already think like a scientist',
    objective: 'Recognise the scientific method in everyday situations outside school.',
    content: `You've used the scientific method many times without calling it that.

A scientist isn't a type of person. It's what someone is doing when they ask a question and work out the answer properly.

## Same method, different jobs

A cook notices the milk boiled over. She asks why, guesses the flame was too high, turns it down next time, and watches. That's the cycle.

Someone whose ceiling fan has got slower checks whether it's slow on every setting, or only on one. That's narrowing down a cause.

A tailor whose sewing machine keeps jamming tries a new needle first, because it's the easiest thing to change. That's testing one thing at a time.

None of them would describe themselves as doing science. All of them are.

## Why it's worth noticing

Two reasons.

First, it means you're not starting from zero — you already have the habit, and school science is about getting more careful with it.

Second, it tells you what careful actually means: **change one thing at a time**. If the cook lowered the flame *and* switched to a smaller pot, and the milk didn't boil over, she still wouldn't know which change did it.

---

**Think about this:** Something went wrong at home recently. What was the question, and what was the first guess?`
  },
  {
    slug: 'getting-good-at-science',
    title: 'Getting good at science',
    objective: 'Build the three habits that make science easier: observing, asking why, and working with others.',
    content: `Three habits do most of the work. None of them is about memorising.

## Observe properly

Looking and observing aren't the same thing.

Observing is noticing detail: not just "the leaf is green", but greener on top than underneath. Not just "it's cold", but colder near the window. Detail is where the questions come from, and no question means nothing to investigate.

## Ask "why" more often than feels normal

Most people stop asking why quite early. Keep going one step further than you want to.

Why does the sea look blue? Why do we yawn? Why does bread smell best just out of the oven? You won't be able to answer all of them — that's completely fine. Having the question is the first step, and some of them you'll answer in later chapters, some in later years.

## Don't do it alone

Scientists almost never work by themselves. They work in groups, share what they find, and check each other's reasoning.

So if you're stuck, asking a friend or your teacher isn't cheating. It's the normal way science gets done. Explaining something to someone else is also the fastest way to find out whether you actually understood it.

## One honest thing

You won't get answers to everything this year, and you're not supposed to. Some questions you'll come back to in Class 7 or 8, and some are still open for scientists right now.

**The habit to keep:** notice, ask, find out.

---

**Think about this:** What is one "why" question about something you saw today, and where would you start looking for the answer?`
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

// ---------------------------------------------------------------- main

async function main() {
  const url = resolveDatabaseUrl();
  const endpoint = assertApprovedTarget(url);
  const officialTitle = officialChapterTitleFromMap();

  console.log('');
  console.log('  target endpoint  : ' + endpoint + (DRY_RUN ? '   [DRY RUN — no writes]' : ''));
  console.log('  course           : ' + COURSE_SLUG);
  console.log('  official chapter : "' + officialTitle + '"  (from docs/curriculum-map.md)');
  console.log('  ED topics        : ' + TOPICS.length);
  TOPICS.forEach((t, i) => console.log(`      ${i + 1}. ${t.title}`));
  console.log('');

  if (DRY_RUN) {
    console.log('  dry run complete — nothing written');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const course = await prisma.course.findUnique({
      where: { slug: COURSE_SLUG },
      select: { id: true, title: true }
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

    // The module must be the chapter the official record names. If the seeded
    // module has drifted from the map, abort rather than attach topics to the
    // wrong chapter.
    if (chapter.title !== officialTitle) {
      throw new Error(
        `Chapter mismatch: module is "${chapter.title}" but the map says "${officialTitle}". Aborting.`
      );
    }
    console.log('  chapter verified : "' + chapter.title + '"');
    console.log('');

    let created = 0;
    let updated = 0;

    for (const [index, topic] of TOPICS.entries()) {
      const existing = await prisma.lesson.findUnique({
        where: { moduleId_slug: { moduleId: chapter.id, slug: topic.slug } },
        select: { id: true, title: true, content: true, description: true, sortOrder: true }
      });

      const data = {
        title: topic.title,
        description: topic.objective,
        type: 'TEXT' as const,
        content: topic.content,
        sortOrder: index + 1,
        // Curriculum topics are readable without enrolling: the existing
        // free-preview mechanism, not a new access system.
        isFreePreview: true,
        isPublished: true
      };

      if (existing) {
        const changed =
          existing.title !== data.title ||
          existing.content !== data.content ||
          existing.description !== data.description ||
          existing.sortOrder !== data.sortOrder;
        if (changed) {
          await prisma.lesson.update({ where: { id: existing.id }, data });
          updated += 1;
        }
      } else {
        await prisma.lesson.create({ data: { ...data, moduleId: chapter.id, slug: topic.slug } });
        created += 1;
      }
    }

    const total = await prisma.lesson.count({ where: { moduleId: chapter.id } });

    console.log('  topics created   : ' + created);
    console.log('  topics updated   : ' + updated);
    console.log('  topics in chapter: ' + total);
    console.log('');
    console.log('  done');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('');
  console.error('  SEED ABORTED: ' + (err instanceof Error ? err.message : String(err)));
  console.error('');
  process.exit(1);
});
