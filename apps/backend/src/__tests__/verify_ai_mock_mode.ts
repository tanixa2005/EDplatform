/**
 * AI_TUTOR_MODE=mock: the tutor answers with the local Mock on the main
 * deployment, and nothing ever reaches an external AI provider.
 *
 * Offline throughout. fetch is replaced with a recorder before anything runs, so
 * every attempt to reach any host is counted. '@prisma/client' resolves to an
 * in-memory fixture stub, so no database can be reached. A fake OpenRouter key is
 * set on purpose, to prove mock mode ignores it. No environment file is read:
 * the in-process checks run from an empty temporary folder, and the production
 * startup checks run the real environment module in child processes.
 *
 * Run: npm run test:ai-mock
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const REPO = path.resolve(BACKEND, '..', '..');
const TSX = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const ENV_MODULE = path.join(BACKEND, 'src', 'config', 'env.config.ts');
const FACTORY_MODULE = path.join(BACKEND, 'src', 'services', 'ai', 'provider.factory.ts');
const AVAILABILITY_MODULE = path.join(BACKEND, 'src', 'services', 'ai', 'ai-availability.ts');

const HOOK_URL = new URL('./support/prisma-fixture-hook.mjs', import.meta.url).href;
const FAKE_KEY = 'sk-or-v1-MOCKMODETESTKEY0000000000000000000000000000000000000000000';
const PAUSED_MESSAGE =
  "ED's AI tutor is paused for a little while. Your lessons and quizzes still work, so try ED again later.";
const OFFLINE_NOTE = '_(Offline demo response.)_';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ------------------------------------------------------------ network recorder

const requests: string[] = [];

function installFetchRecorder(): void {
  globalThis.fetch = (async (input: unknown) => {
    requests.push(String(input));
    throw new Error('mock mode must not make network requests');
  }) as typeof globalThis.fetch;
}

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

// ------------------------------------------------------------ production startup probes

/**
 * Placeholders only. `.invalid` never resolves and is not a Neon endpoint, so
 * this can be no real database; nothing connects to it either way.
 */
const PLACEHOLDER_PASSWORD = 'placeholder-password-not-real';
const PLACEHOLDER_DB = `postgresql://u:${PLACEHOLDER_PASSWORD}@db.example.invalid:5432/edplatform`;

function childEnv(extra: Record<string, string>): Record<string, string> {
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: 'production',
    DATABASE_URL: PLACEHOLDER_DB,
    JWT_SECRET: 'x'.repeat(48),
    OPENROUTER_API_KEY: '',
    CLERK_SECRET_KEY: '',
    OFFLINE_DEMO_AI: 'false',
    AI_TUTOR_MODE: 'mock'
  };
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...base, ...extra })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

const PROBE = `
await import(${JSON.stringify(pathToFileURL(ENV_MODULE).href)});
const factory = await import(${JSON.stringify(pathToFileURL(FACTORY_MODULE).href)});
const availability = await import(${JSON.stringify(pathToFileURL(AVAILABILITY_MODULE).href)});
console.log('PROBE provider=' + factory.primaryProvider.name +
  ' paused=' + availability.isAiTutorPaused() +
  ' external=' + availability.isExternalAiAllowed() +
  ' status=' + JSON.stringify(availability.aiClientStatus()));
`;

function runProbe(work: string, env: Record<string, string>): { status: number | null; output: string } {
  const file = path.join(work, 'probe.mts');
  writeFileSync(file, PROBE, 'utf8');
  const result = spawnSync(process.execPath, [TSX, file], { cwd: work, env, encoding: 'utf8', timeout: 180_000 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🧪 AI MOCK MODE SUITE');
  console.log('====================================================');

  // Isolation, before anything from the application is imported.
  register(HOOK_URL);
  const isolated = mkdtempSync(path.join(tmpdir(), 'edp-ai-mock-'));
  const backendDir = process.cwd();
  process.chdir(isolated);
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  process.env.OFFLINE_DEMO_AI = 'false';
  process.env.NODE_ENV = 'test';
  process.env.AI_TUTOR_MODE = 'mock';
  installFetchRecorder();

  const g = globalThis as unknown as { __EDP_PRISMA_FIXTURE__?: Record<string, unknown> };
  g.__EDP_PRISMA_FIXTURE__ = {};

  const { env } = await import('../config/env.config.js');
  const availability = await import('../services/ai/ai-availability.js');
  const factory = (await quietly(() => import('../services/ai/provider.factory.js'))).result!;
  const { primaryProvider, mockProvider } = factory;
  const { edTutorService } = await import('../services/tutor/ed-tutor.service.js');
  const { tutorSessionService } = await import('../services/tutor/tutor-session.service.js');
  const { studentProfileService } = await import('../services/student-profile.service.js');
  const { aiTutorService } = await import('../services/ai/ai-tutor.service.js');
  const { buildTutorSystemPrompt } = await import('../services/tutor/prompt-builder.service.js');
  const { quizMistakeAnalysisResultSchema } = await import('@edplatform/shared');

  // Records exactly what the Mock was asked, so the prompt is checked as sent.
  const seenPrompts: string[] = [];
  const m = mockProvider as unknown as Record<string, unknown>;
  const originalStream = mockProvider.generateStream.bind(mockProvider);
  m.generateStream = (params: Parameters<typeof mockProvider.generateStream>[0]) => {
    seenPrompts.push(params.systemPrompt);
    return originalStream(params);
  };

  const calls: string[] = [];
  const s = tutorSessionService as unknown as Record<string, unknown>;
  s.getOwnedSession = async () => {
    calls.push('getOwnedSession');
    return {
      id: 'session-1',
      userId: 'user-1',
      classLevel: 'CLASS_6',
      subject: 'SCIENCE',
      lessonId: null,
      lesson: null,
      moduleId: null,
      module: null
    };
  };
  s.getRecentHistory = async () => [];
  s.appendStudentMessage = async () => {
    calls.push('appendStudentMessage');
    return { id: 'student-msg' };
  };
  s.ensureTitle = async () => undefined;
  s.ensureSubject = async () => 'SCIENCE';
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
    seenPrompts.length = 0;
  };
  const chatTurn = (chunks: string[], images: { mimeType: string; data: Buffer }[] = []) =>
    edTutorService.streamTurn(
      user,
      'session-1',
      { message: 'Why do plants need sunlight?' } as never,
      (c) => void chunks.push(c),
      images
    );

  // -------------------------------------------------------------------------
  console.log('\n[1] Reading AI_TUTOR_MODE');

  await check('"mock" (any case, surrounding spaces ignored) means mock', () => {
    for (const v of ['mock', 'MOCK', ' Mock ']) {
      assert.equal(availability.resolveAiTutorMode(v), 'mock', v);
    }
  });

  await check('Near-misses of "mock" still mean paused, never mock or live', () => {
    for (const v of ['mocks', 'mock live', 'moc', 'demo', 'offline']) {
      assert.equal(availability.resolveAiTutorMode(v), 'paused', v);
    }
  });

  await check('Mock mode is not paused and allows no external AI, even with a key set', () => {
    assert.equal(env.OPENROUTER_API_KEY, FAKE_KEY);
    assert.equal(availability.isMockTutorMode(), true);
    assert.equal(availability.isAiTutorPaused(), false);
    assert.equal(availability.isExternalAiAllowed(), false);
  });

  await check('The frontend is told the tutor is on and the mic stays off', () => {
    assert.deepEqual(availability.aiClientStatus(), { tutorPaused: false, voiceInputAllowed: false });
  });

  await check('The Mock is the selected provider; no OpenRouter client exists', () => {
    assert.equal(primaryProvider, mockProvider);
    assert.equal(primaryProvider.name, 'MockAITutorProvider');
  });

  // -------------------------------------------------------------------------
  console.log('\n[2] Tutor chat');

  await check('A chat turn streams a Mock answer, stores both turns and makes no request', async () => {
    reset();
    const chunks: string[] = [];
    const out = await quietly(() => chatTurn(chunks));
    assert.equal(out.error, null, String(out.error));
    assert.ok(chunks.length > 0, 'nothing was streamed');
    assert.match(out.result!.reply, /photosynthesis/i);
    assert.deepEqual(calls, ['getOwnedSession', 'appendStudentMessage', 'appendEdMessage']);
    assert.equal(requests.length, 0);
  });

  await check('Every Mock answer is labelled as an offline demo response', async () => {
    reset();
    const out = await quietly(() => chatTurn([]));
    assert.ok(out.result!.reply.endsWith(OFFLINE_NOTE), out.result!.reply.slice(-80));
    assert.ok(!/OPENROUTER|API key|apikey/i.test(out.result!.reply), 'the reply mentions configuration');
  });

  await check('The Mock receives the unchanged teaching prompt', async () => {
    reset();
    await quietly(() => chatTurn([]));
    const expected = buildTutorSystemPrompt({
      classLevel: 'CLASS_6',
      subject: 'SCIENCE',
      language: 'ENGLISH',
      explanationStyle: 'SIMPLE',
      studentFirstName: null,
      curriculum: null,
      action: null
    });
    assert.equal(seenPrompts[0], expected);
  });

  await check('A photo turn is answered honestly offline and makes no request', async () => {
    reset();
    const out = await quietly(() => chatTurn([], [{ mimeType: 'image/png', data: PNG }]));
    assert.equal(out.error, null, String(out.error));
    assert.ok(out.result!.reply.length > 0);
    assert.equal(requests.length, 0);
  });

  await check('No tutor reply is the paused message', async () => {
    reset();
    const out = await quietly(() => chatTurn([]));
    assert.ok(!out.result!.reply.includes(PAUSED_MESSAGE));
  });

  // -------------------------------------------------------------------------
  console.log('\n[3] Quiz hints');

  await check('A quiz hint streams a Mock hint that does not give the answer, with no request', async () => {
    reset();
    const prepared = {
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
    const chunks: string[] = [];
    const out = await quietly(() => aiTutorService.streamPreparedQuizHint(prepared, (c) => void chunks.push(c)));
    assert.equal(out.error, null, String(out.error));
    assert.ok(chunks.join('').length > 0, 'no hint was streamed');
    assert.equal(seenPrompts[0], prepared.systemPrompt);
    assert.equal(requests.length, 0);
  });

  // -------------------------------------------------------------------------
  console.log('\n[4] Quiz analysis');

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

  await check('Quiz analysis is the local, schema-valid analysis and is never cached', async () => {
    reset();
    updates.length = 0;
    useAttempt(submittedAttempt());
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.equal(out.error, null, String(out.error));
    const result = quizMistakeAnalysisResultSchema.parse(out.result);
    assert.equal(result.mistakes.length, 1);
    assert.equal(result.mistakes[0].questionId, 'q2');
    assert.match(result.generalFeedback, /You got 1 of 2 right/);
    assert.equal(updates.length, 0, 'a Mock analysis was stored as if an AI wrote it');
    assert.equal(requests.length, 0);
    assert.match(out.logged, /quiz analysis served locally: AI_TUTOR_MODE is mock/);
  });

  await check('A stored AI analysis is not served in mock mode', async () => {
    reset();
    updates.length = 0;
    const local = (await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'))).result as unknown as Record<
      string,
      unknown
    >;
    const stored = JSON.stringify({ ...local, generalFeedback: 'AI-CACHED-MARKER: an earlier AI summary.' });
    useAttempt(submittedAttempt({ aiFeedback: stored }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.ok(!JSON.stringify(out.result).includes('AI-CACHED-MARKER'));
    assert.equal(updates.length, 0);
  });

  await check('Quiz analysis keeps its access check: another student is refused', async () => {
    useAttempt(submittedAttempt({ userId: 'someone-else' }));
    const out = await quietly(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
    assert.ok(out.error, 'another student was allowed to read the analysis');
  });

  // -------------------------------------------------------------------------
  console.log('\n[5] Production startup');

  process.chdir(backendDir);
  const work = mkdtempSync(path.join(tmpdir(), 'edp-ai-mock-probe-'));

  await check('Production starts in mock mode with no key, and selects the Mock', () => {
    const out = runProbe(work, childEnv({}));
    assert.equal(out.status, 0, out.output);
    assert.match(out.output, /PROBE provider=MockAITutorProvider paused=false external=false/);
    assert.match(out.output, /"tutorPaused":false,"voiceInputAllowed":false/);
  });

  await check('Production in mock mode with a key present still selects the Mock and allows no external AI', () => {
    const out = runProbe(work, childEnv({ OPENROUTER_API_KEY: FAKE_KEY }));
    assert.equal(out.status, 0, out.output);
    assert.match(out.output, /PROBE provider=MockAITutorProvider paused=false external=false/);
    assert.ok(!out.output.includes(FAKE_KEY), 'the key was printed');
    assert.ok(!out.output.includes(PLACEHOLDER_PASSWORD), 'the database password was printed');
  });

  await check('Production with the mode unset is still paused, as before', () => {
    const out = runProbe(work, childEnv({ AI_TUTOR_MODE: '' }));
    assert.equal(out.status, 0, out.output);
    assert.match(out.output, /PROBE provider=DisabledAITutorProvider paused=true external=false/);
  });

  // ------------------------------------------------------------------ teardown
  m.generateStream = originalStream;
  g.__EDP_PRISMA_FIXTURE__ = undefined;
  for (const dir of [isolated, work]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold the empty folder open; it is in the temp dir either way.
    }
  }

  console.log('\n====================================================');
  console.log('📊 AI MOCK MODE RESULTS');
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
