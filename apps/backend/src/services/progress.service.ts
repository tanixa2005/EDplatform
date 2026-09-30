import {
  UpdateProgressInput,
  LessonProgressDto,
  calculateMeaningfulPlaybackCoverage,
  WatchedInterval
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError } from '../errors/app.error.js';
import { Prisma } from '@prisma/client';

export class ProgressService {
  /**
   * Saves or updates lesson progress using non-overlapping watched interval calculation.
   * Prevents cheating by seeking straight to 90%+.
   */
  async updateProgress(input: UpdateProgressInput, userId: string): Promise<LessonProgressDto> {
    const lesson = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      include: {
        module: {
          select: { courseId: true }
        }
      }
    });

    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    // 1. Retrieve existing progress record
    const existing = await prisma.lessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId: input.lessonId
        }
      }
    });

    let existingIntervals: WatchedInterval[] = [];
    if (existing?.watchedIntervalsJson && Array.isArray(existing.watchedIntervalsJson)) {
      existingIntervals = existing.watchedIntervalsJson as unknown as WatchedInterval[];
    }

    // 2. Combine and compute non-redundant coverage
    const combinedIntervals = [...existingIntervals, ...input.watchedIntervals];
    const totalDuration = input.totalDurationSeconds || lesson.videoDuration || 0;

    const { coveragePercentage, isEligibleForCompletion } = calculateMeaningfulPlaybackCoverage(
      combinedIntervals,
      totalDuration
    );

    // Determine completion status
    let isCompleted = existing?.isCompleted || false;

    if (lesson.type === 'VIDEO') {
      // Must have watched at least 90% non-redundant coverage
      if (isEligibleForCompletion) {
        isCompleted = true;
      }
    } else if (lesson.type === 'TEXT') {
      // Text lessons can be marked complete on explicit user request
      if (input.forceComplete) {
        isCompleted = true;
      }
    }

    // 3. Upsert progress record
    const updated = await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId,
          lessonId: input.lessonId
        }
      },
      create: {
        userId,
        lessonId: input.lessonId,
        lastPositionSeconds: input.lastPositionSeconds,
        coveragePercentage,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        watchedIntervalsJson: combinedIntervals as unknown as Prisma.InputJsonValue
      },
      update: {
        lastPositionSeconds: input.lastPositionSeconds,
        coveragePercentage: Math.max(existing?.coveragePercentage || 0, coveragePercentage),
        isCompleted,
        completedAt: isCompleted && !existing?.completedAt ? new Date() : existing?.completedAt,
        watchedIntervalsJson: combinedIntervals as unknown as Prisma.InputJsonValue
      }
    });

    // 4. If lesson was completed, check if entire course is now completed
    if (isCompleted) {
      const courseId = lesson.module.courseId;
      const allCourseLessons = await prisma.lesson.findMany({
        where: {
          module: { courseId },
          isPublished: true
        },
        select: { id: true }
      });

      const allProgress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          lessonId: { in: allCourseLessons.map((l) => l.id) },
          isCompleted: true
        }
      });

      if (allProgress.length >= allCourseLessons.length && allCourseLessons.length > 0) {
        await prisma.enrollment.updateMany({
          where: {
            userId,
            courseId,
            completedAt: null
          },
          data: {
            completedAt: new Date()
          }
        });
      }
    }

    return {
      lessonId: updated.lessonId,
      isCompleted: updated.isCompleted,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      lastPositionSeconds: updated.lastPositionSeconds,
      coveragePercentage: updated.coveragePercentage
    };
  }

  /**
   * Retrieves user's progress for a single lesson.
   */
  async getLessonProgress(lessonId: string, userId: string): Promise<LessonProgressDto | null> {
    const progress = await prisma.lessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId
        }
      }
    });

    if (!progress) return null;

    return {
      lessonId: progress.lessonId,
      isCompleted: progress.isCompleted,
      completedAt: progress.completedAt ? progress.completedAt.toISOString() : null,
      lastPositionSeconds: progress.lastPositionSeconds,
      coveragePercentage: progress.coveragePercentage
    };
  }

  /**
   * Retrieves user's progress summary for an entire course.
   */
  async getCourseProgress(courseId: string, userId: string) {
    const courseLessons = await prisma.lesson.findMany({
      where: {
        module: { courseId },
        isPublished: true
      },
      select: { id: true }
    });

    const lessonIds = courseLessons.map((l) => l.id);

    const progressRecords = await prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessonIds }
      }
    });

    const completedLessonIds = progressRecords.filter((r) => r.isCompleted).map((r) => r.lessonId);
    const totalLessons = lessonIds.length;
    const progressPercentage =
      totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0;

    return {
      courseId,
      totalLessons,
      completedLessonsCount: completedLessonIds.length,
      progressPercentage,
      completedLessonIds,
      progressRecords: progressRecords.map((r) => ({
        lessonId: r.lessonId,
        isCompleted: r.isCompleted,
        lastPositionSeconds: r.lastPositionSeconds,
        coveragePercentage: r.coveragePercentage
      }))
    };
  }
}

export const progressService = new ProgressService();
