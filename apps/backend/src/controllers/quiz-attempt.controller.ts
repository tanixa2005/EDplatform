import { Request, Response, NextFunction } from 'express';
import { quizAttemptService } from '../services/quiz-attempt.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class QuizAttemptController {
  async startAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const attempt = await quizAttemptService.startAttempt(
        req.params.quizId as string,
        req.user
      );
      res.status(201).json({ success: true, data: { attempt } });
    } catch (error) {
      next(error);
    }
  }

  async getActiveAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const attempt = await quizAttemptService.getActiveAttempt(
        req.params.quizId as string,
        req.user
      );
      res.status(200).json({ success: true, data: { attempt } });
    } catch (error) {
      next(error);
    }
  }

  async submitAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const result = await quizAttemptService.submitAttempt(
        req.params.attemptId as string,
        req.body,
        req.user
      );
      res.status(200).json({ success: true, data: { result } });
    } catch (error) {
      next(error);
    }
  }

  async getUserAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const attempts = await quizAttemptService.getUserAttempts(
        req.params.quizId as string,
        req.user
      );
      res.status(200).json({ success: true, data: { attempts } });
    } catch (error) {
      next(error);
    }
  }

  async getAttemptResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const result = await quizAttemptService.getAttemptResult(
        req.params.attemptId as string,
        req.user
      );
      res.status(200).json({ success: true, data: { result } });
    } catch (error) {
      next(error);
    }
  }
}

export const quizAttemptController = new QuizAttemptController();
