/**
 * Diagnostics for a failed AI call, safe to log and safe to show a developer.
 *
 * Everything here is built from a status code, a fixed category name and a
 * model id. None of it is taken from the provider's response body, the prompt,
 * the student's image or any credential, because those are the things that must
 * never reach a log line or a screen. That is the whole point of the module: it
 * turns "something failed" into a code a developer can act on without exposing
 * what was sent.
 *
 * Where it shows up:
 *   - the backend terminal, on every failed provider attempt;
 *   - in development only, as a bracketed code after ED's generic sentence in
 *     the chat. Production never receives it.
 */

export type FailureKind = 'text' | 'photo';

const CATEGORY_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'payment_required',
  403: 'forbidden',
  404: 'not_found',
  408: 'timeout',
  413: 'payload_too_large',
  429: 'rate_limited'
};

/** A short, fixed name for an HTTP status. Unknown codes are named, not echoed. */
export function categoryForStatus(status: number | null | undefined): string {
  if (status === null || status === undefined) return 'no_status';
  const named = CATEGORY_BY_STATUS[status];
  if (named) return named;
  if (status >= 500) return 'upstream_unavailable';
  return 'other';
}

function numericStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

function stringField(err: unknown, key: string): string | null {
  const value = (err as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The category for a failure: a set one wins (for example `empty_stream`, or
 * `vision_not_configured`, which have no HTTP status); otherwise it is derived
 * from the status.
 */
export function failureCategory(err: unknown): string {
  const tagged = stringField(err, 'category');
  if (tagged) return tagged;
  return categoryForStatus(numericStatus(err));
}

/**
 * One line that says what failed: the kind of request, the status, the
 * category and the model. Deliberately built from fields, never from the
 * error's message, which is where a provider would put its echo of the request.
 */
export function providerFailureDiagnostic(err: unknown, kind: FailureKind): string {
  const status = numericStatus(err);
  const parts: string[] = [
    kind,
    status !== null ? `http ${status}` : 'no http status',
    failureCategory(err)
  ];
  const model = stringField(err, 'model');
  if (model) parts.push(`model ${model}`);
  return parts.join(' · ');
}

/**
 * The bracketed code appended to a student-facing message in development only.
 *
 * Allowlisted to 'development' rather than denylisted for 'production', so an
 * unexpected or missing environment value shows nothing rather than something.
 */
export function devDiagnosticSuffix(diagnostic: string | null | undefined, nodeEnv: string): string {
  if (!diagnostic || nodeEnv !== 'development') return '';
  return ` [dev: ${diagnostic}]`;
}
