/**
 * External AI is OFF by default: no OpenRouter request on any path unless
 * AI_TUTOR_MODE=live, the offline demo's Mock tutor still answers, and the
 * production backend starts without OPENROUTER_API_KEY while AI is off.
 *
 * Every scenario runs in a fresh child process, because the provider is chosen
 * once at startup. Each child:
 *   - runs in a throwaway folder with no .env file and gets only the variables
 *     passed to it, so the real environment file is never read;
 *   - resolves '@prisma/client' to the in-memory fixture stub, so no database
 *     can be reached;
 *   - replaces fetch with a recorder that refuses every non-local request, so
 *     no request can leave the machine and every attempt is counted.
 * Keys and database URLs are placeholders.
 *
 * A last group reads the backend source to catch a future bypass: a new fetch,
 * a second place that creates the OpenRouter client, or a request method that
 * lost its guard.
 *
 * Run: npm run test:ai-off
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const SRC = path.join(BACKEND, 'src');
const REPO = path.resolve(BACKEND, '..', '..');
const TSX = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const href = (...parts: string[]) => JSON.stringify(pathToFileURL(path.join(SRC, ...parts)).href);

const PLACEHOLDER_KEY = 'sk-or-v1-placeholder-key-not-real-0000000000000000000000000000';
const PLACEHOLDER_PASSWORD = 'placeholder-password-not-real';
const DEMO_ENDPOINT = 'ep-demo-approved-test1234';
const DEMO_URL = `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${DEMO_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const PROD_PLACEHOLDER_URL = `postgresql://app:${PLACEHOLDER_PASSWORD}@db.invalid.example.test:5432/none`;
const PAUSED_MESSAGE =
  "ED's AI tutor is paused for a little while. Your lessons and quizzes still work, so try ED again later.";

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

// ---------------------------------------------------------------- child-process helpers

const WORK = mkdtempSync(path.join(tmpdir(), 'edp-ai-off-'));

/** Only the variables the child needs, with undefined values removed. */
function childEnv(extra: Record<string, string | undefined>): Record<string, string> {
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: 'test',
    DATABASE_URL: PROD_PLACEHOLDER_URL,
    JWT_SECRET: 'x'.repeat(48),
    OPENROUTER_API_KEY: '',
    CLERK_SECRET_KEY: '',
    OFFLINE_DEMO_AI: 'false'
  };
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...base, ...extra })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

const demoEnv = (extra: Record<string, string | undefined> = {}) =>
  childEnv({
    NODE_ENV: 'production',
    DATABASE_URL: DEMO_URL,
    OFFLINE_DEMO_AI: 'true',
    OFFLINE_DEMO_EXPECT_ENDPOINT: DEMO_ENDPOINT,
    ...extra
  });

interface ChildResult {
  status: number | null;
  output: string;
}

function runProbe(name: string, body: string, env: Record<string, string>): ChildResult {
  const file = path.join(WORK, `${name}.mts`);
  writeFileSync(file, body, 'utf8');
  const result = spawnSync(process.execPath, [TSX, file], { cwd: WORK, env, encoding: 'utf8', timeout: 180_000 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function assertNoSecrets(output: string): void {
  assert.ok(!output.includes(PLACEHOLDER_KEY), 'the output printed the API key');
  assert.ok(!output.includes(PLACEHOLDER_PASSWORD), 'the output printed the database password');
}

/**
 * The probe: drives every AI path once, then starts the app and calls health.
 * Prints one RESULT line of JSON. Nothing in it is a secret.
 */
const PROBE = `
import { register } from 'node:module';
register(${JSON.stringify(pathToFileURL(path.join(HERE, 'support', 'prisma-fixture-hook.mjs')).href)});

// Network recorder: local requests (the health check) pass, everything else is
// counted and refused, so nothing can leave the machine.
const realFetch = globalThis.fetch;
const external = [];
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
  external.push(url.replace(/\\?.*$/, ''));
  throw new Error('offline test: external request blocked');
};

const updates = [];
const attempt = {
  id: 'attempt-1', userId: 'user-1', quizId: 'quiz-1', status: 'SUBMITTED', score: 50, percentage: 50,
  isPassed: false, aiFeedback: null,
  quiz: {
    id: 'quiz-1', title: 'Quick check', isPublished: true, lessonId: 'lesson-1', moduleId: null, module: null,
    lesson: { id: 'lesson-1', title: 'What science really is', isPublished: true, moduleId: 'module-1',
      module: { id: 'module-1', title: 'Science', course: { slug: 'class-6-science', title: 'Class 6 Science', isPublished: true } } },
    questions: [
      { id: 'q1', prompt: 'What is science?', explanation: 'A way of working things out.', lessonId: 'lesson-1',
        options: [{ id: 'q1a', text: 'A way of working things out', isCorrect: true }, { id: 'q1b', text: 'A list of facts', isCorrect: false }] },
      { id: 'q2', prompt: 'A wrong guess is wasted?', explanation: 'A wrong guess still teaches you something.', lessonId: 'lesson-1',
        options: [{ id: 'q2a', text: 'True', isCorrect: false }, { id: 'q2b', text: 'False', isCorrect: true }] }
    ]
  },
  answers: [
    { questionId: 'q1', isCorrect: true, selectedOptionIds: ['q1a'] },
    { questionId: 'q2', isCorrect: false, selectedOptionIds: ['q2a'] }
  ]
};
globalThis.__EDP_PRISMA_FIXTURE__ = {
  quizAttempt: { findUnique: async () => attempt, update: async (args) => { updates.push(args); return {}; } }
};

// Loaded before output is captured, so a refused startup prints its reason.
const { env } = await import(${href('config', 'env.config.ts')});

const logs = [];
const savedLog = console.log;
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));
console.warn = (...a) => logs.push(a.join(' '));

const availability = await import(${href('services', 'ai', 'ai-availability.ts')});
const { primaryProvider, streamWithFallback } = await import(${href('services', 'ai', 'provider.factory.ts')});
const { OpenRouterAITutorProvider } = await import(${href('services', 'ai', 'openrouter.provider.ts')});
const { edTutorService } = await import(${href('services', 'tutor', 'ed-tutor.service.ts')});
const { tutorSessionService } = await import(${href('services', 'tutor', 'tutor-session.service.ts')});
const { studentProfileService } = await import(${href('services', 'student-profile.service.ts')});
const { aiTutorService } = await import(${href('services', 'ai', 'ai-tutor.service.ts')});
const { buildTutorSystemPrompt } = await import(${href('services', 'tutor', 'prompt-builder.service.ts')});
const { createApp } = await import(${href('app.ts')});

// In-memory tutor session, so a turn can run with no database.
const stored = [];
Object.assign(tutorSessionService, {
  getOwnedSession: async () => ({ id: 'session-1', userId: 'user-1', classLevel: 'CLASS_6', subject: 'SCIENCE',
    lessonId: null, lesson: null, moduleId: null, module: null }),
  getRecentHistory: async () => [],
  appendStudentMessage: async () => { stored.push('student'); return { id: 'student-msg' }; },
  ensureTitle: async () => undefined,
  ensureSubject: async () => 'SCIENCE',
  appendEdMessage: async () => { stored.push('ed'); return { id: 'ed-msg' }; }
});
studentProfileService.getProfile = async () => ({ classLevel: 'CLASS_6' });
const user = { id: 'user-1', firstName: null, role: 'STUDENT' };

const outcome = async (fn) => {
  const chunks = [];
  try {
    const value = await fn((c) => { chunks.push(c); });
    return { ok: true, text: (typeof value === 'string' ? value : '') + chunks.join(''), value };
  } catch (err) {
    return { ok: false, code: err?.code ?? null, status: err?.statusCode ?? null, message: String(err?.message ?? err) };
  }
};

const result = {};
result.mode = env.AI_TUTOR_MODE;
result.paused = availability.isAiTutorPaused();
result.externalAllowed = availability.isExternalAiAllowed();
result.provider = primaryProvider.name;

result.chat = await outcome((onChunk) => edTutorService.streamTurn(user, 'session-1', { message: 'What is a magnet?' }, onChunk, []));
result.photo = await outcome((onChunk) => edTutorService.streamTurn(user, 'session-1', { message: 'Look at this' }, onChunk,
  [{ mimeType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]));
result.storedTurns = stored.length;

const hintPrompt = buildTutorSystemPrompt({ classLevel: 'CLASS_6', subject: 'SCIENCE', language: 'ENGLISH',
  explanationStyle: 'SIMPLE', studentFirstName: null, curriculum: null, action: 'hint' });
result.hint = await outcome((onChunk) => aiTutorService.streamPreparedQuizHint({ systemPrompt: hintPrompt,
  userPrompt: 'give me a hint',
  meta: { classLevel: 'CLASS_6', subject: 'SCIENCE', action: 'hint', studentFirstName: null, curriculum: null } }, onChunk));

const analysis = await outcome(() => aiTutorService.analyzeQuizMistakes(user, 'attempt-1'));
result.analysis = analysis.ok
  ? { ok: true, incorrect: analysis.value.incorrectQuestionsCount, mistakes: analysis.value.mistakes.length,
      feedback: typeof analysis.value.generalFeedback === 'string' && analysis.value.generalFeedback.length > 0 }
  : analysis;
result.analysisWrites = updates.length;

// Bypasses: callers that skip every service check.
const params = { systemPrompt: 'x', userPrompt: 'bypass', history: [], images: [], onChunk: () => undefined };
const structured = { systemPrompt: 'x', userPrompt: 'bypass', schema: {}, fallbackGenerator: () => ({ local: true }) };
result.bypassStream = await outcome(() => streamWithFallback(params));
result.bypassPrimaryStream = await outcome(() => primaryProvider.generateStream(params));
result.bypassPrimaryStructured = await outcome(() => primaryProvider.generateStructured(structured));
const direct = new OpenRouterAITutorProvider(${JSON.stringify(PLACEHOLDER_KEY)}, 'test/model:free', 'openrouter/free');
result.bypassDirectStream = await outcome(() => direct.generateStream(params));
result.bypassDirectStructured = await outcome(() => direct.generateStructured(structured));

// Startup: the app serves health with this configuration.
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/v1/health');
result.health = res.status;
server.close();

result.external = external;
result.stub = globalThis.__EDP_PRISMA_STUB_LOADED__ === true;
result.pausedLog = logs.some((l) => l.includes('AI tutor: PAUSED'));
result.disabledLog = logs.some((l) => l.includes('AI provider: disabled'));
savedLog('RESULT ' + JSON.stringify(result));
process.exit(0);
`;

function probe(name: string, env: Record<string, string>): Record<string, any> {
  const r = runProbe(name, PROBE, env);
  assertNoSecrets(r.output);
  assert.equal(r.status, 0, `probe exited ${String(r.status)}:\n${r.output.slice(-2000)}`);
  const line = r.output.split('\n').find((l) => l.startsWith('RESULT ')) ?? '';
  assert.ok(line, `no RESULT line:\n${r.output.slice(-2000)}`);
  return JSON.parse(line.slice(7)) as Record<string, any>;
}

function assertRefused(outcome: Record<string, any>, label: string): void {
  assert.equal(outcome.ok, false, `${label} was not refused`);
  assert.equal(outcome.code, 'AI_TUTOR_PAUSED', `${label}: ${String(outcome.message)}`);
  assert.equal(outcome.status, 503, label);
  assert.equal(outcome.message, PAUSED_MESSAGE, label);
}

/** Every AI path refused or served locally, with zero external requests. */
function assertAllBlocked(r: Record<string, any>): void {
  assert.equal(r.provider, 'DisabledAITutorProvider');
  assert.equal(r.paused, true);
  assert.equal(r.externalAllowed, false);
  assertRefused(r.chat, 'chat');
  assertRefused(r.photo, 'photo');
  assertRefused(r.hint, 'hint');
  assert.equal(r.storedTurns, 0, 'a refused turn was stored');
  assert.equal(r.analysis.ok, true, `analysis failed: ${JSON.stringify(r.analysis)}`);
  assert.equal(r.analysis.incorrect, 1);
  assert.equal(r.analysis.mistakes, 1);
  assert.equal(r.analysisWrites, 0, 'the local analysis was written to the database');
  for (const key of ['bypassStream', 'bypassPrimaryStream', 'bypassPrimaryStructured', 'bypassDirectStream', 'bypassDirectStructured']) {
    assertRefused(r[key], key);
  }
  assert.deepEqual(r.external, [], `external requests were attempted: ${r.external.join(', ')}`);
  assert.equal(r.stub, true, 'the offline Prisma stub was not used');
}

// ---------------------------------------------------------------- source helpers

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(full));
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Source with comment lines removed, so prose about fetch() is not mistaken for a call. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

async function runAll(): Promise<void> {
  // ------------------------------------------------------------------------
  console.log('\n[1] Default: AI_TUTOR_MODE unset, with a key present');

  await check('Chat, photo, hint, analysis and every bypass make zero external requests', () => {
    assertAllBlocked(probe('default-with-key', childEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY })));
  });

  await check('Typos and other values behave exactly like unset', () => {
    for (const mode of ['paused', 'off', 'livee', '', 'true']) {
      const r = probe(`mode-${mode || 'blank'}`, childEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY, AI_TUTOR_MODE: mode }));
      assertAllBlocked(r);
    }
  });

  await check('Control: with AI_TUTOR_MODE=live the recorder does see (and block) OpenRouter attempts', () => {
    // Proves "zero requests" above is measured, not a blind spot. The recorder
    // refuses the request, so nothing leaves the machine here either.
    const r = probe('control-live', childEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY, AI_TUTOR_MODE: 'live' }));
    assert.equal(r.provider, 'OpenRouterAITutorProvider');
    assert.equal(r.externalAllowed, true);
    assert.ok(
      r.external.some((u: string) => u.startsWith('https://openrouter.ai/')),
      'the recorder saw no OpenRouter attempt in live mode'
    );
  });

  await check('The paused state is logged at startup and no OpenRouter client is created', () => {
    const r = probe('default-logs', childEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY }));
    assert.equal(r.pausedLog, true, 'the PAUSED startup line is missing');
    assert.equal(r.disabledLog, true, 'the disabled-provider line is missing');
    assert.notEqual(r.provider, 'OpenRouterAITutorProvider');
  });

  // ------------------------------------------------------------------------
  console.log('\n[2] Production startup without OPENROUTER_API_KEY');

  await check('Production with AI off and no key starts, serves health, and makes zero external requests', () => {
    const r = probe('prod-no-key', childEnv({ NODE_ENV: 'production', OPENROUTER_API_KEY: '' }));
    assert.equal(r.health, 200);
    assert.equal(r.pausedLog, true);
    assertAllBlocked(r);
  });

  await check('Production with AI_TUTOR_MODE=paused and no key also starts', () => {
    const r = probe('prod-paused-no-key', childEnv({ NODE_ENV: 'production', OPENROUTER_API_KEY: '', AI_TUTOR_MODE: 'paused' }));
    assert.equal(r.health, 200);
    assertAllBlocked(r);
  });

  await check('Production with AI_TUTOR_MODE=live and no key still refuses to start', () => {
    const r = runProbe(
      'prod-live-no-key',
      PROBE,
      childEnv({ NODE_ENV: 'production', OPENROUTER_API_KEY: '', AI_TUTOR_MODE: 'live' })
    );
    assertNoSecrets(r.output);
    assert.notEqual(r.status, 0, 'a live production deploy with no key started');
    assert.match(r.output, /OPENROUTER_API_KEY is required in production/);
    assert.ok(!r.output.includes('RESULT '), 'the probe ran past startup');
  });

  // ------------------------------------------------------------------------
  console.log('\n[3] Offline demo: the Mock tutor still answers, offline');

  await check('With AI_TUTOR_MODE unset the demo Mock answers chat, photo, hint and analysis with zero external requests', () => {
    const r = probe('demo-default', demoEnv());
    assert.equal(r.provider, 'MockAITutorProvider');
    assert.equal(r.paused, false, 'the demo tutor is paused');
    assert.equal(r.externalAllowed, false, 'the demo allows external AI');
    for (const key of ['chat', 'photo', 'hint']) {
      assert.equal(r[key].ok, true, `${key} failed: ${String(r[key].message)}`);
      assert.ok(r[key].text.trim().length > 0, `${key} produced no reply`);
    }
    assert.ok(r.storedTurns > 0, 'the demo chat turn was not stored');
    assert.equal(r.analysis.ok, true, `analysis failed: ${JSON.stringify(r.analysis)}`);
    assert.equal(r.analysis.incorrect, 1);
    assert.equal(r.analysis.feedback, true);
    assert.equal(r.health, 200);
    assertRefused(r.bypassDirectStream, 'direct OpenRouter stream in demo');
    assertRefused(r.bypassDirectStructured, 'direct OpenRouter structured in demo');
    assert.deepEqual(r.external, [], `external requests were attempted: ${r.external.join(', ')}`);
    assert.equal(r.stub, true);
  });

  await check('With AI_TUTOR_MODE=live the demo is still the Mock and still makes zero external requests', () => {
    const r = probe('demo-live', demoEnv({ AI_TUTOR_MODE: 'live' }));
    assert.equal(r.provider, 'MockAITutorProvider');
    assert.equal(r.externalAllowed, false);
    assert.equal(r.chat.ok, true);
    assert.deepEqual(r.external, []);
  });

  await check('The demo still refuses to start with a key, whatever the mode', () => {
    const r = runProbe('demo-with-key', PROBE, demoEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY, AI_TUTOR_MODE: 'live' }));
    assertNoSecrets(r.output);
    assert.notEqual(r.status, 0);
    assert.match(r.output, /must not be combined with OPENROUTER_API_KEY/);
  });

  // ------------------------------------------------------------------------
  console.log('\n[4] Source tripwires: a new path cannot reach the network unguarded');

  const files = sourceFiles(SRC);

  await check('fetch is called only in the OpenRouter provider', () => {
    const callers = files.filter((f) => /\bfetch\s*\(/.test(codeOf(f))).map(rel);
    assert.deepEqual(callers, ['services/ai/openrouter.provider.ts']);
  });

  await check('The OpenRouter client is created only by the provider factory', () => {
    const creators = files.filter((f) => /new\s+OpenRouterAITutorProvider\s*\(/.test(codeOf(f))).map(rel);
    assert.deepEqual(creators, ['services/ai/provider.factory.ts']);
  });

  await check('Both OpenRouter request methods check the mode before anything else', () => {
    const source = readFileSync(path.join(SRC, 'services', 'ai', 'openrouter.provider.ts'), 'utf8');
    for (const method of ['generateStream(params: StreamParams): Promise<string> {', 'generateStructured<T>(params: StructuredParams<T>): Promise<T> {']) {
      const at = source.indexOf(method);
      assert.ok(at >= 0, `${method} not found`);
      const firstStatement = source.slice(at + method.length).trim().split('\n')[0].trim();
      assert.equal(firstStatement, 'assertExternalAiAllowed();', `${method} does not start with the guard`);
    }
    assert.match(source, /function assertExternalAiAllowed\(\): void \{\s*if \(!isExternalAiAllowed\(\)\) throw aiPausedError\(\);/);
  });

  await check('The factory picks the disabled provider before it can create the OpenRouter client', () => {
    const factory = readFileSync(path.join(SRC, 'services', 'ai', 'provider.factory.ts'), 'utf8');
    const disabled = factory.indexOf('if (!isExternalAiAllowed()) {');
    const openRouter = factory.indexOf('new OpenRouterAITutorProvider(');
    assert.ok(disabled > 0 && openRouter > disabled, 'the disabled branch does not come first');
  });

  await check('The disabled provider has no network code', () => {
    const code = codeOf(path.join(SRC, 'services', 'ai', 'disabled.provider.ts'));
    assert.ok(!/fetch|https?:\/\/|import\s.*openrouter/i.test(code));
  });

  await check('Gemini and every other AI SDK are unreachable', () => {
    const geminiImporters = files.filter((f) => /from\s+['"][^'"]*gemini\.provider/.test(codeOf(f))).map(rel);
    assert.deepEqual(geminiImporters, [], 'the Gemini provider is imported');
    const sdkImporters = files
      .filter((f) => /from\s+['"](@google\/genai|@google\/generative-ai|openai|@anthropic-ai\/[^'"]+|groq-sdk|cohere-ai|@mistralai\/[^'"]+)['"]/.test(codeOf(f)))
      .map(rel);
    assert.deepEqual(sdkImporters, ['services/ai/gemini.provider.ts'], 'an AI SDK is imported outside the dead Gemini file');
  });

  // ------------------------------------------------------------------------
  rmSync(WORK, { recursive: true, force: true });
  console.log('\n====================================================');
  console.log('📊 AI OFF BY DEFAULT RESULTS');
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
  rmSync(WORK, { recursive: true, force: true });
  process.exit(1);
});
