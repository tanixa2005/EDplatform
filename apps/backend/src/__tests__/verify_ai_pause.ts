/**
 * AI_TUTOR_MODE=paused: no external AI request on any path, nothing stored for a
 * refused tutor turn, and quiz analysis still works without AI.
 *
 * Offline throughout. fetch is replaced with a recorder before anything runs, so
 * no request leaves this process and every attempt to reach OpenRouter is
 * counted. '@prisma/client' resolves to an in-memory fixture stub that throws on
 * any model a test did not provide, so no database can be reached. The key is
 * fake. No environment file is read.
 *
 * Run: npm run test:ai-pause
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
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TEST_KEY = 'sk-or-v1-PAUSETESTKEY000000000000000000000000000000000000000000000000';
const EXPECTED_MESSAGE =
  "ED's AI tutor is paused for a little while. Your lessons and quizzes still work, so try ED again later.";
const STUDENT_MARKER = 'STUDENT-CANARY-a7c3 my name is Meera';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const HOOK_URL = new URL('./support/prisma-fixture-hook.mjs', import.meta.url).href;

// ------------------------------------------------------------ network recorder

const requests: { url: string; body: Record<string, unknown> | null }[] = [];
let respond: (url: string) => Response = () => {
  throw new Error('no network response scripted');
};

function installFetchRecorder(): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    return respond(url);
  }) as typeof globalThis.fetch;
}
const openRouterCalls = () => requests.filter((r) => r.url.startsWith('https://openrouter.ai/')).length;

const sse = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;

/** Captures console output for one call. */
async function quietly<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; logged: string }> {
  const saved = { error: console.error, warn: console.warn, log: console.log };
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
  };
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  try {
    return { result: await fn(), error: null, logged: lines.join('\n') };
  } catch (error) {
    return { result: null, error, logged: lines.join('\n') };
  } finally {
    console.error = saved.error;
    console.warn = saved.warn;
    console.log = saved.log;
  }
}

// ------------------------------------------------------------ fixtures

/** A submitted Class 6 Science attempt: two questions, the second answered wrongly. */
function submittedAttempt(overrides: Record<string, unknown> = {}) {
  const course = { slug: 'class-6-science', title: 'Class 6 Science', isPublished: true };
  const module = { id: 'module-1', title: 'The Wonderful World of Science', course };
  const lesson = { id: 'lesson-1', title: 'What science really is', isPublished: true, moduleId: 'module-1', module };
  return {
    id: 'attempt-1',
    userId: 'user-1',
    quizId: 'quiz-1',
    status: 'SUBMITTED',
    score: 50,
    percentage: 50,
    isPassed: false,
    aiFeedback: null,
    quiz: {
      id: 'quiz-1',
      title: 'Quick check: The Wonderful World of Science',
      isPublished: true,
      lessonId: 'lesson-1',
      moduleId: null,
      lesson,
      module: null,
      questions: [
        {
          id: 'q1',
          prompt: 'Which of these is the closest to what science actually is?',
          explanation: 'Science is a way of working things out.',
          lessonId: 'lesson-1',
          lesson,
          options: [
            { id: 'q1a', text: 'A way of working things out', isCorrect: true },
            { id: 'q1b', text: 'A list of facts', isCorrect: false }
          ]
        },
        {
          id: 'q2',
          prompt: 'True or false: a wrong guess means the test was a waste of time.',
          explanation: 'A wrong guess still teaches you something.',
          lessonId: 'lesson-1',
          lesson,
          options: [
            { id: 'q2a', text: 'True', isCorrect: false },
            { id: 'q2b', text: 'False', isCorrect: true }
          ]
        }
      ]
    },
    answers: [
      { questionId: 'q1', isCorrect: true, selectedOptionIds: ['q1a'] },
      { questionId: 'q2', isCorrect: false, selectedOptionIds: ['q2a'] }
    ],
    ...overrides
  };
}

async function runAll(): Promise<void> {
  // Isolation, before anything from the application is imported.
  register(HOOK_URL);
  const isolated = mkdtempSync(path.join(tmpdir(), 'edp-ai-pause-'));
  const backendDir = process.cwd();
  process.chdir(isolated);
  process.env.OPENROUTER_API_KEY = '';
  process.env.OFFLINE_DEMO_AI = 'false';
  process.env.NODE_ENV = 'test';
  delete process.env.AI_TUTOR_MODE;
  installFetchRecorder();

  const g = globalThis as unknown as { __EDP_PRISMA_FIXTURE__?: Record<string, unknown> };
  g.__EDP_PRISMA_FIXTURE__ = {};

  const { env } = await import('../config/env.config.js');
  const availability = await import('../services/ai/ai-availability.js');
  const { AppError } = await import('../errors/app.error.js');
  const { OpenRouterAITutorProvider } = await import('../services/ai/openrouter.provider.js');
  const factory = await import('../services/ai/provider.factory.js');
  const { primaryProvider, streamWithFallback } = factory;
  const { edTutorService } = await import('../services/tutor/ed-tutor.service.js');
  const { tutorSessionService } = await import('../services/tutor/tutor-session.service.js');
  const { studentProfileService } = await import('../services/student-profile.service.js');
  const { aiTutorService } = await import('../services/ai/ai-tutor.service.js');
  const { buildTutorSystemPrompt } = await import('../services/tutor/prompt-builder.service.js');
  const { quizMistakeAnalysisResultSchema } = await import('@edplatform/shared');

  const setMode = (value: string | undefined) => {
    (env as { AI_TUTOR_MODE: string }).AI_TUTOR_MODE = value ?? 'live';
  };

  // The real OpenRouter provider, wired in with the fake key, for both stream
  // and structured calls - so "no request" is measured at the real fetch.
  const gemma = new OpenRouterAITutorProvider(TEST_KEY, GEMMA, GEMMA);
  const p = primaryProvider as unknown as Record<string, unknown>;
  const original = { generateStream: p.generateStream, generateStructured: p.generateStructured };
  p.generateStream = (params: Parameters<typeof gemma.generateStream>[0]) => gemma.generateStream(params);
  p.generateStructured = (params: Parameters<typeof gemma.generateStructured>[0]) => gemma.generateStructured(params);

  // In-memory tutor services: every call is counted, so "nothing stored" is
  // checked directly.
  const calls: string[] = [];
  const s = tutorSessionService as unknown as Record<string, unknown>;
  s.getOwnedSession = async () => {
    calls.push('getOwnedSession');
    return {
      id: 'session-1',
      userId: 'user-1',
      classLevel: 'CLASS_6',
      subject: 'ENGLISH',
      lessonId: null,
      lesson: null,
      moduleId: null,
      module: null
    };
  };
  s.getRecentHistory = async () => {
    calls.push('getRecentHistory');
    return [];
  };
  s.appendStudentMessage = async () => {
    calls.push('appendStudentMessage');
    return { id: 'student-msg' };
  };
  s.ensureTitle = async () => {
    calls.push('ensureTitle');
  };
  s.ensureSubject = async () => 'ENGLISH';
  s.appendEdMessage = async () => {
    calls.push('appendEdMessage');
    return { id: 'ed-msg' };
  };
  (studentProfileService as unknown as Record<string, unknown>).getProfile = async () => ({ classLevel: 'CLASS_6' });

  const user = { id: 'user-1', firstName: null, role: 'STUDENT' } as unknown as Parameters<
    typeof edTutorService.streamTurn
  >[0];
  const reset = () => {
    requests.length = 0;
    calls.length = 0;
  };

  const chatTurn = (images: { mimeType: string; data: Buffer }[] = []) =>
    edTutorService.streamTurn(user, 'session-1', { message: STUDENT_MARKER } as never, () => undefined, images);

  const assertPaused = (error: unknown) => {
    assert.ok(error, 'the request was not refused');
    assert.ok(error instanceof AppError, 'not an AppError, so the SSE sanitiser would hide the message');
    assert.equal((error as Error).message, EXPECTED_MESSAGE);
    assert.equal((error as { code?: string }).code, 'AI_TUTOR_PAUSED');
    assert.equal((error as { statusCode?: number }).statusCode, 503);
  };

  // -------------------------------------------------------------------------
  console.log('\n[1] Reading AI_TUTOR_MODE');

  await check('Unset, blank and "live" (any case) mean live', () => {
    for (const v of [undefined, null, '', '  ', 'live', 'LIVE', ' Live ']) {
      assert.equal(availability.resolveAiTutorMode(v), 'live', String(v));
    }
  });

  await check('"paused", and every other value including typos, mean paused', () => {
    for (const v of ['paused', 'PAUSED', 'pause', 'off', 'true', 'false', '0', 'livee', 'on']) {
      assert.equal(availability.resolveAiTutorMode(v), 'paused', v);
    }
  });

  await check('The student-facing message is exactly the agreed sentence', () => {
    assert.equal(availability.AI_PAUSED_MESSAGE, EXPECTED_MESSAGE);
  });

  await check('The setting defaults to live when the variable is absent', () => {
    assert.equal(env.AI_TUTOR_MODE, 'live');
    assert.equal(availability.isAiTutorPaused(), false);
  });

  // -------------------------------------------------------------------------
  console.log('\n[2] Paused: chat');

  await check('A paused chat turn is refused with the pause message and contacts no provider', async () => {
    setMode('paused');
    reset();
    const out = await quietly(() => chatTurn());
    assertPaused(out.error);
    assert.equal(openRouterCalls(), 0);
  });

  await check('A paused chat turn stores nothing and reads nothing first', async () => {
    setMode('paused');
    reset();
    await quietly(() => chatTurn());
    assert.deepEqual(calls, [], `service calls made: ${calls.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  console.log('\n[3] Paused: photo questions');

  await check('A paused photo turn is refused with the same message, no provider, nothing stored', async () => {
    setMode('paused');
    reset();
    const out = await quietly(() => chatTurn([{ mimeType: 'image/png', data: PNG }]));
    assertPaused(out.error);
    assert.equal(openRouterCalls(), 0);
    assert.deepEqual(calls, []);
  });

  // -------------------------------------------------------------------------
  console.log('\n[4] Paused: quiz hints');

  const preparedHint = {
    systemPrompt: buildTutorSystemPrompt({
      classLevel: 'CLASS_6',
      subject: 'SCIENCE',
      language: 'ENGLISH',
      explanationStyle: 'SIMPLE',
      studentFirstName: null,
      curriculum: null,
      action: 'hint'
    }),
    userPrompt: 'give me a hint',
    meta: { classLevel: 'CLASS_6', subject: 'SCIENCE', action: 'hint', studentFirstName: null, curriculum: null }
  } as unknown as Parameters<typeof aiTutorService.streamPreparedQuizHint>[0];

  await check('A paused quiz hint is refused with the pause message and contacts no provider', async () => {
    setMode('paused');
    reset();
    const chunks: string[] = [];
    const out = await quietly(() => aiTutorService.streamPreparedQuizHint(preparedHint, (c) => void chunks.push(c)));
    assertPaused(out.error);
    assert.equal(openRouterCalls(), 0);
    assert.equal(chunks.length, 0);
  });

  await check('The shared stream entry point refuses on its own, whatever the caller', async () => {
    setMode('paused');
    reset();
    const out = await quietly(() =>
      streamWithFallback({ systemPrompt: 'x', userPrompt: STUDENT_MARKER, history: [], images: [], onChunk: () => undefined })
    );
    assertPaused(out.error);
    assert.equal(openRouterCalls(), 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[5] Paused: quiz analysis');

  const updates: unknown[] = [];
  const useAttempt = (attempt: ReturnType<typeof submittedAttempt>) => {
    g.__EDP_PRISMA_FIXTURE__ = {
      quizAttempt: {
        findUnique: async () => attempt,
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        }
      }
    };
  };

  await check('Paused quiz analysis works without AI: correct, schema-valid, from stored data', async () => {
    setMode('paused');
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt());
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null, String(out.error));
    const result = quizMistakeAnalysisResultSchema.parse(out.result);
    assert.equal(result.incorrectQuestionsCount, 1);
    assert.equal(result.mistakes.length, 1);
    assert.equal(result.mistakes[0].questionId, 'q2');
    assert.equal(result.mistakes[0].userAnswerText, 'True');
    assert.equal(result.mistakes[0].correctAnswerText, 'False');
    assert.equal(result.mistakes[0].explanation, 'A wrong guess still teaches you something.');
    assert.match(result.generalFeedback, /You got 1 of 2 right/);
    assert.deepEqual(result.strengths, []);
  });

  await check('Paused quiz analysis contacts no provider and writes nothing to the database', async () => {
    setMode('paused');
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt());
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null);
    assert.equal(openRouterCalls(), 0);
    assert.equal(updates.length, 0, 'a non-AI analysis was cached as the permanent result');
    assert.match(out.logged, /quiz analysis served locally/);
  });

  /** A schema-valid stored AI analysis, marked so it can be told apart from the local one. */
  const storedAiAnalysis = async (): Promise<string> => {
    setMode('paused');
    useAttempt(submittedAttempt());
    const local = (await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'))).result as unknown as Record<
      string,
      unknown
    >;
    const stored = {
      ...local,
      generalFeedback: 'AI-CACHED-MARKER: an earlier AI-written summary.',
      strengths: ['AI-CACHED-MARKER strength']
    };
    quizMistakeAnalysisResultSchema.parse(stored);
    return JSON.stringify(stored);
  };

  await check('Paused quiz analysis ignores a stored AI analysis and serves the local one', async () => {
    const stored = await storedAiAnalysis();
    setMode('paused');
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt({ aiFeedback: stored }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null, String(out.error));
    assert.ok(!JSON.stringify(out.result).includes('AI-CACHED-MARKER'), 'the stored AI analysis was served while paused');
    assert.match((out.result as { generalFeedback: string }).generalFeedback, /You got 1 of 2 right/);
    assert.equal(openRouterCalls(), 0);
    assert.equal(updates.length, 0, 'the stored analysis was overwritten while paused');
  });

  await check('Paused quiz analysis attempts no write even when a write would fail', async () => {
    setMode('paused');
    reset();
    g.__EDP_PRISMA_FIXTURE__ = {
      quizAttempt: {
        findUnique: async () => submittedAttempt(),
        update: async () => {
          throw new Error('database write refused');
        }
      }
    };
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null, String(out.error));
    assert.ok(!/could not cache/.test(out.logged), 'a cache write was attempted');
  });

  await check('Live quiz analysis still serves a stored analysis without a request, as before', async () => {
    const stored = await storedAiAnalysis();
    setMode('live');
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt({ aiFeedback: stored }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.deepEqual(out.result, JSON.parse(stored));
    assert.equal(openRouterCalls(), 0);
    assert.equal(updates.length, 0);
  });

  await check('Paused quiz analysis keeps every access check: another student is still refused', async () => {
    setMode('paused');
    useAttempt(submittedAttempt({ userId: 'someone-else' }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.ok(out.error, 'another student was allowed through');
  });

  await check('Paused quiz analysis still refuses an attempt that is not submitted', async () => {
    setMode('paused');
    reset();
    useAttempt(submittedAttempt({ status: 'IN_PROGRESS' }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.ok(out.error, 'an unsubmitted attempt was analysed');
    assert.match((out.error as Error).message, /not submitted/);
    assert.equal(openRouterCalls(), 0);
  });

  await check('Paused quiz analysis still refuses a student outside the course class', async () => {
    setMode('paused');
    reset();
    const profile = (studentProfileService as unknown as Record<string, unknown>).getProfile;
    (studentProfileService as unknown as Record<string, unknown>).getProfile = async () => ({ classLevel: 'CLASS_8' });
    try {
      useAttempt(submittedAttempt());
      const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
      assert.ok(out.error, 'a Class 8 student was given a Class 6 analysis');
    } finally {
      (studentProfileService as unknown as Record<string, unknown>).getProfile = profile;
    }
  });

  await check('A database error loading the attempt is reported, never replaced by a made-up analysis', async () => {
    setMode('paused');
    reset();
    g.__EDP_PRISMA_FIXTURE__ = {
      quizAttempt: {
        findUnique: async () => {
          throw new Error('database unavailable');
        }
      }
    };
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.ok(out.error, 'an analysis was produced without the attempt');
    assert.equal(out.result, null);
    assert.equal(openRouterCalls(), 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[6] Live: unchanged');

  await check('Live chat still stores the turn and makes exactly one Gemma request', async () => {
    setMode('live');
    reset();
    g.__EDP_PRISMA_FIXTURE__ = {};
    respond = () => new Response(sse('A noun names a thing.'), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    const out = await quietly(() => chatTurn());
    assert.equal(out.error, null, String(out.error));
    assert.equal(openRouterCalls(), 1);
    assert.equal(requests[0].url, CHAT_URL);
    assert.equal(requests[0].body?.model, GEMMA);
    assert.deepEqual(Object.keys(requests[0].body ?? {}).sort(), ['messages', 'model', 'stream', 'temperature']);
    assert.ok(calls.includes('appendStudentMessage') && calls.includes('appendEdMessage'));
  });

  await check('Live chat sends the unchanged teaching prompt', async () => {
    setMode('live');
    reset();
    respond = () => new Response(sse('ok'), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    await quietly(() => chatTurn());
    const messages = requests[0].body?.messages as { role: string; content: string }[];
    const expected = buildTutorSystemPrompt({
      classLevel: 'CLASS_6',
      subject: 'ENGLISH',
      language: 'ENGLISH',
      explanationStyle: 'SIMPLE',
      studentFirstName: null,
      curriculum: null,
      action: null
    });
    assert.equal(messages[0].content, expected);
  });

  await check('Live quiz analysis still asks the provider, as before the pause existed', async () => {
    setMode('live');
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt());
    respond = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  generalFeedback: 'Nearly there.',
                  mistakes: [],
                  strengths: [],
                  recommendedTopics: []
                })
              }
            }
          ]
        }),
        { status: 200 }
      );
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null, String(out.error));
    assert.equal(openRouterCalls(), 1);
    assert.equal(updates.length, 1, 'the live result was not cached as before');
  });

  await check('The Gemma configuration is untouched by the pause setting', () => {
    setMode('paused');
    assert.equal(env.OPENROUTER_MODEL, process.env.OPENROUTER_MODEL ?? 'apodex/apodex-1.1-mini:free');
    assert.equal(typeof primaryProvider.generateStream, 'function');
    setMode('live');
  });

  // -------------------------------------------------------------------------
  console.log('\n[7] Privacy');

  await check('Paused requests log no student text and no key', async () => {
    setMode('paused');
    reset();
    const outs = [
      await quietly(() => chatTurn()),
      await quietly(() => chatTurn([{ mimeType: 'image/png', data: PNG }])),
      await quietly(() => aiTutorService.streamPreparedQuizHint(preparedHint, () => undefined))
    ];
    for (const out of outs) {
      for (const secret of ['STUDENT-CANARY', 'Meera', TEST_KEY, 'Bearer']) {
        assert.ok(!out.logged.includes(secret), `leaked: ${secret}`);
      }
    }
  });

  // ------------------------------------------------------------------ teardown
  setMode('live');
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
  console.log('📊 AI PAUSE RESULTS');
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
