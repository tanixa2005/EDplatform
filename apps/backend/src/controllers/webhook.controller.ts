import { Request, Response, NextFunction } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env.config.js';
import {
  deleteStudentByClerkId,
  linkOrCreateStudent
} from '../services/clerk-identity.service.js';
import { BadRequestError, UnauthorizedError } from '../errors/app.error.js';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserEventData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
}

function primaryEmail(data: ClerkUserEventData): string | null {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return null;

  const primary = data.primary_email_address_id
    ? addresses.find((a) => a.id === data.primary_email_address_id)
    : undefined;

  return (primary ?? addresses[0]).email_address ?? null;
}

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
    try {
      if (!env.CLERK_WEBHOOK_SECRET) {
        throw new UnauthorizedError('Clerk webhooks are not configured on this server');
      }

      const payload = req.body;
      if (!Buffer.isBuffer(payload)) {
        throw new BadRequestError('Clerk webhook payload must be a raw body');
      }

      const headers = {
        'svix-id': req.header('svix-id') ?? '',
        'svix-timestamp': req.header('svix-timestamp') ?? '',
        'svix-signature': req.header('svix-signature') ?? ''
      };

      let event: ClerkWebhookEvent;
      try {
        const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET);
        event = webhook.verify(payload.toString('utf8'), headers) as unknown as ClerkWebhookEvent;
      } catch {
        throw new UnauthorizedError('Invalid Clerk webhook signature');
      }

      switch (event.type) {
        case 'user.created':
        case 'user.updated': {
          const email = primaryEmail(event.data);
          if (!email) {
            // Nothing actionable without an email; acknowledge so Clerk does not retry.
            break;
          }
          await linkOrCreateStudent({
            clerkUserId: event.data.id,
            email,
            firstName: event.data.first_name ?? '',
            lastName: event.data.last_name ?? '',
            avatarUrl: event.data.image_url ?? null
          });
          break;
        }

        case 'user.deleted': {
          await deleteStudentByClerkId(event.data.id);
          break;
        }

        default:
          // Other event types are acknowledged and ignored.
          break;
      }

      res.status(200).json({ success: true, data: { received: event.type } });
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
