import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { dashboardRateLimiter } from '../middlewares/rate-limit.middleware.js';

export const dashboardRouter = Router();

// Apply rate limiting to all dashboard aggregation queries
dashboardRouter.use(dashboardRateLimiter);

// ==========================================
// Student Dashboard Routes
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

// ==========================================
// Instructor Dashboard Routes (INSTRUCTOR, ADMIN)
// ==========================================
dashboardRouter.get(
  '/instructor',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  (req, res, next) => {
    dashboardController.getInstructorDashboard(req, res, next);
  }
);

dashboardRouter.get(
  '/instructor/courses/:courseId',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  (req, res, next) => {
    dashboardController.getInstructorCourseDetail(req, res, next);
  }
);

dashboardRouter.get(
  '/instructor/courses/:courseId/students',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  (req, res, next) => {
    dashboardController.getInstructorCourseStudents(req, res, next);
  }
);

dashboardRouter.get(
  '/instructor/courses/:courseId/quizzes',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  (req, res, next) => {
    dashboardController.getInstructorCourseQuizzes(req, res, next);
  }
);

// ==========================================
// Admin Dashboard Routes (ADMIN ONLY)
// ==========================================
dashboardRouter.get('/admin', authenticate, requireRoles('ADMIN'), (req, res, next) => {
  dashboardController.getAdminDashboard(req, res, next);
});

dashboardRouter.get('/admin/users', authenticate, requireRoles('ADMIN'), (req, res, next) => {
  dashboardController.getAdminUsers(req, res, next);
});

dashboardRouter.get('/admin/courses', authenticate, requireRoles('ADMIN'), (req, res, next) => {
  dashboardController.getAdminCourses(req, res, next);
});

dashboardRouter.get('/admin/activity', authenticate, requireRoles('ADMIN'), (req, res, next) => {
  dashboardController.getAdminActivity(req, res, next);
});
