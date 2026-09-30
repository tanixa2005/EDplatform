import { Router } from 'express';
import { enrollmentController } from '../controllers/enrollment.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export const enrollmentRouter = Router();

// ==========================================
// User Enrolled Courses
// ==========================================
enrollmentRouter.get('/me', authenticate, enrollmentController.getUserEnrollments);
