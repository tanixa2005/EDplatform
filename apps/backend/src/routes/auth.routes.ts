import { Router } from 'express';
import { registerSchema, loginSchema } from '@edplatform/shared';
import { authController } from '../controllers/auth.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validateBody(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

authRouter.post('/login', authRateLimiter, validateBody(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

authRouter.post('/logout', (req, res, next) => {
  authController.logout(req, res, next);
});

authRouter.get('/me', authenticate, (req, res, next) => {
  authController.getCurrentUser(req, res, next);
});
