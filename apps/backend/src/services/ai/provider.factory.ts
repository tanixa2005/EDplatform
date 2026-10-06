import { env } from '../../config/env.config.js';
import type { IAITutorProvider, StreamParams } from './ai-provider.interface.js';
import { GeminiAITutorProvider } from './gemini.provider.js';
import { MockAITutorProvider } from './mock.provider.js';

/**
 * Single shared provider pair for every AI feature.
 *
 * Previously each service constructed its own Gemini client. Centralising it
 * keeps one client (and one JWKS/connection pool) per process, and gives every
 * caller the same mock fallback when GEMINI_API_KEY is unset - which is what lets
 * the app run and be tested with no API key.
 */
export const mockProvider = new MockAITutorProvider();

export const primaryProvider: IAITutorProvider = (() => {
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim() !== '') {
    console.log('🤖 AI provider: Gemini (gemini-2.5-flash)');
    return new GeminiAITutorProvider(env.GEMINI_API_KEY);
  }
  console.log('🤖 AI provider: Mock (GEMINI_API_KEY not set)');
  return mockProvider;
})();

/**
 * Streams from Gemini, falling back to the mock provider if the call fails, so a
 * provider outage degrades to a usable response instead of a broken screen.
 */
export async function streamWithFallback(params: StreamParams): Promise<string> {
  try {
    return await primaryProvider.generateStream(params);
  } catch (err) {
    console.warn('[AI] Primary provider failed, falling back to mock provider:', err);
    return mockProvider.generateStream(params);
  }
}
