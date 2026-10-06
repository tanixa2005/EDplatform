import { getApiUrl, getAuthHeaders, ApiError } from '@/lib/api';

export interface StreamOptions {
  /** API path, e.g. `/tutor/sessions/<id>/stream`. */
  endpoint: string;
  body: unknown;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

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
  signal,
  onChunk
}: StreamOptions): Promise<string> {
  const response = await fetch(getApiUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders())
    },
    signal,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
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
    throw new ApiError('ED sent an empty response', 'EMPTY_STREAM');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

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
        if (parsed.chunk) {
          full += parsed.chunk;
          onChunk(parsed.chunk);
        }
      } catch (err) {
        // A genuine stream error must propagate; a half-arrived frame must not.
        if (err instanceof ApiError) throw err;
      }
    }
  }

  return full;
}
