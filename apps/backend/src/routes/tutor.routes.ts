import { Router } from 'express';
import { tutorController } from '../controllers/tutor.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { uploadTutorImage } from '../middlewares/upload.middleware.js';

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
// uploadTutorImage sits AFTER the rate limiter so a flood of photo uploads is
// throttled before any multipart parsing happens, and passes a plain JSON turn
// through untouched.
tutorRouter.post(
  '/sessions/:sessionId/stream',
  authenticate,
  aiRateLimiter,
  uploadTutorImage,
  (req, res, next) => {
    tutorController.streamTurn(req, res, next);
  }
);
