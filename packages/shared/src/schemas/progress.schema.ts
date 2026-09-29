import { z } from 'zod';

export const watchedIntervalSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0)
});

export const updateProgressSchema = z.object({
  lessonId: z.string().uuid(),
  lastPositionSeconds: z.number().min(0),
  watchedIntervals: z.array(watchedIntervalSchema).default([]),
  totalDurationSeconds: z.number().min(0),
  forceComplete: z.boolean().optional()
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
