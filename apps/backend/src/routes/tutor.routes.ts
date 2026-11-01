import { Router } from 'express';
import { tutorController } from '../controllers/tutor.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { withAiAudience } from '../middlewares/ai-audience.middleware.js';
import { aiDailyRateLimiter, aiRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { uploadTutorImage } from '../middlewares/upload.middleware.js';

export const tutorRouter = Router();

// AI availability flags for the UI: tutor paused, voice input allowed. No DB read.
tutorRouter.get('/status', authenticate, withAiAudience, (req, res, next) => {
  tutorController.getStatus(req, res, next);
});

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
  aiDailyRateLimiter,
  uploadTutorImage,
  // Last, right before the handler, so the audience is set in the same async
  // context the handler runs in (multipart parsing is event-driven).
  withAiAudience,
  (req, res, next) => {
    tutorController.streamTurn(req, res, next);
  }
);
