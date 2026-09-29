import { WatchedInterval } from '../constants/progress.constants.js';

export interface LessonProgressDto {
  lessonId: string;
  isCompleted: boolean;
  completedAt: string | null;
  lastPositionSeconds: number;
  coveragePercentage: number;
}

export interface ProgressUpdateRequest {
  lessonId: string;
  lastPositionSeconds: number;
  watchedIntervals: WatchedInterval[];
  totalDurationSeconds: number;
  forceComplete?: boolean; // Only for text lessons
}
