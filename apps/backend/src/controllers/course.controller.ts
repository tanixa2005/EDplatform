import { Request, Response, NextFunction } from 'express';
import { courseService } from '../services/course.service.js';
import { studentProfileService } from '../services/student-profile.service.js';
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

      // The class level comes from the student's stored profile, never from the
      // request, so it cannot be spoofed to reveal content for another class.
      const profile = req.user ? await studentProfileService.getProfile(req.user.id) : null;

      // An anonymous visitor (no verified user) gets the public Class 6-8 catalogue.
      // A signed-in user with no class level gets nothing; see public-catalog.ts.
      const courses = await courseService.getPublishedCourses({
        search: typeof search === 'string' ? search : undefined,
        level: typeof level === 'string' ? level : undefined,
        categoryId: typeof categoryId === 'string' ? categoryId : undefined,
        classLevel: profile?.classLevel ?? null,
        anonymous: !req.user
      });
      res.status(200).json({ success: true, data: { courses } });
    } catch (error) {
      next(error);
    }
  }

  async getCourseByIdOrSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Class level comes from the stored profile, never from the request.
      const detailProfile = req.user ? await studentProfileService.getProfile(req.user.id) : null;

      const course = await courseService.getCourseByIdOrSlug(
        req.params.idOrSlug as string,
        req.user,
        detailProfile?.classLevel ?? null
      );
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
