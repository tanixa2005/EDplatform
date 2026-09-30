import { Request, Response, NextFunction } from 'express';
import { moduleService } from '../services/module.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class ModuleController {
  async createModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const moduleItem = await moduleService.createModule(req.params.courseId as string, req.body, req.user);
      res.status(201).json({ success: true, data: { module: moduleItem } });
    } catch (error) {
      next(error);
    }
  }

  async updateModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const moduleItem = await moduleService.updateModule(req.params.id as string, req.body, req.user);
      res.status(200).json({ success: true, data: { module: moduleItem } });
    } catch (error) {
      next(error);
    }
  }

  async deleteModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await moduleService.deleteModule(req.params.id as string, req.user);
      res.status(200).json({ success: true, message: 'Module deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async reorderModules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await moduleService.reorderModules(req.params.courseId as string, req.body, req.user);
      res.status(200).json({ success: true, message: 'Modules reordered successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const moduleController = new ModuleController();
