import { z } from 'zod';

export const questionTypeEnum = z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);
export const attemptStatusEnum = z.enum(['IN_PROGRESS', 'SUBMITTED', 'EXPIRED']);

export const createQuizSchema = z.object({
  title: z.string().trim().min(3, 'Quiz title must be at least 3 characters').max(150),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  passingScore: z.number().int().min(0).max(100).default(70),
  timeLimitSeconds: z.number().int().min(10).optional().nullable(),
  isPublished: z.boolean().default(false),
  lessonId: z.string().uuid().optional().nullable(),
  moduleId: z.string().uuid().optional().nullable()
});

export const updateQuizSchema = createQuizSchema.partial();

export const publishQuizSchema = z.object({
  isPublished: z.boolean()
});

export const createQuizOptionSchema = z.object({
  text: z.string().trim().min(1, 'Option text is required').max(300),
  sortOrder: z.number().int().min(0).default(0),
  isCorrect: z.boolean().default(false)
});

export const createQuizQuestionSchema = z.object({
  prompt: z.string().trim().min(3, 'Question prompt is required').max(1000),
  type: questionTypeEnum.default('SINGLE_CHOICE'),
  points: z.number().int().min(1).default(1),
  explanation: z.string().trim().max(1000).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).default(0),
  options: z.array(createQuizOptionSchema).min(2, 'At least 2 options are required')
}).refine((data) => {
  return data.options.some((o) => o.isCorrect);
}, {
  message: 'At least one option must be marked as correct',
  path: ['options']
}).refine((data) => {
  if (data.type === 'SINGLE_CHOICE' || data.type === 'TRUE_FALSE') {
    const correctCount = data.options.filter((o) => o.isCorrect).length;
    return correctCount === 1;
  }
  return true;
}, {
  message: 'Single choice and True/False questions must have exactly one correct option',
  path: ['options']
});

export const updateQuizQuestionSchema = z.object({
  prompt: z.string().trim().min(3).max(1000).optional(),
  type: questionTypeEnum.optional(),
  points: z.number().int().min(1).optional(),
  explanation: z.string().trim().max(1000).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).optional(),
  options: z.array(createQuizOptionSchema).min(2).optional()
});

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  selectedOptionIds: z.array(z.string().uuid('Invalid option ID'))
});

export const submitQuizAttemptSchema = z.object({
  answers: z.array(submitAnswerSchema).default([])
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type PublishQuizInput = z.infer<typeof publishQuizSchema>;
export type CreateQuizOptionInput = z.infer<typeof createQuizOptionSchema>;
export type CreateQuizQuestionInput = z.infer<typeof createQuizQuestionSchema>;
export type UpdateQuizQuestionInput = z.infer<typeof updateQuizQuestionSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;
