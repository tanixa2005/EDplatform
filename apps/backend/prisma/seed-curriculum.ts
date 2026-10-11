/**
 * Seeds the Class 6-8 CBSE curriculum STRUCTURE: 12 Course containers and one
 * Module per officially verified chapter/unit. Creates ZERO lessons — ED
 * teaching topics are authored separately, after the Learn structure is agreed.
 *
 * Source of truth is `docs/curriculum-map.md`, which is PARSED at run time.
 * Nothing here is typed from memory: if a title is not in that document, it
 * does not reach the database. The document records every official NCERT
 * source URL behind each chapter list.
 *
 * Safety:
 *   - asserts the target endpoint in-process before connecting
 *   - refuses to run against the known production endpoint
 *   - idempotent: upserts by canonical slug, then by (course, sortOrder)
 *   - never deletes a row; an unexpected row aborts the run instead
 *   - reuses an existing owner account and creates no users
 *
 * Usage:
 *   npm run db:seed:curriculum -- --dry-run     inspect the plan, write nothing
 *   npm run db:seed:curriculum                  apply
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  CLASS_COURSE_SLUGS,
  SUBJECT_LABELS,
  type ClassLevel,
  type SubjectKey
} from '@edplatform/shared';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, '..', '..', '..');
const MAP_PATH = path.join(REPO_ROOT, 'docs', 'curriculum-map.md');

const PRODUCTION_ENDPOINT = 'ep-dark-flower-azql23vb';
const EXPECTED_ENDPOINT = 'ep-young-moon-azdhrnrr';

/**
 * Existing account used as `Course.instructorId`, which the schema requires and
 * which curriculum has no real use for. This account already exists and already
 * owns the legacy technical courses, so it is the platform's content owner.
 * No user is created by this script — if it is missing, the run aborts.
 */
const OWNER_EMAIL = 'instructor@edplatform.com';

/**
 * Dry run. An env var is offered alongside the flag because `npm run <script> --
 * --dry-run` through a root workspace passthrough is consumed by npm itself and
 * never reaches this process — which is exactly how a "dry run" silently became
 * a real write the first time this script was used.
 */
const DRY_RUN = process.argv.includes('--dry-run') || process.env.EDP_SEED_DRY_RUN === '1';

// ---------------------------------------------------------------- guard

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

// ---------------------------------------------------------------- parsing

interface ParsedBook {
  classLevel: ClassLevel;
  subject: SubjectKey;
  /** 'Part I' / 'Part 1' etc., or null for a single-volume book. */
  part: string | null;
  /** Official chapter/unit number as printed. */
  entries: { number: number; title: string }[];
}

const SUBJECT_BY_HEADING: Record<string, SubjectKey> = {
  Mathematics: 'MATH',
  Science: 'SCIENCE',
  'Social Science': 'SOCIAL_SCIENCE',
  English: 'ENGLISH'
};

const CLASS_BY_NUMBER: Record<string, ClassLevel> = {
  '6': 'CLASS_6',
  '7': 'CLASS_7',
  '8': 'CLASS_8'
};

/**
 * Reads docs/curriculum-map.md and returns one ParsedBook per `###` section
 * that carries a verified chapter/unit table.
 */
function parseCurriculumMap(markdown: string): ParsedBook[] {
  const books: ParsedBook[] = [];
  let classLevel: ClassLevel | null = null;
  let current: ParsedBook | null = null;

  const flush = () => {
    if (current && current.entries.length > 0) books.push(current);
    current = null;
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();

    const classMatch = /^## Class ([678])\s*$/.exec(line);
    if (classMatch) {
      flush();
      classLevel = CLASS_BY_NUMBER[classMatch[1]];
      continue;
    }

    const headingMatch = /^### (.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      if (!classLevel) continue;
      // "Mathematics" or "Mathematics — Part I" (em dash) / "- Part I"
      const [, heading] = headingMatch;
      const parts = heading.split(/\s+[—–-]\s+/);
      const subjectName = parts[0].trim();
      const subject = SUBJECT_BY_HEADING[subjectName];
      if (!subject) continue;
      const partLabel = parts[1]?.trim() ?? null;
      current = { classLevel, subject, part: partLabel, entries: [] };
      continue;
    }

    if (!current) continue;

    // Table rows: | 1 | Title | …optional extra columns… |
    const rowMatch = /^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (rowMatch) {
      current.entries.push({ number: Number(rowMatch[1]), title: rowMatch[2].trim() });
    }
  }

  flush();
  return books;
}

// ---------------------------------------------------------------- planning

interface PlannedModule {
  sortOrder: number;
  title: string;
  description: string;
}

interface PlannedCourse {
  slug: string;
  title: string;
  description: string;
  modules: PlannedModule[];
}

function slugFor(classLevel: ClassLevel, subject: SubjectKey): string {
  const classPart = classLevel.replace('CLASS_', 'class-');
  const subjectPart = {
    MATH: 'math',
    SCIENCE: 'science',
    SOCIAL_SCIENCE: 'social-science',
    ENGLISH: 'english'
  }[subject];
  return `${classPart}-${subjectPart}`;
}

function buildPlan(books: ParsedBook[]): PlannedCourse[] {
  const byCourse = new Map<string, PlannedCourse>();

  for (const book of books) {
    const slug = slugFor(book.classLevel, book.subject);
    const classLabel = book.classLevel.replace('CLASS_', 'Class ');
    const subjectLabel = SUBJECT_LABELS[book.subject];

    if (!byCourse.has(slug)) {
      byCourse.set(slug, {
        slug,
        title: `${classLabel} ${subjectLabel}`,
        description:
          `CBSE ${classLabel} ${subjectLabel}, following the current NCERT textbook ` +
          `(NCF-SE 2023). Chapter structure verified from official NCERT sources; ` +
          `see docs/curriculum-map.md for the source URL behind every chapter.`,
        modules: []
      });
    }

    const course = byCourse.get(slug)!;
    const unitWord = book.subject === 'ENGLISH' ? 'Unit' : 'Chapter';

    for (const entry of book.entries) {
      // The exact official title. A part marker is prefixed only for two-part
      // books, so a student can tell Part I Chapter 1 from Part II Chapter 1.
      const title = book.part ? `${book.part} · ${entry.title}` : entry.title;

      course.modules.push({
        // Continuous ordering across parts; the official number stays in the
        // description because Module has a single ordering sequence.
        sortOrder: course.modules.length + 1,
        title,
        description: book.part
          ? `Official NCERT ${book.part}, ${unitWord} ${entry.number}`
          : `Official NCERT ${unitWord} ${entry.number}`
      });
    }
  }

  return [...byCourse.values()];
}

// ---------------------------------------------------------------- seeding

async function main() {
  const url = resolveDatabaseUrl();
  const endpoint = assertApprovedTarget(url);

  console.log('');
  console.log('  target endpoint : ' + endpoint + (DRY_RUN ? '   [DRY RUN — no writes]' : ''));
  console.log('  source of truth : docs/curriculum-map.md');

  const books = parseCurriculumMap(readFileSync(MAP_PATH, 'utf8'));
  const plan = buildPlan(books);

  const expectedSlugs = new Set(Object.values(CLASS_COURSE_SLUGS).flat());
  const plannedSlugs = new Set(plan.map((c) => c.slug));

  console.log('  books parsed    : ' + books.length);
  console.log('  courses planned : ' + plan.length);
  console.log('  modules planned : ' + plan.reduce((n, c) => n + c.modules.length, 0));
  console.log('');

  if (plan.length !== 12) {
    throw new Error(`Expected 12 curriculum courses from the map, parsed ${plan.length}`);
  }
  for (const slug of plannedSlugs) {
    if (!expectedSlugs.has(slug)) {
      throw new Error(`Planned slug "${slug}" is not in CLASS_COURSE_SLUGS — refusing`);
    }
  }
  for (const slug of expectedSlugs) {
    if (!plannedSlugs.has(slug)) {
      throw new Error(`Allowlisted slug "${slug}" has no parsed curriculum — refusing`);
    }
  }

  for (const course of plan) {
    console.log(`  ${course.slug.padEnd(24)} ${String(course.modules.length).padStart(2)} modules`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('  dry run complete — nothing written');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true, email: true }
    });

    if (!owner) {
      throw new Error(
        `Owner account ${OWNER_EMAIL} does not exist. ` +
          'This script will not create users. Aborting rather than inventing an account.'
      );
    }
    console.log('  owner (existing, not created): ' + owner.email);
    console.log('');

    let coursesCreated = 0;
    let coursesReused = 0;
    let modulesCreated = 0;
    let modulesUpdated = 0;

    for (const planned of plan) {
      const existing = await prisma.course.findUnique({
        where: { slug: planned.slug },
        select: { id: true, title: true, instructorId: true }
      });

      // Refuse to touch a row with our slug that is not ours.
      if (existing && existing.instructorId !== owner.id) {
        throw new Error(
          `Course "${planned.slug}" exists but is owned by another account ` +
            `(${existing.instructorId}). Refusing to overwrite unrelated data.`
        );
      }

      const data: Prisma.CourseUncheckedCreateInput = {
        title: planned.title,
        slug: planned.slug,
        description: planned.description,
        shortSummary: `${planned.title} — CBSE curriculum (NCERT, NCF-SE 2023)`,
        instructorId: owner.id,
        isPublished: true,
        status: 'PUBLISHED',
        price: 0
      };

      const course = existing
        ? await prisma.course.update({ where: { id: existing.id }, data })
        : await prisma.course.create({ data });

      if (existing) coursesReused += 1;
      else coursesCreated += 1;

      // Modules are matched on (courseId, sortOrder): deterministic, and it
      // never requires deleting a row to re-run.
      const existingModules = await prisma.module.findMany({
        where: { courseId: course.id },
        select: { id: true, sortOrder: true, title: true, description: true }
      });
      const bySortOrder = new Map(existingModules.map((m) => [m.sortOrder, m]));

      for (const mod of planned.modules) {
        const match = bySortOrder.get(mod.sortOrder);
        if (!match) {
          await prisma.module.create({
            data: {
              courseId: course.id,
              title: mod.title,
              description: mod.description,
              sortOrder: mod.sortOrder
            }
          });
          modulesCreated += 1;
        } else if (match.title !== mod.title || match.description !== mod.description) {
          await prisma.module.update({
            where: { id: match.id },
            data: { title: mod.title, description: mod.description }
          });
          modulesUpdated += 1;
        }
      }

      const extra = existingModules.filter((m) => m.sortOrder > planned.modules.length);
      if (extra.length > 0) {
        console.warn(
          `  ! ${planned.slug}: ${extra.length} module(s) beyond the planned range left untouched ` +
            '(this script never deletes rows)'
        );
      }
    }

    console.log('  courses created : ' + coursesCreated);
    console.log('  courses reused  : ' + coursesReused);
    console.log('  modules created : ' + modulesCreated);
    console.log('  modules updated : ' + modulesUpdated);
    console.log('  lessons created : 0  (intentional — topics are authored separately)');
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
