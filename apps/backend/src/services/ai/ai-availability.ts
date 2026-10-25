import { env } from '../../config/env.config.js';
import { ServiceUnavailableError } from '../../errors/app.error.js';

/**
 * Whether ED may contact an external AI provider at all.
 *
 * A temporary, reversible pause, controlled by AI_TUTOR_MODE. It sits in front
 * of the provider rather than replacing it: the OpenRouter key, the model ids
 * and the teaching prompt all stay configured exactly as they are, they are
 * just not used while paused. Removing the variable (or setting it to 'live')
 * restores normal operation with nothing else to undo.
 *
 * Fail-safe in one direction only: anything other than 'live' or unset means
 * paused. A mistyped value stops AI requests; it can never start them.
 */

export type AiTutorMode = 'live' | 'paused';

/**
 * The only thing a student is told while the pause is on. Honest that the AI
 * is off, and points at what still works.
 */
export const AI_PAUSED_MESSAGE =
  "ED's AI tutor is paused for a little while. Your lessons and quizzes still work, so try ED again later.";

/** Pure, so every spelling can be tested. */
export function resolveAiTutorMode(raw: string | null | undefined): AiTutorMode {
  const value = (raw ?? '').trim().toLowerCase();
  return value === '' || value === 'live' ? 'live' : 'paused';
}

/** Read on every call, so a test can flip it; production sets it once at startup. */
export function isAiTutorPaused(): boolean {
  return resolveAiTutorMode(env.AI_TUTOR_MODE) === 'paused';
}

/** The error a paused AI request is refused with. A 503 carrying only the safe sentence. */
export function aiPausedError(): ServiceUnavailableError {
  return new ServiceUnavailableError(AI_PAUSED_MESSAGE, 'AI_TUTOR_PAUSED');
}
