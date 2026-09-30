import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { UnauthorizedError } from '../errors/app.error.js';
import { adminPaginationQuerySchema } from '@edplatform/shared';

export class DashboardController {
  // ==========================================
  // Student Endpoints
  // ==========================================

  public async getStudentDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await dashboardService.getStudentDashboard(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getStudentProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await dashboardService.getStudentProgress(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getStudentActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await dashboardService.getStudentActivity(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getStudentQuizPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await dashboardService.getStudentQuizPerformance(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Instructor Endpoints
  // ==========================================

  public async getInstructorDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await dashboardService.getInstructorDashboard(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getInstructorCourseDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const courseId = String(req.params.courseId);
      const isAdmin = req.user.role === 'ADMIN';
      const data = await dashboardService.getInstructorCourseDetail(req.user.id, courseId, isAdmin);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getInstructorCourseStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const courseId = String(req.params.courseId);
      const isAdmin = req.user.role === 'ADMIN';
      const data = await dashboardService.getInstructorCourseStudents(req.user.id, courseId, isAdmin);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getInstructorCourseQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const courseId = String(req.params.courseId);
      const isAdmin = req.user.role === 'ADMIN';
      const data = await dashboardService.getInstructorCourseQuizzes(req.user.id, courseId, isAdmin);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Admin Endpoints
  // ==========================================

  public async getAdminDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getAdminDashboard();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getAdminUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminPaginationQuerySchema.parse(req.query);
      const data = await dashboardService.getAdminUsers(query);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getAdminCourses(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getAdminCourses();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  public async getAdminActivity(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getAdminActivity();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
