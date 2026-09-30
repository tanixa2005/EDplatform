import { Request, Response, NextFunction } from 'express';
import { progressService } from '../services/progress.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class ProgressController {
  async updateProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const lessonId = req.params.lessonId || req.body.lessonId;
      const progress = await progressService.updateProgress(
        { ...req.body, lessonId },
        req.user.id
      );
      res.status(200).json({ success: true, data: { progress } });
    } catch (error) {
      next(error);
    }
  }

  async getLessonProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const progress = await progressService.getLessonProgress(req.params.lessonId as string, req.user.id);
      res.status(200).json({ success: true, data: { progress } });
    } catch (error) {
      next(error);
    }
  }

  async getCourseProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const progress = await progressService.getCourseProgress(req.params.courseId as string, req.user.id);
      res.status(200).json({ success: true, data: progress });
    } catch (error) {
      next(error);
    }
  }
}

export const progressController = new ProgressController();
