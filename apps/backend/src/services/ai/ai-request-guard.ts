import { ConflictError } from '../../errors/app.error.js';

/**
 * At most one AI request at a time per key - a tutor session, or a student's
 * quiz hint.
 *
 * A double-click, a resubmitted form or a second browser tab would otherwise
 * start a second generation for a question that is already being answered,
 * spending free quota on a reply nobody reads. The frontend guards against
 * this too; this is the guarantee that holds whatever the client does.
 *
 * In memory, so it covers one server process - which is what the backend runs
 * as. A slot is released when its request finishes, and is treated as free
 * after STALE_AFTER_MS whatever happens, so a crash mid-request can never lock
 * a session permanently.
 */

/** Longer than the provider's 90s stream timeout plus the retry budget. */
const STALE_AFTER_MS = 3 * 60 * 1000;

const inFlight = new Map<string, number>();

/** What a student sees when they ask again while ED is still answering. */
export const AI_BUSY_MESSAGE = 'ED is still answering your last question. Wait for it to finish, then ask again.';

/**
 * Claims the slot for `key`, or returns null if a request already holds it.
 * The returned function releases the slot; calling it twice is harmless.
 */
export function tryAcquireAiSlot(key: string, now: number = Date.now()): (() => void) | null {
  const heldSince = inFlight.get(key);
  if (heldSince !== undefined && now - heldSince < STALE_AFTER_MS) return null;
  inFlight.set(key, now);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Only release our own claim, never a newer one that replaced a stale slot.
    if (inFlight.get(key) === now) inFlight.delete(key);
  };
}

/** A 409 carrying only the safe sentence. */
export function aiBusyError(): ConflictError {
  return new ConflictError(AI_BUSY_MESSAGE, 'AI_REQUEST_IN_PROGRESS');
}
