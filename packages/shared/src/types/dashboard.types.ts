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

// ==========================================
// Instructor Dashboard Types
// ==========================================

export interface InstructorCourseMetricsDto {
  courseId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  isPublished: boolean;
  createdAt: string;
  enrollmentCount: number;
  publishedLessonCount: number;
  averageProgress: number;
  completionCount: number;
  quizCount: number;
  quizAttemptsCount: number;
  averageQuizScore: number;
}

export interface InstructorDashboardSummaryDto {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  totalEnrolledStudents: number;
  averageCourseCompletion: number;
  totalQuizAttempts: number;
  averageQuizPercentage: number;
}

export interface InstructorRecentEnrollmentDto {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  studentEmail: string;
  enrolledAt: string;
  progressPercentage: number;
}

export interface InstructorDashboardDto {
  summary: InstructorDashboardSummaryDto;
  courses: InstructorCourseMetricsDto[];
  recentEnrollments: InstructorRecentEnrollmentDto[];
}

export interface InstructorStudentInCourseDto {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercentage: number;
  completedLessonsCount: number;
  totalCourseLessons: number;
  quizAttemptsCount: number;
  averageQuizScore: number;
}

export interface InstructorCourseQuizAnalyticsDto {
  quizId: string;
  quizTitle: string;
  lessonTitle: string | null;
  passingScore: number;
  totalAttempts: number;
  uniqueStudentsAttempted: number;
  passRate: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
}

export interface InstructorSingleCourseDetailAnalyticsDto {
  course: InstructorCourseMetricsDto;
  students: InstructorStudentInCourseDto[];
  quizzes: InstructorCourseQuizAnalyticsDto[];
}

// ==========================================
// Admin Dashboard Types
// ==========================================

export interface AdminDashboardSummaryDto {
  totalUsers: number;
  totalStudents: number;
  totalInstructors: number;
  totalAdmins: number;
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  totalLessons: number;
  totalQuizzes: number;
  totalEnrollments: number;
  totalQuizAttempts: number;
  passedQuizAttempts: number;
  averagePlatformQuizScore: number;
}

export interface AdminPlatformActivityDto {
  id: string;
  type: 'USER_REGISTERED' | 'COURSE_CREATED' | 'ENROLLMENT' | 'QUIZ_SUBMITTED';
  description: string;
  timestamp: string;
  userEmail?: string;
  details?: Record<string, any>;
}

export interface AdminUserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
  enrolledCoursesCount: number;
  createdCoursesCount: number;
}

export interface AdminCourseSummaryDto {
  id: string;
  title: string;
  slug: string;
  instructorName: string;
  instructorEmail: string;
  isPublished: boolean;
  status: string;
  createdAt: string;
  enrollmentCount: number;
  lessonCount: number;
}

export interface AdminDashboardDto {
  summary: AdminDashboardSummaryDto;
  recentActivity: AdminPlatformActivityDto[];
  recentUsers: AdminUserSummaryDto[];
  recentCourses: AdminCourseSummaryDto[];
}
