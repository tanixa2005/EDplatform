/**
 * What an OpenRouter refusal actually said, reduced to facts that are safe to log.
 *
 * Until now a failed response was logged as "status=429" and nothing else, so
 * a daily allowance running out, a free model being throttled upstream and a
 * per-minute burst all looked identical - and all three were retried the same
 * way. The body says which one it is; this reads it.
 *
 * It reads the body, but it never copies it. An error body can echo the
 * request, and the request carries the student's question, the assembled
 * prompt and sometimes a photo. So the free text is only ever tested against
 * known patterns and turned into a fixed reason label. What leaves this module
 * is that label, numbers parsed from rate-limit headers, OpenRouter's numeric
 * code, and the upstream provider's name only when it looks like a name. No
 * header except those numeric ones is read, and the request's Authorization
 * header is never in reach here at all.
 */

/** The safe-to-log summary of one failed response. */
export interface OpenRouterFailureDetails {
  /** A fixed label, one of the values below. Never text taken from the body. */
  reason:
    | 'daily_quota'
    | 'per_minute_limit'
    | 'upstream_rate_limited'
    | 'insufficient_credits'
    | 'rate_limited_unspecified'
    | 'unrecognised';
  /** How long the provider asked us to wait, when it said. */
  retryAfterMs: number | null;
  limit: number | null;
  remaining: number | null;
  /** When the current window resets, as epoch milliseconds. */
  resetAt: number | null;
  /** e.g. "Google AI Studio", for an upstream throttle. Null unless it looks like a plain name. */
  upstreamProvider: string | null;
  /** OpenRouter's own numeric error code from the body, when present. */
  openRouterCode: number | null;
}

/** Enough for any real OpenRouter error body; anything past this is not parsed. */
const MAX_BODY_CHARS = 8_192;

/** A provider name is a short plain label. Anything else is not logged. */
const SAFE_PROVIDER_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,39}$/;
/** Even a short label is dropped if it looks like it carries a credential. */
const CREDENTIAL_LIKE = /bearer|sk-|key|token|secret/i;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/**
 * A reset time as epoch milliseconds. OpenRouter sends milliseconds; a value
 * in seconds is accepted too. Anything too small to be a timestamp is ignored
 * rather than guessed at.
 */
function epochMs(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null) return null;
  if (n > 1e12) return Math.round(n);
  if (n > 1e9) return Math.round(n * 1000);
  return null;
}

/** Retry-After is either delta seconds or an HTTP date. */
function retryAfterHeaderMs(value: string | null, now: number): number | null {
  if (value === null || value.trim() === '') return null;
  const seconds = finiteNumber(value);
  if (seconds !== null) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Case-insensitive lookup in a plain object of upstream headers. */
function pick(source: Record<string, unknown> | null, name: string): unknown {
  if (!source) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function classify(status: number, text: string): OpenRouterFailureDetails['reason'] {
  if (/free-models-per-day|per[-\s]?day|daily/i.test(text)) return 'daily_quota';
  if (/free-models-per-min|per[-\s]?min/i.test(text)) return 'per_minute_limit';
  if (/upstream/i.test(text)) return 'upstream_rate_limited';
  if (status === 402 || /insufficient credits|more credits|credit balance/i.test(text)) {
    return 'insufficient_credits';
  }
  if (status === 429) return 'rate_limited_unspecified';
  return 'unrecognised';
}

/**
 * Summarises a failed response from its status, headers and body text.
 *
 * Pure apart from `now`, so every branch is testable without a network call.
 */
export function describeOpenRouterFailure(
  status: number,
  headers: Headers,
  bodyText: string,
  now: number = Date.now()
): OpenRouterFailureDetails {
  let message = '';
  let raw = '';
  let code: number | null = null;
  let providerName: string | null = null;
  let upstreamHeaders: Record<string, unknown> | null = null;

  try {
    const parsed = JSON.parse(bodyText.slice(0, MAX_BODY_CHARS)) as {
      error?: {
        message?: unknown;
        code?: unknown;
        metadata?: { raw?: unknown; provider_name?: unknown; headers?: unknown };
      };
    };
    const error = parsed?.error;
    if (typeof error?.message === 'string') message = error.message;
    code = finiteNumber(error?.code);
    const metadata = error?.metadata;
    if (typeof metadata?.raw === 'string') raw = metadata.raw;
    if (typeof metadata?.provider_name === 'string') providerName = metadata.provider_name.trim();
    if (metadata?.headers && typeof metadata.headers === 'object') {
      upstreamHeaders = metadata.headers as Record<string, unknown>;
    }
  } catch {
    // Not JSON. The status still classifies it; the text is not looked at further.
  }

  // The rate-limit numbers can arrive as real response headers, or (for the
  // free-tier allowance) inside the body's metadata. Either is accepted.
  const limit = finiteNumber(headers.get('x-ratelimit-limit')) ?? finiteNumber(pick(upstreamHeaders, 'x-ratelimit-limit'));
  const remaining =
    finiteNumber(headers.get('x-ratelimit-remaining')) ?? finiteNumber(pick(upstreamHeaders, 'x-ratelimit-remaining'));
  const resetAt = epochMs(headers.get('x-ratelimit-reset')) ?? epochMs(pick(upstreamHeaders, 'x-ratelimit-reset'));

  let retryAfterMs = retryAfterHeaderMs(headers.get('retry-after'), now);
  if (retryAfterMs === null) {
    const upstream = pick(upstreamHeaders, 'retry-after');
    retryAfterMs = retryAfterHeaderMs(typeof upstream === 'string' || typeof upstream === 'number' ? String(upstream) : null, now);
  }
  // An exhausted window with a known reset is a wait time even without Retry-After.
  if (retryAfterMs === null && remaining === 0 && resetAt !== null) {
    retryAfterMs = Math.max(0, resetAt - now);
  }

  return {
    reason: classify(status, `${message}\n${raw}`),
    retryAfterMs,
    limit,
    remaining,
    resetAt,
    upstreamProvider:
      providerName && SAFE_PROVIDER_NAME.test(providerName) && !CREDENTIAL_LIKE.test(providerName)
        ? providerName
        : null,
    openRouterCode: code
  };
}

/** The details as one log fragment: labels and numbers only. */
export function formatFailureDetails(details: OpenRouterFailureDetails): string {
  const parts = [`reason=${details.reason}`];
  if (details.openRouterCode !== null) parts.push(`openrouter_code=${details.openRouterCode}`);
  if (details.upstreamProvider !== null) parts.push(`upstream="${details.upstreamProvider}"`);
  if (details.retryAfterMs !== null) parts.push(`retry_after_ms=${details.retryAfterMs}`);
  if (details.limit !== null) parts.push(`ratelimit_limit=${details.limit}`);
  if (details.remaining !== null) parts.push(`ratelimit_remaining=${details.remaining}`);
  if (details.resetAt !== null) parts.push(`ratelimit_reset=${new Date(details.resetAt).toISOString()}`);
  return parts.join(' ');
}
