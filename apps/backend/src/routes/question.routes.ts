import { Router } from 'express';
import { quizController } from '../controllers/quiz.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { updateQuizQuestionSchema } from '@edplatform/shared';

export const questionRouter = Router();

// ==========================================
// Question Management
// ==========================================
questionRouter.put(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(updateQuizQuestionSchema),
  quizController.updateQuestion
);

questionRouter.delete(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  quizController.deleteQuestion
);
