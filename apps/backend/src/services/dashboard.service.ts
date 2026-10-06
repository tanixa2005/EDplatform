import {
  StudentDashboardDto,
  StudentProgressOverviewDto,
  StudentRecentActivityDto,
  StudentQuizAttemptSummaryDto,
  ContinueLearningLessonDto,
  StudentCourseProgressDto,
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';

export class DashboardService {
  // ==========================================
  // 1. STUDENT DASHBOARD & ANALYTICS
  // ==========================================

  /**
   * Retrieves complete student dashboard metrics, course progress, continue learning, and activity.
   */
  public async getStudentDashboard(userId: string): Promise<StudentDashboardDto> {
    // 1. Fetch user's enrollments with course structure
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            modules: {
              orderBy: { sortOrder: 'asc' },
              include: {
                lessons: {
                  where: { isPublished: true },
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    sortOrder: true,
                    videoDuration: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    // 2. Fetch user's lesson progress
    const lessonProgressList = await prisma.lessonProgress.findMany({
      where: { userId },
      select: {
        lessonId: true,
        isCompleted: true,
        lastPositionSeconds: true,
        coveragePercentage: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const progressMap = new Map(lessonProgressList.map((lp) => [lp.lessonId, lp]));

    // 3. Process each course progress & determine Continue Learning
    const coursesProgress: StudentCourseProgressDto[] = [];
    const continueLearningList: ContinueLearningLessonDto[] = [];

    let completedCoursesCount = 0;

    for (const enrollment of enrollments) {
      const course = enrollment.course;
      const allPublishedLessons: Array<{
        id: string;
        title: string;
        sortOrder: number;
        moduleTitle: string;
      }> = [];

      for (const mod of course.modules) {
        for (const les of mod.lessons) {
          allPublishedLessons.push({
            id: les.id,
            title: les.title,
            sortOrder: les.sortOrder,
            moduleTitle: mod.title,
          });
        }
      }

      const totalPublished = allPublishedLessons.length;
      let completedLessons = 0;

      for (const les of allPublishedLessons) {
        if (progressMap.get(les.id)?.isCompleted) {
          completedLessons++;
        }
      }

      const progressPercentage =
        totalPublished > 0 ? Math.round((completedLessons / totalPublished) * 100) : 0;

      const isCourseCompleted = totalPublished > 0 && completedLessons === totalPublished;
      if (isCourseCompleted) {
        completedCoursesCount++;
      }

      // Determine Continue Learning lesson
      let continueLessonDto: ContinueLearningLessonDto | null = null;

      if (totalPublished > 0) {
        const incompleteLessons = allPublishedLessons.filter(
          (l) => !progressMap.get(l.id)?.isCompleted
        );

        if (incompleteLessons.length > 0) {
          // Check for most recently accessed incomplete lesson
          let mostRecentIncomplete: (typeof incompleteLessons)[0] | null = null;
          let mostRecentDate = 0;

          for (const inc of incompleteLessons) {
            const p = progressMap.get(inc.id);
            if (p && p.updatedAt) {
              const time = new Date(p.updatedAt).getTime();
              if (time > mostRecentDate) {
                mostRecentDate = time;
                mostRecentIncomplete = inc;
              }
            }
          }

          const target = mostRecentIncomplete || incompleteLessons[0];
          const targetProgress = progressMap.get(target.id);

          continueLessonDto = {
            lessonId: target.id,
            lessonTitle: target.title,
            moduleTitle: target.moduleTitle,
            courseId: course.id,
            courseTitle: course.title,
            courseSlug: course.slug,
            sortOrder: target.sortOrder,
            coveragePercentage: targetProgress?.coveragePercentage || 0,
            isCompleted: targetProgress?.isCompleted || false,
            lastPositionSeconds: targetProgress?.lastPositionSeconds || 0,
          };
        } else {
          // All lessons completed - review first lesson
          const firstLesson = allPublishedLessons[0];
          const firstProgress = progressMap.get(firstLesson.id);

          continueLessonDto = {
            lessonId: firstLesson.id,
            lessonTitle: firstLesson.title,
            moduleTitle: firstLesson.moduleTitle,
            courseId: course.id,
            courseTitle: course.title,
            courseSlug: course.slug,
            sortOrder: firstLesson.sortOrder,
            coveragePercentage: firstProgress?.coveragePercentage || 100,
            isCompleted: true,
            lastPositionSeconds: 0,
          };
        }
      }

      if (continueLessonDto && !isCourseCompleted) {
        continueLearningList.push(continueLessonDto);
      }

      coursesProgress.push({
        courseId: course.id,
        courseTitle: course.title,
        courseSlug: course.slug,
        thumbnailUrl: course.thumbnailUrl,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
        totalPublishedLessons: totalPublished,
        completedLessons,
        progressPercentage,
        isCompleted: isCourseCompleted,
        continueLesson: continueLessonDto,
      });
    }

    // 4. Fetch quiz performance
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { userId, status: 'SUBMITTED' },
      include: {
        quiz: {
          include: {
            lesson: {
              include: {
                module: {
                  include: {
                    course: true,
                  },
                },
              },
            },
            module: {
              include: {
                course: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });

    const recentQuizAttempts: StudentQuizAttemptSummaryDto[] = quizAttempts.map((att) => {
      const course = att.quiz.lesson?.module.course || att.quiz.module?.course;
      return {
        attemptId: att.id,
        quizId: att.quizId,
        quizTitle: att.quiz.title,
        courseTitle: course?.title || 'Course Quiz',
        courseSlug: course?.slug || '',
        lessonId: att.quiz.lessonId || undefined,
        score: att.score,
        percentage: Number(att.percentage),
        isPassed: att.isPassed,
        startedAt: att.startedAt.toISOString(),
        submittedAt: att.submittedAt ? att.submittedAt.toISOString() : null,
      };
    });

    const quizzesAttempted = quizAttempts.length;
    const quizzesPassed = quizAttempts.filter((a) => a.isPassed).length;
    const averageQuizPercentage =
      quizzesAttempted > 0
        ? Math.round(
            quizAttempts.reduce((acc, a) => acc + Number(a.percentage), 0) / quizzesAttempted
          )
        : 0;

    // 5. Calculate summary metrics
    const totalLessonsCompleted = Array.from(progressMap.values()).filter((p) => p.isCompleted).length;
    const totalLessonsInProgress = Array.from(progressMap.values()).filter(
      (p) => !p.isCompleted && (p.coveragePercentage > 0 || p.lastPositionSeconds > 0)
    ).length;

    // 6. Recent learning activities
    const recentActivities: StudentRecentActivityDto[] = [];

    // Add recent quiz attempts to activity feed
    for (const att of recentQuizAttempts.slice(0, 5)) {
      recentActivities.push({
        id: `quiz-${att.attemptId}`,
        type: 'QUIZ_ATTEMPT',
        title: `Attempted Quiz: ${att.quizTitle}`,
        subtitle: `Scored ${att.percentage}% (${att.isPassed ? 'Passed' : 'Failed'})`,
        courseTitle: att.courseTitle,
        courseSlug: att.courseSlug,
        timestamp: att.submittedAt || att.startedAt,
      });
    }

    // Add recent enrollments
    for (const enr of enrollments.slice(0, 5)) {
      recentActivities.push({
        id: `enr-${enr.id}`,
        type: 'COURSE_ENROLLED',
        title: `Enrolled in Course`,
        subtitle: `Started learning ${enr.course.title}`,
        courseTitle: enr.course.title,
        courseSlug: enr.course.slug,
        timestamp: enr.enrolledAt.toISOString(),
      });
    }

    // Sort combined activities by timestamp desc
    recentActivities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      summary: {
        totalEnrolledCourses: enrollments.length,
        completedCourses: completedCoursesCount,
        totalLessonsCompleted,
        totalLessonsInProgress,
        quizzesAttempted,
        quizzesPassed,
        averageQuizPercentage,
      },
      courses: coursesProgress,
      recentActivities: recentActivities.slice(0, 10),
      recentQuizAttempts,
      continueLearning: continueLearningList.slice(0, 5),
    };
  }

  /**
   * Retrieves enrolled courses progress and continue learning details for student.
   */
  public async getStudentProgress(userId: string): Promise<StudentProgressOverviewDto> {
    const dashboard = await this.getStudentDashboard(userId);
    const totalEnrolled = dashboard.courses.length;
    const totalCompleted = dashboard.summary.completedCourses;
    const overallAverageProgress =
      totalEnrolled > 0
        ? Math.round(
            dashboard.courses.reduce((acc, c) => acc + c.progressPercentage, 0) / totalEnrolled
          )
        : 0;

    return {
      courses: dashboard.courses,
      totalEnrolled,
      totalCompleted,
      overallAverageProgress,
    };
  }

  /**
   * Retrieves student recent learning activity stream.
   */
  public async getStudentActivity(userId: string): Promise<StudentRecentActivityDto[]> {
    const dashboard = await this.getStudentDashboard(userId);
    return dashboard.recentActivities;
  }

  /**
   * Retrieves student quiz performance history.
   */
  public async getStudentQuizPerformance(
    userId: string
  ): Promise<StudentQuizAttemptSummaryDto[]> {
    const dashboard = await this.getStudentDashboard(userId);
    return dashboard.recentQuizAttempts;
  }
}

export const dashboardService = new DashboardService();
