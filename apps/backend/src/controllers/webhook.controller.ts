import { Request, Response, NextFunction } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env.config.js';
import {
  deleteStudentByClerkId,
  linkOrCreateStudent
} from '../services/clerk-identity.service.js';
import { handleClerkWebhook, type WebhookDeps } from './clerk-webhook-handler.js';

/**
 * The real wiring of the Clerk webhook. The handling logic is in
 * clerk-webhook-handler.ts, which is tested offline. This file supplies the svix
 * signature check, the identity service, and the environment's webhook secret.
 */
const deps = (): WebhookDeps => ({
  webhookSecret: env.CLERK_WEBHOOK_SECRET,
  verify: (rawBody, headers) => new Webhook(env.CLERK_WEBHOOK_SECRET).verify(rawBody, headers),
  provision: (input) => linkOrCreateStudent(input),
  deleteByClerkId: (clerkUserId) => deleteStudentByClerkId(clerkUserId)
});

export class WebhookController {
  /**
   * POST /api/v1/webhooks/clerk
   *
   * Keeps the local student row in step with Clerk. The request body must be the
   * raw bytes, which is why this route is mounted before express.json().
   *
   * Signature verification is mandatory: without it anyone could POST a
   * user.deleted event and remove a student's data.
   */
  async handleClerk(req: Request, res: Response, next: NextFunction): Promise<void> {
    await handleClerkWebhook(deps(), req, res, next);
  }
}

export const webhookController = new WebhookController();
