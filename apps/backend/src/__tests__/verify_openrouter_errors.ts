/**
 * OpenRouter refusals: telling a spent daily allowance from a short throttle,
 * waiting sensibly for the second, and logging neither a secret nor a student.
 *
 * Offline throughout. fetch is replaced with scripted responses before any
 * provider call, so no request leaves this process; the provider is given a
 * fake key; no database, environment file or network service is touched.
 *
 * Run: npm run test:openrouter-errors
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

async function check(test: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: message });
    console.error(`  [FAIL] ${test}: ${message}`);
  }
}

const GEMMA = 'google/gemma-4-31b-it:free';
/** Fake, but shaped like a real key so a pattern-based leak would show. */
const TEST_KEY = 'sk-or-v1-TESTKEY0000000000000000000000000000000000000000000000000000';
const SYSTEM_MARKER = 'SYSTEM-PROMPT-CANARY-91c2';
const STUDENT_MARKER = 'STUDENT-MESSAGE-CANARY-4be8 my name is Asha and I live at 12 Park Road';
const USER_ID_MARKER = 'user_CANARY77aa';

const NOW = Date.UTC(2026, 9, 22, 7, 30, 0);
const TOMORROW_RESET = Date.UTC(2026, 9, 23, 0, 0, 0);

function dailyQuotaBody(): string {
  return JSON.stringify({
    error: {
      message:
        'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
      code: 429,
      metadata: {
        headers: {
          'X-RateLimit-Limit': '50',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(TOMORROW_RESET)
        },
        provider_name: null
      }
    },
    user_id: USER_ID_MARKER
  });
}

function upstreamThrottleBody(): string {
  return JSON.stringify({
    error: {
      message: 'Provider returned error',
      code: 429,
      metadata: {
        raw: `${GEMMA} is temporarily rate-limited upstream. Please retry shortly.`,
        provider_name: 'Google AI Studio'
      }
    },
    user_id: USER_ID_MARKER
  });
}

/** A hostile body: every field echoes something that must never be logged. */
function echoingBody(): string {
  return JSON.stringify({
    error: {
      message: `Rate limited. Request was: ${SYSTEM_MARKER} ${STUDENT_MARKER} Authorization: Bearer ${TEST_KEY}`,
      code: 429,
      metadata: {
        raw: `upstream said ${STUDENT_MARKER} key=${TEST_KEY}`,
        provider_name: `Bearer ${TEST_KEY}`,
        headers: { 'X-RateLimit-Remaining': `${TEST_KEY}` }
      }
    },
    user_id: USER_ID_MARKER
  });
}

const SSE_OK =
  'data: {"choices":[{"delta":{"content":"Here is a hint."}}]}\n\n' + 'data: [DONE]\n\n';

type Scripted = { status: number; body: string; headers?: Record<string, string> };

/** Replaces fetch with a script and records every request and log line. */
async function withScript<T>(
  script: Scripted[],
  fn: () => Promise<T>
): Promise<{ result: T | null; error: unknown; requests: Record<string, unknown>[]; requestHeaders: Headers[]; logged: string }> {
  const savedFetch = globalThis.fetch;
  const saved = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  const lines: string[] = [];
  const requests: Record<string, unknown>[] = [];
  const requestHeaders: Headers[] = [];
  let call = 0;

  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    requestHeaders.push(new Headers(init?.headers));
    const step = script[Math.min(call, script.length - 1)];
    call += 1;
    return new Response(step.body, { status: step.status, headers: step.headers });
  }) as typeof globalThis.fetch;
  const capture = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
  };
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  console.info = capture;

  try {
    const result = await fn();
    return { result, error: null, requests, requestHeaders, logged: lines.join('\n') };
  } catch (error) {
    return { result: null, error, requests, requestHeaders, logged: lines.join('\n') };
  } finally {
    globalThis.fetch = savedFetch;
    console.error = saved.error;
    console.warn = saved.warn;
    console.log = saved.log;
    console.info = saved.info;
  }
}

async function runAll(): Promise<void> {
  // Isolation: run from an empty folder so no .env can be read, and make sure
  // the factory selects the Mock rather than any real key in this shell. The
  // real OpenRouter provider is then wired in by hand with the fake key.
  const isolated = mkdtempSync(path.join(tmpdir(), 'edp-openrouter-errors-'));
  const backendDir = process.cwd();
  process.chdir(isolated);
  process.env.OPENROUTER_API_KEY = '';
  process.env.OFFLINE_DEMO_AI = 'false';
  process.env.NODE_ENV = 'test';
  // This suite exercises the live retry path, so it opts in explicitly: AI is
  // off by default. fetch is still a recorder, so nothing leaves the process.
  process.env.AI_TUTOR_MODE = 'live';

  const { describeOpenRouterFailure, formatFailureDetails } = await import('../services/ai/openrouter-failure.js');
  const { OpenRouterAITutorProvider, isFreeVisionRoute } = await import('../services/ai/openrouter.provider.js');
  const factory = await import('../services/ai/provider.factory.js');
  const {
    AI_RETRY,
    AI_UNAVAILABLE_MESSAGE,
    isTransientProviderError,
    primaryProvider,
    retryDelayMs,
    shouldRetryProviderCall,
    streamWithFallback
  } = factory;

  const real = new OpenRouterAITutorProvider(TEST_KEY, GEMMA, GEMMA);
  const originalGenerate = primaryProvider.generateStream;
  (primaryProvider as unknown as { generateStream: unknown }).generateStream = (
    params: Parameters<typeof real.generateStream>[0]
  ) => real.generateStream(params);

  const turn = () =>
    streamWithFallback({
      systemPrompt: SYSTEM_MARKER,
      userPrompt: STUDENT_MARKER,
      history: [],
      images: [],
      onChunk: () => undefined
    });

  console.log('\n[1] Reading an OpenRouter refusal');

  await check('A free-models-per-day refusal is recognised as the daily quota', () => {
    const d = describeOpenRouterFailure(429, new Headers(), dailyQuotaBody(), NOW);
    assert.equal(d.reason, 'daily_quota');
    assert.equal(d.limit, 50);
    assert.equal(d.remaining, 0);
    assert.equal(d.resetAt, TOMORROW_RESET);
    assert.equal(d.retryAfterMs, TOMORROW_RESET - NOW);
    assert.equal(d.openRouterCode, 429);
  });

  await check('An upstream throttle is recognised, with the upstream provider named', () => {
    const d = describeOpenRouterFailure(429, new Headers(), upstreamThrottleBody(), NOW);
    assert.equal(d.reason, 'upstream_rate_limited');
    assert.equal(d.upstreamProvider, 'Google AI Studio');
    assert.equal(d.retryAfterMs, null);
  });

  await check('Retry-After is read as seconds or as an HTTP date', () => {
    const seconds = describeOpenRouterFailure(429, new Headers({ 'Retry-After': '3' }), '{}', NOW);
    assert.equal(seconds.retryAfterMs, 3000);
    const date = new Date(NOW + 5000).toUTCString();
    const dated = describeOpenRouterFailure(429, new Headers({ 'Retry-After': date }), '{}', NOW);
    assert.equal(dated.retryAfterMs, 5000);
  });

  await check('Real rate-limit response headers are read', () => {
    const d = describeOpenRouterFailure(
      429,
      new Headers({ 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(NOW + 4000) }),
      'not json',
      NOW
    );
    assert.equal(d.limit, 20);
    assert.equal(d.remaining, 0);
    assert.equal(d.retryAfterMs, 4000);
    assert.equal(d.reason, 'rate_limited_unspecified');
  });

  await check('A body that is not JSON, or says nothing known, gets a fixed label', () => {
    assert.equal(describeOpenRouterFailure(404, new Headers(), '<html>oops</html>', NOW).reason, 'unrecognised');
    assert.equal(describeOpenRouterFailure(429, new Headers(), '', NOW).reason, 'rate_limited_unspecified');
  });

  console.log('\n[2] Daily quota exhaustion: one attempt, then the safe message');

  await check('A daily quota is permanent, and the retry rule stops on it', () => {
    const err = Object.assign(new Error('OpenRouter stream failed with status 429 (reason=daily_quota)'), {
      status: 429,
      rateLimit: describeOpenRouterFailure(429, new Headers(), dailyQuotaBody(), NOW)
    });
    assert.equal(isTransientProviderError(err), false);
    const decision = shouldRetryProviderCall({
      transient: false,
      emittedAnything: false,
      attempt: 1,
      elapsedMs: 300,
      nextDelayMs: retryDelayMs(err, 1)
    });
    assert.deepEqual(decision, { retry: false, reason: 'permanent' });
  });

  await check('A 429 asking for a wait of hours is permanent even without daily wording', () => {
    const err = Object.assign(new Error('OpenRouter stream failed with status 429 (reason=rate_limited_unspecified)'), {
      status: 429,
      rateLimit: describeOpenRouterFailure(429, new Headers({ 'Retry-After': '7200' }), '{}', NOW)
    });
    assert.equal(isTransientProviderError(err), false);
  });

  await check('A live daily-quota turn makes exactly one request and shows only the safe sentence', async () => {
    const out = await withScript([{ status: 429, body: dailyQuotaBody() }], turn);
    assert.equal(out.requests.length, 1, `made ${out.requests.length} requests`);
    assert.ok(out.error, 'the turn did not fail');
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /status=429/);
    assert.match(out.logged, /reason=daily_quota/);
    assert.match(out.logged, /ratelimit_remaining=0/);
    assert.match(out.logged, /retry=false\/permanent/);
  });

  console.log('\n[3] Temporary 429 throttling: real backoff, not three tries in 1.7s');

  await check('Without a hint, a 429 waits 2s then 4s (the old schedule was 0.4s then 0.8s)', () => {
    const err = Object.assign(new Error('OpenRouter stream failed with status 429 (reason=upstream_rate_limited)'), {
      status: 429,
      rateLimit: describeOpenRouterFailure(429, new Headers(), upstreamThrottleBody(), NOW)
    });
    assert.equal(isTransientProviderError(err), true);
    assert.equal(retryDelayMs(err, 1), 2000);
    assert.equal(retryDelayMs(err, 2), 4000);
    assert.ok(retryDelayMs(err, 1)! + retryDelayMs(err, 2)! >= 6000);
  });

  await check('A short Retry-After is honoured', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      rateLimit: describeOpenRouterFailure(429, new Headers({ 'Retry-After': '5' }), upstreamThrottleBody(), NOW)
    });
    assert.equal(retryDelayMs(err, 1), 5000);
  });

  await check('A Retry-After longer than a student should wait stops the retries', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      rateLimit: describeOpenRouterFailure(429, new Headers({ 'Retry-After': '30' }), upstreamThrottleBody(), NOW)
    });
    assert.equal(isTransientProviderError(err), true);
    assert.equal(retryDelayMs(err, 1), null);
    assert.deepEqual(
      shouldRetryProviderCall({ transient: true, emittedAnything: false, attempt: 1, elapsedMs: 100, nextDelayMs: null }),
      { retry: false, reason: 'wait-too-long' }
    );
  });

  await check('A wait that would run past the whole-turn budget is not started', () => {
    assert.deepEqual(
      shouldRetryProviderCall({
        transient: true,
        emittedAnything: false,
        attempt: 1,
        elapsedMs: AI_RETRY.totalBudgetMs - 1000,
        nextDelayMs: 4000
      }),
      { retry: false, reason: 'budget-exhausted' }
    );
  });

  await check('Other transient failures keep the original fast schedule', () => {
    const err = Object.assign(new Error('503'), { status: 503 });
    assert.equal(retryDelayMs(err, 1), 400);
    assert.equal(retryDelayMs(err, 2), 800);
  });

  await check('A live throttled turn is retried with real waits, then recovers', async () => {
    const started = Date.now();
    const out = await withScript(
      [
        { status: 429, body: upstreamThrottleBody(), headers: { 'Retry-After': '1' } },
        { status: 200, body: SSE_OK, headers: { 'Content-Type': 'text/event-stream' } }
      ],
      turn
    );
    const elapsed = Date.now() - started;
    assert.equal(out.error, null, `the turn failed: ${String(out.error)}`);
    assert.equal(out.result, 'Here is a hint.');
    assert.equal(out.requests.length, 2);
    assert.ok(elapsed >= 950, `retried after only ${elapsed}ms`);
    assert.match(out.logged, /reason=upstream_rate_limited/);
    assert.match(out.logged, /upstream="Google AI Studio"/);
    assert.match(out.logged, /retry_after_ms=1000/);
    assert.match(out.logged, /next_in=1000ms/);
  });

  await check('A live throttle that persists uses all attempts, spaced out, then the safe sentence', async () => {
    const started = Date.now();
    const out = await withScript(
      [{ status: 429, body: upstreamThrottleBody(), headers: { 'Retry-After': '1' } }],
      turn
    );
    const elapsed = Date.now() - started;
    assert.equal(out.requests.length, AI_RETRY.maxAttempts);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.ok(elapsed >= 1900, `three attempts took only ${elapsed}ms`);
    assert.match(out.logged, /retry=false\/attempts-exhausted/);
  });

  console.log('\n[4] Secret and student-data redaction');

  const FORBIDDEN = [TEST_KEY, 'sk-or-v1', 'Bearer', 'Authorization', SYSTEM_MARKER, 'STUDENT-MESSAGE-CANARY', 'Asha', 'Park Road', USER_ID_MARKER];

  await check('A body that echoes the key, prompt and student message leaks none of them to logs or errors', async () => {
    const out = await withScript([{ status: 429, body: echoingBody() }], turn);
    assert.ok(out.error);
    const visible = `${out.logged}\n${(out.error as Error).message}`;
    for (const secret of FORBIDDEN) {
      assert.ok(!visible.includes(secret), `leaked: ${secret}`);
    }
    // The unsafe provider name and the non-numeric header were dropped, not echoed.
    assert.ok(!/upstream=/.test(out.logged));
    assert.ok(!/ratelimit_remaining=/.test(out.logged));
  });

  await check('The provider error itself carries no secret, prompt or student text', async () => {
    const out = await withScript([{ status: 429, body: echoingBody() }], () =>
      real.generateStream({
        systemPrompt: SYSTEM_MARKER,
        userPrompt: STUDENT_MARKER,
        history: [],
        images: [],
        onChunk: () => undefined
      })
    );
    const err = out.error as Error & { rateLimit?: unknown };
    assert.equal((err as { status?: number }).status, 429);
    const serialised = `${err.message}\n${JSON.stringify(err.rateLimit)}\n${out.logged}`;
    for (const secret of FORBIDDEN) {
      assert.ok(!serialised.includes(secret), `leaked: ${secret}`);
    }
  });

  await check('Structured generation logs the reason, falls back, and leaks nothing', async () => {
    const out = await withScript([{ status: 429, body: echoingBody() }], () =>
      real.generateStructured({
        systemPrompt: SYSTEM_MARKER,
        userPrompt: STUDENT_MARKER,
        fallbackGenerator: () => ({ fallback: true })
      })
    );
    assert.deepEqual(out.result, { fallback: true });
    assert.match(out.logged, /structured generation failed: status=429/);
    for (const secret of FORBIDDEN) {
      assert.ok(!out.logged.includes(secret), `leaked: ${secret}`);
    }
  });

  await check('The formatted details contain only labels and numbers', () => {
    const line = formatFailureDetails(describeOpenRouterFailure(429, new Headers(), echoingBody(), NOW));
    // "upstream" appears in the echoed raw text, so that is the label; the
    // echoed text itself is not.
    assert.equal(line, 'reason=upstream_rate_limited openrouter_code=429');
  });

  await check('A short provider name that looks like a credential is dropped', () => {
    const body = JSON.stringify({ error: { message: 'x', code: 429, metadata: { provider_name: 'Bearer abc' } } });
    assert.equal(describeOpenRouterFailure(429, new Headers(), body, NOW).upstreamProvider, null);
  });

  console.log('\n[5] Configuration that must not change');

  await check('The request still goes to Gemma, free route, with the key only in the Authorization header', async () => {
    const out = await withScript([{ status: 200, body: SSE_OK, headers: { 'Content-Type': 'text/event-stream' } }], turn);
    assert.equal(out.error, null);
    assert.equal(out.requests[0].model, GEMMA);
    assert.ok(isFreeVisionRoute(GEMMA));
    assert.equal(out.requestHeaders[0].get('authorization'), `Bearer ${TEST_KEY}`);
    assert.ok(!JSON.stringify(out.requests[0]).includes(TEST_KEY), 'the key reached the request body');
    // The teaching prompt is passed through exactly as given.
    const messages = out.requests[0].messages as { role: string; content: string }[];
    assert.deepEqual(messages[0], { role: 'system', content: SYSTEM_MARKER });
  });

  await check('The student-facing message is unchanged', () => {
    assert.equal(AI_UNAVAILABLE_MESSAGE, 'ED is having trouble connecting right now. Try again in a moment.');
  });

  await check('The ordinary retry bounds are unchanged', () => {
    assert.equal(AI_RETRY.maxAttempts, 3);
    assert.equal(AI_RETRY.baseDelayMs, 400);
    assert.equal(AI_RETRY.maxDelayMs, 2000);
    assert.equal(AI_RETRY.totalBudgetMs, 60_000);
  });

  (primaryProvider as unknown as { generateStream: unknown }).generateStream = originalGenerate;
  process.chdir(backendDir);
  try {
    rmSync(isolated, { recursive: true, force: true });
  } catch {
    // Windows can briefly hold the empty folder open; it is in the temp dir either way.
  }

  console.log('\n====================================================');
  console.log('📊 OPENROUTER ERROR HANDLING RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
