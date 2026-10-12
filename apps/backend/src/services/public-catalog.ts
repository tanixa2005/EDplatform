import {
  CLASS_COURSE_SLUGS,
  isCourseVisibleToClass,
  PUBLIC_CATALOG_SLUGS,
  type ClassLevel,
  type CourseCardDto
} from '@edplatform/shared';

/**
 * Course-catalogue selection, kept free of Prisma so it can be tested offline.
 *
 * Three scopes, decided only by the caller's verified state:
 *  - class:  a signed-in student with a saved class level sees that class's courses.
 *  - public: an anonymous visitor sees the Class 6-8 curriculum courses, nothing else.
 *  - none:   a signed-in user with no class level sees nothing (fails closed).
 *
 * Every scope requires isPublished = true. Unpublished rows, legacy courses and
 * unknown slugs never reach the response, even if the database returns them.
 */

export type CatalogScope =
  | { kind: 'class'; classLevel: ClassLevel }
  | { kind: 'public' }
  | { kind: 'none' };

export interface CatalogFilters {
  search?: string;
  level?: string;
  categoryId?: string;
}

export interface CatalogScopeInput {
  /** Taken from the signed-in student's stored profile only, never from the request. */
  classLevel?: ClassLevel | null;
  /** True when the request carries no verified user. */
  anonymous: boolean;
}

export interface CatalogRow {
  slug: string;
  isPublished: boolean;
}

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

export function catalogScope(input: CatalogScopeInput): CatalogScope {
  if (input.classLevel) return { kind: 'class', classLevel: input.classLevel };
  if (input.anonymous) return { kind: 'public' };
  return { kind: 'none' };
}

/** The slugs a scope may show, or null when the scope shows nothing. */
export function allowedSlugs(scope: CatalogScope): readonly string[] | null {
  if (scope.kind === 'class') return CLASS_COURSE_SLUGS[scope.classLevel] ?? [];
  if (scope.kind === 'public') return PUBLIC_CATALOG_SLUGS;
  return null;
}

/** Builds the database filter for a scope. Returns null when nothing may be queried. */
export function buildCatalogWhere(
  filters: CatalogFilters,
  scope: CatalogScope
): Record<string, unknown> | null {
  const slugs = allowedSlugs(scope);
  if (slugs === null) return null;

  const where: Record<string, unknown> = {
    isPublished: true,
    slug: { in: [...slugs] }
  };

  if (filters.level) {
    const normalizedLevel = filters.level.trim().toUpperCase();
    if ((LEVELS as readonly string[]).includes(normalizedLevel)) {
      where.level = normalizedLevel;
    }
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { shortSummary: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  return where;
}

/**
 * Last line of defence after the query: a row must be published and approved
 * for the scope, whatever the database returned.
 */
export function isCatalogRowVisible(row: CatalogRow, scope: CatalogScope): boolean {
  if (!row.isPublished) return false;
  if (scope.kind === 'class') return isCourseVisibleToClass(row.slug, scope.classLevel);
  if (scope.kind === 'public') return PUBLIC_CATALOG_SLUGS.includes(row.slug);
  return false;
}

/**
 * A course card as an anonymous visitor may see it. Built from an explicit list
 * of fields, so a field added to the card later stays hidden until it is listed here.
 * It omits account identifiers (the instructor's user id and instructorId) and
 * restricts the instructor and category to display fields.
 */
export type PublicCourseCard = Omit<CourseCardDto, 'instructorId' | 'instructor' | 'category'> & {
  instructor: { firstName: string; lastName: string; avatarUrl: string | null };
  category: { id: string; name: string; slug: string } | null;
};

/** The card a caller receives: the full card for signed-in scopes, the public card otherwise. */
export type CatalogCard = CourseCardDto | PublicCourseCard;

export function toPublicCard(card: CourseCardDto): PublicCourseCard {
  return {
    id: card.id,
    title: card.title,
    slug: card.slug,
    shortSummary: card.shortSummary,
    description: card.description,
    thumbnailUrl: card.thumbnailUrl,
    price: card.price,
    level: card.level,
    status: card.status,
    isPublished: card.isPublished,
    instructor: {
      firstName: card.instructor.firstName,
      lastName: card.instructor.lastName,
      avatarUrl: card.instructor.avatarUrl
    },
    category: card.category
      ? { id: card.category.id, name: card.category.name, slug: card.category.slug }
      : null,
    modulesCount: card.modulesCount,
    lessonsCount: card.lessonsCount,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  };
}

/**
 * Runs the catalogue query for a scope and keeps only visible rows. The query
 * function receives the filter and returns rows; with scope 'none' it is never called.
 */
export async function selectCatalogCourses<T extends CatalogRow>(
  input: CatalogScopeInput,
  filters: CatalogFilters,
  findMany: (where: Record<string, unknown>) => Promise<T[]>
): Promise<T[]> {
  const scope = catalogScope(input);
  const where = buildCatalogWhere(filters, scope);
  if (where === null) return [];

  const rows = await findMany(where);
  return rows.filter((row) => isCatalogRowVisible(row, scope));
}
