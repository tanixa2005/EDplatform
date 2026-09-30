import { Request, Response, NextFunction } from 'express';
import { quizService } from '../services/quiz.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class QuizController {
  async createQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const lessonId = (req.params.lessonId as string) || req.body.lessonId;
      const quiz = await quizService.createQuiz({ ...req.body, lessonId }, req.user);
      res.status(201).json({ success: true, data: { quiz } });
    } catch (error) {
      next(error);
    }
  }

  async getQuizById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const quiz = await quizService.getQuizById(req.params.id as string, req.user);
      res.status(200).json({ success: true, data: { quiz } });
    } catch (error) {
      next(error);
    }
  }

  async getQuizByLessonId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const quiz = await quizService.getQuizByLessonId(req.params.lessonId as string, req.user);
      res.status(200).json({ success: true, data: { quiz } });
    } catch (error) {
      next(error);
    }
  }

  async updateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const quiz = await quizService.updateQuiz(req.params.id as string, req.body, req.user);
      res.status(200).json({ success: true, data: { quiz } });
    } catch (error) {
      next(error);
    }
  }

  async setPublishStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const quiz = await quizService.setPublishStatus(
        req.params.id as string,
        req.body.isPublished,
        req.user
      );
      res.status(200).json({ success: true, data: { quiz } });
    } catch (error) {
      next(error);
    }
  }

  async deleteQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await quizService.deleteQuiz(req.params.id as string, req.user);
      res.status(200).json({ success: true, message: 'Quiz deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async addQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const question = await quizService.addQuestion(
        req.params.quizId as string,
        req.body,
        req.user
      );
      res.status(201).json({ success: true, data: { question } });
    } catch (error) {
      next(error);
    }
  }

  async updateQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const question = await quizService.updateQuestion(
        req.params.id as string,
        req.body,
        req.user
      );
      res.status(200).json({ success: true, data: { question } });
    } catch (error) {
      next(error);
    }
  }

  async deleteQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await quizService.deleteQuestion(req.params.id as string, req.user);
      res.status(200).json({ success: true, message: 'Question deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async reorderQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await quizService.reorderQuestions(
        req.params.quizId as string,
        req.body.items,
        req.user
      );
      res.status(200).json({ success: true, message: 'Questions reordered successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const quizController = new QuizController();
