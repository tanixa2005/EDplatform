import { Request, Response, NextFunction } from 'express';
import {
  aiTutorStreamSchema,
  quizMistakeAnalysisInputSchema,
} from '@edplatform/shared';
import { aiTutorService } from '../services/ai/ai-tutor.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class AIController {
  /**
   * Handle real-time streaming of AI tutor responses via Server-Sent Events (SSE)
   * POST /api/v1/ai/tutor/stream
   */
  public async streamTutor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to use the AI Tutor');
      }

      const input = aiTutorStreamSchema.parse(req.body);

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
        await aiTutorService.streamTutorResponse(
          req.user,
          input,
          async (chunk: string) => {
            if (clientDisconnected) return;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          }
        );

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError: unknown) {
        const errorMsg = streamError instanceof Error ? streamError.message : 'AI Tutor streaming failed';
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
          res.end();
        }
      }
    } catch (error) {
      if (res.headersSent) {
        const errorMsg = error instanceof Error ? error.message : 'Unexpected error';
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
      } else {
        next(error);
      }
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
