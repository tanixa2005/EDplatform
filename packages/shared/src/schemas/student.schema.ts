import { z } from 'zod';

export const classLevelSchema = z.enum(['CLASS_6', 'CLASS_7', 'CLASS_8']);
export const boardSchema = z.enum(['CBSE']);
export const subjectKeySchema = z.enum(['MATH', 'SCIENCE', 'SOCIAL_SCIENCE', 'ENGLISH']);
export const languageSchema = z.enum(['ENGLISH', 'HINDI', 'HINGLISH']);
export const explanationStyleSchema = z.enum([
  'SIMPLE',
  'STEP_BY_STEP',
  'REAL_LIFE',
  'EXAM_FOCUSED'
]);

/**
 * Student onboarding. Four questions, nothing personally identifying:
 * class, subjects, language, explanation preference.
 */
export const onboardingSchema = z.object({
  classLevel: classLevelSchema,
  subjects: z
    .array(subjectKeySchema)
    .min(1, 'Pick at least one subject')
    .max(4)
    // Guard against a client sending the same subject twice; the composite
    // primary key on StudentSubject would otherwise reject the whole write.
    .transform((values) => Array.from(new Set(values))),
  preferredLanguage: languageSchema.default('ENGLISH'),
  preferredExplanationStyle: explanationStyleSchema.default('SIMPLE'),
  board: boardSchema.default('CBSE')
});

/** Partial update from the "Me" screen. Every field is optional. */
export const updateStudentProfileSchema = z
  .object({
    classLevel: classLevelSchema.optional(),
    subjects: z
      .array(subjectKeySchema)
      .min(1, 'Pick at least one subject')
      .max(4)
      .transform((values) => Array.from(new Set(values)))
      .optional(),
    preferredLanguage: languageSchema.optional(),
    preferredExplanationStyle: explanationStyleSchema.optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update'
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
