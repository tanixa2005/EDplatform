/**
 * The SSE reader, verified without a browser.
 *
 * This is the one piece of the tutor a student is always watching, and its
 * failure modes are all invisible in a happy-path demo: a connection that goes
 * quiet, a frame split across two network reads, a chunk that happens to be
 * falsy, an error frame that must not be mistaken for content.
 *
 * Everything here drives the real `streamSse` with `fetch` replaced, so no
 * request leaves the process and no server is needed.
 *
 * Run: npx tsx src/__tests__/verify_sse_stream.ts
 */
import assert from 'node:assert/strict';
import { streamSse, STREAM_IDLE_TIMEOUT_MS } from '../lib/sse-stream.js';
import { ApiError } from '../lib/api.js';

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

/** Every check below must report. Guards against the suite exiting early. */
const EXPECTED_CHECKS = 10;

/**
 * Every check runs under a deadline.
 *
 * Without one, a test whose promise never settles does not fail - the event
 * loop simply drains and node exits 0 part way through the suite, with the
 * missing results looking exactly like a short run. A hung test has to be a
 * red test.
 */
const CHECK_DEADLINE_MS = 5_000;

async function check(test: string, fn: () => Promise<void>) {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`did not settle within ${CHECK_DEADLINE_MS}ms`)),
        CHECK_DEADLINE_MS
      );
    });
    try {
      await Promise.race([fn(), deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: message });
    console.error(`  [FAIL] ${test}: ${message}`);
  }
}

/** Encodes frames as the backend writes them. */
function sseFrame(payload: string): string {
  return `data: ${payload}\n\n`;
}
function chunkFrame(text: string): string {
  return sseFrame(JSON.stringify({ chunk: text }));
}

/**
 * Replaces fetch with one that streams the given raw pieces, split exactly as
 * supplied so chunk-boundary handling is really exercised.
 */
function stubFetch(pieces: string[], init: ResponseInit = { status: 200 }): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const piece of pieces) controller.enqueue(encoder.encode(piece));
          controller.close();
        }
      }),
      { headers: { 'Content-Type': 'text/event-stream' }, ...init }
    );
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = saved;
  };
}

/**
 * A fetch whose body never produces anything and never closes.
 *
 * Mirrors real fetch on one detail that matters: a signal that is ALREADY
 * aborted rejects immediately rather than returning a response. Without that,
 * an abort racing the request leaves a promise that never settles - which is
 * what a careless version of this stub did, and it hid a whole test.
 */
function stubSilentFetch(): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, opts?: { signal?: AbortSignal }) => {
    const signal = opts?.signal;
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          // Only an abort ever ends this.
          signal?.addEventListener('abort', () => {
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        }
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = saved;
  };
}

async function runTests() {
  console.log('\n====================================================');
  console.log('🔌 SSE STREAM READER SUITE');
  console.log('====================================================\n');

  await check('A normal stream delivers every chunk and returns the whole text', async () => {
    const restore = stubFetch([
      ': connected\n\n',
      chunkFrame('A shadow forms '),
      chunkFrame('because an object blocks light.'),
      sseFrame('[DONE]')
    ]);
    const seen: string[] = [];
    try {
      const full = await streamSse({
        endpoint: '/tutor/sessions/x/stream',
        body: {},
        onChunk: (c) => seen.push(c)
      });
      assert.equal(seen.length, 2);
      assert.equal(full, 'A shadow forms because an object blocks light.');
    } finally {
      restore();
    }
  });

  await check('Markdown, LaTeX and internal blank lines survive the wire', async () => {
    const body = 'Here:\n\nThe fraction $\\frac{3}{4}$ and **bold**.\n\n```js\nconst x = 1;\n```\n';
    const restore = stubFetch([chunkFrame(body), sseFrame('[DONE]')]);
    try {
      const full = await streamSse({
        endpoint: '/x',
        body: {},
        onChunk: () => undefined
      });
      assert.equal(full, body, 'the reader altered the text');
    } finally {
      restore();
    }
  });

  await check('A frame split across two network reads is reassembled', async () => {
    // The split falls inside the JSON payload, which is the case that breaks a
    // naive line-by-line reader.
    const frame = chunkFrame('split across reads');
    const cut = Math.floor(frame.length / 2);
    const restore = stubFetch([frame.slice(0, cut), frame.slice(cut), sseFrame('[DONE]')]);
    const seen: string[] = [];
    try {
      const full = await streamSse({ endpoint: '/x', body: {}, onChunk: (c) => seen.push(c) });
      assert.equal(full, 'split across reads');
      assert.equal(seen.length, 1, 'a split frame produced the wrong number of chunks');
    } finally {
      restore();
    }
  });

  await check('A lone "0" chunk and a malformed chunk value are both handled', async () => {
    // "0" survived the old truthiness check too - it is a non-empty string.
    // Pinned anyway, because it is the case a reader expects to be fragile.
    // The real guard is the second half: a non-string chunk is dropped rather
    // than concatenated into the answer as "undefined".
    const restore = stubFetch([
      chunkFrame('The answer is '),
      chunkFrame('0'),
      chunkFrame('.'),
      sseFrame('[DONE]')
    ]);
    const seen: string[] = [];
    try {
      const full = await streamSse({ endpoint: '/x', body: {}, onChunk: (c) => seen.push(c) });
      assert.equal(full, 'The answer is 0.');
      assert.deepEqual(seen, ['The answer is ', '0', '.']);
    } finally {
      restore();
    }

    // A server that one day sends a non-string chunk must not have it
    // stringified into a student's answer.
    const restoreOdd = stubFetch([
      sseFrame(JSON.stringify({ chunk: 42 })),
      sseFrame(JSON.stringify({ chunk: { text: 'x' } })),
      chunkFrame('real text'),
      sseFrame('[DONE]')
    ]);
    try {
      const full = await streamSse({ endpoint: '/x', body: {}, onChunk: () => undefined });
      assert.equal(full, 'real text', 'a non-string chunk reached the answer');
    } finally {
      restoreOdd();
    }
  });

  await check('An error frame becomes a reportable ApiError, not content', async () => {
    const restore = stubFetch([
      chunkFrame('Partial answer'),
      sseFrame(JSON.stringify({ error: 'ED is having trouble connecting right now.' })),
      sseFrame('[DONE]')
    ]);
    const seen: string[] = [];
    try {
      await assert.rejects(
        () => streamSse({ endpoint: '/x', body: {}, onChunk: (c) => seen.push(c) }),
        (err: unknown) => {
          assert.ok(err instanceof ApiError, 'not an ApiError');
          assert.equal((err as ApiError).code, 'STREAM_ERROR');
          assert.match((err as ApiError).message, /trouble connecting/);
          return true;
        }
      );
      // The text that already arrived was still shown to the student.
      assert.deepEqual(seen, ['Partial answer']);
    } finally {
      restore();
    }
  });

  await check('A silent connection times out with a message the student can act on', async () => {
    const restore = stubSilentFetch();
    try {
      await assert.rejects(
        () =>
          streamSse({
            endpoint: '/x',
            body: {},
            onChunk: () => undefined,
            idleTimeoutMs: 40
          }),
        (err: unknown) => {
          // Critically NOT an AbortError: callers ignore those on purpose, so
          // a silent abort would leave the student with a spinner and no text.
          assert.ok(err instanceof ApiError, `expected ApiError, got ${(err as Error)?.name}`);
          assert.equal((err as ApiError).code, 'STREAM_TIMEOUT');
          assert.match((err as ApiError).message, /taking too long/i);
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  await check('The Stop button still aborts, and is not reported as a timeout', async () => {
    const restore = stubSilentFetch();
    const controller = new AbortController();
    try {
      const pending = streamSse({
        endpoint: '/x',
        body: {},
        signal: controller.signal,
        onChunk: () => undefined,
        idleTimeoutMs: 2_000
      });
      // Let the reader actually start before aborting, so this exercises an
      // abort DURING the stream rather than one that races the request.
      await new Promise((r) => setTimeout(r, 25));
      controller.abort();
      await assert.rejects(pending, (err: unknown) => {
        assert.ok(!(err instanceof ApiError), 'a user abort was converted into an error message');
        assert.equal((err as Error).name, 'AbortError');
        return true;
      });
    } finally {
      restore();
    }
  });

  await check('A long answer is never cut off while chunks keep arriving', async () => {
    // Each read resets the watchdog, so a stream slower than the idle window
    // in total still completes as long as it keeps producing.
    const restore = (() => {
      const saved = globalThis.fetch;
      globalThis.fetch = (async () => {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              for (let i = 0; i < 5; i += 1) {
                await new Promise((r) => setTimeout(r, 30));
                controller.enqueue(encoder.encode(chunkFrame(`part${i} `)));
              }
              controller.enqueue(encoder.encode(sseFrame('[DONE]')));
              controller.close();
            }
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      }) as typeof globalThis.fetch;
      return () => {
        globalThis.fetch = saved;
      };
    })();

    try {
      // 50ms idle window, 5 gaps of 30ms: 150ms total, never idle that long.
      const full = await streamSse({
        endpoint: '/x',
        body: {},
        onChunk: () => undefined,
        idleTimeoutMs: 50
      });
      assert.equal(full, 'part0 part1 part2 part3 part4 ');
    } finally {
      restore();
    }
  });

  await check('A non-OK response reports a status, and 429 gets its own message', async () => {
    const saved = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response('{}', { status: 429 })) as typeof globalThis.fetch;
      await assert.rejects(
        () => streamSse({ endpoint: '/x', body: {}, onChunk: () => undefined }),
        (err: unknown) => {
          assert.equal((err as ApiError).code, 'RATE_LIMITED');
          assert.match((err as ApiError).message, /asking very fast/i);
          return true;
        }
      );

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: { message: 'Not found', code: 'NOT_FOUND' } }), {
          status: 404
        })) as typeof globalThis.fetch;
      await assert.rejects(
        () => streamSse({ endpoint: '/x', body: {}, onChunk: () => undefined }),
        (err: unknown) => {
          assert.equal((err as ApiError).status, 404);
          return true;
        }
      );
    } finally {
      globalThis.fetch = saved;
    }
  });

  await check('The idle window is bounded and sits under the server attempt ceiling', async () => {
    assert.ok(STREAM_IDLE_TIMEOUT_MS > 20_000, 'too tight for an observed 19s time to first token');
    assert.ok(STREAM_IDLE_TIMEOUT_MS <= 90_000, 'the UI would outlast the server attempt ceiling');
  });

  console.log('\n====================================================');
  console.log('📊 SSE STREAM SUITE RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  // A tripwire for the silent-exit mode above: if the count ever drops, the
  // suite stopped early rather than passing.
  if (RESULTS.length !== EXPECTED_CHECKS) {
    console.error(
      `  [FAIL] the suite ran ${RESULTS.length} of ${EXPECTED_CHECKS} checks - it stopped early`
    );
    process.exit(1);
  }
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
