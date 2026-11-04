import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Whether the current AI request comes from a signed-in EDplatform account.
 *
 * Live Gemini is served to any authenticated account and never to an
 * anonymous visitor. `authenticate` already refuses anonymous requests on
 * every AI route; this is the second line behind it, checked by
 * ai-availability.ts and so inside the Gemini provider before anything is sent.
 *
 * The audience is set per request by withAiAudience (after authenticate).
 * Fail-closed: outside a request with an account - a route that forgot the
 * middleware, a background job - live Gemini is off, so a gap pauses the AI
 * rather than exposing it.
 */

interface AiAudience {
  userId: string | null;
}

const storage = new AsyncLocalStorage<AiAudience>();

/** Runs `fn` with the given account (or none) as the AI audience. */
export function runWithAiAudience<T>(userId: string | null | undefined, fn: () => T): T {
  const value = (userId ?? '').trim();
  return storage.run({ userId: value === '' ? null : value }, fn);
}

/** Whether the current request has a signed-in account. False outside a request. */
export function isCurrentAudienceAuthenticated(): boolean {
  return (storage.getStore()?.userId ?? null) !== null;
}
