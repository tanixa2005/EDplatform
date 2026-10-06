import { Router } from 'express';
import { tutorController } from '../controllers/tutor.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const tutorRouter = Router();

// Home screen context: class, recent sessions, starter prompts.
tutorRouter.get('/home', authenticate, (req, res, next) => {
  tutorController.getHome(req, res, next);
});

// Persistent tutor sessions.
tutorRouter.post('/sessions', authenticate, (req, res, next) => {
  tutorController.createSession(req, res, next);
});

tutorRouter.get('/sessions', authenticate, (req, res, next) => {
  tutorController.listSessions(req, res, next);
});

tutorRouter.get('/sessions/:sessionId', authenticate, (req, res, next) => {
  tutorController.getSession(req, res, next);
});

tutorRouter.delete('/sessions/:sessionId', authenticate, (req, res, next) => {
  tutorController.closeSession(req, res, next);
});

// One tutoring turn, streamed over SSE. Rate-limited to protect AI spend.
tutorRouter.post('/sessions/:sessionId/stream', authenticate, aiRateLimiter, (req, res, next) => {
  tutorController.streamTurn(req, res, next);
});
