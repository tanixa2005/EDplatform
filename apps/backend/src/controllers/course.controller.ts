import { Request, Response, NextFunction } from 'express';
import { courseService } from '../services/course.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class CourseController {
  async createCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const course = await courseService.createCourse(req.body, req.user.id);
      res.status(201).json({ success: true, data: { course } });
    } catch (error) {
      next(error);
    }
  }

  async getPublishedCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { search, level, categoryId } = req.query;
      const courses = await courseService.getPublishedCourses({
        search: typeof search === 'string' ? search : undefined,
        level: typeof level === 'string' ? level : undefined,
        categoryId: typeof categoryId === 'string' ? categoryId : undefined
      });
      res.status(200).json({ success: true, data: { courses } });
    } catch (error) {
      next(error);
    }
  }

  async getCourseByIdOrSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const course = await courseService.getCourseByIdOrSlug(req.params.idOrSlug as string, req.user);
      res.status(200).json({ success: true, data: { course } });
    } catch (error) {
      next(error);
    }
  }

  async getInstructorCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const courses = await courseService.getInstructorCourses(req.user.id);
      res.status(200).json({ success: true, data: { courses } });
    } catch (error) {
      next(error);
    }
  }

  async updateCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const course = await courseService.updateCourse(req.params.id as string, req.body, req.user);
      res.status(200).json({ success: true, data: { course } });
    } catch (error) {
      next(error);
    }
  }

  async setPublishStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const course = await courseService.setPublishStatus(req.params.id as string, req.body.isPublished, req.user);
      res.status(200).json({ success: true, data: { course } });
    } catch (error) {
      next(error);
    }
  }

  async deleteCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await courseService.deleteCourse(req.params.id as string, req.user);
      res.status(200).json({ success: true, message: 'Course deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const courseController = new CourseController();
