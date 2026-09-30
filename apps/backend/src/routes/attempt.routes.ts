import { Router } from 'express';
import { quizAttemptController } from '../controllers/quiz-attempt.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { quizSubmitRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { submitQuizAttemptSchema } from '@edplatform/shared';

export const attemptRouter = Router();

// ==========================================
// Quiz Attempt Evaluation & Results
// ==========================================
attemptRouter.post(
  '/:attemptId/submit',
  authenticate,
  quizSubmitRateLimiter,
  validateBody(submitQuizAttemptSchema),
  quizAttemptController.submitAttempt
);

attemptRouter.get(
  '/:attemptId',
  authenticate,
  quizAttemptController.getAttemptResult
);
