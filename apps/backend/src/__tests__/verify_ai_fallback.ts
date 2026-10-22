/**
 * The free fallback route: when it is used, when it is not, and that it can
 * only ever be free.
 *
 * Offline throughout. fetch is replaced with a script before any provider
 * call, so no request leaves this process - neither to the chat endpoint nor
 * to the model catalogue. '@prisma/client' resolves to a stub that throws on
 * use, so no database can be reached; the tutor service's own reads are
 * replaced with in-memory fakes. The key is fake. No environment file is read.
 *
 * Run: npm run test:ai-fallback
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

const GEMMA = 'google/gemma-4-31b-it:free';
const INKLING = 'thinkingmachines/inkling-small:free';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CATALOGUE_URL = `https://openrouter.ai/api/v1/models/${INKLING}/endpoints`;
/** Fake, but shaped like a real key so a leak would show. */
const TEST_KEY = 'sk-or-v1-FALLBACKTESTKEY00000000000000000000000000000000000000000000';
const STUDENT_MARKER = 'STUDENT-CANARY-5d1e what is a noun, I am Ravi from Pune';

const HOOK_URL = new URL('./support/prisma-stub-hook.mjs', import.meta.url).href;

// ------------------------------------------------------------ scripted network

type ChatStep =
  | { status: number; body: string; headers?: Record<string, string> }
  | { networkError: true };

interface Recorded {
  url: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

const sse = (...parts: string[]) =>
  parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') +
  'data: [DONE]\n\n';
const ok = (...parts: string[]): ChatStep => ({
  status: 200,
  body: sse(...parts),
  headers: { 'Content-Type': 'text/event-stream' }
});
const upstream429 = (headers?: Record<string, string>): ChatStep => ({
  status: 429,
  headers,
  body: JSON.stringify({
    error: {
      message: 'Provider returned error',
      code: 429,
      metadata: { raw: 'temporarily rate-limited upstream', provider_name: 'Google AI Studio' }
    }
  })
});
const daily429: ChatStep = {
  status: 429,
  body: JSON.stringify({
    error: {
      message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
      code: 429
    }
  })
};
const status = (code: number): ChatStep => ({ status: code, body: JSON.stringify({ error: { message: 'x', code } }) });

function catalogue(overrides: {
  id?: string;
  pricing?: Record<string, unknown>[];
  inputs?: string[];
  outputs?: string[];
} = {}): unknown {
  return {
    data: {
      id: overrides.id ?? INKLING,
      architecture: {
        input_modalities: overrides.inputs ?? ['text', 'image', 'audio'],
        output_modalities: overrides.outputs ?? ['text']
      },
      endpoints: (overrides.pricing ?? [{ prompt: '0', completion: '0', discount: 0 }]).map((pricing) => ({
        provider_name: 'Thinking Machines',
        pricing
      }))
    }
  };
}

interface Script {
  chat: Record<string, ChatStep[]>;
  /** A JSON body, an HTTP status, or 'unreachable'. Defaults to a verified free catalogue. */
  catalogue?: unknown | number | 'unreachable';
}

async function withScript<T>(
  script: Script,
  fn: () => Promise<T>
): Promise<{ result: T | null; error: unknown; requests: Recorded[]; logged: string; elapsedMs: number }> {
  const savedFetch = globalThis.fetch;
  const saved = { error: console.error, warn: console.warn, log: console.log };
  const requests: Recorded[] = [];
  const lines: string[] = [];
  const queues: Record<string, ChatStep[]> = Object.fromEntries(
    Object.entries(script.chat).map(([model, steps]) => [model, [...steps]])
  );

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    if (init?.body) body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push({ url, headers: new Headers(init?.headers), body });

    if (url === CATALOGUE_URL) {
      const c = script.catalogue === undefined ? catalogue() : script.catalogue;
      if (c === 'unreachable') throw new TypeError('fetch failed');
      if (typeof c === 'number') return new Response('{}', { status: c });
      return new Response(JSON.stringify(c), { status: 200 });
    }
    if (url !== CHAT_URL) throw new Error(`unexpected host in test: ${url}`);

    const model = String(body?.model);
    const queue = queues[model];
    if (!queue || queue.length === 0) throw new Error(`no scripted response left for ${model}`);
    const step = queue.length > 1 ? queue.shift()! : queue[0];
    if ('networkError' in step) throw new TypeError('fetch failed');
    return new Response(step.body, { status: step.status, headers: step.headers });
  }) as typeof globalThis.fetch;
  const capture = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
  };
  console.error = capture;
  console.warn = capture;
  console.log = capture;

  const started = Date.now();
  try {
    const result = await fn();
    return { result, error: null, requests, logged: lines.join('\n'), elapsedMs: Date.now() - started };
  } catch (error) {
    return { result: null, error, requests, logged: lines.join('\n'), elapsedMs: Date.now() - started };
  } finally {
    globalThis.fetch = savedFetch;
    console.error = saved.error;
    console.warn = saved.warn;
    console.log = saved.log;
  }
}

const chatRequests = (requests: Recorded[]) => requests.filter((r) => r.url === CHAT_URL);
const modelsCalled = (requests: Recorded[]) => chatRequests(requests).map((r) => String(r.body?.model));
const catalogueReads = (requests: Recorded[]) => requests.filter((r) => r.url === CATALOGUE_URL).length;

async function runAll(): Promise<void> {
  // Isolation, before anything from the application is imported.
  register(HOOK_URL);
  const isolated = mkdtempSync(path.join(tmpdir(), 'edp-ai-fallback-'));
  const backendDir = process.cwd();
  process.chdir(isolated);
  process.env.OPENROUTER_API_KEY = '';
  process.env.OFFLINE_DEMO_AI = 'false';
  process.env.NODE_ENV = 'test';

  const { OpenRouterAITutorProvider } = await import('../services/ai/openrouter.provider.js');
  const guard = await import('../services/ai/free-model-guard.js');
  const factory = await import('../services/ai/provider.factory.js');
  const { AI_RETRY, AI_UNAVAILABLE_MESSAGE, aiFallback, primaryProvider, shouldSwitchToFallback, streamWithFallback } =
    factory;
  const { buildTutorSystemPrompt } = await import('../services/tutor/prompt-builder.service.js');
  const lessonFallback = await import('../services/tutor/lesson-fallback.js');
  const { TOPICS } = await import('../tools/production-curriculum/curriculum-content.js');
  const { ED_BANNED_OPENERS } = await import('@edplatform/shared');

  // Without a key the factory builds no fallback; that is itself the first check.
  await check('With no API key there is no fallback route at all', () => {
    assert.equal(aiFallback.provider, null);
  });

  // Wire the real OpenRouter provider in for both routes, with the fake key.
  const gemma = new OpenRouterAITutorProvider(TEST_KEY, GEMMA, GEMMA);
  const originalGenerate = primaryProvider.generateStream;
  const usePrimary = (impl: (p: Parameters<typeof gemma.generateStream>[0]) => Promise<string>) => {
    (primaryProvider as unknown as { generateStream: unknown }).generateStream = impl;
  };
  // The production allowlist is empty, so the fallback MECHANISM is exercised
  // below with a test-only allowlist passed in explicitly. Section [0] proves
  // that without it nothing can be called.
  const TEST_ALLOWLIST = [INKLING];
  const verifyForTest = () => guard.verifyFreeModel(INKLING, globalThis.fetch, TEST_ALLOWLIST);
  const resetRoutes = () => {
    usePrimary((p) => gemma.generateStream(p));
    aiFallback.provider = new OpenRouterAITutorProvider(TEST_KEY, INKLING, INKLING, { zeroPriceCap: true });
    aiFallback.gate = guard.createFreeModelGate(INKLING, undefined, TEST_ALLOWLIST);
  };

  // The exact prompt production would send: the real builder, unmodified.
  const SYSTEM_PROMPT = buildTutorSystemPrompt({
    classLevel: 'CLASS_6',
    subject: 'ENGLISH',
    language: 'ENGLISH',
    explanationStyle: 'SIMPLE',
    studentFirstName: null,
    curriculum: null,
    action: null
  });
  const HISTORY = [
    { role: 'user' as const, text: 'earlier question' },
    { role: 'model' as const, text: 'earlier answer' }
  ];

  let received: string[] = [];
  const turn = (images: { mimeType: string; data: Buffer }[] = []) => {
    received = [];
    return streamWithFallback({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: STUDENT_MARKER,
      history: HISTORY,
      images,
      onChunk: (chunk) => {
        received.push(chunk);
      }
    });
  };

  // -------------------------------------------------------------------------
  console.log('\n[0] Production allowlist: no fallback model can be called');

  await check('The production fallback allowlist is empty', () => {
    assert.deepEqual([...guard.FREE_FALLBACK_ALLOWLIST], []);
    assert.equal(guard.isAllowlistedFreeModel(INKLING), false);
  });

  await check('The production gate refuses the evaluated model without any network call', async () => {
    const gate = guard.createFreeModelGate(INKLING);
    const out = await withScript({ chat: {} }, () => gate.check(false));
    assert.deepEqual(out.result, { ok: false, reason: 'not_allowlisted', supportsImages: false });
    assert.equal(out.requests.length, 0);
  });

  await check('Even with a fallback provider wired in, the production gate keeps every turn on Gemma', async () => {
    usePrimary((p) => gemma.generateStream(p));
    aiFallback.provider = new OpenRouterAITutorProvider(TEST_KEY, INKLING, INKLING, { zeroPriceCap: true });
    aiFallback.gate = guard.createFreeModelGate(INKLING);
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [ok('must never be sent')] } },
      () => turn()
    );
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, GEMMA, GEMMA]);
    assert.equal(catalogueReads(out.requests), 0);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /free fallback not used \(not_allowlisted\)/);
  });

  // -------------------------------------------------------------------------
  console.log('\n[1] Free-only enforcement (mechanism, with a test-only allowlist)');

  await check('The verified catalogue entry passes, with photo support', async () => {
    const out = await withScript({ chat: {} }, verifyForTest);
    assert.deepEqual(out.result, { ok: true, reason: 'verified', supportsImages: true });
  });

  await check('Ids outside the one-entry allowlist are refused without any network call', async () => {
    for (const id of [
      'thinkingmachines/inkling-small',
      'thinkingmachines/inkling-small:free:extended',
      'openrouter/free',
      'nvidia/nemotron-3.5-content-safety:free',
      GEMMA
    ]) {
      const out = await withScript({ chat: {} }, () => guard.verifyFreeModel(id));
      assert.equal(out.result?.ok, false, id);
      assert.equal(out.result?.reason, 'not_allowlisted', id);
      assert.equal(out.requests.length, 0, `${id} triggered a request`);
    }
  });

  await check('Any non-zero or missing price fails verification', async () => {
    const priced: Record<string, unknown>[][] = [
      [{ prompt: '0', completion: '0.0000002' }],
      [{ prompt: '0.0000001', completion: '0' }],
      [{ prompt: '0', completion: '0' }, { prompt: '0', completion: '0.000001' }],
      [{ prompt: '0', completion: '0', request: '0.001' }],
      [{ prompt: '0', completion: '0', image: '0.002' }],
      [{ completion: '0' }],
      [{ prompt: '', completion: '0' }],
      [{}]
    ];
    for (const pricing of priced) {
      const out = await withScript({ chat: {}, catalogue: catalogue({ pricing }) }, verifyForTest);
      assert.equal(out.result?.reason, 'not_free', JSON.stringify(pricing));
    }
  });

  await check('An unreadable or inconsistent catalogue fails closed', async () => {
    const cases: [Script['catalogue'], string][] = [
      ['unreachable', 'catalogue_unreachable'],
      [500, 'catalogue_error'],
      [catalogue({ id: 'thinkingmachines/inkling:free' }), 'id_mismatch'],
      [{ data: { id: INKLING, endpoints: [] } }, 'no_endpoints'],
      [catalogue({ outputs: ['image'] }), 'text_unsupported']
    ];
    for (const [c, reason] of cases) {
      const out = await withScript({ chat: {}, catalogue: c }, verifyForTest);
      assert.equal(out.result?.ok, false);
      assert.equal(out.result?.reason, reason);
    }
  });

  await check('The catalogue read sends no key, no header and no body', async () => {
    const out = await withScript({ chat: {} }, verifyForTest);
    const read = out.requests[0];
    assert.equal(read.url, CATALOGUE_URL);
    assert.equal(read.headers.get('authorization'), null);
    assert.equal([...read.headers.keys()].length, 0);
    assert.equal(read.body, null);
  });

  await check('A priced fallback is never called: the primary keeps its own retries', async () => {
    resetRoutes();
    const out = await withScript(
      {
        chat: { [GEMMA]: [status(503)] },
        catalogue: catalogue({ pricing: [{ prompt: '0', completion: '0.000003' }] })
      },
      () => turn()
    );
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, GEMMA, GEMMA]);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /free fallback not used \(not_free\)/);
  });

  await check('An unreachable catalogue means the fallback is never called', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [status(503)] }, catalogue: 'unreachable' },
      () => turn()
    );
    assert.ok(!modelsCalled(out.requests).includes(INKLING));
    assert.match(out.logged, /free fallback not used \(catalogue_unreachable\)/);
  });

  await check('A failed verification is cached, so a broken catalogue is not read every turn', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [status(503)] }, catalogue: 'unreachable' },
      async () => {
        await turn().catch(() => undefined);
        await turn().catch(() => undefined);
      }
    );
    assert.equal(catalogueReads(out.requests), 1);
  });

  await check('Every fallback request carries a zero price cap; the Gemma request is unchanged', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [upstream429(), ok('Done.')] } },
      () => turn()
    );
    const chats = chatRequests(out.requests);
    const fallbackBodies = chats.filter((r) => r.body?.model === INKLING).map((r) => r.body!);
    assert.equal(fallbackBodies.length, 2);
    for (const body of fallbackBodies) {
      assert.deepEqual(body.provider, { max_price: { prompt: 0, completion: 0, request: 0, image: 0 } });
    }
    const gemmaBody = chats.find((r) => r.body?.model === GEMMA)!.body!;
    assert.equal('provider' in gemmaBody, false, 'the Gemma request body changed');
    assert.deepEqual(Object.keys(gemmaBody).sort(), ['messages', 'model', 'stream', 'temperature']);
  });

  await check('A photo turn never falls back to a model that cannot read images', async () => {
    resetRoutes();
    const out = await withScript(
      {
        chat: { [GEMMA]: [status(503)] },
        catalogue: catalogue({ inputs: ['text'] })
      },
      () => turn([{ mimeType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }])
    );
    assert.ok(!modelsCalled(out.requests).includes(INKLING));
    assert.match(out.logged, /free fallback not used \(images_unsupported\)/);
  });

  await check('A photo turn may fall back when the catalogue confirms image input', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [status(503)], [INKLING]: [ok('That is a triangle.')] } },
      () => turn([{ mimeType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }])
    );
    assert.equal(out.result, 'That is a triangle.');
    const content = chatRequests(out.requests).find((r) => r.body?.model === INKLING)!.body!.messages as {
      content: unknown;
    }[];
    assert.ok(Array.isArray(content[content.length - 1].content), 'the photo was not sent in multimodal form');
  });

  // -------------------------------------------------------------------------
  console.log('\n[2] Primary success');

  await check('A healthy Gemma answers alone: one request, no catalogue read, no fallback', async () => {
    resetRoutes();
    const out = await withScript({ chat: { [GEMMA]: [ok('A noun ', 'names a thing.')] } }, () => turn());
    assert.equal(out.result, 'A noun names a thing.');
    assert.deepEqual(modelsCalled(out.requests), [GEMMA]);
    assert.equal(catalogueReads(out.requests), 0);
    assert.ok(!/fallback/.test(out.logged));
  });

  // -------------------------------------------------------------------------
  console.log('\n[3] Fallback on retryable upstream failures');

  for (const [label, step] of [
    ['an upstream 429', upstream429()],
    ['a 503', status(503)],
    ['a 502', status(502)],
    ['a dropped connection', { networkError: true } as ChatStep],
    ['an empty 200 stream', { status: 200, body: 'data: [DONE]\n\n', headers: { 'Content-Type': 'text/event-stream' } }]
  ] as [string, ChatStep][]) {
    await check(`After ${label} from Gemma, the free fallback answers at once`, async () => {
      resetRoutes();
      const out = await withScript(
        { chat: { [GEMMA]: [step], [INKLING]: [ok('Fallback ', 'answer.')] } },
        () => turn()
      );
      assert.equal(out.error, null, String(out.error));
      assert.equal(out.result, 'Fallback answer.');
      assert.deepEqual(modelsCalled(out.requests), [GEMMA, INKLING]);
      assert.ok(out.elapsedMs < 1500, `waited ${out.elapsedMs}ms before switching`);
      assert.match(out.logged, /next=fallback thinkingmachines\/inkling-small:free/);
      assert.match(out.logged, /reply served by free fallback/);
    });
  }

  await check('A timed-out Gemma attempt moves to the fallback', async () => {
    resetRoutes();
    usePrimary(async () => {
      throw Object.assign(new Error('OpenRouter stream timed out'), { status: 408, category: 'timeout', model: GEMMA });
    });
    const out = await withScript({ chat: { [INKLING]: [ok('After the timeout.')] } }, () => turn());
    assert.equal(out.result, 'After the timeout.');
    assert.deepEqual(modelsCalled(out.requests), [INKLING]);
  });

  await check('A slow stall that used up the time budget does not start the fallback', () => {
    assert.equal(
      shouldSwitchToFallback({ transient: true, emittedAnything: false, attempt: 1, elapsedMs: AI_RETRY.totalBudgetMs }),
      false
    );
    assert.equal(
      shouldSwitchToFallback({ transient: true, emittedAnything: false, attempt: 1, elapsedMs: 300 }),
      true
    );
  });

  // -------------------------------------------------------------------------
  console.log('\n[4] Quotas and permanent errors');

  await check('A daily quota on Gemma stops the turn: one request, no fallback, no catalogue read', async () => {
    resetRoutes();
    const out = await withScript({ chat: { [GEMMA]: [daily429] } }, () => turn());
    assert.deepEqual(modelsCalled(out.requests), [GEMMA]);
    assert.equal(catalogueReads(out.requests), 0);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.match(out.logged, /reason=daily_quota/);
  });

  await check('A daily quota on the fallback stops it too, judged from its own response', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [daily429] } },
      () => turn()
    );
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, INKLING]);
    assert.match(out.logged, /route=fallback[^\n]*retry=false\/permanent/);
  });

  for (const code of [400, 401, 402, 403, 404]) {
    await check(`A permanent ${code} from Gemma is not retried and not sent to the fallback`, async () => {
      resetRoutes();
      const out = await withScript({ chat: { [GEMMA]: [status(code)] } }, () => turn());
      assert.deepEqual(modelsCalled(out.requests), [GEMMA]);
      assert.equal(catalogueReads(out.requests), 0);
    });
  }

  // -------------------------------------------------------------------------
  console.log('\n[5] Bounded retries and Retry-After');

  await check('The fallback honours a short Retry-After before its one retry', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [upstream429({ 'Retry-After': '1' }), ok('Second try.')] } },
      () => turn()
    );
    assert.equal(out.result, 'Second try.');
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, INKLING, INKLING]);
    assert.ok(out.elapsedMs >= 950, `retried after only ${out.elapsedMs}ms`);
  });

  await check('A long Retry-After on the fallback ends the turn instead of waiting', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [upstream429({ 'Retry-After': '30' })] } },
      () => turn()
    );
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, INKLING]);
    assert.ok(out.elapsedMs < 1500);
    assert.match(out.logged, /retry=false\/wait-too-long/);
  });

  await check('Both routes failing: at most three upstream requests, then the safe sentence', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [status(503)], [INKLING]: [status(503)] } },
      () => turn()
    );
    assert.equal(chatRequests(out.requests).length, AI_RETRY.maxAttempts);
    assert.deepEqual(modelsCalled(out.requests), [GEMMA, INKLING, INKLING]);
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.equal(received.length, 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[6] Streaming is never duplicated');

  await check('A Gemma stream that fails after sending text is not restarted on the fallback', async () => {
    resetRoutes();
    const partialThenError =
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'A noun is' } }] })}\n\n` +
      `data: ${JSON.stringify({ error: { message: 'x', code: 502 } })}\n\n`;
    const out = await withScript(
      {
        chat: {
          [GEMMA]: [{ status: 200, body: partialThenError, headers: { 'Content-Type': 'text/event-stream' } }],
          [INKLING]: [ok('A noun is a naming word.')]
        }
      },
      () => turn()
    );
    assert.deepEqual(modelsCalled(out.requests), [GEMMA]);
    assert.deepEqual(received, ['A noun is'], 'the student saw text twice or from two models');
    assert.equal(catalogueReads(out.requests), 0);
    assert.match(out.logged, /retry=false\/already-streamed/);
  });

  await check('A fallback answer streams incrementally, chunk by chunk', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [status(503)], [INKLING]: [ok('One ', 'two ', 'three.')] } },
      () => turn()
    );
    assert.deepEqual(received, ['One ', 'two ', 'three.']);
    assert.equal(out.result, 'One two three.');
  });

  // -------------------------------------------------------------------------
  console.log('\n[7] Prompt preservation');

  await check('The fallback receives the identical teaching prompt, history and message', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [ok('Fine.')] } },
      () => turn()
    );
    const [primaryBody, fallbackBody] = chatRequests(out.requests).map((r) => r.body!);
    assert.deepEqual(fallbackBody.messages, primaryBody.messages);
    assert.equal(fallbackBody.temperature, primaryBody.temperature);
    const messages = fallbackBody.messages as { role: string; content: string }[];
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[0].content, SYSTEM_PROMPT, 'the system prompt was altered');
    assert.deepEqual(
      messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user']
    );
    assert.equal(messages[3].content, STUDENT_MARKER);
  });

  await check('The teaching prompt still carries the ED voice and safety rules', async () => {
    const { ED_SAFETY_RULES, ED_VOICE_GUIDE } = await import('@edplatform/shared');
    assert.ok(SYSTEM_PROMPT.includes(ED_SAFETY_RULES.trim().slice(0, 80)));
    assert.ok(SYSTEM_PROMPT.includes(ED_VOICE_GUIDE.trim().slice(0, 80)));
  });

  // -------------------------------------------------------------------------
  console.log('\n[8] Privacy');

  await check('No key, header, prompt or student text reaches the logs on any path', async () => {
    resetRoutes();
    const out = await withScript(
      { chat: { [GEMMA]: [upstream429()], [INKLING]: [status(503)] } },
      () => turn()
    );
    for (const secret of [TEST_KEY, 'sk-or-v1', 'Bearer', 'Authorization', 'STUDENT-CANARY', 'Ravi', 'Pune', SYSTEM_PROMPT.slice(0, 60)]) {
      assert.ok(!out.logged.includes(secret), `leaked: ${secret}`);
    }
    for (const r of chatRequests(out.requests)) {
      assert.equal(r.headers.get('authorization'), `Bearer ${TEST_KEY}`);
      assert.ok(!JSON.stringify(r.body).includes(TEST_KEY), 'the key reached a request body');
    }
  });

  // -------------------------------------------------------------------------
  console.log('\n[9] Lesson fallback content');

  await check('Every production lesson yields a verbatim opening within the length limit', () => {
    assert.equal(TOPICS.length, 4);
    for (const topic of TOPICS) {
      const intro = lessonFallback.lessonIntroduction(topic.content);
      assert.ok(intro, `${topic.slug} has no usable opening`);
      assert.ok(topic.content.includes(intro!), `${topic.slug}: the opening is not verbatim`);
      assert.ok(intro!.length <= lessonFallback.LESSON_FALLBACK_MAX_CHARS);
      assert.ok(!/^#/m.test(intro!), `${topic.slug}: a heading leaked into the opening`);
    }
  });

  await check('An opening that is too long is dropped, never cut short', () => {
    const long = 'word '.repeat(400).trim();
    assert.equal(lessonFallback.lessonIntroduction(long), null);
    assert.equal(lessonFallback.lessonIntroduction(`${long}\n\n## Heading\n\nmore`), null);
    assert.equal(lessonFallback.lessonIntroduction(''), null);
    assert.equal(lessonFallback.lessonIntroduction(null), null);
    assert.equal(lessonFallback.lessonIntroduction('## Heading first\n\nbody'), null);
    assert.equal(lessonFallback.lessonIntroduction('First para.\n\nSecond para.'), 'First para.');
  });

  await check('The lesson reply is honest, labelled, and free of internal labels', () => {
    const reply = lessonFallback.lessonFallbackReply('What science really is', 'Science is a way of working things out.');
    assert.ok(reply.includes('"What science really is"'));
    assert.ok(reply.includes('Science is a way of working things out.'));
    assert.ok(/can't answer that properly yet/.test(reply));
    for (const banned of ED_BANNED_OPENERS) assert.ok(!reply.toLowerCase().startsWith(banned));
    for (const label of ['User Safety', 'safe', 'OpenRouter', 'model', '429', 'error', 'fallback']) {
      assert.ok(!reply.toLowerCase().includes(label.toLowerCase()), `contains "${label}"`);
    }
  });

  // -------------------------------------------------------------------------
  console.log('\n[10] Lesson fallback in a real tutor turn (database replaced by fakes)');

  const { edTutorService } = await import('../services/tutor/ed-tutor.service.js');
  const { tutorSessionService, quizInProgressWhere } = await import('../services/tutor/tutor-session.service.js');
  const { studentProfileService } = await import('../services/student-profile.service.js');
  const realHasQuizInProgress = tutorSessionService.hasQuizInProgressForLesson;

  const LESSON = TOPICS[0];
  const persisted: string[] = [];
  const quizChecks: string[] = [];
  const sourceReads: string[] = [];
  const fakeSession = (lessonId: string | null) => ({
    id: 'session-1',
    userId: 'user-1',
    classLevel: 'CLASS_6',
    subject: 'SCIENCE',
    lessonId,
    moduleId: null,
    module: null,
    lesson: lessonId
      ? {
          title: LESSON.title,
          description: LESSON.objective,
          teachingBrief: null,
          moduleId: 'module-1',
          module: { id: 'module-1', title: 'The Wonderful World of Science', course: { title: 'Class 6 Science', slug: 'class-6-science' } }
        }
      : null
  });
  /** What the quiz-in-progress check answers: a boolean, an error, or the real database-backed method. */
  type QuizState = boolean | 'throws' | 'real';
  const stubs = (
    lessonId: string | null,
    lessonSource: { title: string; content: string } | null,
    quiz: QuizState = false
  ) => {
    const s = tutorSessionService as unknown as Record<string, unknown>;
    quizChecks.length = 0;
    sourceReads.length = 0;
    s.hasQuizInProgressForLesson =
      quiz === 'real'
        ? realHasQuizInProgress
        : async (userId: string, id: string) => {
            quizChecks.push(`${userId}:${id}`);
            if (quiz === 'throws') throw new Error('database unavailable');
            return quiz;
          };
    s.getOwnedSession = async () => fakeSession(lessonId);
    s.getRecentHistory = async () => [];
    s.appendStudentMessage = async () => ({ id: 'student-msg' });
    s.ensureTitle = async () => undefined;
    s.ensureSubject = async () => 'SCIENCE';
    s.appendEdMessage = async (_id: string, text: string) => {
      persisted.push(text);
      return { id: 'ed-msg' };
    };
    s.getLessonFallbackSource = async () => {
      sourceReads.push('read');
      return lessonSource;
    };
    (studentProfileService as unknown as Record<string, unknown>).getProfile = async () => null;
  };
  const user = { id: 'user-1', firstName: null } as unknown as Parameters<typeof edTutorService.streamTurn>[0];
  const failingRoutes = { chat: { [GEMMA]: [status(503)], [INKLING]: [status(503)] } };

  await check('A lesson session with both routes down gets the lesson opening, streamed and saved', async () => {
    resetRoutes();
    persisted.length = 0;
    stubs('lesson-1', { title: LESSON.title, content: LESSON.content });
    const chunks: string[] = [];
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: STUDENT_MARKER } as never, (c) => {
        chunks.push(c);
      })
    );
    assert.equal(out.error, null, String(out.error));
    const intro = lessonFallback.lessonIntroduction(LESSON.content)!;
    assert.equal(chunks.join(''), lessonFallback.lessonFallbackReply(LESSON.title, intro));
    assert.equal(persisted[0], chunks.join(''));
    assert.ok(!out.logged.includes('STUDENT-CANARY'));
    assert.deepEqual(quizChecks, ['user-1:lesson-1'], 'the quiz-in-progress check was not made for this student');
  });

  // -------------------------------------------------------------------------
  console.log('\n[11] No lesson text while a quiz is in progress');

  await check('With a quiz in progress, the lesson opening is never shown or even read', async () => {
    resetRoutes();
    persisted.length = 0;
    stubs('lesson-1', { title: LESSON.title, content: LESSON.content }, true);
    const chunks: string[] = [];
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: 'what is science?' } as never, (c) => {
        chunks.push(c);
      })
    );
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.equal(chunks.length, 0);
    assert.equal(persisted.length, 0);
    assert.equal(sourceReads.length, 0, 'the lesson text was read while a quiz was in progress');
    const intro = lessonFallback.lessonIntroduction(LESSON.content)!;
    assert.ok(!out.logged.includes(intro.slice(0, 40)));
  });

  await check('If the quiz check fails, the lesson opening is not shown', async () => {
    resetRoutes();
    persisted.length = 0;
    stubs('lesson-1', { title: LESSON.title, content: LESSON.content }, 'throws');
    const chunks: string[] = [];
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: 'hi' } as never, (c) => {
        chunks.push(c);
      })
    );
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.equal(chunks.length, 0);
    assert.equal(sourceReads.length, 0);
  });

  await check('The real quiz check fails closed when the database cannot be reached', async () => {
    resetRoutes();
    persisted.length = 0;
    // The real method, against the offline Prisma stub, which throws on any query.
    stubs('lesson-1', { title: LESSON.title, content: LESSON.content }, 'real');
    const chunks: string[] = [];
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: 'hi' } as never, (c) => {
        chunks.push(c);
      })
    );
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.equal(chunks.length, 0);
    assert.equal(sourceReads.length, 0);
  });

  await check('"In progress" means this student, IN_PROGRESS, and a quiz covering this lesson or its chapter', () => {
    assert.deepEqual(quizInProgressWhere('user-1', 'lesson-1', 'module-1'), {
      userId: 'user-1',
      status: 'IN_PROGRESS',
      quiz: {
        OR: [
          { lessonId: 'lesson-1' },
          { moduleId: 'module-1' },
          { lesson: { moduleId: 'module-1' } },
          { questions: { some: { lessonId: 'lesson-1' } } }
        ]
      }
    });
  });

  await check('The safeguard reads quiz state only; lesson and quiz data are never written', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      path.join(backendDir, 'src/services/tutor/tutor-session.service.ts'),
      'utf8'
    );
    const method = source.slice(
      source.indexOf('public async hasQuizInProgressForLesson'),
      source.indexOf('public async getOwnedSession')
    );
    assert.ok(method.length > 0, 'the method was not found');
    assert.ok(!/\.(create|update|upsert|delete|deleteMany|updateMany|createMany)\(/.test(method));
  });

  await check('A free chat with both routes down gets the unavailable message, not lesson text', async () => {
    resetRoutes();
    persisted.length = 0;
    stubs(null, { title: LESSON.title, content: LESSON.content });
    const chunks: string[] = [];
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: 'What is a noun?' } as never, (c) => {
        chunks.push(c);
      })
    );
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
    assert.equal(chunks.length, 0);
    assert.equal(persisted.length, 0);
  });

  await check('A lesson whose stored text is unsuitable keeps the unavailable message', async () => {
    resetRoutes();
    stubs('lesson-1', { title: LESSON.title, content: '## Starts with a heading\n\nbody' });
    const out = await withScript(failingRoutes, () =>
      edTutorService.streamTurn(user, 'session-1', { message: 'hi' } as never, () => undefined)
    );
    assert.equal((out.error as Error).message, AI_UNAVAILABLE_MESSAGE);
  });

  await check('A photo turn in a lesson session never gets lesson text', async () => {
    resetRoutes();
    stubs('lesson-1', { title: LESSON.title, content: LESSON.content });
    const chunks: string[] = [];
    const out = await withScript(
      { ...failingRoutes, catalogue: catalogue({ inputs: ['text'] }) },
      () =>
        edTutorService.streamTurn(
          user,
          'session-1',
          { message: 'what is this?' } as never,
          (c) => {
            chunks.push(c);
          },
          [{ mimeType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }]
        )
    );
    assert.ok(out.error, 'the photo turn did not fail');
    assert.ok(!(out.error as Error).message.includes(LESSON.title));
    assert.equal(chunks.length, 0);
  });

  // ------------------------------------------------------------------ teardown
  (primaryProvider as unknown as { generateStream: unknown }).generateStream = originalGenerate;
  aiFallback.provider = null;
  process.chdir(backendDir);
  try {
    rmSync(isolated, { recursive: true, force: true });
  } catch {
    // Windows can briefly hold the empty folder open; it is in the temp dir either way.
  }

  console.log('\n====================================================');
  console.log('📊 AI FALLBACK RESULTS');
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
