import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const aiRouter = Router();

// Stream AI Tutor responses via SSE (Rate-limited, authenticated)
aiRouter.post('/tutor/stream', authenticate, aiRateLimiter, (req, res, next) => {
  aiController.streamTutor(req, res, next);
});

// Diagnostic mistake analysis for completed quiz attempt
aiRouter.post('/quiz/mistake-analysis', authenticate, aiRateLimiter, (req, res, next) => {
  aiController.analyzeMistakes(req, res, next);
});
