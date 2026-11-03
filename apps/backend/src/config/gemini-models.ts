/**
 * The Gemini API models EDplatform may use, and how each one is configured.
 *
 * An allowlist, not a pattern: GEMINI_MODEL must name one of these exactly, or
 * startup is refused (env.config.ts) and the provider will not construct. That
 * keeps out everything that would misbehave or cost money:
 *   - Gemma models (`gemma-*`), which are not Gemini models;
 *   - Gemini 2.5 models, which Google now restricts to projects that used them
 *     before - a new key will not reach them;
 *   - text-to-speech, image, live and embedding variants, which are not chat
 *     models;
 *   - models with no free tier, such as gemini-4-argon.
 *
 * Checked against Google's documentation on 24 October 2026 (models,
 * deprecations and pricing pages updated 22 October 2026; thinking page
 * updated 14 October 2026). Both entries are on the Gemini API free tier
 * ("Free of charge" for input and output) with no shutdown date announced,
 * and both are the models Google recommends for new projects.
 *
 * Output limits include thinking tokens (Google: max_output_tokens "including
 * thought tokens"), so a model that thinks more gets more headroom.
 */

export interface GeminiModelProfile {
  /** The lowest thinking level the model supports; sent on every request. */
  thinkingLevel: 'MINIMAL' | 'LOW';
  /** Ceiling for one tutor reply, thinking included. */
  tutorMaxOutputTokens: number;
  /** Ceiling for one structured quiz analysis, thinking included. */
  structuredMaxOutputTokens: number;
}

export const GEMINI_MODELS: Readonly<Record<string, GeminiModelProfile>> = {
  // Default. Thinking defaults to minimal and can stay there.
  'gemini-3.5-flash-lite': { thinkingLevel: 'MINIMAL', tutorMaxOutputTokens: 1024, structuredMaxOutputTokens: 2048 },
  // Supports low, medium and high only, so it thinks a little on every turn.
  'gemini-3.8-flash': { thinkingLevel: 'LOW', tutorMaxOutputTokens: 2048, structuredMaxOutputTokens: 3072 }
};

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** True only for a model on the allowlist above. */
export function isSupportedGeminiModel(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GEMINI_MODELS, id);
}
