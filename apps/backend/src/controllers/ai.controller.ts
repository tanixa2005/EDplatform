import { Request, Response, NextFunction } from 'express';
import {
  quizHintSchema,
  chapterSessionInputSchema,
  mistakeSessionInputSchema,
  quizMistakeAnalysisInputSchema,
} from '@edplatform/shared';
import { aiTutorService } from '../services/ai/ai-tutor.service.js';
import { AppError, UnauthorizedError } from '../errors/app.error.js';

/**
 * The only text allowed into an SSE error frame.
 *
 * AppError messages are authored by us and safe to show a child. Anything else
 * - a Prisma failure, a provider SDK error, a TypeError - could carry a
 * connection string, a model id or a stack fragment, so it is replaced with a
 * generic sentence and the real error is logged instead.
 */
function safeStreamErrorMessage(err: unknown, context: string): string {
  if (err instanceof AppError) return err.message;
  console.error(`[${context}] unexpected stream failure:`, err);
  return 'ED could not reply just now. Try again in a moment.';
}

export class AIController {
  /**
   * Handle real-time streaming of AI tutor responses via Server-Sent Events (SSE)
   * POST /api/v1/ai/quiz/hint
   */
  public async streamQuizHint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to use the AI Tutor');
      }

      // Only questionId and message are read. Anything else the client sends -
      // lessonId, classLevel, subject, question text, a fabricated history - is
      // dropped here by the schema and never reaches the service.
      const input = quizHintSchema.parse(req.body);

      // Authorise BEFORE the stream opens, so a refusal arrives as a real HTTP
      // status the client can act on rather than a 200 carrying an error frame.
      const prepared = await aiTutorService.prepareQuizHint(req.user, input);

      // Initialize Server-Sent Events headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial keep-alive comment
      res.write(': connected\n\n');

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
      });

      try {
        await aiTutorService.streamPreparedQuizHint(prepared, async (chunk: string) => {
          if (clientDisconnected) return;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        });

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError: unknown) {
        const errorMsg = safeStreamErrorMessage(streamError, 'ai.quizHint');
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
          res.end();
        }
      }
    } catch (error) {
      if (res.headersSent) {
        const errorMsg = safeStreamErrorMessage(error, 'ai.quizHint.outer');
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
      } else {
        next(error);
      }
    }
  }

  /**
   * Opens a tutor session about one mistake.
   * POST /api/v1/ai/tutor/sessions/from-mistake
   */
  public async createSessionFromMistake(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // Only the two ids are read. Anything else in the body - a lessonId, a
      // classLevel, a question text, a "correct answer" - is dropped here and
      // never reaches the service.
      const input = mistakeSessionInputSchema.parse(req.body);

      const result = await aiTutorService.createSessionFromMistake(req.user, input);

      res.status(201).json({
        success: true,
        data: { sessionId: result.sessionId, openingMessage: result.openingMessage }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Opens a tutor session about a chapter that has no written topics yet.
   * POST /api/v1/ai/tutor/sessions/from-chapter
   */
  public async createSessionFromChapter(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // One id is read. A classLevel, subject, chapterTitle or lessonId in
      // the body is rejected outright by .strict() rather than ignored.
      const input = chapterSessionInputSchema.parse(req.body);

      const result = await aiTutorService.createSessionFromChapter(req.user, input);

      res.status(201).json({
        success: true,
        data: { sessionId: result.sessionId, openingMessage: result.openingMessage }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Analyze student mistakes on a completed quiz attempt
   * POST /api/v1/ai/quiz/mistake-analysis
   */
  public async analyzeMistakes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { attemptId } = quizMistakeAnalysisInputSchema.parse(req.body);

      const result = await aiTutorService.analyzeQuizMistakes(req.user, attemptId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const aiController = new AIController();
