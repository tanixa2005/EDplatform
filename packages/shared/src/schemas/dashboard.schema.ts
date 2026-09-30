import { z } from 'zod';

export const instructorCourseParamsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID format'),
});

export const adminPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
