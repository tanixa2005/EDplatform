import { Router } from 'express';
import { studentController } from '../controllers/student.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export const studentRouter = Router();

// Identity + learning profile for the signed-in student.
studentRouter.get('/', authenticate, (req, res, next) => {
  studentController.getMe(req, res, next);
});

// Onboarding: class, subjects, language, explanation style.
studentRouter.post('/onboarding', authenticate, (req, res, next) => {
  studentController.completeOnboarding(req, res, next);
});

// Partial preference update from the "Me" screen.
studentRouter.patch('/', authenticate, (req, res, next) => {
  studentController.updateProfile(req, res, next);
});
