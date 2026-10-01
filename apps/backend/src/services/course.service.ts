import {
  CreateCourseInput,
  UpdateCourseInput,
  CourseCardDto,
  CourseDetailDto,
  SafeUser
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/app.error.js';
import { slugify } from '../utils/slug.util.js';

export class CourseService {
  /**
   * Asserts that the user is the instructor owner of the course, or an administrator.
   */
  async assertCourseOwnership(courseId: string, user: SafeUser) {
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      throw new NotFoundError('Course not found');
    }

    if (user.role !== 'ADMIN' && course.instructorId !== user.id) {
      throw new ForbiddenError('You do not have permission to modify this course');
    }

    return course;
  }

  /**
   * Creates a new course. Generates slug automatically if not provided.
   */
  async createCourse(input: CreateCourseInput, instructorId: string): Promise<CourseCardDto> {
    const baseSlug = input.slug || slugify(input.title);
    let uniqueSlug = baseSlug;
    let counter = 1;

    // Ensure slug uniqueness
    while (await prisma.course.findUnique({ where: { slug: uniqueSlug } })) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const course = await prisma.course.create({
      data: {
        title: input.title,
        slug: uniqueSlug,
        shortSummary: input.shortSummary,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl || null,
        price: input.price,
        level: input.level,
        isPublished: input.isPublished ?? false,
        status: input.isPublished ? 'PUBLISHED' : 'DRAFT',
        instructorId,
        categoryId: input.categoryId || null
      },
      include: {
        instructor: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        },
        category: true,
        modules: {
          include: { lessons: true }
        }
      }
    });

    const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      shortSummary: course.shortSummary,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      price: Number(course.price),
      level: course.level,
      status: course.status,
      isPublished: course.isPublished,
      instructorId: course.instructorId,
      instructor: course.instructor,
      category: course.category,
      modulesCount: course.modules.length,
      lessonsCount: totalLessons,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    };
  }

  /**
   * Retrieves all published courses for the public catalog.
   */
  async getPublishedCourses(query?: {
    search?: string;
    level?: string;
    categoryId?: string;
  }): Promise<CourseCardDto[]> {
    const whereClause: Record<string, unknown> = {
      isPublished: true
    };

    if (query?.level) {
      const normalizedLevel = query.level.trim().toUpperCase();
      if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(normalizedLevel)) {
        whereClause.level = normalizedLevel;
      }
    }

    if (query?.categoryId) {
      whereClause.categoryId = query.categoryId;
    }

    if (query?.search) {
      whereClause.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { shortSummary: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    const courses = await prisma.course.findMany({
      where: whereClause,
      include: {
        instructor: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        },
        category: true,
        modules: {
          include: {
            lessons: {
              where: { isPublished: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      shortSummary: course.shortSummary,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      price: Number(course.price),
      level: course.level,
      status: course.status,
      isPublished: course.isPublished,
      instructorId: course.instructorId,
      instructor: course.instructor,
      category: course.category,
      modulesCount: course.modules.length,
      lessonsCount: course.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    }));
  }

  /**
   * Retrieves course by ID or slug. Enforces unpublished course authorization.
   */
  async getCourseByIdOrSlug(idOrSlug: string, currentUser?: SafeUser): Promise<CourseDetailDto> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const course = await prisma.course.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        instructor: true,
        category: true,
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      }
    });

    if (!course) {
      throw new NotFoundError('Course not found');
    }

    // Access check for unpublished courses
    if (!course.isPublished) {
      const isOwner = currentUser?.id === course.instructorId;
      const isAdmin = currentUser?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('This course is not yet published');
      }
    }

    // Check enrollment if user is logged in
    let isEnrolled = false;
    if (currentUser) {
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: currentUser.id,
            courseId: course.id
          }
        }
      });
      isEnrolled = !!enrollment;
    }
    const safeInstructor: SafeUser = {
      id: course.instructor.id,
      email: course.instructor.email,
      firstName: course.instructor.firstName,
      lastName: course.instructor.lastName,
      avatarUrl: course.instructor.avatarUrl,
      bio: course.instructor.bio,
      role: course.instructor.role,
      isActive: course.instructor.isActive,
      createdAt: course.instructor.createdAt,
      updatedAt: course.instructor.updatedAt
    };
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      shortSummary: course.shortSummary,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      price: Number(course.price),
      level: course.level,
      status: course.status,
      isPublished: course.isPublished,
      instructorId: course.instructorId,
      instructor: safeInstructor,
      category: course.category,
      modulesCount: course.modules.length,
      lessonsCount: course.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      modules: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        sortOrder: m.sortOrder,
        courseId: m.courseId,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          slug: l.slug,
          description: l.description,
          type: l.type,
          videoUrl: l.videoUrl,
          videoDuration: l.videoDuration,
          sortOrder: l.sortOrder,
          isFreePreview: l.isFreePreview,
          isPublished: l.isPublished,
          moduleId: l.moduleId
        }))
      })),
      isEnrolled,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    };
  }

  /**
   * Retrieves all courses authored by the instructor.
   */
  async getInstructorCourses(instructorId: string): Promise<CourseCardDto[]> {
    const courses = await prisma.course.findMany({
      where: { instructorId },
      include: {
        instructor: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        },
        category: true,
        modules: {
          include: { lessons: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      shortSummary: course.shortSummary,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      price: Number(course.price),
      level: course.level,
      status: course.status,
      isPublished: course.isPublished,
      instructorId: course.instructorId,
      instructor: course.instructor,
      category: course.category,
      modulesCount: course.modules.length,
      lessonsCount: course.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    }));
  }

  /**
   * Updates an existing course.
   */
  async updateCourse(courseId: string, input: UpdateCourseInput, user: SafeUser): Promise<CourseCardDto> {
    await this.assertCourseOwnership(courseId, user);

    if (input.slug) {
      const existingWithSlug = await prisma.course.findFirst({
        where: { slug: input.slug, NOT: { id: courseId } }
      });
      if (existingWithSlug) {
        throw new ConflictError('A course with this slug already exists');
      }
    }

    const updated = await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(input.title && { title: input.title }),
        ...(input.slug && { slug: input.slug }),
        ...(input.shortSummary !== undefined && { shortSummary: input.shortSummary }),
        ...(input.description && { description: input.description }),
        ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl || null }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.level && { level: input.level }),
        ...(input.isPublished !== undefined && {
          isPublished: input.isPublished,
          status: input.isPublished ? 'PUBLISHED' : 'DRAFT'
        }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId || null })
      },
      include: {
        instructor: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        },
        category: true,
        modules: {
          include: { lessons: true }
        }
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      shortSummary: updated.shortSummary,
      description: updated.description,
      thumbnailUrl: updated.thumbnailUrl,
      price: Number(updated.price),
      level: updated.level,
      status: updated.status,
      isPublished: updated.isPublished,
      instructorId: updated.instructorId,
      instructor: updated.instructor,
      category: updated.category,
      modulesCount: updated.modules.length,
      lessonsCount: updated.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  /**
   * Toggles the published status of a course.
   */
  async setPublishStatus(courseId: string, isPublished: boolean, user: SafeUser): Promise<CourseCardDto> {
    await this.assertCourseOwnership(courseId, user);

    const updated = await prisma.course.update({
      where: { id: courseId },
      data: {
        isPublished,
        status: isPublished ? 'PUBLISHED' : 'DRAFT'
      },
      include: {
        instructor: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        },
        category: true,
        modules: {
          include: { lessons: true }
        }
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      shortSummary: updated.shortSummary,
      description: updated.description,
      thumbnailUrl: updated.thumbnailUrl,
      price: Number(updated.price),
      level: updated.level,
      status: updated.status,
      isPublished: updated.isPublished,
      instructorId: updated.instructorId,
      instructor: updated.instructor,
      category: updated.category,
      modulesCount: updated.modules.length,
      lessonsCount: updated.modules.reduce((acc, m) => acc + m.lessons.length, 0),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  /**
   * Deletes a course.
   */
  async deleteCourse(courseId: string, user: SafeUser): Promise<void> {
    await this.assertCourseOwnership(courseId, user);
    await prisma.course.delete({
      where: { id: courseId }
    });
  }
}

export const courseService = new CourseService();
