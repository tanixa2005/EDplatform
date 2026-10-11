import { z } from 'zod';

export const aiMessageHistorySchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string().min(1).max(5000),
});

/**
 * Asking ED for a hint while mid-question.
 *
 * Replaces aiTutorStreamSchema, which took lessonId, mode and up to twenty
 * client-supplied history messages. All three were wrong: the lesson was used
 * for authorization while the questionId it was paired with went unchecked,
 * and a client that writes its own history can put words in ED's mouth.
 *
 * Now the question id is the only handle. Everything else - the lesson, the
 * course, the class, the subject, the question text and its options - is
 * derived on the server from that one id, after checking the student is
 * allowed to see it.
 */
export const quizHintSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Message is too long (max 2000 characters)')
});

export const quizMistakeAnalysisInputSchema = z.object({
  attemptId: z.string().uuid('Invalid attempt ID'),
});

/**
 * Opening an ED session about one mistake.
 *
 * Two ids, nothing else. The question text, what the student picked, what was
 * correct, the explanation, the lesson, the class and the subject are all read
 * from the database after the attempt is proven to belong to this student -
 * so none of them can be supplied, altered or invented by a client.
 */
export const mistakeSessionInputSchema = z.object({
  attemptId: z.string().uuid('Invalid attempt ID'),
  questionId: z.string().uuid('Invalid question ID')
});

/**
 * Opening an ED session about a chapter that has no written topics yet.
 *
 * One id. The chapter title, the textbook, the course, the class and the
 * subject are all read from the database after the chapter is proven to be
 * one this student's own class can see, so a client cannot name a chapter it
 * is not entitled to or claim to be in another class while doing so.
 *
 * Deliberately `.strict()`: there is no second field this endpoint should
 * ever accept, and a silently-ignored extra is harder to notice than a 400.
 */
export const chapterSessionInputSchema = z
  .object({
    moduleId: z.string().uuid('Invalid chapter ID')
  })
  .strict();

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
  /**
   * Where "worth re-reading" points, when it can point anywhere.
   *
   * Both optional on purpose. They are absent for a legacy question whose
   * topic is unpublished or unresolvable, and absent from every analysis
   * cached in QuizAttempt.aiFeedback before C13.3 - so an older cache still
   * parses and simply renders as plain text instead of a link. The UI must
   * treat "no ids" as "not linkable", never as an error.
   *
   * Server-derived from the question's own topic via resolveQuestionTopic.
   * A client never supplies either value.
   */
  topicLessonId: z.string().optional(),
  topicCourseSlug: z.string().optional(),
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

export type QuizHintInput = z.infer<typeof quizHintSchema>;
export type QuizMistakeAnalysisInput = z.infer<typeof quizMistakeAnalysisInputSchema>;
export type MistakeSessionInput = z.infer<typeof mistakeSessionInputSchema>;
export type ChapterSessionInput = z.infer<typeof chapterSessionInputSchema>;
