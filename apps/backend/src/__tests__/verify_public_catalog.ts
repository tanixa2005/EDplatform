/**
 * Public course catalogue, verified offline.
 *
 * The query is replaced by a fake that either applies the filter it is given or
 * ignores it (returning every row), so both the query shape and the final
 * filtering are checked. No database, network or environment file is touched.
 *
 * Run: npm run test:public-catalog
 */
import assert from 'node:assert/strict';
import { isCourseVisibleToClass, type CourseCardDto } from '@edplatform/shared';
import {
  allowedSlugs,
  buildCatalogWhere,
  catalogScope,
  isCatalogRowVisible,
  selectCatalogCourses,
  toPublicCard,
  type CatalogRow
} from '../services/public-catalog.js';

type Where = Record<string, unknown>;

interface Row extends CatalogRow {
  id: string;
  title: string;
  description: string;
  shortSummary: string;
  level: string;
  categoryId: string | null;
}

const CLASS_CURRICULUM_SLUGS = [
  'class-6-math',
  'class-6-science',
  'class-6-social-science',
  'class-6-english',
  'class-7-math',
  'class-7-science',
  'class-7-social-science',
  'class-7-english',
  'class-8-math',
  'class-8-science',
  'class-8-social-science',
  'class-8-english'
];

function row(overrides: Partial<Row> & Pick<Row, 'id' | 'slug'>): Row {
  return {
    title: overrides.slug,
    description: '',
    shortSummary: '',
    isPublished: true,
    level: 'BEGINNER',
    categoryId: null,
    ...overrides
  };
}

// One published and one unpublished curriculum course, legacy courses, and an unknown class.
const ROWS: Row[] = [
  row({ id: '1', slug: 'class-6-math', title: 'Class 6 Mathematics', description: 'Numbers and patterns' }),
  row({ id: '2', slug: 'class-7-science', title: 'Class 7 Science', description: 'Living things' }),
  row({ id: '3', slug: 'class-8-english', title: 'Class 8 English', description: 'Reading' }),
  row({ id: '4', slug: 'class-6-social-science', title: 'Class 6 Social Science', isPublished: false }),
  row({ id: '5', slug: 'distributed-systems-resilient-architectures', title: 'Distributed Systems' }),
  row({ id: '6', slug: 'postgresql-internals', title: 'PostgreSQL Internals' }),
  row({ id: '7', slug: 'class-9-math', title: 'Class 9 Mathematics' })
];

function matches(candidate: Row, where: Where): boolean {
  if (where.isPublished !== undefined && candidate.isPublished !== where.isPublished) return false;
  const slugIn = (where.slug as { in?: string[] } | undefined)?.in;
  if (slugIn !== undefined && !slugIn.includes(candidate.slug)) return false;
  if (where.level !== undefined && candidate.level !== where.level) return false;
  if (where.categoryId !== undefined && candidate.categoryId !== where.categoryId) return false;
  const or = where.OR as Array<Record<string, { contains: string }>> | undefined;
  if (or !== undefined) {
    const hit = or.some((condition) => {
      const [field, spec] = Object.entries(condition)[0];
      const value = String((candidate as unknown as Record<string, unknown>)[field] ?? '');
      return value.toLowerCase().includes(spec.contains.toLowerCase());
    });
    if (!hit) return false;
  }
  return true;
}

/** A fake query. honourWhere=false models a database that returns more than was asked for. */
function fakeQuery(rows: Row[], honourWhere: boolean) {
  const calls: Where[] = [];
  const findMany = async (where: Where): Promise<Row[]> => {
    calls.push(where);
    return rows.filter((candidate) => !honourWhere || matches(candidate, where));
  };
  return { findMany, calls };
}

async function visibleSlugs(
  input: { classLevel?: 'CLASS_6' | 'CLASS_7' | 'CLASS_8' | null; anonymous: boolean },
  filters: { search?: string; level?: string; categoryId?: string },
  honourWhere = true
): Promise<string[]> {
  const query = fakeQuery(ROWS, honourWhere);
  const courses = await selectCatalogCourses(input, filters, query.findMany);
  return courses.map((course) => course.slug).sort();
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

async function main(): Promise<void> {
  // --- Scope decisions -----------------------------------------------------

  await check('anonymous visitor gets the public scope', () => {
    assert.deepEqual(catalogScope({ anonymous: true }), { kind: 'public' });
  });

  await check('signed-in student with a class level gets that class scope', () => {
    assert.deepEqual(catalogScope({ classLevel: 'CLASS_6', anonymous: false }), {
      kind: 'class',
      classLevel: 'CLASS_6'
    });
  });

  await check('signed-in user with no class level gets no scope (fails closed)', () => {
    assert.deepEqual(catalogScope({ classLevel: null, anonymous: false }), { kind: 'none' });
  });

  await check('a class level takes precedence over the anonymous flag', () => {
    assert.deepEqual(catalogScope({ classLevel: 'CLASS_7', anonymous: true }), {
      kind: 'class',
      classLevel: 'CLASS_7'
    });
  });

  // --- Allowlist ----------------------------------------------------------

  await check('public allowlist is exactly the twelve Class 6-8 curriculum slugs', () => {
    const slugs = [...(allowedSlugs({ kind: 'public' }) ?? [])].sort();
    assert.deepEqual(slugs, [...CLASS_CURRICULUM_SLUGS].sort());
  });

  await check('public allowlist excludes legacy and unknown-class slugs', () => {
    const slugs = allowedSlugs({ kind: 'public' }) ?? [];
    for (const forbidden of ['distributed-systems-resilient-architectures', 'postgresql-internals', 'class-9-math']) {
      assert.equal(slugs.includes(forbidden), false, `public allowlist must not contain ${forbidden}`);
    }
  });

  // --- Query shape ----------------------------------------------------------

  await check('anonymous query requires isPublished and the public slug list', () => {
    const where = buildCatalogWhere({}, { kind: 'public' });
    assert.ok(where !== null);
    assert.equal(where.isPublished, true);
    assert.deepEqual([...((where.slug as { in: string[] }).in)].sort(), [...CLASS_CURRICULUM_SLUGS].sort());
  });

  await check('Class 6 student query is limited to Class 6 slugs only', () => {
    const where = buildCatalogWhere({}, { kind: 'class', classLevel: 'CLASS_6' });
    assert.ok(where !== null);
    assert.equal(where.isPublished, true);
    assert.deepEqual([...((where.slug as { in: string[] }).in)].sort(), [
      'class-6-english',
      'class-6-math',
      'class-6-science',
      'class-6-social-science'
    ]);
  });

  await check('signed-in user with no class level builds no query at all', () => {
    assert.equal(buildCatalogWhere({}, { kind: 'none' }), null);
  });

  await check('no-scope request never calls the database', async () => {
    const query = fakeQuery(ROWS, true);
    const courses = await selectCatalogCourses({ classLevel: null, anonymous: false }, {}, query.findMany);
    assert.deepEqual(courses, []);
    assert.equal(query.calls.length, 0);
  });

  await check('level filter is normalised and unknown levels are ignored', () => {
    const advanced = buildCatalogWhere({ level: ' advanced ' }, { kind: 'public' });
    assert.equal(advanced?.level, 'ADVANCED');
    const unknown = buildCatalogWhere({ level: 'expert' }, { kind: 'public' });
    assert.equal('level' in (unknown ?? {}), false);
  });

  await check('category and search filters are added for the anonymous scope', () => {
    const where = buildCatalogWhere({ categoryId: 'cat-1', search: 'math' }, { kind: 'public' });
    assert.equal(where?.categoryId, 'cat-1');
    assert.ok(Array.isArray(where?.OR));
  });

  // --- Anonymous visitors -----------------------------------------------------

  await check('anonymous visitor sees the published Class 6-8 courses', async () => {
    assert.deepEqual(await visibleSlugs({ anonymous: true }, {}), [
      'class-6-math',
      'class-7-science',
      'class-8-english'
    ]);
  });

  await check('anonymous visitor never sees unpublished courses', async () => {
    const slugs = await visibleSlugs({ anonymous: true }, {});
    assert.equal(slugs.includes('class-6-social-science'), false);
  });

  await check('anonymous visitor never sees legacy or unknown-class courses', async () => {
    const slugs = await visibleSlugs({ anonymous: true }, {});
    for (const forbidden of ['distributed-systems-resilient-architectures', 'postgresql-internals', 'class-9-math']) {
      assert.equal(slugs.includes(forbidden), false, `anonymous must not see ${forbidden}`);
    }
  });

  await check('anonymous search narrows results within the public scope', async () => {
    assert.deepEqual(await visibleSlugs({ anonymous: true }, { search: 'english' }), ['class-8-english']);
  });

  await check('anonymous search cannot reveal a legacy course', async () => {
    assert.deepEqual(await visibleSlugs({ anonymous: true }, { search: 'distributed' }), []);
  });

  // --- Authenticated students ---------------------------------------------------

  await check('Class 6 student sees only the Class 6 courses', async () => {
    assert.deepEqual(await visibleSlugs({ classLevel: 'CLASS_6', anonymous: false }, {}), ['class-6-math']);
  });

  await check('Class 7 student sees only the Class 7 courses', async () => {
    assert.deepEqual(await visibleSlugs({ classLevel: 'CLASS_7', anonymous: false }, {}), ['class-7-science']);
  });

  await check('Class 8 student sees only the Class 8 courses', async () => {
    assert.deepEqual(await visibleSlugs({ classLevel: 'CLASS_8', anonymous: false }, {}), ['class-8-english']);
  });

  await check('signed-in user with no class level still sees nothing', async () => {
    assert.deepEqual(await visibleSlugs({ classLevel: null, anonymous: false }, {}), []);
  });

  // --- Final filter when the database over-returns --------------------------

  await check('anonymous results stay correct when the database ignores the filter', async () => {
    assert.deepEqual(await visibleSlugs({ anonymous: true }, {}, false), [
      'class-6-math',
      'class-7-science',
      'class-8-english'
    ]);
  });

  await check('Class 6 results stay correct when the database ignores the filter', async () => {
    assert.deepEqual(await visibleSlugs({ classLevel: 'CLASS_6', anonymous: false }, {}, false), [
      'class-6-math'
    ]);
  });

  await check('row visibility rejects unpublished rows in every scope', () => {
    const unpublished = row({ id: 'x', slug: 'class-6-math', isPublished: false });
    assert.equal(isCatalogRowVisible(unpublished, { kind: 'public' }), false);
    assert.equal(isCatalogRowVisible(unpublished, { kind: 'class', classLevel: 'CLASS_6' }), false);
    assert.equal(isCatalogRowVisible(unpublished, { kind: 'none' }), false);
  });

  // --- Public card fields -----------------------------------------------------

  const PUBLIC_KEYS = [
    'id', 'title', 'slug', 'shortSummary', 'description', 'thumbnailUrl', 'price', 'level',
    'status', 'isPublished', 'instructor', 'category', 'modulesCount', 'lessonsCount',
    'createdAt', 'updatedAt'
  ].sort();

  // A full card as the service builds it, with extra fields that must never leak.
  const fullCard = {
    id: 'course-1',
    title: 'Class 6 Mathematics',
    slug: 'class-6-math',
    shortSummary: 'Numbers',
    description: 'Numbers and patterns',
    thumbnailUrl: null,
    price: 0,
    level: 'BEGINNER',
    status: 'PUBLISHED',
    isPublished: true,
    instructorId: 'user-internal-42',
    instructor: {
      id: 'user-internal-42',
      firstName: 'Asha',
      lastName: 'Rao',
      avatarUrl: null,
      email: 'instructor@example.test',
      clerkUserId: 'user_secret_123'
    },
    category: {
      id: 'cat-1',
      name: 'Mathematics',
      slug: 'mathematics',
      description: 'internal note',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02'
    },
    modulesCount: 3,
    lessonsCount: 12,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02'
  } as unknown as CourseCardDto;

  await check('public card exposes exactly the intended course-card fields', () => {
    assert.deepEqual(Object.keys(toPublicCard(fullCard)).sort(), PUBLIC_KEYS);
  });

  await check('public card hides account identifiers, email and the clerk id', () => {
    const serialised = JSON.stringify(toPublicCard(fullCard));
    for (const hidden of ['user-internal-42', 'instructorId', 'instructor@example.test', 'user_secret_123']) {
      assert.equal(serialised.includes(hidden), false, `public card must not contain ${hidden}`);
    }
    assert.equal('id' in toPublicCard(fullCard).instructor, false, 'instructor id must be hidden');
  });

  await check('public card restricts instructor and category to display fields', () => {
    const card = toPublicCard(fullCard);
    assert.deepEqual(Object.keys(card.instructor).sort(), ['avatarUrl', 'firstName', 'lastName']);
    assert.deepEqual(Object.keys(card.category ?? {}).sort(), ['id', 'name', 'slug']);
  });

  await check('public card keeps the course content fields visible to every visitor', () => {
    const card = toPublicCard(fullCard);
    assert.equal(card.slug, 'class-6-math');
    assert.equal(card.isPublished, true);
    assert.equal(card.modulesCount, 3);
    assert.equal(card.lessonsCount, 12);
  });

  // --- Course detail stays protected -----------------------------------------

  await check('anonymous course detail gate still denies every curriculum course', () => {
    for (const slug of CLASS_CURRICULUM_SLUGS) {
      assert.equal(isCourseVisibleToClass(slug, null), false, `detail must stay closed for ${slug}`);
      assert.equal(isCourseVisibleToClass(slug, undefined), false, `detail must stay closed for ${slug}`);
    }
  });

  // --- Report ---------------------------------------------------------------

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
  }
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
