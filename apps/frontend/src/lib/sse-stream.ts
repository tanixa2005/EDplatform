import { getApiUrl, getAuthHeaders, ApiError } from '@/lib/api';

export interface StreamOptions {
  /** API path, e.g. `/tutor/sessions/<id>/stream`. */
  endpoint: string;
  body: unknown;
  /**
   * One photo for this turn. When present the request goes as multipart rather
   * than JSON, which keeps it off the server's global JSON body limit.
   */
  image?: File | null;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  /**
   * Overrides the idle timeout. Exists so the timeout path is testable without
   * a test that sits for a minute; production callers leave it unset.
   */
  idleTimeoutMs?: number;
}

/**
 * How long to wait for the stream to produce anything before giving up.
 *
 * An idle timeout, not a total one: it is reset by every read, so a long answer
 * is never cut off mid-sentence, while a connection that goes quiet is
 * abandoned. Without it the tutor could sit on a spinner indefinitely - the
 * only AbortController here was wired to the Stop button, so a stalled backend
 * or a dropped network left the student with no way out but to wait.
 *
 * Sized against what the free models actually do: the slowest measured time to
 * first token was 19 seconds, and the server caps a single attempt at 90.
 */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * Reads the backend's Server-Sent Events stream.
 *
 * The backend speaks POST + SSE (so a request body is possible, which EventSource
 * cannot do), with three frame shapes:
 *   data: {"chunk":"..."}   incremental text
 *   data: {"error":"..."}   recoverable failure
 *   data: [DONE]            end of turn
 *
 * Extracted from the old lesson tutor drawer so the home screen, the tutor canvas
 * and the in-lesson tutor all share one reader instead of three copies.
 */
export async function streamSse({
  endpoint,
  body,
  image,
  signal,
  onChunk,
  idleTimeoutMs = STREAM_IDLE_TIMEOUT_MS
}: StreamOptions): Promise<string> {
  // With a photo the payload is multipart; without one it stays exactly as it
  // was. Content-Type is deliberately NOT set for multipart - the browser has
  // to add it so it can include the boundary.
  let payload: BodyInit;
  const headers: Record<string, string> = { ...(await getAuthHeaders()) };

  if (image) {
    const form = new FormData();
    form.append('image', image);
    const fields = (body ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
    payload = form;
  } else {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  // An internal controller so the watchdog can abort the stream. The caller's
  // own signal (the Stop button) is forwarded into it, so both paths work.
  const controller = new AbortController();
  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const abortForTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const armWatchdog = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(abortForTimeout, idleTimeoutMs);
  };
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);
  if (signal?.aborted) controller.abort();

  const cleanUp = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    signal?.removeEventListener('abort', forwardAbort);
  };

  /**
   * A timeout must not look like the student pressing Stop: callers ignore an
   * AbortError on purpose, so a silent abort would leave them with nothing at
   * all. It is re-thrown as a message they can act on.
   */
  const asReportableError = (err: unknown): unknown =>
    timedOut
      ? new ApiError('ED is taking too long to reply. Try again in a moment.', 'STREAM_TIMEOUT')
      : err;

  let response: Response;
  armWatchdog();
  try {
    response = await fetch(getApiUrl(endpoint), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: payload
    });
  } catch (err) {
    cleanUp();
    throw asReportableError(err);
  }

  if (!response.ok) {
    cleanUp();
    if (response.status === 429) {
      throw new ApiError(
        'You are asking very fast. Give ED a few seconds to catch up.',
        'RATE_LIMITED',
        429
      );
    }
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      payload?.error?.message || `ED could not reply (status ${response.status})`,
      payload?.error?.code,
      response.status
    );
  }

  if (!response.body) {
    cleanUp();
    throw new ApiError('ED sent an empty response', 'EMPTY_STREAM');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let done = false;

  try {
    while (!done) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      // Something arrived, so the connection is alive: start the clock again.
      armWatchdog();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // The final element may be a partial line; keep it for the next read.
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          done = true;
          break;
        }

        try {
          const parsed = JSON.parse(payload) as { chunk?: string; error?: string };
          if (parsed.error) {
            throw new ApiError(parsed.error, 'STREAM_ERROR');
          }
          // An explicit type and length check rather than truthiness. Not a
          // bug fix: a chunk of "0" is a non-empty string and was already
          // truthy. It guards the shape instead - a non-string `chunk` from a
          // changed server contract would otherwise be concatenated as
          // "[object Object]" or "undefined" into a child's answer.
          if (typeof parsed.chunk === 'string' && parsed.chunk.length > 0) {
            full += parsed.chunk;
            onChunk(parsed.chunk);
          }
        } catch (err) {
          // A genuine stream error must propagate; a half-arrived frame must not.
          if (err instanceof ApiError) throw err;
        }
      }
    }
  } catch (err) {
    throw asReportableError(err);
  } finally {
    cleanUp();
  }

  return full;
}
