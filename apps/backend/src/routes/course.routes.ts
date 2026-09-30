import { Router } from 'express';
import { courseController } from '../controllers/course.controller.js';
import { moduleController } from '../controllers/module.controller.js';
import { enrollmentController } from '../controllers/enrollment.controller.js';
import { progressController } from '../controllers/progress.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  createCourseSchema,
  updateCourseSchema,
  publishCourseSchema,
  createModuleSchema,
  reorderItemsSchema
} from '@edplatform/shared';

export const courseRouter = Router();

// ==========================================
// Public Course Discovery
// ==========================================
courseRouter.get('/', courseController.getPublishedCourses);

// ==========================================
// Instructor Course Management
// Note: /instructor/my-courses must come before /:idOrSlug
// ==========================================
courseRouter.get(
  '/instructor/my-courses',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  courseController.getInstructorCourses
);

courseRouter.post(
  '/',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createCourseSchema),
  courseController.createCourse
);

// ==========================================
// Course Detail & Nested Operations
// ==========================================
courseRouter.get('/:idOrSlug', optionalAuthenticate, courseController.getCourseByIdOrSlug);

courseRouter.put(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(updateCourseSchema),
  courseController.updateCourse
);

courseRouter.patch(
  '/:id/publish',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(publishCourseSchema),
  courseController.setPublishStatus
);

courseRouter.delete(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  courseController.deleteCourse
);

// ==========================================
// Course Module Nested Routes
// ==========================================
courseRouter.post(
  '/:courseId/modules',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createModuleSchema),
  moduleController.createModule
);

courseRouter.patch(
  '/:courseId/modules/reorder',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(reorderItemsSchema),
  moduleController.reorderModules
);

// ==========================================
// Course Enrollment & Progress Nested Routes
// ==========================================
courseRouter.post('/:courseId/enroll', authenticate, enrollmentController.enroll);

courseRouter.get(
  '/:courseId/enrollment-status',
  authenticate,
  enrollmentController.checkEnrollmentStatus
);

courseRouter.get('/:courseId/progress', authenticate, progressController.getCourseProgress);
