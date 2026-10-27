import { env } from '../../config/env.config.js';
import { resolveAiTutorMode } from '../../config/ai-mode.js';
import { ServiceUnavailableError } from '../../errors/app.error.js';

/**
 * Whether ED may contact an external AI provider at all.
 *
 * Controlled by AI_TUTOR_MODE and OFF by default: only 'live' allows external
 * AI. It sits in front of the provider rather than replacing it: the
 * OpenRouter model ids and the teaching prompt all stay configured exactly as
 * they are, they are just not used while paused. Setting AI_TUTOR_MODE=live
 * (with a key) restores normal operation with nothing else to undo.
 *
 * Two questions, kept apart on purpose:
 *   - isAiTutorPaused(): do students get the pause message? Not in the offline
 *     demo, whose Mock tutor is local and is the point of the demo.
 *   - isExternalAiAllowed(): may a request leave for an AI provider? Only in
 *     live mode, and never in the offline demo.
 *
 * Fail-safe in one direction only: anything other than 'live' means paused. A
 * mistyped or missing value stops AI requests; it can never start them.
 */

export { resolveAiTutorMode, type AiTutorMode } from '../../config/ai-mode.js';

/**
 * The only thing a student is told while the pause is on. Honest that the AI
 * is off, and points at what still works.
 */
export const AI_PAUSED_MESSAGE =
  "ED's AI tutor is paused for a little while. Your lessons and quizzes still work, so try ED again later.";

/**
 * Whether AI features refuse with the pause message. Read on every call, so a
 * test can flip it; production sets it once at startup.
 *
 * The offline demo is never paused: env validation guarantees it has no key,
 * so its provider is always the local Mock and nothing can leave the process.
 */
export function isAiTutorPaused(): boolean {
  if (env.OFFLINE_DEMO_AI) return false;
  return resolveAiTutorMode(env.AI_TUTOR_MODE) === 'paused';
}

/**
 * Whether a request may be sent to an external AI provider. The network-level
 * check: every OpenRouter request method calls it before fetch, so a caller
 * that skips the service checks is still refused. Read on every call.
 */
export function isExternalAiAllowed(): boolean {
  if (env.OFFLINE_DEMO_AI) return false;
  return resolveAiTutorMode(env.AI_TUTOR_MODE) === 'live';
}

/**
 * What the frontend is told about AI, as flags only: no key, no model id.
 *
 * `voiceInputAllowed` follows the network rule, not the pause: browser speech
 * recognition sends the student's audio to the browser vendor's speech
 * service, so the mic is offered only when external AI is allowed. That keeps
 * it hidden in the offline demo too, where the tutor answers but nothing may
 * leave the device.
 */
export function aiClientStatus(): { tutorPaused: boolean; voiceInputAllowed: boolean } {
  return { tutorPaused: isAiTutorPaused(), voiceInputAllowed: isExternalAiAllowed() };
}

/** The error a paused AI request is refused with. A 503 carrying only the safe sentence. */
export function aiPausedError(): ServiceUnavailableError {
  return new ServiceUnavailableError(AI_PAUSED_MESSAGE, 'AI_TUTOR_PAUSED');
}
