import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { dashboardRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const dashboardRouter = Router();

// Apply rate limiting to all dashboard aggregation queries
dashboardRouter.use(dashboardRateLimiter);

// ==========================================
// Student Progress Routes
//
// EDplatform is a student-only product: the instructor and admin analytics
// endpoints that used to live here have been removed along with their service
// and controller methods.
// ==========================================
dashboardRouter.get('/student', authenticate, (req, res, next) => {
  dashboardController.getStudentDashboard(req, res, next);
});

dashboardRouter.get('/student/progress', authenticate, (req, res, next) => {
  dashboardController.getStudentProgress(req, res, next);
});

dashboardRouter.get('/student/activity', authenticate, (req, res, next) => {
  dashboardController.getStudentActivity(req, res, next);
});

dashboardRouter.get('/student/quiz-performance', authenticate, (req, res, next) => {
  dashboardController.getStudentQuizPerformance(req, res, next);
});
