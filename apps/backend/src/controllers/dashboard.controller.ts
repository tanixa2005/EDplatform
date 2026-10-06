import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

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
}

export const dashboardController = new DashboardController();
