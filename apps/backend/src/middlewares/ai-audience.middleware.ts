import type { NextFunction, Request, Response } from 'express';
import { runWithAiAudience } from '../services/ai/ai-audience.js';

/**
 * Records the signed-in account as the AI audience for the rest of the request
 * (see services/ai/ai-audience.ts). Must come after authenticate. A route that
 * leaves it out is treated as having no account, so live Gemini stays off.
 */
export function withAiAudience(req: Request, _res: Response, next: NextFunction): void {
  runWithAiAudience(req.user?.id ?? null, () => next());
}
