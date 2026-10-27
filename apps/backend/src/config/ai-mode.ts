/**
 * How AI_TUTOR_MODE is read. Pure and import-free, so env.config.ts can use it
 * during validation without importing the AI services (which import env).
 *
 * External AI is OFF unless the mode is exactly 'live' (any case, surrounding
 * spaces ignored). Unset, blank, 'paused' and every typo mean paused: a missing
 * or mistyped value stops AI requests, it can never start them.
 */

export type AiTutorMode = 'live' | 'paused';

/** The default when AI_TUTOR_MODE is absent. Kept here so the schema and tests agree. */
export const DEFAULT_AI_TUTOR_MODE: AiTutorMode = 'paused';

/** Pure, so every spelling can be tested. */
export function resolveAiTutorMode(raw: string | null | undefined): AiTutorMode {
  return (raw ?? '').trim().toLowerCase() === 'live' ? 'live' : 'paused';
}
