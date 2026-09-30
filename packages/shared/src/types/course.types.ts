import { SafeUser } from './user.types.js';

export type CourseStatusType = 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type DifficultyLevelType = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type LessonContentType = 'VIDEO' | 'TEXT';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface LessonSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: LessonContentType;
  videoUrl: string | null;
  videoDuration: number | null;
  sortOrder: number;
  isFreePreview: boolean;
  isPublished: boolean;
  moduleId: string;
}

export interface ModuleSummaryDto {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  courseId: string;
  lessons: LessonSummaryDto[];
}

export interface CourseCardDto {
  id: string;
  title: string;
  slug: string;
  shortSummary: string | null;
  description: string;
  thumbnailUrl: string | null;
  price: number;
  level: DifficultyLevelType;
  status: CourseStatusType;
  isPublished: boolean;
  instructorId: string;
  instructor: Pick<SafeUser, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
  category: CategoryDto | null;
  modulesCount: number;
  lessonsCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CourseDetailDto extends Omit<CourseCardDto, 'instructor'> {
  instructor: SafeUser;
  modules: ModuleSummaryDto[];
  isEnrolled?: boolean;
}

export interface EnrollmentDto {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string | Date;
  completedAt: string | Date | null;
  course: CourseCardDto;
  progressPercentage: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
}
