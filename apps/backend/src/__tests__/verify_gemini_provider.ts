/**
 * The direct Gemini API provider, its selection, and the request-saving guards.
 *
 * Offline throughout and synthetic only. fetch is replaced before anything runs,
 * so the real @google/genai SDK builds real requests that never leave this
 * process; every response is scripted. '@prisma/client' resolves to an
 * in-memory fixture stub that throws on any model a test has not provided. The
 * key is fake and shaped like a real one so a leak would show. No student data,
 * real or otherwise, is sent anywhere.
 *
 * Run: npm run test:gemini
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { register } from 'node:module';
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

/** The configured default: a genuine Gemini model, never Gemma. */
const MODEL = 'gemini-3.5-flash-lite';
/** Fake, but shaped like a real Google API key. */
const TEST_KEY = 'AIzaSyFAKE-TEST-KEY-0000000000000000000';
const STUDENT_MARKER = 'SYNTHETIC-STUDENT-CANARY-77 what is a fraction';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HOOK_URL = new URL('./support/prisma-fixture-hook.mjs', import.meta.url).href;

// ------------------------------------------------------------ scripted network

type Step =
  | { kind: 'sse'; chunks: Array<Record<string, unknown>>; thenRawError?: Record<string, unknown> }
  | { kind: 'json'; status: number; body: unknown }
  | { kind: 'network' }
  | { kind: 'abort' };

interface Recorded {
  url: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

/** The real fetch, kept for calling the local test server once fetch is scripted. */
const realFetch = globalThis.fetch;
const requests: Recorded[] = [];
/** Every request of the whole run, never reset - for the "no Gemma, ever" check. */
const allRequests: Recorded[] = [];
let script: Step[] = [];

const textChunk = (text: string) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] });
const sse = (...texts: string[]): Step => ({ kind: 'sse', chunks: texts.map(textChunk) });
const apiError = (status: number, apiStatus: string, details: unknown[] = []): Step => ({
  kind: 'json',
  status,
  body: { error: { code: status, message: `Synthetic ${apiStatus} message`, status: apiStatus, details } }
});
const quota = (quotaId: string, retryDelay?: string): Step =>
  apiError(429, 'RESOURCE_EXHAUSTED', [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId }]
    },
    ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : [])
  ]);

function installFetch(): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === 'string') body = JSON.parse(init.body) as Record<string, unknown>;
    requests.push({ url, headers, body });
    allRequests.push({ url, headers, body });

    const step = script.length > 1 ? script.shift()! : script[0];
    if (!step) throw new Error('no scripted response');
    if (step.kind === 'network') throw new TypeError('fetch failed');
    // What fetch throws when the provider's timeout aborts the request.
    if (step.kind === 'abort') throw new DOMException('This operation was aborted', 'AbortError');
    if (step.kind === 'json') {
      return new Response(JSON.stringify(step.body), {
        status: step.status,
        headers: { 'content-type': 'application/json' }
      });
    }
    const payload = step.chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('');
    if (!step.thenRawError) {
      return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    // A mid-stream failure: the text so far, then a separate network chunk
    // holding a bare JSON error - the shape the SDK checks for.
    const encoder = new TextEncoder();
    const rawError = JSON.stringify(step.thenRawError);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.enqueue(encoder.encode(rawError));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof globalThis.fetch;
}

async function quietly<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; logged: string; ms: number }> {
  const saved = { error: console.error, warn: console.warn, log: console.log };
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
  };
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  const started = Date.now();
  try {
    return { result: await fn(), error: null, logged: lines.join('\n'), ms: Date.now() - started };
  } catch (error) {
    return { result: null, error, logged: lines.join('\n'), ms: Date.now() - started };
  } finally {
    console.error = saved.error;
    console.warn = saved.warn;
    console.log = saved.log;
  }
}

const reset = (steps: Step[]) => {
  requests.length = 0;
  script = [...steps];
};
const googleCalls = () => requests.filter((r) => r.url.includes('generativelanguage.googleapis.com')).length;
const nonGoogleCalls = () => requests.filter((r) => !r.url.includes('generativelanguage.googleapis.com'));

async function runAll(): Promise<void> {
  register(HOOK_URL);
  const isolated = mkdtempSync(path.join(tmpdir(), 'edp-gemini-'));
  const backendDir = process.cwd();
  process.chdir(isolated);
  process.env.OPENROUTER_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  delete process.env.AI_PROVIDER;
  // Live with no keys: the factory builds the Mock, so nothing real exists,
  // and Gemini is swapped in below. AI_PROVIDER stays unset here so the
  // signed-in-account gate is off for these provider checks; section [A] tests it.
  process.env.AI_TUTOR_MODE = 'live';
  process.env.OFFLINE_DEMO_AI = 'false';
  process.env.NODE_ENV = 'test';
  installFetch();

  const g = globalThis as unknown as { __EDP_PRISMA_FIXTURE__?: Record<string, unknown> };
  g.__EDP_PRISMA_FIXTURE__ = {};

  const { env, envSchema } = await import('../config/env.config.js');
  const { GeminiAITutorProvider } = await import('../services/ai/gemini.provider.js');
  const { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } = await import('../config/gemini-models.js');
  const { describeGeminiFailure } = await import('../services/ai/gemini-failure.js');
  const factory = await import('../services/ai/provider.factory.js');
  const {
    AI_QUOTA_MESSAGE,
    AI_UNAVAILABLE_MESSAGE,
    AI_RETRY,
    primaryProvider,
    resolveProviderChoice,
    streamWithFallback
  } = factory;
  const { AI_PAUSED_MESSAGE } = await import('../services/ai/ai-availability.js');
  const guard = await import('../services/ai/ai-request-guard.js');
  const { boundHistory, TUTOR_HISTORY_CHAR_BUDGET } = await import('../services/tutor/history-budget.js');
  const { buildTutorSystemPrompt } = await import('../services/tutor/prompt-builder.service.js');
  const { aiDailyRateLimiter, AI_DAILY_REQUESTS_PER_STUDENT } = await import('../middlewares/rate-limit.middleware.js');
  const { tutorController } = await import('../controllers/tutor.controller.js');
  const { aiController } = await import('../controllers/ai.controller.js');
  const { edTutorService } = await import('../services/tutor/ed-tutor.service.js');
  const { tutorSessionService } = await import('../services/tutor/tutor-session.service.js');
  const { aiTutorService } = await import('../services/ai/ai-tutor.service.js');
  const { studentProfileService } = await import('../services/student-profile.service.js');

  const SYSTEM_PROMPT = buildTutorSystemPrompt({
    classLevel: 'CLASS_6',
    subject: 'MATH',
    language: 'ENGLISH',
    explanationStyle: 'SIMPLE',
    studentFirstName: null,
    curriculum: null,
    action: null
  });

  const gemini = new GeminiAITutorProvider(TEST_KEY, MODEL);
  const p = primaryProvider as unknown as Record<string, unknown>;
  const original = { generateStream: p.generateStream, generateStructured: p.generateStructured };
  const useGemini = (provider = gemini) => {
    p.generateStream = (params: Parameters<typeof provider.generateStream>[0]) => provider.generateStream(params);
    p.generateStructured = (params: Parameters<typeof provider.generateStructured>[0]) =>
      provider.generateStructured(params);
  };
  useGemini();

  let received: string[] = [];
  const turn = (images: { mimeType: string; data: Buffer }[] = []) => {
    received = [];
    return streamWithFallback({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: STUDENT_MARKER,
      history: [
        { role: 'user', text: 'earlier question' },
        { role: 'model', text: 'earlier answer' }
      ],
      images,
      onChunk: (chunk) => {
        received.push(chunk);
      }
    });
  };
  const assertNoSecrets = (text: string) => {
    for (const secret of [TEST_KEY, 'AIzaSy', 'x-goog-api-key', 'STUDENT-CANARY', 'Synthetic RESOURCE_EXHAUSTED message', 'Synthetic']) {
      assert.ok(!text.includes(secret), `leaked: ${secret}`);
    }
  };

  // -------------------------------------------------------------------------
  console.log('\n[1] Provider selection: explicit, never accidental, never a fallback');

  const choice = (c: Partial<Parameters<typeof resolveProviderChoice>[0]>) =>
    resolveProviderChoice({ OPENROUTER_API_KEY: '', GEMINI_API_KEY: '', OFFLINE_DEMO_AI: false, ...c });

  await check('AI_PROVIDER=gemini selects Gemini even when an OpenRouter key is also set', () => {
    assert.equal(choice({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'o' }), 'gemini');
  });
  await check('AI_PROVIDER=gemini without a Gemini key is the Mock, never OpenRouter', () => {
    assert.equal(choice({ AI_PROVIDER: 'gemini', OPENROUTER_API_KEY: 'o' }), 'mock');
  });
  await check('Unset AI_PROVIDER keeps the old behaviour; a Gemini key alone selects nothing', () => {
    assert.equal(choice({ OPENROUTER_API_KEY: 'o' }), 'openrouter');
    assert.equal(choice({ GEMINI_API_KEY: 'k' }), 'mock');
    assert.equal(choice({}), 'mock');
  });
  await check('AI_PROVIDER=openrouter ignores a Gemini key', () => {
    assert.equal(choice({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'k' }), 'openrouter');
    assert.equal(choice({ AI_PROVIDER: 'openrouter', GEMINI_API_KEY: 'k' }), 'mock');
  });
  await check('The offline demo always gets the Mock', () => {
    assert.equal(choice({ OFFLINE_DEMO_AI: true }), 'offline-demo');
  });
  await check('In this offline run no real provider was built', () => {
    assert.equal(primaryProvider.name, 'MockAITutorProvider');
  });

  // -------------------------------------------------------------------------
  console.log('\n[2] Startup validation (production)');

  const prodEnv = (extra: Record<string, string>) => ({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-unique-production-secret-that-is-long-enough-123',
    DATABASE_URL: 'postgresql://user:pw@db.example.test:5432/app',
    CORS_ORIGIN: 'https://e-dplatform.vercel.app',
    AI_TUTOR_MODE: 'live',
    ...extra
  });
  const issues = (r: ReturnType<typeof envSchema.safeParse>) =>
    r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

  await check('Production with AI_PROVIDER=gemini and no key refuses to start, naming the variable only', () => {
    const r = envSchema.safeParse(prodEnv({ AI_PROVIDER: 'gemini', OPENROUTER_API_KEY: 'sk-or-v1-x' }));
    assert.equal(r.success, false);
    assert.ok(issues(r).some((i) => i.startsWith('GEMINI_API_KEY')));
  });
  await check('Production with AI_PROVIDER=gemini and a key starts without an OpenRouter key', () => {
    const r = envSchema.safeParse(prodEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: TEST_KEY }));
    assert.equal(r.success, true, issues(r).join('; '));
    const text = issues(r).join(' ');
    assert.ok(!text.includes(TEST_KEY));
  });
  await check('Production without AI_PROVIDER still requires the OpenRouter key, as before', () => {
    const r = envSchema.safeParse(prodEnv({}));
    assert.ok(issues(r).some((i) => i.startsWith('OPENROUTER_API_KEY')));
  });
  await check('An unknown AI_PROVIDER value is refused', () => {
    const r = envSchema.safeParse(prodEnv({ AI_PROVIDER: 'gemni', GEMINI_API_KEY: TEST_KEY }));
    assert.equal(r.success, false);
  });
  await check('The offline demo cannot be combined with AI_PROVIDER=gemini', () => {
    const r = envSchema.safeParse({ ...prodEnv({}), OFFLINE_DEMO_AI: 'true', AI_PROVIDER: 'gemini' });
    assert.ok(issues(r).some((i) => i.startsWith('AI_PROVIDER')));
  });
  await check('The default model is the Gemini model gemini-3.5-flash-lite, not Gemma', () => {
    assert.equal(env.GEMINI_MODEL, MODEL);
    assert.equal(DEFAULT_GEMINI_MODEL, MODEL);
    assert.match(MODEL, /^gemini-/);
    assert.ok(!/gemma/i.test(MODEL));
  });

  await check('Every allowlisted model is a Gemini model; none is Gemma, 2.5, TTS, image or live', () => {
    const ids = Object.keys(GEMINI_MODELS);
    assert.ok(ids.length > 0);
    for (const id of ids) {
      assert.match(id, /^gemini-3\.\d-flash(-lite)?$/, id);
      assert.ok(!/gemma|2\.5|tts|image|live|embedding|argon/i.test(id), id);
    }
  });

  for (const bad of ['gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-2.5-flash', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-image', 'gemini-4-argon', 'gemini-3.8-live', '']) {
    await check(`AI_PROVIDER=gemini with GEMINI_MODEL="${bad}" refuses to start, in development too`, () => {
      for (const nodeEnv of ['development', 'production']) {
        const r = envSchema.safeParse({ ...prodEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: TEST_KEY, GEMINI_MODEL: bad }), NODE_ENV: nodeEnv });
        assert.equal(r.success, false, `${nodeEnv} accepted ${bad}`);
        assert.ok(issues(r).some((i) => i.startsWith('GEMINI_MODEL')));
        assert.ok(!issues(r).join(' ').includes(TEST_KEY), 'the key appeared in a startup message');
      }
    });
  }

  await check('The provider itself refuses a Gemma or unsupported model before any request', () => {
    requests.length = 0;
    for (const bad of ['gemma-4-31b-it', 'gemini-2.5-flash', 'gemini-3.8-flash-tts']) {
      assert.throws(() => new GeminiAITutorProvider(TEST_KEY, bad), /Unsupported Gemini model/);
    }
    assert.equal(requests.length, 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[3] What is sent to Google (real SDK, intercepted)');

  await check('One request to the Gemini API: key in a header only, never in the URL', async () => {
    reset([sse('A fraction ', 'is part of a whole.')]);
    const out = await quietly(() => turn());
    assert.equal(out.error, null, String(out.error));
    assert.equal(requests.length, 1);
    const [req] = requests;
    assert.match(req.url, /^https:\/\/generativelanguage\.googleapis\.com\/.*models\/gemini-3\.5-flash-lite:streamGenerateContent\?alt=sse$/);
    assert.ok(!/gemma/i.test(req.url), 'a Gemma model was requested');
    assert.ok(!req.url.includes(TEST_KEY), 'the key is in the URL');
    assert.equal(req.headers.get('x-goog-api-key'), TEST_KEY);
  });

  await check('The ED teaching prompt is sent byte-for-byte as the system instruction', async () => {
    reset([sse('ok')]);
    await quietly(() => turn());
    const body = requests[0].body!;
    const sent = (body.systemInstruction as { parts: { text: string }[] }).parts.map((x) => x.text).join('');
    assert.equal(sent, SYSTEM_PROMPT);
  });

  await check('History, then this turn, in Gemini roles; nothing else about the student', async () => {
    reset([sse('ok')]);
    await quietly(() => turn());
    const contents = requests[0].body!.contents as { role: string; parts: { text?: string }[] }[];
    assert.deepEqual(contents.map((c) => c.role), ['user', 'model', 'user']);
    assert.equal(contents[2].parts[0].text, STUDENT_MARKER);
    assert.deepEqual(Object.keys(requests[0].body!).sort(), ['contents', 'generationConfig', 'systemInstruction']);
  });

  await check('Output is capped at 1024 tokens and thinking is at the model\'s lowest level (minimal)', async () => {
    reset([sse('ok')]);
    await quietly(() => turn());
    const config = requests[0].body!.generationConfig as Record<string, unknown>;
    assert.equal(config.maxOutputTokens, GEMINI_MODELS[MODEL].tutorMaxOutputTokens);
    assert.equal(config.maxOutputTokens, 1024);
    assert.equal(config.temperature, 0.7);
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'MINIMAL' });
    assert.equal(config.responseMimeType, undefined, 'a tutor reply was forced into JSON');
  });

  await check('gemini-3.8-flash, which cannot go below low thinking, gets low thinking and more room', async () => {
    reset([sse('ok')]);
    const flash = new GeminiAITutorProvider(TEST_KEY, 'gemini-3.8-flash');
    await quietly(() =>
      flash.generateStream({ systemPrompt: SYSTEM_PROMPT, userPrompt: 'synthetic', history: [], onChunk: () => undefined })
    );
    assert.match(requests[0].url, /models\/gemini-3\.8-flash:streamGenerateContent/);
    const config = requests[0].body!.generationConfig as Record<string, unknown>;
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.equal(config.maxOutputTokens, 2048);
  });

  await check('A photo is sent inline with the question, as base64', async () => {
    reset([sse('That is a triangle.')]);
    const out = await quietly(() => turn([{ mimeType: 'image/png', data: PNG }]));
    assert.equal(out.result, 'That is a triangle.');
    const last = (requests[0].body!.contents as { parts: Record<string, unknown>[] }[]).at(-1)!;
    assert.deepEqual(last.parts[0], { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } });
    assert.equal(last.parts[1].text, STUDENT_MARKER);
  });

  await check('The reply streams chunk by chunk and the full text is returned', async () => {
    reset([sse('One ', 'two ', 'three.')]);
    const out = await quietly(() => turn());
    assert.deepEqual(received, ['One ', 'two ', 'three.']);
    assert.equal(out.result, 'One two three.');
  });

  // -------------------------------------------------------------------------
  console.log('\n[4] Quota, rate limits and failures');

  await check('A daily quota: one request, no retry, the friendly quota message', async () => {
    reset([quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '43200s')]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), 1);
    assert.equal((out.error as Error).message, AI_QUOTA_MESSAGE);
    assert.equal((out.error as { code?: string }).code, 'AI_QUOTA_EXHAUSTED');
    assert.match(out.logged, /reason=daily_quota/);
    assertNoSecrets(out.logged);
  });

  await check('A per-minute limit with a long wait is not waited out: one request, quota message', async () => {
    reset([quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '40s')]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), 1);
    assert.equal((out.error as Error).message, AI_QUOTA_MESSAGE);
    assert.match(out.logged, /retry=false\/wait-too-long/);
  });

  await check('A per-minute limit with a short wait is retried once after that wait', async () => {
    reset([quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '1s'), sse('Recovered.')]);
    const out = await quietly(() => turn());
    assert.equal(out.result, 'Recovered.');
    assert.equal(googleCalls(), 2);
    assert.ok(out.ms >= 950, `retried after ${out.ms}ms`);
  });

  await check('The SDK does not retry on its own: a 503 is exactly the policy\'s attempts', async () => {
    reset([apiError(503, 'UNAVAILABLE')]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), AI_RETRY.maxAttempts, `made ${googleCalls()} requests`);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
  });

  for (const [status, apiStatus] of [
    [400, 'INVALID_ARGUMENT'],
    [401, 'UNAUTHENTICATED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND']
  ] as const) {
    await check(`A ${status} is permanent: one request, the ordinary message, not the quota one`, async () => {
      reset([apiError(status, apiStatus)]);
      const out = await quietly(() => turn());
      assert.equal(googleCalls(), 1);
      assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
      assertNoSecrets(out.logged + (out.error as Error).message);
    });
  }

  await check('A dropped connection is retried within the bound, then the ordinary message', async () => {
    reset([{ kind: 'network' }]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), AI_RETRY.maxAttempts);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /category=network/);
  });

  await check('A timed-out request is reported as a timeout, retried within the bound, then the ordinary message', async () => {
    reset([{ kind: 'abort' }]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), AI_RETRY.maxAttempts);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /stream timed out: model=gemini-3\.5-flash-lite/);
    assert.match(out.logged, /status=408/);
    assertNoSecrets(out.logged);
  });

  await check('A model refusal with no text is not retried', async () => {
    reset([{ kind: 'sse', chunks: [{ candidates: [{ finishReason: 'SAFETY', content: { role: 'model', parts: [] } }] }] }]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), 1);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
  });

  await check('An error after text has streamed is not retried, so nothing is shown twice', async () => {
    reset([
      {
        kind: 'sse',
        chunks: [textChunk('A fraction is')],
        thenRawError: { error: { code: 503, status: 'UNAVAILABLE', message: 'x' } }
      }
    ]);
    const out = await quietly(() => turn());
    assert.equal(googleCalls(), 1);
    assert.deepEqual(received, ['A fraction is']);
    assert.ok(out.error, 'the mid-stream failure was not reported');
    assert.match(out.logged, /retry=false\/already-streamed/);
  });

  await check('No failure ever sends a request anywhere but Google - there is no fallback provider', () => {
    assert.deepEqual(nonGoogleCalls(), []);
  });

  await check('Quota details are read from a mid-stream error too', () => {
    const d = describeGeminiFailure(
      429,
      'got status: RESOURCE_EXHAUSTED. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}'
    );
    assert.equal(d.reason, 'daily_quota');
  });

  // -------------------------------------------------------------------------
  console.log('\n[5] Structured quiz analysis');

  const structured = (fallback: { local: true }) =>
    gemini.generateStructured<Record<string, unknown>>({
      systemPrompt: 'Return JSON.',
      userPrompt: 'synthetic quiz data',
      fallbackGenerator: () => fallback
    });

  await check('Quiz analysis uses JSON mode, a 2048-token cap and minimal thinking; a fenced reply still parses', async () => {
    reset([{ kind: 'json', status: 200, body: textChunk('```json\n{"generalFeedback":"ok"}\n```') }]);
    const out = await quietly(() => structured({ local: true }));
    assert.deepEqual(out.result, { generalFeedback: 'ok' });
    assert.match(requests[0].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    const config = requests[0].body!.generationConfig as Record<string, unknown>;
    assert.equal(config.maxOutputTokens, GEMINI_MODELS[MODEL].structuredMaxOutputTokens);
    assert.equal(config.responseMimeType, 'application/json');
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'MINIMAL' });
  });

  await check('Malformed JSON falls back locally without logging the reply', async () => {
    reset([{ kind: 'json', status: 200, body: textChunk('not json STUDENT-CANARY') }]);
    const out = await quietly(() => structured({ local: true }));
    assert.deepEqual(out.result, { local: true });
    assert.ok(!out.logged.includes('STUDENT-CANARY'));
    assert.match(out.logged, /invalid_json/);
  });

  await check('A quota error falls back locally after one request', async () => {
    reset([quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')]);
    const out = await quietly(() => structured({ local: true }));
    assert.deepEqual(out.result, { local: true });
    assert.equal(googleCalls(), 1);
  });

  await check('gemini-3.8-flash quiz analysis gets low thinking and a 3072-token cap', async () => {
    reset([{ kind: 'json', status: 200, body: textChunk('{"a":1}') }]);
    const flash = new GeminiAITutorProvider(TEST_KEY, 'gemini-3.8-flash');
    await quietly(() => flash.generateStructured({ systemPrompt: 's', userPrompt: 'u' }));
    const config = requests[0].body!.generationConfig as Record<string, unknown>;
    assert.equal(config.responseMimeType, 'application/json');
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.equal(config.maxOutputTokens, 3072);
  });

  await check('Across every request in this suite, no Gemma model was ever named', () => {
    assert.ok(allRequests.length > 0);
    for (const r of allRequests) {
      assert.ok(!/gemma/i.test(r.url) && !/gemma/i.test(JSON.stringify(r.body ?? {})), `Gemma in ${r.url}`);
    }
  });

  // -------------------------------------------------------------------------
  console.log('\n[6] Pause switch');

  await check('While paused, Gemini is never called', async () => {
    (env as { AI_TUTOR_MODE: string }).AI_TUTOR_MODE = 'paused';
    try {
      reset([sse('must not be sent')]);
      const out = await quietly(() => turn());
      assert.equal(requests.length, 0);
      assert.equal((out.error as Error).message, AI_PAUSED_MESSAGE);
    } finally {
      (env as { AI_TUTOR_MODE: string }).AI_TUTOR_MODE = 'live';
    }
  });

  // -------------------------------------------------------------------------
  console.log('\n[7] Conversation history budget');

  const msg = (role: 'user' | 'model', size: number, tag: string) => ({ role, text: tag.padEnd(size, '.') });

  await check('Short conversations are sent whole', () => {
    const h = [msg('user', 100, 'u1'), msg('model', 100, 'm1')];
    assert.deepEqual(boundHistory(h), h);
  });
  await check('Long conversations keep the newest whole messages within the budget', () => {
    const h = [msg('user', 3000, 'u1'), msg('model', 3000, 'm1'), msg('user', 3000, 'u2'), msg('model', 3000, 'm2')];
    const kept = boundHistory(h);
    assert.ok(kept.reduce((n, m) => n + m.text.length, 0) <= TUTOR_HISTORY_CHAR_BUDGET);
    assert.equal(kept.at(-1)!.text, h[3].text);
    assert.ok(kept.every((m) => h.includes(m)), 'a message was altered');
  });
  await check('The kept history always starts with a student turn', () => {
    const h = [msg('user', 7000, 'u1'), msg('model', 3000, 'm1'), msg('user', 3000, 'u2'), msg('model', 1000, 'm2')];
    const kept = boundHistory(h);
    assert.equal(kept[0].role, 'user');
  });
  await check('A single newest message is kept even if it alone exceeds the budget', () => {
    const h = [msg('user', 9000, 'u1')];
    assert.equal(boundHistory(h).length, 1);
  });

  // -------------------------------------------------------------------------
  console.log('\n[8] Duplicate-request guards');

  await check('An AI slot can be held once; a second claim is refused until released', () => {
    const release = guard.tryAcquireAiSlot('t:1');
    assert.ok(release);
    assert.equal(guard.tryAcquireAiSlot('t:1'), null);
    release!();
    release!();
    const again = guard.tryAcquireAiSlot('t:1');
    assert.ok(again);
    again!();
  });
  await check('A slot left by a crashed request frees itself after three minutes', () => {
    const t0 = 1_000_000;
    assert.ok(guard.tryAcquireAiSlot('t:stale', t0));
    assert.equal(guard.tryAcquireAiSlot('t:stale', t0 + 60_000), null);
    const late = guard.tryAcquireAiSlot('t:stale', t0 + 3 * 60_000 + 1);
    assert.ok(late);
    late!();
  });

  // Fake express objects for the controllers.
  const fakeRes = () => {
    const res = {
      headersSent: false,
      written: [] as string[],
      writeHead() {
        res.headersSent = true;
        return res;
      },
      write(s: string) {
        res.written.push(s);
        return true;
      },
      end() {
        return res;
      }
    };
    return res;
  };
  const fakeReq = (body: unknown, sessionId = 'session-1') => ({
    user: { id: 'user-1', firstName: null },
    params: { sessionId },
    body,
    on() {}
  });

  await check('A second tutor turn while the first is streaming gets 409 and is never stored or sent', async () => {
    const s = tutorSessionService as unknown as Record<string, unknown>;
    const e = edTutorService as unknown as Record<string, unknown>;
    const saved = { owned: s.getOwnedSession, stream: e.streamTurn };
    let streamCalls = 0;
    const pending: Array<() => void> = [];
    const finishAll = () => pending.splice(0).forEach((resolve) => resolve());
    s.getOwnedSession = async () => ({ id: 'session-1', userId: 'user-1' });
    e.streamTurn = async () => {
      streamCalls += 1;
      await new Promise<void>((resolve) => pending.push(resolve));
      return { studentMessageId: 'a', reply: 'r', edMessageId: 'b' };
    };
    const settle = (promise: Promise<unknown>) => Promise.race([promise, new Promise((r) => setTimeout(r, 100))]);
    try {
      const errors: unknown[] = [];
      const first = tutorController.streamTurn(fakeReq({ message: 'one' }) as never, fakeRes() as never, (err) => {
        errors.push(err);
      });
      await new Promise((r) => setTimeout(r, 20));
      await settle(
        tutorController.streamTurn(fakeReq({ message: 'two' }) as never, fakeRes() as never, (err) => {
          errors.push(err);
        })
      );
      assert.equal(streamCalls, 1, 'the duplicate reached the tutor service');
      assert.equal((errors[0] as { statusCode?: number }).statusCode, 409);
      assert.equal((errors[0] as Error).message, guard.AI_BUSY_MESSAGE);
      finishAll();
      await first;
      // Released: the next turn goes through.
      const third = tutorController.streamTurn(fakeReq({ message: 'three' }) as never, fakeRes() as never, () => {});
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(streamCalls, 2);
      finishAll();
      await third;
    } finally {
      finishAll();
      s.getOwnedSession = saved.owned;
      e.streamTurn = saved.stream;
    }
  });

  await check('A second quiz hint while the first is streaming gets 409 and makes no AI call', async () => {
    const a = aiTutorService as unknown as Record<string, unknown>;
    const saved = { prepare: a.prepareQuizHint, stream: a.streamPreparedQuizHint };
    let streamCalls = 0;
    const pending: Array<() => void> = [];
    const finishAll = () => pending.splice(0).forEach((resolve) => resolve());
    a.prepareQuizHint = async () => ({ systemPrompt: 's', userPrompt: 'u', meta: {} });
    a.streamPreparedQuizHint = async () => {
      streamCalls += 1;
      await new Promise<void>((resolve) => pending.push(resolve));
    };
    const settle = (promise: Promise<unknown>) => Promise.race([promise, new Promise((r) => setTimeout(r, 100))]);
    try {
      const errors: unknown[] = [];
      const body = { questionId: '00000000-0000-4000-8000-000000000001', message: 'hint please' };
      const first = aiController.streamQuizHint(fakeReq(body) as never, fakeRes() as never, (e) => {
        errors.push(e);
      });
      await new Promise((r) => setTimeout(r, 20));
      await settle(
        aiController.streamQuizHint(fakeReq(body) as never, fakeRes() as never, (e) => {
          errors.push(e);
        })
      );
      assert.equal(streamCalls, 1);
      assert.equal((errors[0] as { statusCode?: number }).statusCode, 409, String(errors[0]));
      finishAll();
      await first;
    } finally {
      finishAll();
      a.prepareQuizHint = saved.prepare;
      a.streamPreparedQuizHint = saved.stream;
    }
  });

  // A submitted attempt with one wrong answer, for the analysis tests.
  const course = { slug: 'class-6-science', title: 'Class 6 Science', isPublished: true };
  const lesson = { id: 'lesson-1', title: 'Topic', isPublished: true, moduleId: 'module-1', module: { id: 'module-1', title: 'Ch', course } };
  const attempt = (aiFeedback: string | null = null) => ({
    id: 'attempt-1',
    userId: 'user-1',
    quizId: 'quiz-1',
    status: 'SUBMITTED',
    score: 0,
    percentage: 0,
    isPassed: false,
    aiFeedback,
    quiz: {
      id: 'quiz-1',
      title: 'Synthetic quiz',
      isPublished: true,
      lessonId: 'lesson-1',
      moduleId: null,
      lesson,
      module: null,
      questions: [
        {
          id: 'q1',
          prompt: 'Synthetic question?',
          explanation: 'Synthetic explanation.',
          lessonId: 'lesson-1',
          lesson,
          options: [
            { id: 'a', text: 'Right', isCorrect: true },
            { id: 'b', text: 'Wrong', isCorrect: false }
          ]
        }
      ]
    },
    answers: [{ questionId: 'q1', isCorrect: false, selectedOptionIds: ['b'] }]
  });
  const updates: unknown[] = [];
  const useAttempt = (row: ReturnType<typeof attempt>) => {
    updates.length = 0;
    g.__EDP_PRISMA_FIXTURE__ = {
      quizAttempt: {
        findUnique: async () => row,
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        }
      }
    };
  };
  (studentProfileService as unknown as Record<string, unknown>).getProfile = async () => ({ classLevel: 'CLASS_6' });
  const student = { id: 'user-1', firstName: null, role: 'STUDENT' } as unknown as Parameters<
    typeof aiTutorService.analyzeQuizMistakes
  >[0];
  const analysisJson = textChunk(
    JSON.stringify({
      generalFeedback: 'Synthetic AI feedback.',
      mistakes: [{ questionId: 'q1', concept: 'c', mistakeType: 'misconception', explanation: 'e', recommendedAction: 'r', practicePrompt: 'p' }],
      strengths: [],
      recommendedTopics: []
    })
  );

  await check('Two simultaneous analyses of one attempt make one AI request and share the result', async () => {
    useAttempt(attempt());
    reset([{ kind: 'json', status: 200, body: analysisJson }]);
    const out = await quietly(() =>
      Promise.all([
        aiTutorService.analyzeQuizMistakes(student, 'attempt-1'),
        aiTutorService.analyzeQuizMistakes(student, 'attempt-1')
      ])
    );
    assert.equal(out.error, null, String(out.error));
    assert.equal(googleCalls(), 1);
    assert.deepEqual(out.result![0], out.result![1]);
    assert.equal(updates.length, 1, 'the result was not cached exactly once');
  });

  await check('A cached analysis is reused with no AI request', async () => {
    useAttempt(attempt());
    reset([{ kind: 'json', status: 200, body: analysisJson }]);
    const first = await quietly(() => aiTutorService.analyzeQuizMistakes(student, 'attempt-1'));
    useAttempt(attempt(JSON.stringify(first.result)));
    reset([{ kind: 'json', status: 200, body: analysisJson }]);
    const second = await quietly(() => aiTutorService.analyzeQuizMistakes(student, 'attempt-1'));
    assert.equal(requests.length, 0);
    assert.deepEqual(second.result, first.result);
  });

  await check('A perfect score needs no AI at all', async () => {
    const perfect = attempt();
    perfect.answers = [{ questionId: 'q1', isCorrect: true, selectedOptionIds: ['a'] }];
    useAttempt(perfect);
    reset([{ kind: 'json', status: 200, body: analysisJson }]);
    await quietly(() => aiTutorService.analyzeQuizMistakes(student, 'attempt-1'));
    assert.equal(requests.length, 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[9] Per-student daily limit');

  await check(`The daily limit allows ${AI_DAILY_REQUESTS_PER_STUDENT} AI requests, then refuses with a friendly 429`, () => {
    const run = (userId: string) => {
      let threw: unknown = null;
      try {
        aiDailyRateLimiter({ user: { id: userId }, ip: '127.0.0.1' } as never, { setHeader() {} } as never, () => {});
      } catch (err) {
        threw = err;
      }
      return threw;
    };
    for (let i = 0; i < AI_DAILY_REQUESTS_PER_STUDENT; i += 1) assert.equal(run('daily-user'), null, `refused at ${i + 1}`);
    const refused = run('daily-user') as { statusCode?: number; message?: string };
    assert.equal(refused.statusCode, 429);
    assert.match(refused.message ?? '', /try ED again tomorrow/);
    assert.equal(run('another-user'), null, 'another student was affected');
  });

  // -------------------------------------------------------------------------
  console.log('\n[10] Secrets');

  await check('The key never appears in logs, error messages or diagnostics', async () => {
    const outs = [];
    for (const steps of [
      [quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')],
      [apiError(403, 'PERMISSION_DENIED')],
      [{ kind: 'network' } as Step],
      [apiError(500, 'INTERNAL')]
    ]) {
      reset(steps);
      outs.push(await quietly(() => turn()));
    }
    for (const out of outs) {
      const e = out.error as Error & { diagnostic?: string };
      assertNoSecrets(`${out.logged}\n${e.message}\n${e.diagnostic ?? ''}`);
    }
  });

  // -------------------------------------------------------------------------
  console.log('\n[A] Signed-in gate: live Gemini for any authenticated account, never anonymous');

  const availability = await import('../services/ai/ai-availability.js');
  const { runWithAiAudience } = await import('../services/ai/ai-audience.js');
  const mutableEnv = env as { AI_PROVIDER?: string; AI_TUTOR_MODE: string };
  const savedGate = { ...mutableEnv };
  mutableEnv.AI_TUTOR_MODE = 'live';
  mutableEnv.AI_PROVIDER = 'gemini';

  await check('There is no email allowlist setting any more', () => {
    assert.equal('AI_LIVE_ALLOWED_EMAILS' in env, false);
  });
  await check('Outside a request nobody is allowed: paused, no external AI, no mic', () => {
    assert.equal(availability.isAiTutorPaused(), true);
    assert.equal(availability.isExternalAiAllowed(), false);
    assert.deepEqual(availability.aiClientStatus(), { tutorPaused: true, voiceInputAllowed: false });
  });
  for (const anonymous of [null, undefined, '', '   ']) {
    await check(`A request with no account (${JSON.stringify(anonymous)}) is paused and sends nothing`, async () => {
      await runWithAiAudience(anonymous, async () => {
        assert.deepEqual(availability.aiClientStatus(), { tutorPaused: true, voiceInputAllowed: false });
        reset([sse('should not be sent')]);
        const out = await quietly(() => turn());
        assert.equal((out.error as Error).message, AI_PAUSED_MESSAGE);
        assert.equal(googleCalls(), 0);
      });
    });
  }
  await check('Calling the Gemini provider directly with no account sends nothing', async () => {
    await runWithAiAudience(null, async () => {
      reset([sse('should not be sent')]);
      const out = await quietly(() => gemini.generateStream({ systemPrompt: SYSTEM_PROMPT, userPrompt: 'x', onChunk: () => {} }));
      assert.equal((out.error as Error).message, AI_PAUSED_MESSAGE);
      assert.equal(googleCalls(), 0);
    });
  });
  for (const userId of ['user-team-member-1', 'user-any-other-account']) {
    await check(`Any signed-in account (${userId}) gets live Gemini and the mic, with no list to be on`, async () => {
      await runWithAiAudience(userId, async () => {
        assert.deepEqual(availability.aiClientStatus(), { tutorPaused: false, voiceInputAllowed: true });
        reset([sse('Hello ', 'there.')]);
        const out = await quietly(() => turn());
        assert.equal(out.error, null, String(out.error));
        assert.equal(out.result, 'Hello there.');
        assert.equal(googleCalls(), 1);
        assert.equal(nonGoogleCalls().length, 0);
      });
    });
  }
  await check('Paused mode stays paused even for a signed-in account', async () => {
    mutableEnv.AI_TUTOR_MODE = 'paused';
    await runWithAiAudience('user-team-member-1', async () => {
      assert.deepEqual(availability.aiClientStatus(), { tutorPaused: true, voiceInputAllowed: false });
    });
    mutableEnv.AI_TUTOR_MODE = 'live';
  });

  // Anonymous HTTP requests, live Gemini configured: every AI route answers
  // 401 from authenticate, and nothing reaches Google.
  const { createApp } = await import('../app.js');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/v1`;
  const photoForm = () => {
    const form = new FormData();
    form.append('message', 'What is this?');
    form.append('image', new Blob([PNG], { type: 'image/png' }), 'q.png');
    return form;
  };
  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });
  const anonymousCalls: Array<[string, string, () => RequestInit]> = [
    ['tutor status', '/tutor/status', () => ({ method: 'GET' })],
    ['tutor chat stream', '/tutor/sessions/session-1/stream', () => json({ message: 'hi' })],
    ['photo question', '/tutor/sessions/session-1/stream', () => ({ method: 'POST', body: photoForm() })],
    ['quiz hint', '/ai/quiz/hint', () => json({ attemptId: 'attempt-1', questionId: 'question-1' })],
    ['quiz analysis', '/ai/quiz/mistake-analysis', () => json({ attemptId: 'attempt-1' })]
  ];
  try {
    for (const [label, route, init] of anonymousCalls) {
      await check(`Anonymous ${label} is refused with 401 and sends nothing to Gemini`, async () => {
        reset([sse('should not be sent')]);
        const res = await realFetch(`${base}${route}`, init());
        assert.equal(res.status, 401, `${label}: ${res.status}`);
        assert.equal(googleCalls(), 0);
      });
    }
  } finally {
    server.close();
  }
  Object.assign(mutableEnv, savedGate);
  if (savedGate.AI_PROVIDER === undefined) delete mutableEnv.AI_PROVIDER;

  // ------------------------------------------------------------------ teardown
  p.generateStream = original.generateStream;
  p.generateStructured = original.generateStructured;
  g.__EDP_PRISMA_FIXTURE__ = undefined;
  process.chdir(backendDir);
  try {
    rmSync(isolated, { recursive: true, force: true });
  } catch {
    // Windows can briefly hold the empty folder open; it is in the temp dir either way.
  }

  console.log('\n====================================================');
  console.log('📊 GEMINI PROVIDER RESULTS');
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
