import { Request, Response, NextFunction } from 'express';
import { enrollmentService } from '../services/enrollment.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class EnrollmentController {
  async enroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const result = await enrollmentService.enroll(req.params.courseId as string, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getUserEnrollments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const enrollments = await enrollmentService.getUserEnrollments(req.user.id);
      res.status(200).json({ success: true, data: { enrollments } });
    } catch (error) {
      next(error);
    }
  }

  async checkEnrollmentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const status = await enrollmentService.checkEnrollmentStatus(req.params.courseId as string, req.user.id);
      res.status(200).json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }
}

export const enrollmentController = new EnrollmentController();
