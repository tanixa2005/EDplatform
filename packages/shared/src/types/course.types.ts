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
  type: LessonContentType;
  videoDuration: number | null;
  sortOrder: number;
  isFreePreview: boolean;
}

export interface ModuleSummaryDto {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  lessons: LessonSummaryDto[];
}

export interface CourseCardDto {
  id: string;
  title: string;
  slug: string;
  shortSummary: string | null;
  thumbnailUrl: string | null;
  price: number;
  level: DifficultyLevelType;
  status: CourseStatusType;
  instructor: Pick<SafeUser, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
  category: CategoryDto | null;
  modulesCount: number;
  lessonsCount: number;
}
