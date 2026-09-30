import { Request, Response, NextFunction } from 'express';
import { lessonService } from '../services/lesson.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class LessonController {
  async createLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const lesson = await lessonService.createLesson(req.params.moduleId as string, req.body, req.user);
      res.status(201).json({ success: true, data: { lesson } });
    } catch (error) {
      next(error);
    }
  }

  async getLessonById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lesson = await lessonService.getLessonById(req.params.id as string, req.user);
      res.status(200).json({ success: true, data: { lesson } });
    } catch (error) {
      next(error);
    }
  }

  async updateLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const lesson = await lessonService.updateLesson(req.params.id as string, req.body, req.user);
      res.status(200).json({ success: true, data: { lesson } });
    } catch (error) {
      next(error);
    }
  }

  async deleteLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await lessonService.deleteLesson(req.params.id as string, req.user);
      res.status(200).json({ success: true, message: 'Lesson deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async reorderLessons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await lessonService.reorderLessons(req.params.moduleId as string, req.body, req.user);
      res.status(200).json({ success: true, message: 'Lessons reordered successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const lessonController = new LessonController();
