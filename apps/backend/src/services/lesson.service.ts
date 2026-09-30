import { CreateLessonInput, UpdateLessonInput, ReorderItemsInput, LessonSummaryDto, SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError, ForbiddenError } from '../errors/app.error.js';
import { courseService } from './course.service.js';
import { slugify } from '../utils/slug.util.js';
import { videoService } from './video/video.service.js';

export class LessonService {
  /**
   * Creates a new lesson in a module.
   */
  async createLesson(moduleId: string, input: CreateLessonInput, user: SafeUser): Promise<LessonSummaryDto> {
    const parentModule = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: true }
    });

    if (!parentModule) {
      throw new NotFoundError('Module not found');
    }

    await courseService.assertCourseOwnership(parentModule.courseId, user);

    const baseSlug = input.slug || slugify(input.title);
    let uniqueSlug = baseSlug;
    let counter = 1;

    while (
      await prisma.lesson.findUnique({
        where: {
          moduleId_slug: {
            moduleId,
            slug: uniqueSlug
          }
        }
      })
    ) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    let sortOrder = input.sortOrder;
    if (!sortOrder) {
      const highestOrderLesson = await prisma.lesson.findFirst({
        where: { moduleId },
        orderBy: { sortOrder: 'desc' }
      });
      sortOrder = (highestOrderLesson?.sortOrder ?? -1) + 1;
    }

    const lesson = await prisma.lesson.create({
      data: {
        title: input.title,
        slug: uniqueSlug,
        description: input.description,
        type: input.type,
        content: input.content,
        videoUrl: input.videoUrl || null,
        videoDuration: input.videoDuration || null,
        sortOrder,
        isFreePreview: input.isFreePreview ?? false,
        isPublished: input.isPublished ?? true,
        moduleId
      }
    });

    return {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      type: lesson.type,
      videoUrl: lesson.videoUrl,
      videoDuration: lesson.videoDuration,
      sortOrder: lesson.sortOrder,
      isFreePreview: lesson.isFreePreview,
      isPublished: lesson.isPublished,
      moduleId: lesson.moduleId
    };
  }

  /**
   * Retrieves a single lesson by ID with content and resolved video playback.
   * Enforces enrollment verification or free preview access.
   */
  async getLessonById(lessonId: string, currentUser?: SafeUser) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: {
              include: {
                modules: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    lessons: {
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        id: true,
                        title: true,
                        slug: true,
                        sortOrder: true,
                        type: true,
                        videoDuration: true,
                        isFreePreview: true,
                        isPublished: true,
                        moduleId: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        resources: true
      }
    });

    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    const course = lesson.module.course;

    // Check authorization:
    // 1. Instructor owner or admin can always view
    const isOwner = currentUser?.id === course.instructorId;
    const isAdmin = currentUser?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      // 2. Free preview allows public/student view
      if (!lesson.isFreePreview) {
        if (!currentUser) {
          throw new ForbiddenError('You must sign in and enroll in this course to view this lesson');
        }

        const enrollment = await prisma.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: currentUser.id,
              courseId: course.id
            }
          }
        });

        if (!enrollment) {
          throw new ForbiddenError('You must be enrolled in this course to view this lesson');
        }
      }
    }

    // Resolve video playback abstraction
    let playbackDetails = null;
    if (lesson.videoUrl) {
      playbackDetails = await videoService.getPlayback(lesson.videoUrl);
    }

    // Find previous and next lessons
    const allLessons = course.modules.flatMap((m) => m.lessons);
    const currentIndex = allLessons.findIndex((l) => l.id === lesson.id);
    const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
    const nextLesson = currentIndex >= 0 && currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

    return {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      type: lesson.type,
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      videoDuration: lesson.videoDuration,
      sortOrder: lesson.sortOrder,
      isFreePreview: lesson.isFreePreview,
      isPublished: lesson.isPublished,
      moduleId: lesson.moduleId,
      courseId: course.id,
      courseTitle: course.title,
      courseSlug: course.slug,
      playback: playbackDetails,
      resources: lesson.resources,
      prevLesson: prevLesson ? { id: prevLesson.id, title: prevLesson.title } : null,
      nextLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title } : null,
      courseNavigation: course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          sortOrder: l.sortOrder,
          videoDuration: l.videoDuration,
          isFreePreview: l.isFreePreview
        }))
      }))
    };
  }

  /**
   * Updates an existing lesson.
   */
  async updateLesson(lessonId: string, input: UpdateLessonInput, user: SafeUser): Promise<LessonSummaryDto> {
    const existing = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } }
    });

    if (!existing) {
      throw new NotFoundError('Lesson not found');
    }

    await courseService.assertCourseOwnership(existing.module.courseId, user);

    const updated = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(input.title && { title: input.title }),
        ...(input.slug && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.type && { type: input.type }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.videoUrl !== undefined && { videoUrl: input.videoUrl || null }),
        ...(input.videoDuration !== undefined && { videoDuration: input.videoDuration }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isFreePreview !== undefined && { isFreePreview: input.isFreePreview }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished })
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      description: updated.description,
      type: updated.type,
      videoUrl: updated.videoUrl,
      videoDuration: updated.videoDuration,
      sortOrder: updated.sortOrder,
      isFreePreview: updated.isFreePreview,
      isPublished: updated.isPublished,
      moduleId: updated.moduleId
    };
  }

  /**
   * Deletes a lesson.
   */
  async deleteLesson(lessonId: string, user: SafeUser): Promise<void> {
    const existing = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } }
    });

    if (!existing) {
      throw new NotFoundError('Lesson not found');
    }

    await courseService.assertCourseOwnership(existing.module.courseId, user);

    await prisma.lesson.delete({
      where: { id: lessonId }
    });
  }

  /**
   * Reorders lessons within a module.
   */
  async reorderLessons(moduleId: string, input: ReorderItemsInput, user: SafeUser): Promise<void> {
    const parentModule = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: true }
    });

    if (!parentModule) {
      throw new NotFoundError('Module not found');
    }

    await courseService.assertCourseOwnership(parentModule.courseId, user);

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.lesson.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder }
        })
      )
    );
  }
}

export const lessonService = new LessonService();
