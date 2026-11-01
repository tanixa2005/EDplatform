import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who the current AI request is for, so live Gemini can be limited to adults.
 *
 * Google's Gemini API terms require users to be 18+ and restrict services
 * likely to be accessed by under-18s. EDplatform's students are in Classes
 * 6-8, so live Gemini is served only to the authorised adult project-team
 * accounts listed in AI_LIVE_ALLOWED_EMAILS. Every other account is answered
 * exactly as when AI_TUTOR_MODE is paused.
 *
 * The audience is set per request by withAiAudience (after authenticate) and
 * read by ai-availability.ts. Fail-closed: outside a request with an audience
 * - a route that forgot the middleware, a background job - nobody is allowed,
 * so a gap pauses the AI rather than exposing it.
 */

interface AiAudience {
  email: string | null;
}

const storage = new AsyncLocalStorage<AiAudience>();

/** Runs `fn` with the given account as the AI audience. */
export function runWithAiAudience<T>(email: string | null | undefined, fn: () => T): T {
  return storage.run({ email: normaliseEmail(email) }, fn);
}

/** Lower-cased and trimmed, so the allowlist is not case-sensitive. */
function normaliseEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value === '' ? null : value;
}

/** Pure, so every spelling can be tested. Comma-separated; blanks ignored. */
export function parseAllowedEmails(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => normaliseEmail(entry))
      .filter((entry): entry is string => entry !== null)
  );
}

/** Whether the current request's account is on the allowlist. False outside a request. */
export function isCurrentAudienceAllowed(rawAllowlist: string | null | undefined): boolean {
  const email = storage.getStore()?.email ?? null;
  if (email === null) return false;
  return parseAllowedEmails(rawAllowlist).has(email);
}
