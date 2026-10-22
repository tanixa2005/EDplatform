/**
 * The one free model ED may fall back to, and the check that it is still free.
 *
 * Gemma's free route is served by a single upstream (Google AI Studio), and on
 * 22 Oct 2026 every attempt was refused as `upstream_rate_limited`. A second
 * free model from a different upstream gives a student an answer when that one
 * pool is saturated.
 *
 * Zero budget is a hard rule, and three things enforce it:
 *
 *   1. An allowlist of exactly one reviewed id, in code. There is no
 *      environment variable for it, so no configuration change can point the
 *      fallback at a paid model.
 *   2. This runtime check, made before the fallback is used: OpenRouter's
 *      public catalogue must list the id with EVERY endpoint priced at zero,
 *      text in and text out, and image input for a photo turn. If the
 *      catalogue cannot be read, or says anything else, the fallback is not
 *      used. Unknown is treated as not free.
 *   3. Every fallback request carries a zero `provider.max_price`, so OpenRouter
 *      refuses rather than bills even if pricing changed after this check.
 *
 * The catalogue endpoint is public. No key, no header that identifies a
 * student, and no part of a conversation is ever sent to it.
 */

/** Verified 22 Oct 2026: zero-priced, text+image in, text out, served by Thinking Machines. */
export const FREE_FALLBACK_MODEL = 'thinkingmachines/inkling-small:free';

/** Exactly the ids a fallback may use. Anything else is refused before any request. */
const FREE_FALLBACK_ALLOWLIST: readonly string[] = [FREE_FALLBACK_MODEL];

const CATALOGUE_BASE = 'https://openrouter.ai/api/v1/models/';

/** A slow catalogue must not hold a student's turn. */
const VERIFY_TIMEOUT_MS = 5_000;
/** A good answer is reused for an hour; a failed check is retried after five minutes. */
const VERIFIED_TTL_MS = 60 * 60 * 1000;
const FAILED_TTL_MS = 5 * 60 * 1000;

export interface FreeModelVerification {
  ok: boolean;
  /** A fixed label, safe to log. */
  reason:
    | 'verified'
    | 'not_allowlisted'
    | 'catalogue_unreachable'
    | 'catalogue_error'
    | 'id_mismatch'
    | 'no_endpoints'
    | 'not_free'
    | 'text_unsupported'
    | 'images_unsupported';
  supportsImages: boolean;
}

/** Whether an id may be considered at all: allowlisted, ':free', and never a router. */
export function isAllowlistedFreeModel(id: string): boolean {
  return FREE_FALLBACK_ALLOWLIST.includes(id) && id.endsWith(':free') && !id.startsWith('openrouter/');
}

/** True only when every price field is present and exactly zero. */
function isZeroPriced(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== 'object') return false;
  const asNumber = (value: unknown): number =>
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const record = pricing as Record<string, unknown>;
  // Prompt and completion must be stated, and stated as zero.
  if (asNumber(record.prompt) !== 0 || asNumber(record.completion) !== 0) return false;
  // Any other charge (per request, per image, ...) may be absent, but if it is
  // stated it must be zero too.
  return Object.entries(record)
    .filter(([key]) => key !== 'discount')
    .every(([, value]) => value === null || value === undefined || asNumber(value) === 0);
}

/**
 * Reads the public catalogue and decides whether `id` is usable, free, as a
 * fallback. Pure apart from `fetchImpl`, which tests replace.
 */
export async function verifyFreeModel(
  id: string,
  fetchImpl: typeof fetch = fetch
): Promise<FreeModelVerification> {
  const fail = (reason: FreeModelVerification['reason']): FreeModelVerification => ({
    ok: false,
    reason,
    supportsImages: false
  });

  if (!isAllowlistedFreeModel(id)) return fail('not_allowlisted');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let body: unknown;
  try {
    // Deliberately no headers: this is a public read and carries nothing of ours.
    const res = await fetchImpl(`${CATALOGUE_BASE}${id}/endpoints`, { signal: controller.signal });
    if (!res.ok) return fail('catalogue_error');
    body = await res.json();
  } catch {
    return fail('catalogue_unreachable');
  } finally {
    clearTimeout(timeout);
  }

  const data = (body as {
    data?: {
      id?: unknown;
      architecture?: { input_modalities?: unknown; output_modalities?: unknown };
      endpoints?: Array<{ pricing?: unknown }>;
    };
  } | null)?.data;
  if (!data || data.id !== id) return fail('id_mismatch');

  const endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
  if (endpoints.length === 0) return fail('no_endpoints');
  if (!endpoints.every((endpoint) => isZeroPriced(endpoint?.pricing))) return fail('not_free');

  const inputs = Array.isArray(data.architecture?.input_modalities) ? data.architecture!.input_modalities as unknown[] : [];
  const outputs = Array.isArray(data.architecture?.output_modalities) ? data.architecture!.output_modalities as unknown[] : [];
  if (!inputs.includes('text') || !outputs.includes('text')) return fail('text_unsupported');

  return { ok: true, reason: 'verified', supportsImages: inputs.includes('image') };
}

/**
 * The cached form the retry loop uses: at most one catalogue read per hour
 * when it is healthy, one per five minutes when it is not, so a failing
 * catalogue never turns into a request per student turn.
 */
export function createFreeModelGate(id: string, fetchImpl: () => typeof fetch = () => fetch) {
  let cached: { result: FreeModelVerification; until: number } | null = null;

  return {
    model: id,
    /** Whether the fallback may be used for this turn. */
    async check(needsImages: boolean, now: number = Date.now()): Promise<FreeModelVerification> {
      if (!cached || now >= cached.until) {
        const result = await verifyFreeModel(id, fetchImpl());
        cached = { result, until: now + (result.ok ? VERIFIED_TTL_MS : FAILED_TTL_MS) };
      }
      const { result } = cached;
      if (result.ok && needsImages && !result.supportsImages) {
        return { ok: false, reason: 'images_unsupported', supportsImages: false };
      }
      return result;
    },
    /** Tests only: forget the cached answer. */
    reset(): void {
      cached = null;
    }
  };
}
