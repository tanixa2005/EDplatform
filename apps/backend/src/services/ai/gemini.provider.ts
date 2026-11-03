import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  isSupportedGeminiModel,
  type GeminiModelProfile
} from '../../config/gemini-models.js';
import { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';
import { aiPausedError, isExternalAiAllowed } from './ai-availability.js';
import { categoryForStatus } from './failure-diagnostics.js';
import { describeGeminiFailure, formatGeminiFailure } from './gemini-failure.js';

/**
 * The direct Gemini API, through Google's official GenAI SDK.
 *
 * Selected only when AI_PROVIDER=gemini (see provider.factory.ts). It follows
 * the same rules as the OpenRouter provider, and the security suite checks
 * them by reading this file:
 *
 *   1. Only the assembled system prompt, the stored history and this turn's
 *      message (and photo) leave the process. The typed side-channel on
 *      StreamParams that the Mock reads is never used here.
 *   2. It never reads the environment. The key and the model id arrive as
 *      constructor arguments; env.config and the factory decide everything.
 *   3. Nothing here logs a prompt, a reply, a header, the key or Google's
 *      error text. A failure logs its status, a fixed reason label and a retry
 *      delay - see gemini-failure.ts.
 *
 * The key travels in the SDK's x-goog-api-key request header, never in a URL,
 * and is held only by the SDK client.
 */

/** Wall-clock ceilings, matching the OpenRouter provider. */
const STREAM_TIMEOUT_MS = 90_000;
const STRUCTURED_TIMEOUT_MS = 60_000;

/*
 * Output ceilings and thinking level come from the model's profile in
 * config/gemini-models.ts. They bound the free quota one request can use: a
 * tutor turn is meant to fit a phone screen, and 1024 tokens is roughly 700
 * words, well above a normal ED reply, so a full explanation is not cut short
 * in ordinary use. Thinking tokens count toward the ceiling, which is why the
 * lowest thinking level each model supports is always sent.
 */

/** Finish or block reasons that mean the model will not answer this request. */
const DECLINED_REASONS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
  'OTHER'
]);

/** The provider error shape the retry policy reads. Never carries body text. */
function providerError(message: string, status: number | null, category: string, model: string): Error {
  const err = new Error(message) as Error & { status?: number; category?: string; model?: string };
  if (status !== null) err.status = status;
  err.category = category;
  err.model = model;
  return err;
}

/** True for an error this file already built, so it is not wrapped twice. */
function isOwnError(err: unknown): err is Error & { category: string } {
  return err instanceof Error && typeof (err as { category?: unknown }).category === 'string';
}

export class GeminiAITutorProvider implements IAITutorProvider {
  public readonly name = 'GeminiAITutorProvider';
  /** The allowlisted Gemini models all accept inline images (Gemini API image understanding). */
  public readonly supportsImages = true;
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly profile: GeminiModelProfile;

  constructor(apiKey: string, model: string = DEFAULT_GEMINI_MODEL) {
    // A second line of defence behind env.config: only an allowlisted Gemini
    // model can be used. A Gemma id, a 2.5 model or a TTS/image variant is
    // refused here before any client exists. The id is not secret; the key
    // never appears in this message.
    if (!isSupportedGeminiModel(model)) {
      throw new Error(`Unsupported Gemini model "${model}". Allowed: ${Object.keys(GEMINI_MODELS).join(', ')}`);
    }
    // Pins the SDK to one attempt per call. The SDK only retries when
    // retryOptions is given, and then defaults to five attempts on 429 and 5xx;
    // stating attempts: 1 keeps its retries off even if a default changes, so
    // the retry policy in provider.factory.ts stays the only one and a single
    // student turn can never become hidden quota-consuming repeats.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
    this.model = model;
    this.profile = GEMINI_MODELS[model];
  }

  /** The generation settings for one request. The system prompt is passed through unchanged. */
  private configFor(systemPrompt: string, kind: 'tutor' | 'structured', signal: AbortSignal): GenerateContentConfig {
    return {
      systemInstruction: systemPrompt,
      temperature: kind === 'tutor' ? 0.7 : 0.3,
      maxOutputTokens: kind === 'tutor' ? this.profile.tutorMaxOutputTokens : this.profile.structuredMaxOutputTokens,
      // The lowest level the model supports: thinking tokens are spent from the
      // same free quota and output ceiling, for little benefit to a Class 6-8
      // explanation.
      thinkingConfig: { thinkingLevel: ThinkingLevel[this.profile.thinkingLevel] },
      // Quiz analysis asks for JSON; JSON mode makes the reply parseable.
      ...(kind === 'structured' ? { responseMimeType: 'application/json' } : {}),
      abortSignal: signal
    };
  }

  /** Turns any failure into the provider error shape, logging only safe facts. */
  private failureFrom(err: unknown, label: string, timedOut: boolean): Error {
    if (isOwnError(err)) return err;

    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      console.error(`[${this.name}] ${label} timed out: model=${this.model}`);
      return providerError(`Gemini ${label} timed out`, 408, 'timeout', this.model);
    }

    if (err instanceof ApiError || typeof (err as { status?: unknown } | null)?.status === 'number') {
      const status = (err as { status: number }).status;
      const details = describeGeminiFailure(status, err instanceof Error ? err.message : '');
      const category = categoryForStatus(status);
      console.error(
        `[${this.name}] ${label} failed: status=${status} category=${category} model=${this.model} ` +
          formatGeminiFailure(details)
      );
      const failure = providerError(
        `Gemini ${label} failed with status ${status} (reason=${details.reason})`,
        status,
        category,
        this.model
      );
      // Read by the retry policy and the student-facing message: whether
      // waiting can help, for how long, and whether this is our own quota.
      return Object.assign(failure, {
        rateLimit: { reason: details.reason, retryAfterMs: details.retryAfterMs },
        quotaExhausted: status === 429
      });
    }

    // No HTTP status: a dropped connection or DNS failure. Named, not echoed.
    console.error(`[${this.name}] ${label} failed: category=network model=${this.model}`);
    return providerError(`Gemini ${label} failed: network error`, null, 'network', this.model);
  }

  public async generateStream(params: StreamParams): Promise<string> {
    // The network-level check, as in the OpenRouter provider: nothing is sent
    // while external AI is off or the account is not an allowlisted adult.
    if (!isExternalAiAllowed()) throw aiPausedError();
    const { systemPrompt, userPrompt, history = [], images = [], onChunk } = params;

    // A part is either text or inline binary. History is always text: images
    // are never persisted, so there is nothing to replay from earlier turns.
    type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    const contents: Array<{ role: string; parts: GeminiPart[] }> = history.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Current turn: the image (if any) comes first so the model has it before
    // the question about it. Base64 is produced here and nowhere else, and is
    // never logged.
    const currentParts: GeminiPart[] = images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') }
    }));
    currentParts.push({ text: userPrompt });
    contents.push({ role: 'user', parts: currentParts });

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STREAM_TIMEOUT_MS);

    let fullText = '';
    let declined = false;

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: this.configFor(systemPrompt, 'tutor', controller.signal)
      });

      for await (const chunk of stream) {
        if (chunk.promptFeedback?.blockReason) declined = true;
        const finish = chunk.candidates?.[0]?.finishReason;
        if (finish && DECLINED_REASONS.has(String(finish))) declined = true;

        const text = chunk.text;
        if (text) {
          fullText += text;
          await onChunk(text);
        }
      }

      // A refusal is not an outage: retrying the same request gets the same
      // refusal and spends quota each time. 400 makes it permanent.
      if (fullText === '' && declined) {
        console.error(`[${this.name}] stream declined by the model: model=${this.model}`);
        throw providerError('Gemini declined to answer this request', 400, 'content_declined', this.model);
      }

      return fullText;
    } catch (err: unknown) {
      throw this.failureFrom(err, 'stream', timedOut);
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateStructured<T>(params: StructuredParams<T>): Promise<T> {
    if (!isExternalAiAllowed()) throw aiPausedError();
    const { systemPrompt, userPrompt, fallbackGenerator } = params;

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STRUCTURED_TIMEOUT_MS);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: this.configFor(systemPrompt, 'structured', controller.signal)
      });

      const text = response.text;
      if (typeof text !== 'string' || text.trim() === '') {
        throw providerError('Empty response from Gemini', 502, 'empty_response', this.model);
      }

      try {
        return JSON.parse(stripJsonFence(text)) as T;
      } catch {
        // The parse error's own message can quote the reply, which can quote
        // the student's answers, so it is replaced rather than kept.
        throw providerError('Gemini returned malformed JSON', 502, 'invalid_json', this.model);
      }
    } catch (err: unknown) {
      const failure = this.failureFrom(err, 'structured generation', timedOut);
      // Same contract as the OpenRouter provider: structured generation has a
      // locally built fallback, so a failure degrades to it. One request, no
      // retry - the local analysis is a complete answer on its own.
      console.warn(
        `[${this.name}] Structured generation failed (${(failure as { category?: string }).category ?? 'unknown'}), falling back if available.`
      );
      if (fallbackGenerator) {
        return fallbackGenerator();
      }
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Unwraps a ```json fence, which smaller models add even when asked for bare JSON. */
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}
