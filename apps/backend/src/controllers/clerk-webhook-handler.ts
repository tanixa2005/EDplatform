import type { NextFunction } from 'express';
import { BadRequestError, UnauthorizedError } from '../errors/app.error.js';
import { PROVISIONING_REFUSAL_CODES } from '../services/account-access.js';
import type { LinkOrCreateStudentInput } from '../services/clerk-identity-core.js';
import { primaryFromWebhook } from '../services/clerk-provisioning.js';

/**
 * The Clerk webhook handler, with every outside dependency passed in: the
 * webhook secret, the signature check, the provisioning call and the deletion.
 * The controller wires in the real ones (svix, the identity service). Tests wire
 * in fakes, so the real handling logic is exercised without a database or network.
 *
 * Policy for refusals, which are the expected outcomes of a sign-in that cannot be
 * linked (inactive account, unverified email, conflicting Clerk identity): the
 * event is acknowledged with a 200 and nothing is changed. Clerk is not asked to
 * retry something that cannot succeed. A later user.updated provisions the account
 * once it is verified or reactivated.
 *
 * Anything else is an unexpected error, and it goes to next() unchanged. It is
 * never swallowed.
 */

export interface ClerkEmailAddress {
  id: string;
  email_address: string;
  verification?: { status?: string | null } | null;
}

export interface ClerkUserEventData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

export interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
}

export interface WebhookDeps {
  /** The signing secret. Empty means webhooks are not configured on this server. */
  webhookSecret: string;
  /** Verifies the signature over the raw body, and returns the parsed event. Throws when invalid. */
  verify(rawBody: string, headers: Record<string, string>): unknown;
  /** Attaches a Clerk identity to an account, or creates one. */
  provision(input: LinkOrCreateStudentInput): Promise<unknown>;
  /** Removes or deactivates the account for a deleted Clerk user. */
  deleteByClerkId(clerkUserId: string): Promise<void>;
}

export interface WebhookRequest {
  body: unknown;
  header(name: string): string | undefined;
}

export interface WebhookResponse {
  status(code: number): { json(body: unknown): unknown };
}

export async function handleClerkWebhook(
  deps: WebhookDeps,
  req: WebhookRequest,
  res: WebhookResponse,
  next: NextFunction
): Promise<void> {
  try {
    if (!deps.webhookSecret) {
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
      event = deps.verify(payload.toString('utf8'), headers) as ClerkWebhookEvent;
    } catch {
      throw new UnauthorizedError('Invalid Clerk webhook signature');
    }

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const provision = primaryFromWebhook(event.data);
        if (!provision) {
          // Nothing actionable without an email; acknowledge so Clerk does not retry.
          break;
        }
        try {
          await deps.provision({
            clerkUserId: event.data.id,
            email: provision.email,
            emailVerified: provision.verified,
            firstName: event.data.first_name ?? '',
            lastName: event.data.last_name ?? '',
            avatarUrl: event.data.image_url ?? null
          });
        } catch (error) {
          if (error instanceof UnauthorizedError && PROVISIONING_REFUSAL_CODES.includes(error.code)) {
            break;
          }
          throw error;
        }
        break;
      }

      case 'user.deleted': {
        await deps.deleteByClerkId(event.data.id);
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
