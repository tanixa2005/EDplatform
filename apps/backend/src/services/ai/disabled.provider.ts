import type { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';
import { aiPausedError } from './ai-availability.js';

/**
 * The provider selected while external AI is not allowed (AI_TUTOR_MODE is not
 * 'live'). It has no network code at all: every request is refused with the
 * same pause error the service checks use.
 *
 * It exists so a caller that reaches `primaryProvider` without going through
 * the service checks - a new route, a refactor that drops a guard - still gets
 * an honest refusal, not an OpenRouter request and not a canned Mock reply.
 */
export class DisabledAITutorProvider implements IAITutorProvider {
  public readonly name = 'DisabledAITutorProvider';
  public readonly supportsImages = false;

  public async generateStream(_params: StreamParams): Promise<string> {
    throw aiPausedError();
  }

  public async generateStructured<T>(_params: StructuredParams<T>): Promise<T> {
    throw aiPausedError();
  }
}
