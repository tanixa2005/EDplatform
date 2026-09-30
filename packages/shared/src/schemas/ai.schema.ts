import { z } from 'zod';

export const aiMessageHistorySchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string().min(1).max(5000),
});

export const aiTutorStreamSchema = z.object({
  lessonId: z.string().uuid('Invalid lesson ID'),
  mode: z.enum(['study', 'quiz']),
  message: z.string().min(1, 'Message is required').max(2000, 'Message is too long (max 2000 characters)'),
  questionId: z.string().uuid('Invalid question ID').optional(),
  history: z.array(aiMessageHistorySchema).max(20).optional().default([]),
});

export const quizMistakeAnalysisInputSchema = z.object({
  attemptId: z.string().uuid('Invalid attempt ID'),
});

export const mistakeCategorySchema = z.enum([
  'misconception',
  'calculation_error',
  'term_confusion',
  'incomplete_knowledge',
  'misread_question',
  'other',
]);

export const questionMistakeAnalysisSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  userAnswerText: z.string(),
  correctAnswerText: z.string(),
  concept: z.string(),
  mistakeType: mistakeCategorySchema,
  explanation: z.string(),
  recommendedAction: z.string(),
  practicePrompt: z.string(),
});

export const quizMistakeAnalysisResultSchema = z.object({
  attemptId: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  score: z.number(),
  percentage: z.number(),
  passed: z.boolean(),
  totalQuestions: z.number(),
  incorrectQuestionsCount: z.number(),
  generalFeedback: z.string(),
  mistakes: z.array(questionMistakeAnalysisSchema),
  strengths: z.array(z.string()),
  recommendedTopics: z.array(z.string()),
});

export type AITutorStreamInput = z.infer<typeof aiTutorStreamSchema>;
export type QuizMistakeAnalysisInput = z.infer<typeof quizMistakeAnalysisInputSchema>;
