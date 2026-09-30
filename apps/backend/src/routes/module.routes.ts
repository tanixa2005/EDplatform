import { Router } from 'express';
import { moduleController } from '../controllers/module.controller.js';
import { lessonController } from '../controllers/lesson.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  updateModuleSchema,
  createLessonSchema,
  reorderItemsSchema
} from '@edplatform/shared';

export const moduleRouter = Router();

// ==========================================
// Module Management
// ==========================================
moduleRouter.put(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(updateModuleSchema),
  moduleController.updateModule
);

moduleRouter.delete(
  '/:id',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  moduleController.deleteModule
);

// ==========================================
// Nested Lesson Routes under Module
// ==========================================
moduleRouter.post(
  '/:moduleId/lessons',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(createLessonSchema),
  lessonController.createLesson
);

moduleRouter.patch(
  '/:moduleId/lessons/reorder',
  authenticate,
  requireRoles('INSTRUCTOR', 'ADMIN'),
  validateBody(reorderItemsSchema),
  lessonController.reorderLessons
);
