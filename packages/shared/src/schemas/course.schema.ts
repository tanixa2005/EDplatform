import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be url-friendly kebab-case').optional(),
  shortSummary: z.string().trim().max(300).optional(),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  thumbnailUrl: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  price: z.number().min(0, 'Price cannot be negative').default(0),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  isPublished: z.boolean().default(false),
  categoryId: z.string().uuid().optional()
});

export const updateCourseSchema = createCourseSchema.partial();

export const publishCourseSchema = z.object({
  isPublished: z.boolean()
});

export const createModuleSchema = z.object({
  title: z.string().trim().min(2, 'Module title is required').max(100),
  description: z.string().trim().optional(),
  sortOrder: z.number().int().min(0).default(0)
});

export const updateModuleSchema = createModuleSchema.partial();

export const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0)
    })
  )
});

export const createLessonSchema = z.object({
  title: z.string().trim().min(2, 'Lesson title is required').max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be url-friendly kebab-case').optional(),
  description: z.string().trim().optional(),
  type: z.enum(['VIDEO', 'TEXT']).default('VIDEO'),
  content: z.string().optional(),
  videoUrl: z.string().url('Invalid video URL').optional().or(z.literal('')),
  videoDuration: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isFreePreview: z.boolean().default(false),
  isPublished: z.boolean().default(true)
});

export const updateLessonSchema = createLessonSchema.partial();

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type PublishCourseInput = z.infer<typeof publishCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
