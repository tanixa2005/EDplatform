import { EnrollmentDto, SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError, ForbiddenError } from '../errors/app.error.js';

export class EnrollmentService {
  /**
   * Enrolls the authenticated user into a published course.
   */
  async enroll(courseId: string, user: SafeUser): Promise<{ isEnrolled: boolean; enrollmentId: string }> {
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      throw new NotFoundError('Course not found');
    }

    if (!course.isPublished && user.role !== 'ADMIN' && course.instructorId !== user.id) {
      throw new ForbiddenError('Cannot enroll in an unpublished course');
    }

    // Check if already enrolled
    const existing = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId
        }
      }
    });

    if (existing) {
      return { isEnrolled: true, enrollmentId: existing.id };
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: user.id,
        courseId
      }
    });

    return { isEnrolled: true, enrollmentId: enrollment.id };
  }

  /**
   * Checks whether the user is enrolled in a given course.
   */
  async checkEnrollmentStatus(courseId: string, userId: string): Promise<{ isEnrolled: boolean; enrolledAt: Date | null }> {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      }
    });

    return {
      isEnrolled: !!enrollment,
      enrolledAt: enrollment ? enrollment.enrolledAt : null
    };
  }

  /**
   * Retrieves all courses enrolled by the current user, along with real calculated progress percentages.
   */
  async getUserEnrollments(userId: string): Promise<EnrollmentDto[]> {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            instructor: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true }
            },
            category: true,
            modules: {
              include: {
                lessons: {
                  where: { isPublished: true },
                  select: { id: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Query user's completed lessons across all enrolled courses
    const allLessonIds = enrollments.flatMap((e) =>
      e.course.modules.flatMap((m) => m.lessons.map((l) => l.id))
    );

    const completedProgressRecords = await prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: allLessonIds },
        isCompleted: true
      },
      select: { lessonId: true }
    });

    const completedSet = new Set(completedProgressRecords.map((r) => r.lessonId));

    return enrollments.map((enrollment) => {
      const course = enrollment.course;
      const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
      const totalLessonsCount = lessonIds.length;
      const completedLessonsCount = lessonIds.filter((id) => completedSet.has(id)).length;
      const progressPercentage =
        totalLessonsCount > 0 ? Math.round((completedLessonsCount / totalLessonsCount) * 100) : 0;

      return {
        id: enrollment.id,
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progressPercentage,
        completedLessonsCount,
        totalLessonsCount,
        course: {
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
          lessonsCount: totalLessonsCount,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt
        }
      };
    });
  }
}

export const enrollmentService = new EnrollmentService();
