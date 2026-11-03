/**
 * What a Gemini API refusal said, reduced to facts that are safe to log.
 *
 * The SDK raises an ApiError whose message is the JSON error body Google
 * returned. That body names quotas and limits, which is exactly what the retry
 * policy needs; it is still never logged or forwarded as text. It is parsed
 * here into a fixed reason label and a retry delay, mirroring
 * openrouter-failure.ts for the other provider.
 *
 * Shapes handled (Gemini API, google.rpc error model):
 *   { "error": { "code": 429, "status": "RESOURCE_EXHAUSTED", "message": "...",
 *     "details": [
 *       { "@type": "type.googleapis.com/google.rpc.QuotaFailure",
 *         "violations": [ { "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier", ... } ] },
 *       { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "36s" } ] } }
 */

export interface GeminiFailureDetails {
  /** A fixed label. Never text taken from the body. */
  reason:
    | 'daily_quota'
    | 'per_minute_limit'
    | 'rate_limited_unspecified'
    | 'invalid_key'
    | 'bad_request'
    | 'model_not_found'
    | 'upstream_unavailable'
    | 'unrecognised';
  /** Google's suggested wait before retrying, when it gave one. */
  retryAfterMs: number | null;
}

/** Enough for any real error body; anything past this is not parsed. */
const MAX_BODY_CHARS = 8_192;

/** "36s" or "1.5s" (protobuf Duration as JSON) to milliseconds. */
function durationMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d+(?:\.\d+)?)s\s*$/.exec(value);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

export function describeGeminiFailure(status: number, bodyText: string): GeminiFailureDetails {
  let apiStatus = '';
  const quotaIds: string[] = [];
  let retryAfterMs: number | null = null;

  try {
    // An error raised mid-stream arrives as "got status: X. {json}", so the
    // JSON is read from its first brace rather than from the start.
    const start = bodyText.indexOf('{');
    const parsed = JSON.parse(bodyText.slice(Math.max(0, start), Math.max(0, start) + MAX_BODY_CHARS)) as {
      error?: { status?: unknown; details?: unknown };
    };
    if (typeof parsed?.error?.status === 'string') apiStatus = parsed.error.status;
    const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : [];
    for (const detail of details as Array<Record<string, unknown>>) {
      const type = typeof detail?.['@type'] === 'string' ? (detail['@type'] as string) : '';
      if (type.endsWith('google.rpc.RetryInfo')) retryAfterMs = durationMs(detail.retryDelay);
      if (type.endsWith('google.rpc.QuotaFailure') && Array.isArray(detail.violations)) {
        for (const violation of detail.violations as Array<Record<string, unknown>>) {
          if (typeof violation?.quotaId === 'string') quotaIds.push(violation.quotaId);
        }
      }
    }
  } catch {
    // Not JSON. The status alone still classifies it.
  }

  let reason: GeminiFailureDetails['reason'];
  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    if (quotaIds.some((id) => /PerDay/i.test(id))) reason = 'daily_quota';
    else if (quotaIds.some((id) => /PerMinute/i.test(id))) reason = 'per_minute_limit';
    else reason = 'rate_limited_unspecified';
  } else if (status === 401 || status === 403 || apiStatus === 'PERMISSION_DENIED' || apiStatus === 'UNAUTHENTICATED') {
    reason = 'invalid_key';
  } else if (status === 404) {
    reason = 'model_not_found';
  } else if (status === 400) {
    reason = 'bad_request';
  } else if (status >= 500) {
    reason = 'upstream_unavailable';
  } else {
    reason = 'unrecognised';
  }

  return { reason, retryAfterMs };
}

/** The details as one log fragment: labels and numbers only. */
export function formatGeminiFailure(details: GeminiFailureDetails): string {
  return details.retryAfterMs !== null
    ? `reason=${details.reason} retry_after_ms=${details.retryAfterMs}`
    : `reason=${details.reason}`;
}
