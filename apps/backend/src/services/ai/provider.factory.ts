import { env } from '../../config/env.config.js';
import { ServiceUnavailableError } from '../../errors/app.error.js';
import type { IAITutorProvider, StreamParams } from './ai-provider.interface.js';
import { MockAITutorProvider } from './mock.provider.js';
import { failureCategory, providerFailureDiagnostic } from './failure-diagnostics.js';
import { FREE_FALLBACK_MODEL, createFreeModelGate, isAllowlistedFreeModel } from './free-model-guard.js';
import type { OpenRouterFailureDetails } from './openrouter-failure.js';
import { OpenRouterAITutorProvider } from './openrouter.provider.js';

/**
 * Single shared provider pair for every AI feature.
 *
 * Centralising it keeps one client (and one connection pool) per process, and
 * selects the Mock provider when OPENROUTER_API_KEY is unset - which is what
 * lets the app run and be tested with no API key.
 *
 * This is the one place that decides which vendor is live. The Gemini provider
 * was removed from that decision here; every caller reaches a provider only
 * through `primaryProvider`, so nothing else needed to change.
 */
export const mockProvider = new MockAITutorProvider();

export const primaryProvider: IAITutorProvider = (() => {
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim() !== '') {
    // Model ids only, never the key.
    console.log(
      `🤖 AI provider: OpenRouter (${env.OPENROUTER_MODEL}), photos: ` +
        `${env.OPENROUTER_VISION_MODEL.trim() === '' ? 'not supported - no vision route configured' : env.OPENROUTER_VISION_MODEL}`
    );
    return new OpenRouterAITutorProvider(
      env.OPENROUTER_API_KEY,
      env.OPENROUTER_MODEL,
      env.OPENROUTER_VISION_MODEL
    );
  }
  if (env.OFFLINE_DEMO_AI) {
    // Explicit and opt-in. Logged as a demo so it is never mistaken for live tutoring.
    console.log('🤖 AI provider: OFFLINE DEMO (Mock; no AI requests are made)');
    return mockProvider;
  }
  console.log('🤖 AI provider: Mock (OPENROUTER_API_KEY not set)');
  return mockProvider;
})();

/** True when this process has no real provider at all - local dev with no key. */
export const isOfflineProvider = primaryProvider.name === mockProvider.name;

/**
 * The free fallback route, used only when the primary fails in a way another
 * upstream could avoid. See free-model-guard.ts for why it is this model and
 * how "free" is enforced.
 *
 * Built only when a real key is configured, with the same key and the
 * zero-price cap on every request. The Mock and the offline demo never get one.
 * A mutable holder rather than two constants so the offline tests can put a
 * scripted route in its place; nothing in production reassigns it.
 */
export const aiFallback: {
  provider: IAITutorProvider | null;
  gate: ReturnType<typeof createFreeModelGate>;
} = {
  provider:
    !isOfflineProvider && isAllowlistedFreeModel(FREE_FALLBACK_MODEL)
      ? new OpenRouterAITutorProvider(env.OPENROUTER_API_KEY, FREE_FALLBACK_MODEL, FREE_FALLBACK_MODEL, {
          zeroPriceCap: true
        })
      : null,
  gate: createFreeModelGate(FREE_FALLBACK_MODEL)
};
if (aiFallback.provider) {
  console.log(`🤖 AI fallback: ${FREE_FALLBACK_MODEL} (free only, verified before use)`);
}

/**
 * Retry policy, in one place rather than scattered through the call sites.
 *
 * Deliberately small: a student is waiting, and three fast attempts cover the
 * brief 503 spikes seen in practice without turning a slow outage into a
 * ten-second stare at a blank screen.
 */
export const AI_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 2000,
  /**
   * A ceiling on the WHOLE operation, not on one attempt.
   *
   * Without this, the attempt count and the provider's own timeout multiply: a
   * stream that stalls until the provider aborts it reports 408, which is
   * transient, so it was retried - three 90-second stalls in a row, and a
   * child left watching a spinner for four and a half minutes.
   *
   * Retries exist for failures that come back FAST (a 503 spike, a dropped
   * socket). Set deliberately below the provider's stream timeout so a slow
   * failure exhausts the budget on its first attempt and is reported instead
   * of being tried again.
   */
  totalBudgetMs: 60_000,
  /**
   * Backoff for a 429 specifically.
   *
   * The ordinary 400ms/800ms schedule suits a 503 spike, but against a rate
   * limit it spent all three attempts inside 1.7 seconds - inside the very
   * window that refused the first one. A throttled free model needs seconds,
   * not milliseconds: 2s then 4s, or the provider's own Retry-After when it
   * gives one.
   */
  rateLimitBaseDelayMs: 2_000,
  /**
   * The longest wait honoured for one 429 retry. A Retry-After beyond this is
   * not waited out: the student would sit through it only to be refused again
   * at the next limit, so the honest message comes sooner instead.
   */
  rateLimitMaxDelayMs: 8_000,
  /** A wait longer than this is a quota, not a burst, and is never retried. */
  longLivedQuotaMs: 120_000
} as const;

/**
 * The only provider-failure text a student ever sees.
 *
 * No model id, no HTTP status, no quota wording, no vendor name. Those go to
 * the server log; the child gets a sentence that tells them what to do.
 */
export const AI_UNAVAILABLE_MESSAGE =
  'ED is having trouble connecting right now. Try again in a moment.';

/**
 * Whether an error is worth trying again.
 *
 * Transient means the same request might succeed shortly: rate limits,
 * capacity spikes, gateway hiccups, dropped sockets. Permanent means retrying
 * burns the student's time for nothing - a bad key, a withdrawn model, a
 * malformed request. C9 hit both: a 404 for a retired model (permanent) and
 * repeated 503s for capacity (transient).
 */
export function isTransientProviderError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status !== null) {
    // A 429 is usually a short burst limit and worth retrying - but a daily
    // free-tier quota also arrives as 429, with a retry delay measured in
    // hours. Retrying that three times just makes the child wait longer for
    // the same failure, so it is treated as permanent.
    if (status === 429) return !isLongLivedQuotaError(err);
    if (status === 408) return true;
    if (status >= 500) return true;
    return false;
  }

  // No status: a socket-level failure, which is worth one more go.
  const text = errorText(err).toLowerCase();
  return (
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('enotfound') ||
    text.includes('socket hang up') ||
    text.includes('network') ||
    text.includes('fetch failed')
  );
}

/**
 * A quota exhaustion that will not clear within the student's patience.
 *
 * Both vendors report "too many requests this minute" and "you have used your
 * allowance for today" as 429, and only the wording distinguishes them.
 * OpenRouter's free tier is the case that matters now: it answers an exhausted
 * daily allowance with a 429 naming a per-day limit, and retrying that three
 * times just makes a child wait longer for the same refusal.
 */
function isLongLivedQuotaError(err: unknown): boolean {
  // What the OpenRouter provider parsed from the response, when it has it.
  const details = rateLimitDetails(err);
  if (details) {
    if (details.reason === 'daily_quota') return true;
    if (details.retryAfterMs !== null && details.retryAfterMs > AI_RETRY.longLivedQuotaMs) return true;
  }

  const text = errorText(err);
  const retryDelay = text.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (retryDelay && Number(retryDelay[1]) * 1000 > AI_RETRY.longLivedQuotaMs) return true;
  return /PerDay|per[-\s]day|daily limit|free-models-per-day/i.test(text);
}

/** The parsed rate-limit facts the OpenRouter provider attaches to a failure. */
function rateLimitDetails(err: unknown): OpenRouterFailureDetails | null {
  const details = (err as { rateLimit?: unknown } | null)?.rateLimit;
  return details && typeof details === 'object' ? (details as OpenRouterFailureDetails) : null;
}

/**
 * How long to wait before the next attempt, or null when waiting cannot help.
 *
 * A 429 gets its own, slower schedule (see AI_RETRY.rateLimitBaseDelayMs) and
 * honours the provider's Retry-After when it is short enough to sit through.
 * Everything else keeps the original fast schedule.
 */
export function retryDelayMs(err: unknown, attempt: number): number | null {
  if (extractStatus(err) !== 429) return backoffDelayMs(attempt);

  const hinted = rateLimitDetails(err)?.retryAfterMs ?? null;
  if (hinted !== null) {
    if (hinted > AI_RETRY.rateLimitMaxDelayMs) return null;
    return Math.max(hinted, AI_RETRY.baseDelayMs);
  }
  return Math.min(AI_RETRY.rateLimitBaseDelayMs * 2 ** (attempt - 1), AI_RETRY.rateLimitMaxDelayMs);
}

function extractStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const direct = (err as { status?: unknown }).status;
    if (typeof direct === 'number') return direct;
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'number') return code;
  }
  // The OpenRouter provider sets `status` directly, so the direct path above
  // covers it. This fallback parses a status nested inside the message JSON,
  // which is the shape the Google SDK used and which the reliability tests
  // still script, so it stays.
  const match = errorText(err).match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : null;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.message}`;
  return String(err);
}

function backoffDelayMs(attempt: number): number {
  return Math.min(AI_RETRY.baseDelayMs * 2 ** (attempt - 1), AI_RETRY.maxDelayMs);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Trims whitespace from the FRONT of a reply, across chunk boundaries.
 *
 * Models open with a stray newline or two often enough to matter. The stored
 * message was already trimmed before being saved, so a student saw a reply
 * that began with a blank line while it streamed and then saw it jump up on
 * reload. This closes that gap at the one place every streaming caller passes
 * through.
 *
 * Why a stateful function rather than a per-chunk trim: trimming each chunk
 * independently would eat the single space in ['Hello', ' ', 'world'] and the
 * blank line between paragraphs. This strips only while nothing has been
 * emitted yet - once one non-whitespace character is out, every later chunk is
 * passed through byte for byte, so internal blank lines, Markdown, LaTeX and
 * code fences are untouched.
 *
 * Nothing is buffered: each chunk is forwarded or dropped immediately. The
 * trailing end of a reply is deliberately left alone, because trimming that
 * would mean holding text back from a student who is already reading.
 *
 * Returns '' for a chunk that should not be forwarded at all.
 */
export function createLeadingWhitespaceTrimmer(): (chunk: string) => string {
  let startedEmitting = false;
  return (chunk: string): string => {
    if (startedEmitting) return chunk;
    const trimmed = chunk.replace(/^\s+/, '');
    if (trimmed === '') return '';
    startedEmitting = true;
    return trimmed;
  };
}

/**
 * Streams a tutoring turn from the configured provider.
 *
 * What changed in C9.1, and why it matters: this used to catch any provider
 * failure and quietly return a Mock answer. A retired model id did exactly
 * that during C9 - every student would have received offline stub text
 * ("I don't have an offline explanation... set the API key") believing it
 * was ED, and nothing would have surfaced the fault. That hazard is if
 * anything larger on a free-tier model, which is rate limited by the day.
 *
 * Now a real provider that fails stays failed: the detail is logged server
 * side, and the caller gets one safe sentence. The Mock is still used when it
 * IS the configured provider (no API key, i.e. local development), which is an
 * explicit choice rather than a silent substitution.
 *
 * Retries only happen before any text has reached the student. Once chunks are
 * out, retrying would replay them and the answer would read twice.
 */
/**
 * The retry decision, as a pure function so every branch can be tested without
 * waiting out a real timeout.
 *
 * Five independent reasons not to try again:
 *   - the failure is permanent (a bad key, a retired model, an exhausted
 *     daily allowance): the same request will fail the same way;
 *   - text already reached the student: a retry would print the answer twice;
 *   - attempts are used up;
 *   - the student has already waited longer than the whole operation's budget,
 *     or the wait before the next attempt would carry them past it, so
 *     starting over would be worse than an honest failure;
 *   - the provider asked for a longer wait than a student should sit through
 *     (`nextDelayMs` is null).
 *
 * `nextDelayMs` is optional so a caller that does not know the delay gets the
 * original four rules unchanged.
 */
export function shouldRetryProviderCall(state: {
  transient: boolean;
  emittedAnything: boolean;
  attempt: number;
  elapsedMs: number;
  nextDelayMs?: number | null;
}): { retry: boolean; reason: string } {
  if (!state.transient) return { retry: false, reason: 'permanent' };
  if (state.emittedAnything) return { retry: false, reason: 'already-streamed' };
  if (state.attempt >= AI_RETRY.maxAttempts) return { retry: false, reason: 'attempts-exhausted' };
  if (state.elapsedMs >= AI_RETRY.totalBudgetMs) return { retry: false, reason: 'budget-exhausted' };
  if (state.nextDelayMs === null) return { retry: false, reason: 'wait-too-long' };
  if (state.nextDelayMs !== undefined && state.elapsedMs + state.nextDelayMs >= AI_RETRY.totalBudgetMs) {
    return { retry: false, reason: 'budget-exhausted' };
  }
  return { retry: true, reason: 'transient' };
}

/**
 * Whether a failed primary attempt should move to the free fallback.
 *
 * Only for a failure another upstream could avoid: a non-daily 429, a 5xx, a
 * timeout, a dropped connection or an empty stream - exactly the errors
 * `isTransientProviderError` calls transient. Never for a permanent error (a
 * bad key fails the same way on any model; a malformed request likewise), and
 * never for a daily or long-lived quota: those are classified permanent from
 * the actual response, not assumed to be shared or separate.
 *
 * Never once anything has reached the student either - the fallback would
 * start the answer again and the student would read it twice. And never when
 * the attempt or time budget is already spent.
 */
export function shouldSwitchToFallback(state: {
  transient: boolean;
  emittedAnything: boolean;
  attempt: number;
  elapsedMs: number;
}): boolean {
  if (!state.transient || state.emittedAnything) return false;
  if (state.attempt >= AI_RETRY.maxAttempts) return false;
  return state.elapsedMs < AI_RETRY.totalBudgetMs;
}

/** A provider that finished without saying anything. Transient: worth one more go. */
function emptyStreamError(): Error {
  const err = new Error('The provider completed the stream without returning any text');
  Object.assign(err, { status: 502, category: 'empty_stream' });
  return err;
}

export async function streamWithFallback(params: StreamParams): Promise<string> {
  // No special case for the offline provider. When the Mock IS the configured
  // provider it simply never throws, so this path behaves identically for it -
  // and keeping one code path means the retry and failure behaviour is the
  // same one the tests exercise, whether or not a key is present.
  let emittedAnything = false;
  // One trimmer for the whole call, not one per attempt: if an attempt emitted
  // nothing but whitespace before failing, the next attempt is still at the
  // start of the reply and should still be trimmed.
  const trimLeading = createLeadingWhitespaceTrimmer();
  const guardedParams: StreamParams = {
    ...params,
    onChunk: async (chunk: string) => {
      const normalised = trimLeading(chunk);
      // A whitespace-only chunk before any real text is dropped rather than
      // forwarded, so `emittedAnything` now means "the student has actually
      // seen something", which is the question the retry rule is asking.
      if (normalised === '') return;
      emittedAnything = true;
      await params.onChunk(normalised);
    }
  };

  let lastError: unknown = null;
  const startedAt = Date.now();
  const needsImages = Boolean(params.images && params.images.length > 0);

  // Which route this attempt uses. It starts on the primary and moves to the
  // fallback at most once; it never moves back.
  let provider: IAITutorProvider = primaryProvider;
  let onFallback = false;

  // The attempt count is shared across both routes, so a turn never makes
  // more than AI_RETRY.maxAttempts upstream requests in total - the same
  // ceiling as before the fallback existed. Every one of them counts against
  // the account's free daily allowance.
  for (let attempt = 1; attempt <= AI_RETRY.maxAttempts; attempt += 1) {
    try {
      const text = await provider.generateStream(guardedParams);

      // A 200 that streamed nothing is not a success. It used to be returned
      // as an empty answer: the student watched an empty bubble, and only saw
      // the apology that was stored in its place after a reload. Treated as a
      // failure, it gets the retry policy and then the honest message.
      if (!emittedAnything) throw emptyStreamError();

      if (onFallback) console.log(`[AI] reply served by free fallback model=${aiFallback.gate.model}`);
      return text;
    } catch (err) {
      lastError = err;

      const transient = isTransientProviderError(err);
      const status = extractStatus(err);
      const elapsedMs = Date.now() - startedAt;
      const nextDelayMs = retryDelayMs(err, attempt);
      let { retry, reason } = shouldRetryProviderCall({
        transient,
        emittedAnything,
        attempt,
        elapsedMs,
        nextDelayMs
      });

      // Moving to the fallback is decided first, because it does not wait:
      // the fallback is a different upstream, so the primary's Retry-After
      // says nothing about it.
      let switchTo: IAITutorProvider | null = null;
      if (
        !onFallback &&
        aiFallback.provider &&
        shouldSwitchToFallback({ transient, emittedAnything, attempt, elapsedMs })
      ) {
        const verdict = await aiFallback.gate.check(needsImages);
        if (verdict.ok) {
          switchTo = aiFallback.provider;
          retry = true;
          reason = 'fallback';
        } else {
          // Not verifiably free and compatible: never called. The primary's
          // own retry decision above stands.
          console.error(`[AI] free fallback not used (${verdict.reason}); staying on the primary route`);
        }
      }

      const model = (err as { model?: unknown } | null)?.model;
      console.error(
        `[AI] ${provider.name} attempt ${attempt}/${AI_RETRY.maxAttempts} failed ` +
          `(route=${onFallback ? 'fallback' : 'primary'}${typeof model === 'string' ? `, model=${model}` : ''}, ` +
          `status=${status ?? 'none'}, category=${failureCategory(err)}, transient=${transient}, ` +
          `partial=${emittedAnything}, ` +
          `elapsed=${elapsedMs}ms, retry=${retry}/${reason}` +
          `${switchTo ? `, next=fallback ${aiFallback.gate.model}` : retry ? `, next_in=${nextDelayMs}ms` : ''}): ` +
          errorText(err)
      );

      if (switchTo) {
        provider = switchTo;
        onFallback = true;
        continue;
      }
      if (!retry) break;
      await sleep(nextDelayMs ?? backoffDelayMs(attempt));
    }
  }

  // Deliberately does not carry the provider error forward. The safe sentence
  // is the whole message; everything diagnostic was logged above.
  // The student-facing text stays generic. The reason travels separately, as
  // a diagnostic, so the photo path can show it to a developer and the text
  // path simply ignores it.
  const kind = params.images && params.images.length > 0 ? 'photo' : 'text';
  throw Object.assign(new ServiceUnavailableError(AI_UNAVAILABLE_MESSAGE, 'AI_PROVIDER_UNAVAILABLE'), {
    diagnostic: providerFailureDiagnostic(lastError, kind)
  });
}
