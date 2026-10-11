import { z } from 'zod';
import { classLevelSchema, subjectKeySchema } from './student.schema.js';

export const tutorQuickActionSchema = z.enum([
  'hint',
  'simpler',
  'real_example',
  'quiz_me',
  'still_confused'
]);

export const createTutorSessionSchema = z.object({
  /** Opening question. Optional so the UI can create an empty session first. */
  message: z.string().trim().min(1).max(2000).optional(),
  subject: subjectKeySchema.optional(),
  /** Overrides the profile class level, e.g. a Class 8 student revising Class 6. */
  classLevel: classLevelSchema.optional(),
  /** Set when the session is opened from inside a lesson. */
  lessonId: z.string().uuid().optional()
});

/**
 * A turn in an existing session. Either `message` (the student typed something)
 * or `action` (the student tapped a quick action) must be present.
 */
export const tutorTurnSchema = z
  .object({
    message: z.string().trim().min(1, 'Type your question').max(2000).optional(),
    action: tutorQuickActionSchema.optional()
  })
  .refine((data) => Boolean(data.message) || Boolean(data.action), {
    message: 'Send a message or pick a quick action'
  });

/**
 * A turn that carries a photo.
 *
 * Separate from tutorTurnSchema because the "message or action" requirement
 * does not hold here: a photo on its own is a complete request, and the server
 * supplies a default instruction for it. The image itself is NOT described in
 * this schema - it arrives as multipart and is validated from its bytes, never
 * from anything the client says about it.
 */
export const tutorImageTurnSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  action: tutorQuickActionSchema.optional()
});

export const listTutorSessionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export type CreateTutorSessionInput = z.infer<typeof createTutorSessionSchema>;
export type TutorTurnInput = z.infer<typeof tutorTurnSchema>;
export type TutorImageTurnInput = z.infer<typeof tutorImageTurnSchema>;
