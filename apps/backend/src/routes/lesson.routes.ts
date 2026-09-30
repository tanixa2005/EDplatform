import { Router } from 'express';
import { lessonController } from '../controllers/lesson.controller.js';
import { progressController } from '../controllers/progress.controller.js';
import { quizController } from '../controllers/quiz.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { updateLessonSchema, updateProgressSchema, createQuizSchema } from '@edplatform/shared';

export const lessonRouter = Router();

// ==========================================
// Lesson Playback & Details
// ==========================================
lessonRouter.get('/:id', optionalAuthenticate, lessonController.getLessonById);

lessonRouter.put(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(updateLessonSchema),
  lessonController.updateLesson
);

lessonRouter.delete(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  lessonController.deleteLesson
);

// ==========================================
// Meaningful Progress Tracking
// ==========================================
lessonRouter.post(
  '/:lessonId/progress',
  authenticate,
  validateBody(updateProgressSchema),
  progressController.updateProgress
);

lessonRouter.get(
  '/:lessonId/progress',
  authenticate,
  progressController.getLessonProgress
);

// ==========================================
// Lesson Quizzes
// ==========================================
lessonRouter.get('/:lessonId/quiz', optionalAuthenticate, quizController.getQuizByLessonId);

lessonRouter.post(
  '/:lessonId/quiz',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createQuizSchema),
  quizController.createQuiz
);

