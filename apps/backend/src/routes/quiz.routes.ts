import { Router } from 'express';
import { quizController } from '../controllers/quiz.controller.js';
import { quizAttemptController } from '../controllers/quiz-attempt.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  createQuizSchema,
  updateQuizSchema,
  publishQuizSchema,
  createQuizQuestionSchema,
  reorderItemsSchema
} from '@edplatform/shared';

export const quizRouter = Router();

// ==========================================
// Quiz Management
// ==========================================
quizRouter.post(
  '/',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createQuizSchema),
  quizController.createQuiz
);

quizRouter.get('/:id', optionalAuthenticate, quizController.getQuizById);

quizRouter.put(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(updateQuizSchema),
  quizController.updateQuiz
);

quizRouter.patch(
  '/:id/publish',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(publishQuizSchema),
  quizController.setPublishStatus
);

quizRouter.delete(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  quizController.deleteQuiz
);

// ==========================================
// Questions under Quiz
// ==========================================
quizRouter.post(
  '/:quizId/questions',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createQuizQuestionSchema),
  quizController.addQuestion
);

quizRouter.patch(
  '/:quizId/questions/reorder',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(reorderItemsSchema),
  quizController.reorderQuestions
);

// ==========================================
// Quiz Attempts
// ==========================================
quizRouter.post('/:quizId/attempts', authenticate, quizAttemptController.startAttempt);

quizRouter.get('/:quizId/attempts/active', authenticate, quizAttemptController.getActiveAttempt);

quizRouter.get('/:quizId/attempts', authenticate, quizAttemptController.getUserAttempts);
