export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export interface QuizOptionStudentDto {
  id: string;
  text: string;
  sortOrder: number;
}

export interface QuizOptionInstructorDto extends QuizOptionStudentDto {
  isCorrect: boolean;
}

export interface QuizQuestionStudentDto {
  id: string;
  prompt: string;
  type: QuestionType;
  points: number;
  sortOrder: number;
  options: QuizOptionStudentDto[];
}

export interface QuizQuestionInstructorDto {
  id: string;
  prompt: string;
  type: QuestionType;
  points: number;
  explanation?: string | null;
  sortOrder: number;
  options: QuizOptionInstructorDto[];
}

export interface QuizSummaryDto {
  id: string;
  title: string;
  description?: string | null;
  passingScore: number;
  timeLimitSeconds?: number | null;
  isPublished: boolean;
  lessonId?: string | null;
  moduleId?: string | null;
  questionsCount: number;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizDetailStudentDto extends QuizSummaryDto {
  questions: QuizQuestionStudentDto[];
}

export interface QuizDetailInstructorDto extends QuizSummaryDto {
  questions: QuizQuestionInstructorDto[];
}

export interface QuestionResultDto {
  questionId: string;
  prompt: string;
  type: QuestionType;
  points: number;
  pointsAwarded: number;
  isCorrect: boolean;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  explanation?: string | null;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
  }[];
}

export interface QuizAttemptSummaryDto {
  id: string;
  quizId: string;
  userId: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string | null;
  score: number; // 0 - 100 percentage
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  timeLimitSeconds?: number | null;
  remainingSeconds?: number | null;
}

export interface QuizAttemptResultDto extends QuizAttemptSummaryDto {
  questions: QuestionResultDto[];
}
