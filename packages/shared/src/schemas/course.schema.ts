import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  shortSummary: z.string().trim().max(300).optional(),
  description: z.string().trim().min(20, 'Description must be at least 20 characters'),
  price: z.number().min(0, 'Price cannot be negative').default(0),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  categoryId: z.string().uuid().optional()
});

export const createModuleSchema = z.object({
  title: z.string().trim().min(2, 'Module title is required').max(100),
  description: z.string().trim().optional(),
  sortOrder: z.number().int().min(0).default(0)
});

export const createLessonSchema = z.object({
  title: z.string().trim().min(2, 'Lesson title is required').max(120),
  type: z.enum(['VIDEO', 'TEXT']).default('VIDEO'),
  content: z.string().optional(),
  videoUrl: z.string().url('Invalid video URL').optional().or(z.literal('')),
  videoDuration: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isFreePreview: z.boolean().default(false)
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
