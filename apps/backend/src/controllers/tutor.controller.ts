import { Request, Response, NextFunction } from 'express';
import {
  createTutorSessionSchema,
  listTutorSessionsSchema,
  tutorTurnSchema,
  tutorImageTurnSchema
} from '@edplatform/shared';
import { edTutorService } from '../services/tutor/ed-tutor.service.js';
import { tutorSessionService } from '../services/tutor/tutor-session.service.js';
import { AppError, UnauthorizedError } from '../errors/app.error.js';
import { validateAndSanitiseImage } from '../services/ai/image-validation.service.js';
import type { TutorImage } from '../services/ai/ai-provider.interface.js';
import { aiClientStatus } from '../services/ai/ai-availability.js';

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

export class TutorController {
  /** GET /api/v1/tutor/status - whether the tutor is paused and voice input is allowed. Flags only. */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');
      res.status(200).json({ success: true, data: aiClientStatus() });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/tutor/home - class, recent sessions and starter prompts. */
  async getHome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const data = await edTutorService.getHomeContext(req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/tutor/sessions */
  async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const input = createTutorSessionSchema.parse(req.body ?? {});
      const session = await tutorSessionService.createSession(req.user, input);

      res.status(201).json({ success: true, data: { session } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/tutor/sessions */
  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const { limit } = listTutorSessionsSchema.parse(req.query);
      const sessions = await tutorSessionService.listSessions(req.user.id, limit);

      res.status(200).json({ success: true, data: { sessions } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/tutor/sessions/:sessionId - full transcript for a refresh/reopen. */
  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const session = await tutorSessionService.getSessionDetail(
        String(req.params.sessionId),
        req.user.id
      );

      res.status(200).json({ success: true, data: { session } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/tutor/sessions/:sessionId - soft close, keeps the transcript. */
  async closeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      await tutorSessionService.closeSession(String(req.params.sessionId), req.user.id);
      res.status(200).json({ success: true, message: 'Session closed' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/tutor/sessions/:sessionId/stream
   *
   * One tutoring turn, streamed over Server-Sent Events. Reuses the same SSE
   * contract the lesson tutor already used, so the client stream reader is shared:
   *   data: {"chunk":"..."}   incremental text
   *   data: {"error":"..."}   recoverable failure
   *   data: [DONE]            end of turn
   */
  async streamTurn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError('Not authenticated');

      const sessionId = String(req.params.sessionId);

      // A photo turn arrives as multipart; a text turn as JSON. Both land here.
      const uploaded = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;

      // The image schema allows a photo with no caption, which the strict text
      // schema rightly rejects. Neither schema describes the image itself -
      // that is decided from the bytes, never from what the client claims.
      const input = uploaded
        ? tutorImageTurnSchema.parse(req.body ?? {})
        : tutorTurnSchema.parse(req.body);

      // Fail before the stream opens so real errors arrive as proper HTTP status
      // codes the client can act on, rather than as an SSE error frame.
      await tutorSessionService.getOwnedSession(sessionId, req.user.id);

      // Validate and strip the photo BEFORE a single token is spent. An invalid
      // image must never reach the model, and must never cost a generation.
      const images: TutorImage[] = [];
      if (uploaded) {
        const clean = await validateAndSanitiseImage(uploaded.buffer, uploaded.mimetype);
        images.push({ mimeType: clean.mimeType, data: clean.data });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
      });

      try {
        await edTutorService.streamTurn(
          req.user,
          sessionId,
          input,
          async (chunk) => {
            if (clientDisconnected) return;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          },
          images
        );

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError: unknown) {
        const message = safeStreamErrorMessage(streamError, 'tutor.stream');
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
          res.end();
        }
      }
    } catch (error) {
      if (res.headersSent) {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } else {
        next(error);
      }
    }
  }
}

export const tutorController = new TutorController();
