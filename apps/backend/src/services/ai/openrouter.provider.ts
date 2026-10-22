import { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';
import { categoryForStatus } from './failure-diagnostics.js';
import { describeOpenRouterFailure, formatFailureDetails } from './openrouter-failure.js';

/**
 * OpenRouter, via its OpenAI-compatible chat-completions API.
 *
 * Replaces the Gemini provider. The interface is unchanged on purpose: every
 * caller - the tutor stream, the quiz hint, the mistake analysis - talks to
 * `generateStream` and `generateStructured` and knows nothing about which
 * vendor is behind them, which is what made this swap a provider change rather
 * than a rewrite.
 *
 * Two rules this file inherits from the Gemini provider and must keep, both
 * asserted by the security suite:
 *
 *   1. It never touches the StreamMeta side-channel. That typed field carries
 *      the student's class, subject and curriculum as raw facts for the Mock
 *      provider to read; putting it on the wire would send the same
 *      information twice, in a shape nothing reviews. Only the assembled
 *      prompt, the history and the message leave this process.
 *   2. It never reads the environment directly. The key and the model id
 *      arrive as constructor arguments, so configuration stays in env.config
 *      and there is exactly one place that decides which provider is live.
 *
 * Nothing here logs a prompt, a reply, a request header or the key. A failure
 * logs its status, a fixed reason label and the numeric rate-limit fields,
 * which is what the retry policy and a human debugging an outage actually need.
 */

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Identifies the app to OpenRouter. Static strings, not configuration - they
 * appear on OpenRouter's own dashboards and carry nothing about a student.
 */
const APP_REFERER = 'https://edplatform.local';
const APP_TITLE = 'EDplatform AI';

/**
 * Wall-clock ceilings. The Google SDK managed this itself; raw fetch does not,
 * and a free-tier model that stops responding mid-stream would otherwise hold
 * a child's request open until the socket died. An abort after chunks have
 * already been sent is deliberately not retried upstream, because replaying
 * them would print the answer twice.
 */
const STREAM_TIMEOUT_MS = 90_000;
const STRUCTURED_TIMEOUT_MS = 60_000;

type ChatRole = 'system' | 'user' | 'assistant';

/** A text-only message, or a multimodal one for the image turn. */
type ChatContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
}

/**
 * Whether a vision route may be used at all.
 *
 * Exactly two forms are allowed: OpenRouter's own free router, and a model id
 * ending in ':free'. Anything else - a paid id, a paid variant such as
 * ':extended', an auto or alias route, a near-miss like ':free-ish' - is refused,
 * because a paid route would work perfectly and start billing.
 */
export function isFreeVisionRoute(id: string): boolean {
  if (id === 'openrouter/free') return true;
  return id.endsWith(':free') && id.length > ':free'.length;
}

/**
 * The provider error shape the retry policy already understands.
 *
 * `category` and `model` are carried for diagnostics only. Neither is ever put
 * into the message, which is what gets shown to a student in production.
 */
function providerError(
  message: string,
  status: number | null,
  category?: string,
  model?: string
): Error {
  const err = new Error(message) as Error & { status?: number; category?: string; model?: string };
  if (status !== null) err.status = status;
  err.category = category ?? categoryForStatus(status);
  if (model) err.model = model;
  return err;
}

/** Tags an error that arrived without a category, such as a dropped socket. */
function annotateFailure(err: unknown, category: string, model: string): unknown {
  if (err instanceof Error) {
    const tagged = err as Error & { category?: string; model?: string };
    if (!tagged.category) tagged.category = category;
    if (!tagged.model) tagged.model = model;
  }
  return err;
}

export class OpenRouterAITutorProvider implements IAITutorProvider {
  public readonly name = 'OpenRouterAITutorProvider';
  private readonly apiKey: string;
  private readonly model: string;
  /** Route for turns carrying a photo. Empty means photos are not supported. */
  private readonly visionModel: string;

  constructor(apiKey: string, model = 'nvidia/nemotron-3.5-lightning:free', visionModel = '') {
    this.apiKey = apiKey;
    this.model = model;

    // Zero budget is a hard rule, so a vision route that is not a ':free'
    // variant is not used at all. This is checked here, in the one place a
    // route becomes live, rather than trusted to whoever edits the config: a
    // paid id would otherwise work perfectly and simply start billing. The
    // refusal is visible - the capability reads false and the student is told
    // photos are unavailable - never a silent substitution.
    const requested = visionModel.trim();
    if (requested !== '' && !isFreeVisionRoute(requested)) {
      console.error(
        `[${this.name}] vision route "${requested}" is not an allowed free route ` +
          `('openrouter/free' or a ':free' model id) and will not be used`
      );
      this.visionModel = '';
    } else {
      this.visionModel = requested;
    }
  }

  /**
   * Only true once a vision route is configured.
   *
   * The ordinary tutoring model is text-only. Sending it an image produces a
   * well-formed request that the route refuses, which the retry policy then
   * reports as a provider outage - so the capability is declared up front and
   * checked before a single byte is uploaded.
   */
  public get supportsImages(): boolean {
    return this.visionModel !== '';
  }

  /** The route for this request: the vision one only when a photo is attached. */
  private modelFor(hasImage: boolean): string {
    return hasImage && this.supportsImages ? this.visionModel : this.model;
  }

  /**
   * The request headers.
   *
   * Built per call rather than stored, so the key exists in one short-lived
   * object and never ends up on an instance that something might serialise
   * into a log or an error.
   */
  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_TITLE
    };
  }

  /**
   * The conversation, in OpenAI message form.
   *
   * The assembled system prompt leads, then the stored transcript, then this
   * turn. `model` becomes `assistant`, which is the only shape difference
   * between our history and OpenAI's.
   */
  private buildMessages(params: {
    systemPrompt: string;
    userPrompt: string;
    history: { role: 'user' | 'model'; text: string }[];
    images: { mimeType: string; data: Buffer }[];
  }): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: params.systemPrompt }];

    for (const msg of params.history) {
      messages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text
      });
    }

    // Images belong to THIS turn only. Nothing persists them, so history is
    // text by construction and there is never an image to replay.
    if (params.images.length > 0) {
      const parts: Exclude<ChatContent, string> = [];
      for (const image of params.images) {
        // Base64 is produced here and nowhere else, and is never logged.
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.data.toString('base64')}` }
        });
      }
      parts.push({ type: 'text', text: params.userPrompt });
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: params.userPrompt });
    }

    return messages;
  }

  /**
   * Turns a non-OK response into a diagnosable error.
   *
   * The status alone could not tell a spent daily allowance from a free model
   * being throttled upstream - both are 429 - so they were retried alike. The
   * body is now read to tell them apart, but never copied: it can echo the
   * request back, and the request carries the student's question and photo.
   * describeOpenRouterFailure reduces it to a fixed reason label and numeric
   * rate-limit fields, and those are all that reach the log or the error.
   */
  private async failureFrom(res: Response, label: string, model: string): Promise<Error> {
    const category = categoryForStatus(res.status);
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // An unreadable body still leaves the status, which is enough to fail on.
    }
    const details = describeOpenRouterFailure(res.status, res.headers, bodyText);
    console.error(
      `[${this.name}] ${label} failed: status=${res.status} category=${category} model=${model} ` +
        formatFailureDetails(details)
    );
    const err = providerError(
      `OpenRouter ${label} failed with status ${res.status} (reason=${details.reason})`,
      res.status,
      category,
      model
    );
    // Read by the retry policy: whether waiting can help, and for how long.
    return Object.assign(err, { rateLimit: details });
  }

  public async generateStream(params: StreamParams): Promise<string> {
    const { systemPrompt, userPrompt, history = [], images = [], onChunk } = params;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    let fullText = '';
    const model = this.modelFor(images.length > 0);

    // A photo with no route that can read one must never be sent. The image
    // is not dropped and the turn is not quietly answered as though it were
    // text: the caller is told plainly, before anything is uploaded.
    if (images.length > 0 && !this.supportsImages) {
      clearTimeout(timeout);
      throw providerError(
        'This OpenRouter model cannot read images and no vision route is configured',
        400,
        'vision_not_configured',
        this.model
      );
    }

    try {
      const res = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: this.buildMessages({ systemPrompt, userPrompt, history, images }),
          temperature: 0.7,
          stream: true
        })
      });

      if (!res.ok) throw await this.failureFrom(res, 'stream', model);
      if (!res.body) {
        throw providerError('OpenRouter returned no response body', res.status, 'empty_stream', model);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // A single SSE event can arrive split across two network chunks, so
      // whatever follows the last newline is held back rather than parsed.
      let buffer = '';
      let done = false;

      while (!done) {
        const read = await reader.read();
        if (read.done) break;

        buffer += decoder.decode(read.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line === '') continue;
          // OpenRouter sends ": OPENROUTER PROCESSING" keep-alive comments
          // while a free-tier model is queued. They are not events.
          if (line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;

          const payload = line.slice('data:'.length).trim();
          if (payload === '[DONE]') {
            done = true;
            break;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(payload);
          } catch {
            // A malformed frame is skipped rather than failing the turn: the
            // student already has the text that came before it.
            continue;
          }

          // Only `content` is forwarded. Reasoning-style models also emit a
          // `reasoning` delta, which is working-out rather than an answer and
          // must never reach a child as though it were the explanation.
          const delta = (
            parsed as {
              choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
              error?: { message?: unknown; code?: unknown };
            }
          ).choices?.[0]?.delta?.content;

          // An error can arrive inside a 200 stream, which must not look like
          // a successful empty answer.
          const inlineError = (parsed as { error?: { message?: unknown; code?: unknown } }).error;
          if (inlineError) {
            const code = typeof inlineError.code === 'number' ? inlineError.code : null;
            console.error(`[${this.name}] stream carried an error frame: status=${code ?? 'none'}`);
            throw providerError('OpenRouter stream carried an error frame', code, 'stream_error', model);
          }

          if (typeof delta === 'string' && delta !== '') {
            fullText += delta;
            await onChunk(delta);
          }
        }
      }

      return fullText;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[${this.name}] stream aborted after ${STREAM_TIMEOUT_MS}ms`);
        // 408 so the retry policy treats a stalled request as transient.
        throw providerError('OpenRouter stream timed out', 408, 'timeout', model);
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[${this.name}] Stream error: ${errorMsg} model=${model}`);
      // A failure with no HTTP status is a socket-level one; name it so the
      // diagnostic says "network", not "no status".
      throw annotateFailure(err, 'network', model);
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateStructured<T>(params: StructuredParams<T>): Promise<T> {
    const { systemPrompt, userPrompt, fallbackGenerator } = params;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STRUCTURED_TIMEOUT_MS);

    try {
      const res = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          // Always the text model: structured generation summarises a quiz
          // attempt and never carries an image.
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          // Lower than the streaming path: this extracts a fixed shape rather
          // than teaching, so determinism beats variety.
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) throw await this.failureFrom(res, 'structured generation', this.model);

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw providerError('Empty response from OpenRouter', res.status, 'empty_response', this.model);
      }

      return JSON.parse(stripJsonFence(content)) as T;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.name === 'AbortError'
          ? `timed out after ${STRUCTURED_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      // Same contract as before: structured generation has a locally built
      // fallback, so a failure here degrades to that rather than failing the
      // student's request. The streaming path has no such fallback and throws.
      console.warn(
        `[${this.name}] Structured generation failed (${errorMsg}), falling back if available.`
      );
      if (fallbackGenerator) {
        return fallbackGenerator();
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Unwraps a ```json fence.
 *
 * `response_format: json_object` is advisory on OpenRouter: it is honoured by
 * the upstream model, and the smaller free models frequently return valid JSON
 * wrapped in a markdown fence anyway. Stripping it here turns a parse failure -
 * which would silently become the locally generated fallback analysis - back
 * into the real result.
 */
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}
