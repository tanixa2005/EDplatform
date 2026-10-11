import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const aiRouter = Router();

// In-quiz hint, streamed over SSE.
//
// Replaces POST /tutor/stream, which authorised on enrollment alone and
// accepted an arbitrary questionId - so a student enrolled in any one course
// could read any question in the database. That route is gone rather than
// patched, so nothing can keep calling the old contract by accident.
aiRouter.post('/quiz/hint', authenticate, aiRateLimiter, (req, res, next) => {
  aiController.streamQuizHint(req, res, next);
});

// Diagnostic mistake analysis for completed quiz attempt
aiRouter.post('/quiz/mistake-analysis', authenticate, aiRateLimiter, (req, res, next) => {
  aiController.analyzeMistakes(req, res, next);
});

// Open a tutor session about one mistake. Creates a session only - no
// generation happens here, so it sits outside the AI rate limiter and costs
// nothing until the student actually sends the first turn.
// Creating a session only: it composes text from rows that already exist and
// costs no generation, so it sits outside aiRateLimiter like from-mistake.
// The first real turn, which does cost one, is rate limited as usual.
aiRouter.post('/tutor/sessions/from-chapter', authenticate, (req, res, next) =>
  aiController.createSessionFromChapter(req, res, next)
);

aiRouter.post('/tutor/sessions/from-mistake', authenticate, (req, res, next) => {
  aiController.createSessionFromMistake(req, res, next);
});
