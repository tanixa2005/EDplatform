import {
  StudentDashboardDto,
  StudentProgressOverviewDto,
  StudentRecentActivityDto,
  StudentQuizAttemptSummaryDto,
  ContinueLearningLessonDto,
  StudentCourseProgressDto,
  InstructorDashboardDto,
  InstructorCourseMetricsDto,
  InstructorSingleCourseDetailAnalyticsDto,
  InstructorStudentInCourseDto,
  InstructorCourseQuizAnalyticsDto,
  InstructorRecentEnrollmentDto,
  AdminDashboardDto,
  AdminUserSummaryDto,
  AdminCourseSummaryDto,
  AdminPlatformActivityDto,
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError, ForbiddenError } from '../errors/app.error.js';

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

  // ==========================================
  // 2. INSTRUCTOR DASHBOARD & ANALYTICS
  // ==========================================

  /**
   * Retrieves aggregate dashboard metrics and course breakdowns for an instructor.
   */
  public async getInstructorDashboard(instructorId: string): Promise<InstructorDashboardDto> {
    // 1. Fetch instructor's courses with enrollments and structure
    const courses = await prisma.course.findMany({
      where: { instructorId },
      include: {
        enrollments: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        modules: {
          include: {
            lessons: {
              where: { isPublished: true },
              select: { id: true },
            },
            quizzes: {
              include: {
                attempts: {
                  where: { status: 'SUBMITTED' },
                  select: { percentage: true, isPassed: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalCourses = courses.length;
    const publishedCourses = courses.filter((c) => c.isPublished).length;
    const draftCourses = courses.filter((c) => !c.isPublished).length;

    let totalEnrolledStudents = 0;
    let totalProgressSum = 0;
    let totalProgressCount = 0;
    let totalQuizAttempts = 0;
    let totalQuizScoreSum = 0;

    const courseMetricsList: InstructorCourseMetricsDto[] = [];
    const recentEnrollments: InstructorRecentEnrollmentDto[] = [];

    // Fetch all lesson progress across instructor's lessons in one query
    const allLessonIds = courses.flatMap((c) =>
      c.modules.flatMap((m) => m.lessons.map((l) => l.id))
    );

    const lessonProgresses = await prisma.lessonProgress.findMany({
      where: {
        lessonId: { in: allLessonIds },
        isCompleted: true,
      },
      select: {
        userId: true,
        lessonId: true,
      },
    });

    // Map: userId -> Set of completed lessonIds
    const userCompletedLessons = new Map<string, Set<string>>();
    for (const lp of lessonProgresses) {
      if (!userCompletedLessons.has(lp.userId)) {
        userCompletedLessons.set(lp.userId, new Set());
      }
      userCompletedLessons.get(lp.userId)!.add(lp.lessonId);
    }

    for (const course of courses) {
      const courseLessonIds = new Set(
        course.modules.flatMap((m) => m.lessons.map((l) => l.id))
      );
      const publishedLessonCount = courseLessonIds.size;
      const enrollmentCount = course.enrollments.length;
      totalEnrolledStudents += enrollmentCount;

      let courseCompletions = 0;
      let courseProgressSum = 0;

      for (const enr of course.enrollments) {
        const userCompleted = userCompletedLessons.get(enr.userId);
        let completedInCourse = 0;
        if (userCompleted) {
          for (const lId of courseLessonIds) {
            if (userCompleted.has(lId)) {
              completedInCourse++;
            }
          }
        }

        const pct =
          publishedLessonCount > 0
            ? Math.round((completedInCourse / publishedLessonCount) * 100)
            : 0;

        courseProgressSum += pct;
        if (pct === 100 && publishedLessonCount > 0) {
          courseCompletions++;
        }

        // Add to recent enrollments
        if (recentEnrollments.length < 15) {
          recentEnrollments.push({
            enrollmentId: enr.id,
            courseId: course.id,
            courseTitle: course.title,
            studentName: `${enr.user.firstName} ${enr.user.lastName}`,
            studentEmail: enr.user.email,
            enrolledAt: enr.enrolledAt.toISOString(),
            progressPercentage: pct,
          });
        }
      }

      const avgCourseProgress =
        enrollmentCount > 0 ? Math.round(courseProgressSum / enrollmentCount) : 0;

      if (enrollmentCount > 0) {
        totalProgressSum += courseProgressSum;
        totalProgressCount += enrollmentCount;
      }

      // Quiz stats for course
      const courseQuizzes = course.modules.flatMap((m) => m.quizzes);
      const quizCount = courseQuizzes.length;
      const allAttempts = courseQuizzes.flatMap((q) => q.attempts);
      const quizAttemptsCount = allAttempts.length;
      totalQuizAttempts += quizAttemptsCount;

      const courseQuizScoreSum = allAttempts.reduce(
        (sum, a) => sum + Number(a.percentage),
        0
      );
      totalQuizScoreSum += courseQuizScoreSum;

      const averageQuizScore =
        quizAttemptsCount > 0 ? Math.round(courseQuizScoreSum / quizAttemptsCount) : 0;

      courseMetricsList.push({
        courseId: course.id,
        title: course.title,
        slug: course.slug,
        thumbnailUrl: course.thumbnailUrl,
        isPublished: course.isPublished,
        createdAt: course.createdAt.toISOString(),
        enrollmentCount,
        publishedLessonCount,
        averageProgress: avgCourseProgress,
        completionCount: courseCompletions,
        quizCount,
        quizAttemptsCount,
        averageQuizScore,
      });
    }

    const averageCourseCompletion =
      totalProgressCount > 0 ? Math.round(totalProgressSum / totalProgressCount) : 0;
    const averageQuizPercentage =
      totalQuizAttempts > 0 ? Math.round(totalQuizScoreSum / totalQuizAttempts) : 0;

    // Sort recent enrollments by date
    recentEnrollments.sort(
      (a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()
    );

    return {
      summary: {
        totalCourses,
        publishedCourses,
        draftCourses,
        totalEnrolledStudents,
        averageCourseCompletion,
        totalQuizAttempts,
        averageQuizPercentage,
      },
      courses: courseMetricsList,
      recentEnrollments: recentEnrollments.slice(0, 10),
    };
  }

  /**
   * Retrieves single course analytics for the instructor, verifying ownership.
   */
  public async getInstructorCourseDetail(
    instructorId: string,
    courseId: string,
    isAdmin = false
  ): Promise<InstructorSingleCourseDetailAnalyticsDto> {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true },
            },
            quizzes: {
              include: {
                lesson: { select: { title: true } },
                attempts: {
                  where: { status: 'SUBMITTED' },
                  select: {
                    userId: true,
                    percentage: true,
                    isPassed: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundError('Course not found');
    }

    if (!isAdmin && course.instructorId !== instructorId) {
      throw new ForbiddenError('You do not have permission to view analytics for this course');
    }

    const publishedLessonIds = new Set(
      course.modules.flatMap((m) => m.lessons.map((l) => l.id))
    );
    const totalLessons = publishedLessonIds.size;

    // Fetch completed lesson progress
    const completedProgress = await prisma.lessonProgress.findMany({
      where: {
        lessonId: { in: Array.from(publishedLessonIds) },
        isCompleted: true,
      },
      select: { userId: true, lessonId: true },
    });

    const userCompletedMap = new Map<string, Set<string>>();
    for (const cp of completedProgress) {
      if (!userCompletedMap.has(cp.userId)) {
        userCompletedMap.set(cp.userId, new Set());
      }
      userCompletedMap.get(cp.userId)!.add(cp.lessonId);
    }

    // Fetch quiz attempts for this course
    const allQuizzes = course.modules.flatMap((m) => m.quizzes);
    const quizIds = allQuizzes.map((q) => q.id);

    const quizAttempts = await prisma.quizAttempt.findMany({
      where: {
        quizId: { in: quizIds },
        status: 'SUBMITTED',
      },
      select: {
        userId: true,
        percentage: true,
      },
    });

    const userQuizAttemptsMap = new Map<string, number[]>();
    for (const qa of quizAttempts) {
      if (!userQuizAttemptsMap.has(qa.userId)) {
        userQuizAttemptsMap.set(qa.userId, []);
      }
      userQuizAttemptsMap.get(qa.userId)!.push(Number(qa.percentage));
    }

    // Build student list
    const students: InstructorStudentInCourseDto[] = course.enrollments.map((enr) => {
      const userCompleted = userCompletedMap.get(enr.userId);
      const completedCount = userCompleted ? userCompleted.size : 0;
      const progressPct =
        totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

      const scores = userQuizAttemptsMap.get(enr.userId) || [];
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
          : 0;

      return {
        enrollmentId: enr.id,
        studentId: enr.user.id,
        studentName: `${enr.user.firstName} ${enr.user.lastName}`,
        studentEmail: enr.user.email,
        enrolledAt: enr.enrolledAt.toISOString(),
        completedAt: enr.completedAt ? enr.completedAt.toISOString() : null,
        progressPercentage: progressPct,
        completedLessonsCount: completedCount,
        totalCourseLessons: totalLessons,
        quizAttemptsCount: scores.length,
        averageQuizScore: avgScore,
      };
    });

    // Build quiz analytics
    const quizzes: InstructorCourseQuizAnalyticsDto[] = allQuizzes.map((quiz) => {
      const attempts = quiz.attempts;
      const totalAttempts = attempts.length;
      const uniqueStudents = new Set(attempts.map((a) => a.userId)).size;
      const passedCount = attempts.filter((a) => a.isPassed).length;
      const passRate =
        totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100) : 0;

      const scores = attempts.map((a) => Number(a.percentage));
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
          : 0;
      const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
      const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

      return {
        quizId: quiz.id,
        quizTitle: quiz.title,
        lessonTitle: quiz.lesson?.title || null,
        passingScore: quiz.passingScore,
        totalAttempts,
        uniqueStudentsAttempted: uniqueStudents,
        passRate,
        averageScore: avgScore,
        highestScore,
        lowestScore,
      };
    });

    const completionCount = students.filter((s) => s.progressPercentage === 100).length;
    const avgProgress =
      students.length > 0
        ? Math.round(
            students.reduce((sum, s) => sum + s.progressPercentage, 0) / students.length
          )
        : 0;
    const avgQuizScore =
      quizzes.length > 0
        ? Math.round(quizzes.reduce((sum, q) => sum + q.averageScore, 0) / quizzes.length)
        : 0;

    const courseMetrics: InstructorCourseMetricsDto = {
      courseId: course.id,
      title: course.title,
      slug: course.slug,
      thumbnailUrl: course.thumbnailUrl,
      isPublished: course.isPublished,
      createdAt: course.createdAt.toISOString(),
      enrollmentCount: course.enrollments.length,
      publishedLessonCount: totalLessons,
      averageProgress: avgProgress,
      completionCount,
      quizCount: quizzes.length,
      quizAttemptsCount: quizAttempts.length,
      averageQuizScore: avgQuizScore,
    };

    return {
      course: courseMetrics,
      students,
      quizzes,
    };
  }

  /**
   * Retrieves enrolled students with course progress.
   */
  public async getInstructorCourseStudents(
    instructorId: string,
    courseId: string,
    isAdmin = false
  ): Promise<InstructorStudentInCourseDto[]> {
    const detail = await this.getInstructorCourseDetail(instructorId, courseId, isAdmin);
    return detail.students;
  }

  /**
   * Retrieves course quiz analytics for instructor.
   */
  public async getInstructorCourseQuizzes(
    instructorId: string,
    courseId: string,
    isAdmin = false
  ): Promise<InstructorCourseQuizAnalyticsDto[]> {
    const detail = await this.getInstructorCourseDetail(instructorId, courseId, isAdmin);
    return detail.quizzes;
  }

  // ==========================================
  // 3. ADMIN DASHBOARD & ANALYTICS
  // ==========================================

  /**
   * Retrieves platform-level summary statistics and recent platform events.
   */
  public async getAdminDashboard(): Promise<AdminDashboardDto> {
    // 1. Prisma count aggregations
    const [
      totalUsers,
      totalStudents,
      totalInstructors,
      totalAdmins,
      totalCourses,
      publishedCourses,
      draftCourses,
      totalLessons,
      totalQuizzes,
      totalEnrollments,
      totalQuizAttempts,
      passedQuizAttempts,
      quizScoreAggregate,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'INSTRUCTOR' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.course.count(),
      prisma.course.count({ where: { isPublished: true } }),
      prisma.course.count({ where: { isPublished: false } }),
      prisma.lesson.count(),
      prisma.quiz.count(),
      prisma.enrollment.count(),
      prisma.quizAttempt.count({ where: { status: 'SUBMITTED' } }),
      prisma.quizAttempt.count({ where: { status: 'SUBMITTED', isPassed: true } }),
      prisma.quizAttempt.aggregate({
        _avg: { percentage: true },
        where: { status: 'SUBMITTED' },
      }),
    ]);

    const averagePlatformQuizScore = quizScoreAggregate._avg.percentage
      ? Math.round(Number(quizScoreAggregate._avg.percentage))
      : 0;

    // 2. Recent users (last 10)
    const recentUsersRaw = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            enrollments: true,
            authoredCourses: true,
          },
        },
      },
    });

    const recentUsers: AdminUserSummaryDto[] = recentUsersRaw.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: `${u.firstName} ${u.lastName}`,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      enrolledCoursesCount: u._count.enrollments,
      createdCoursesCount: u._count.authoredCourses,
    }));

    // 3. Recent courses (last 10)
    const recentCoursesRaw = await prisma.course.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        instructor: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
        modules: {
          include: {
            _count: {
              select: { lessons: true },
            },
          },
        },
      },
    });

    const recentCourses: AdminCourseSummaryDto[] = recentCoursesRaw.map((c) => {
      const lessonCount = c.modules.reduce((sum, m) => sum + m._count.lessons, 0);
      return {
        id: c.id,
        title: c.title,
        slug: c.slug,
        instructorName: `${c.instructor.firstName} ${c.instructor.lastName}`,
        instructorEmail: c.instructor.email,
        isPublished: c.isPublished,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        enrollmentCount: c._count.enrollments,
        lessonCount,
      };
    });

    // 4. Platform recent activity
    const recentActivity: AdminPlatformActivityDto[] = [];

    // Recent user registrations
    for (const u of recentUsers.slice(0, 5)) {
      recentActivity.push({
        id: `user-${u.id}`,
        type: 'USER_REGISTERED',
        description: `New ${u.role.toLowerCase()} registered: ${u.fullName}`,
        timestamp: u.createdAt,
        userEmail: u.email,
      });
    }

    // Recent course creations
    for (const c of recentCourses.slice(0, 5)) {
      recentActivity.push({
        id: `course-${c.id}`,
        type: 'COURSE_CREATED',
        description: `Course created: "${c.title}" by ${c.instructorName}`,
        timestamp: c.createdAt,
      });
    }

    recentActivity.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      summary: {
        totalUsers,
        totalStudents,
        totalInstructors,
        totalAdmins,
        totalCourses,
        publishedCourses,
        draftCourses,
        totalLessons,
        totalQuizzes,
        totalEnrollments,
        totalQuizAttempts,
        passedQuizAttempts,
        averagePlatformQuizScore,
      },
      recentActivity: recentActivity.slice(0, 15),
      recentUsers,
      recentCourses,
    };
  }

  /**
   * Retrieves list of users for admin management.
   */
  public async getAdminUsers(params: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{ users: AdminUserSummaryDto[]; total: number }> {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const whereClause = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, usersRaw] = await Promise.all([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              enrollments: true,
              authoredCourses: true,
            },
          },
        },
      }),
    ]);

    const users: AdminUserSummaryDto[] = usersRaw.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: `${u.firstName} ${u.lastName}`,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      enrolledCoursesCount: u._count.enrollments,
      createdCoursesCount: u._count.authoredCourses,
    }));

    return { users, total };
  }

  /**
   * Retrieves list of all courses for admin.
   */
  public async getAdminCourses(): Promise<AdminCourseSummaryDto[]> {
    const dashboard = await this.getAdminDashboard();
    return dashboard.recentCourses;
  }

  /**
   * Retrieves platform activity log for admin.
   */
  public async getAdminActivity(): Promise<AdminPlatformActivityDto[]> {
    const dashboard = await this.getAdminDashboard();
    return dashboard.recentActivity;
  }
}

export const dashboardService = new DashboardService();
