import { Request, Response, NextFunction } from 'express';
import { onboardingSchema, updateStudentProfileSchema } from '@edplatform/shared';
import { studentProfileService } from '../services/student-profile.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class StudentController {
  /** GET /api/v1/me - identity plus learning profile. */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const me = await studentProfileService.getMe(req.user.id);
      res.status(200).json({ success: true, data: me });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/me/onboarding - class, subjects, language, explanation style. */
  async completeOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const input = onboardingSchema.parse(req.body);
      const profile = await studentProfileService.completeOnboarding(req.user.id, input);

      res.status(200).json({ success: true, data: { profile } });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/v1/me - partial preference update from the Me screen. */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const input = updateStudentProfileSchema.parse(req.body);
      const profile = await studentProfileService.updateProfile(req.user.id, input);

      res.status(200).json({ success: true, data: { profile } });
    } catch (error) {
      next(error);
    }
  }
}

export const studentController = new StudentController();
