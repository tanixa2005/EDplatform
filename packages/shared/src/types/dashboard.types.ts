// ==========================================
// Student Dashboard Types
// ==========================================

export interface ContinueLearningLessonDto {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  sortOrder: number;
  coveragePercentage: number;
  isCompleted: boolean;
  lastPositionSeconds: number;
}

export interface StudentCourseProgressDto {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  thumbnailUrl: string | null;
  enrolledAt: string;
  completedAt: string | null;
  totalPublishedLessons: number;
  completedLessons: number;
  progressPercentage: number;
  isCompleted: boolean;
  continueLesson: ContinueLearningLessonDto | null;
}

export interface StudentRecentActivityDto {
  id: string;
  type: 'LESSON_PROGRESS' | 'LESSON_COMPLETED' | 'QUIZ_ATTEMPT' | 'COURSE_ENROLLED' | 'COURSE_COMPLETED';
  title: string;
  subtitle: string;
  courseTitle: string;
  courseSlug?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface StudentQuizAttemptSummaryDto {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseTitle: string;
  courseSlug: string;
  lessonId?: string;
  score: number;
  percentage: number;
  isPassed: boolean;
  startedAt: string;
  submittedAt: string | null;
}

export interface StudentDashboardSummaryDto {
  totalEnrolledCourses: number;
  completedCourses: number;
  totalLessonsCompleted: number;
  totalLessonsInProgress: number;
  quizzesAttempted: number;
  quizzesPassed: number;
  averageQuizPercentage: number;
}

export interface StudentDashboardDto {
  summary: StudentDashboardSummaryDto;
  courses: StudentCourseProgressDto[];
  recentActivities: StudentRecentActivityDto[];
  recentQuizAttempts: StudentQuizAttemptSummaryDto[];
  continueLearning: ContinueLearningLessonDto[];
}

export interface StudentProgressOverviewDto {
  courses: StudentCourseProgressDto[];
  totalEnrolled: number;
  totalCompleted: number;
  overallAverageProgress: number;
}
