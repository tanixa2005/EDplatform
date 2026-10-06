import { Request, Response, NextFunction } from 'express';
import {
  createTutorSessionSchema,
  listTutorSessionsSchema,
  tutorTurnSchema
} from '@edplatform/shared';
import { edTutorService } from '../services/tutor/ed-tutor.service.js';
import { tutorSessionService } from '../services/tutor/tutor-session.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class TutorController {
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

      const input = tutorTurnSchema.parse(req.body);
      const sessionId = String(req.params.sessionId);

      // Fail before the stream opens so real errors arrive as proper HTTP status
      // codes the client can act on, rather than as an SSE error frame.
      await tutorSessionService.getOwnedSession(sessionId, req.user.id);

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
        await edTutorService.streamTurn(req.user, sessionId, input, async (chunk) => {
          if (clientDisconnected) return;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        });

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError: unknown) {
        const message =
          streamError instanceof Error ? streamError.message : 'ED could not reply just now';
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
