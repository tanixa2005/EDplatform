/**
 * Offline demo AI mode (OFFLINE_DEMO_AI=true), verified offline.
 *
 * No test here connects to a database or makes a network request. The startup
 * checks run the real environment module in child processes, from a temporary
 * folder with no .env file, so the test never reads a real configuration. Every
 * credential used is a placeholder.
 *
 * Run: npm run test:offline-demo
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BACKUP_ENDPOINT,
  DENIED_ENDPOINTS,
  DEVELOPMENT_ENDPOINT,
  PRODUCTION_ENDPOINT,
  endpointIdOf,
  isEndpointId
} from '../config/database-endpoints.js';
import { offlineDemoProblems } from '../config/offline-demo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const TSX = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const ENV_MODULE = path.join(BACKEND, 'src', 'config', 'env.config.ts');
const APP_MODULE = path.join(BACKEND, 'src', 'app.ts');
const COOKIE_MODULE = path.join(BACKEND, 'src', 'config', 'cookie.config.ts');
const MOCK_MODULE = path.join(BACKEND, 'src', 'services', 'ai', 'mock.provider.ts');

const DEMO_ENDPOINT = 'ep-demo-approved-test1234';
const PRISMA_HOOK_URL = pathToFileURL(path.join(HERE, 'support', 'prisma-stub-hook.mjs')).href;
const PLACEHOLDER_PASSWORD = 'placeholder-password-not-real';
const PLACEHOLDER_KEY = 'placeholder-key-not-real';
const DEMO_URL = `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${DEMO_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;

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

const read = (file: string) => readFileSync(file, 'utf8');

// ---------------------------------------------------------------- child-process helpers

/** A throwaway folder with no .env file, so the environment module can only see what is passed in. */
const WORK = mkdtempSync(path.join(tmpdir(), 'edp-offline-demo-'));

/** Only the variables the child needs, with undefined values removed. */
function childEnv(extra: Record<string, string>): Record<string, string> {
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: 'production',
    DATABASE_URL: DEMO_URL,
    JWT_SECRET: 'x'.repeat(48),
    OPENROUTER_API_KEY: '',
    CLERK_SECRET_KEY: '',
    OFFLINE_DEMO_AI: 'true',
    OFFLINE_DEMO_EXPECT_ENDPOINT: DEMO_ENDPOINT
  };
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...base, ...extra })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

interface ChildResult {
  status: number | null;
  output: string;
}

/** Writes a probe into the work folder and runs it with tsx, with the given environment. */
function runProbe(name: string, body: string, env: Record<string, string>): ChildResult {
  const file = path.join(WORK, `${name}.mts`);
  writeFileSync(file, body, 'utf8');
  const result = spawnSync(process.execPath, [TSX, file], {
    cwd: WORK,
    env,
    encoding: 'utf8',
    timeout: 180_000
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const ENV_PROBE = `
const mod = await import(${JSON.stringify(pathToFileURL(ENV_MODULE).href)});
console.log('ENV_OK offline=' + String(mod.env.OFFLINE_DEMO_AI));
`;

function assertNoSecrets(output: string): void {
  assert.ok(!output.includes(PLACEHOLDER_PASSWORD), 'the output printed the database password');
  assert.ok(!output.includes(PLACEHOLDER_KEY), 'the output printed the API key');
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🧪 OFFLINE DEMO AI SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. endpoint reading
  await check('The endpoint id is read from a direct and from a pooled host, and nothing else is returned', () => {
    assert.equal(endpointIdOf(`postgresql://u:${PLACEHOLDER_PASSWORD}@ep-demo-x1.c-3.ap-southeast-1.aws.neon.tech/db`), 'ep-demo-x1');
    assert.equal(endpointIdOf('postgresql://u:p@ep-demo-x1-pooler.c-3.ap-southeast-1.aws.neon.tech/db'), 'ep-demo-x1');
    assert.ok(!String(endpointIdOf(DEMO_URL)).includes(PLACEHOLDER_PASSWORD), 'the password leaked into the endpoint id');
  });

  await check('A URL with no Neon endpoint (localhost, junk, empty) yields null, never a guess', () => {
    assert.equal(endpointIdOf('postgresql://u:p@localhost:5432/db'), null);
    assert.equal(endpointIdOf('not a url'), null);
    assert.equal(endpointIdOf(''), null);
  });

  await check('The denied list holds production, development and backup endpoints', () => {
    assert.deepEqual(
      [...DENIED_ENDPOINTS].sort(),
      [BACKUP_ENDPOINT, DEVELOPMENT_ENDPOINT, PRODUCTION_ENDPOINT].sort()
    );
  });

  // ---------------------------------------------------------------- 1b. structural hostname validation
  const APPROVED = 'ep-demo-approved-test1234';
  const HOST = (label: string) => `postgresql://u:${PLACEHOLDER_PASSWORD}@${label}.c-3.ap-southeast-1.aws.neon.tech/db`;

  await check('Legitimate direct and pooled Neon hostnames of the approved endpoint are accepted', () => {
    assert.equal(endpointIdOf(HOST(APPROVED)), APPROVED);
    assert.equal(endpointIdOf(HOST(`${APPROVED}-pooler`)), APPROVED);
    assert.equal(endpointIdOf(`postgres://u:p@${APPROVED}.c-2.us-east-2.aws.neon.tech/db`), APPROVED, 'another region was refused');
  });

  await check('A lookalike hostname that starts with the approved id but is not Neon is rejected', () => {
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.attacker.example/db`), null);
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.c-3.ap-southeast-1.neon.example.com/db`), null, 'a look-alike domain was accepted');
  });

  await check('A forged suffix that ends in the Neon domain but continues past it is rejected', () => {
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.c-3.ap-southeast-1.aws.neon.tech.attacker.example/db`), null);
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.aws.neon.tech.attacker.example/db`), null);
  });

  await check('Extra hostname labels are rejected, wherever they are inserted', () => {
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.evil.c-3.ap-southeast-1.aws.neon.tech/db`), null);
    assert.equal(endpointIdOf(`postgresql://u:p@evil.${APPROVED}.c-3.ap-southeast-1.aws.neon.tech/db`), null);
  });

  await check('Malformed hosts are rejected: double dots, a missing cluster label, a missing region, and a wrong scheme', () => {
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}..c-3.ap-southeast-1.aws.neon.tech/db`), null);
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.ap-southeast-1.aws.neon.tech/db`), null);
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED}.c-3.aws.neon.tech/db`), null);
    assert.equal(endpointIdOf(`http://u:p@${APPROVED}.c-3.ap-southeast-1.aws.neon.tech/db`), null);
    assert.equal(endpointIdOf(`mysql://u:p@${APPROVED}.c-3.ap-southeast-1.aws.neon.tech/db`), null);
  });

  await check('A user-info trick that puts the Neon name before an "@" does not move the host', () => {
    assert.equal(
      endpointIdOf(`postgresql://${APPROVED}.c-3.ap-southeast-1.aws.neon.tech:x@evil.example/db`),
      null,
      'the Neon name in the user part was read as the host'
    );
  });

  await check('An endpoint id that merely starts with the approved id is a different id, not a match', () => {
    const longer = endpointIdOf(HOST(`${APPROVED}5`));
    assert.equal(longer, `${APPROVED}5`);
    assert.notEqual(longer, APPROVED);
    const shorter = endpointIdOf(HOST('ep-demo-approved-test123'));
    assert.notEqual(shorter, APPROVED);
  });

  await check('Host case is normalised, so an upper-case Neon host still names the same endpoint', () => {
    assert.equal(endpointIdOf(`postgresql://u:p@${APPROVED.toUpperCase()}.C-3.AP-SOUTHEAST-1.AWS.NEON.TECH/db`), APPROVED);
  });

  await check('The denied endpoints are still identified exactly, so the denial rule still applies to them', () => {
    for (const denied of DENIED_ENDPOINTS) {
      assert.equal(endpointIdOf(HOST(denied)), denied);
      assert.equal(endpointIdOf(HOST(`${denied}-pooler`)), denied);
    }
  });

  await check('An approved endpoint must itself be a well-formed id', () => {
    assert.equal(isEndpointId(APPROVED), true);
    assert.equal(isEndpointId('ep-demo-approved-test1234.evil'), false);
    assert.equal(isEndpointId('EP-DEMO'), false);
    assert.equal(isEndpointId(''), false);
    assert.equal(isEndpointId('ep-demo-approved-test1234 '), false);
    assert.ok(offlineDemoProblems({
      NODE_ENV: 'production',
      OPENROUTER_API_KEY: '',
      DATABASE_URL: HOST(APPROVED),
      OFFLINE_DEMO_EXPECT_ENDPOINT: 'ep-demo-approved-test1234.evil'
    }).some((p) => /not a well-formed/.test(p)));
  });

  // ---------------------------------------------------------------- 2. the rules, as a pure function
  const VALID = {
    NODE_ENV: 'production',
    OPENROUTER_API_KEY: '',
    DATABASE_URL: DEMO_URL,
    OFFLINE_DEMO_EXPECT_ENDPOINT: DEMO_ENDPOINT
  };

  await check('A production, keyless, approved-endpoint configuration is accepted', () => {
    assert.deepEqual(offlineDemoProblems(VALID), []);
  });

  await check('Development mode is refused', () => {
    assert.ok(offlineDemoProblems({ ...VALID, NODE_ENV: 'development' }).some((p) => /NODE_ENV=production/.test(p)));
  });

  await check('An AI key is refused, so the demo can never reach paid AI', () => {
    assert.ok(offlineDemoProblems({ ...VALID, OPENROUTER_API_KEY: PLACEHOLDER_KEY }).some((p) => /OPENROUTER_API_KEY/.test(p)));
  });

  await check('A missing or blank approved endpoint is refused (fail closed)', () => {
    assert.ok(offlineDemoProblems({ ...VALID, OFFLINE_DEMO_EXPECT_ENDPOINT: '' }).some((p) => /must name/.test(p)));
    assert.ok(offlineDemoProblems({ ...VALID, OFFLINE_DEMO_EXPECT_ENDPOINT: '   ' }).some((p) => /must name/.test(p)));
  });

  await check('An approved endpoint that is itself denied is refused, for production, development and backup', () => {
    for (const denied of DENIED_ENDPOINTS) {
      const url = `postgresql://u:p@${denied}.c-3.ap-southeast-1.aws.neon.tech/db`;
      const problems = offlineDemoProblems({ ...VALID, DATABASE_URL: url, OFFLINE_DEMO_EXPECT_ENDPOINT: denied });
      assert.ok(problems.some((p) => /denied/.test(p)), `${denied} was not refused`);
    }
  });

  await check('A database URL on a denied endpoint is refused, in direct and pooled form', () => {
    for (const denied of DENIED_ENDPOINTS) {
      for (const host of [denied, `${denied}-pooler`]) {
        const url = `postgresql://u:p@${host}.c-3.ap-southeast-1.aws.neon.tech/db`;
        const problems = offlineDemoProblems({ ...VALID, DATABASE_URL: url });
        assert.ok(problems.some((p) => /denied/.test(p)), `${host} was not refused`);
      }
    }
  });

  await check('A database URL that disagrees with the approved endpoint is refused', () => {
    const other = `postgresql://u:p@ep-some-other-zz99.c-3.ap-southeast-1.aws.neon.tech/db`;
    assert.ok(offlineDemoProblems({ ...VALID, DATABASE_URL: other }).some((p) => /does not match/.test(p)));
  });

  await check('A database URL with no readable endpoint (for example localhost) is refused', () => {
    const problems = offlineDemoProblems({ ...VALID, DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    assert.ok(problems.some((p) => /no readable Neon endpoint/.test(p)));
  });

  await check('Problem messages never contain the URL, password, key or endpoint id', () => {
    const everything = [
      offlineDemoProblems({ NODE_ENV: 'development', OPENROUTER_API_KEY: PLACEHOLDER_KEY, DATABASE_URL: DEMO_URL, OFFLINE_DEMO_EXPECT_ENDPOINT: PRODUCTION_ENDPOINT }),
      offlineDemoProblems({ NODE_ENV: 'production', OPENROUTER_API_KEY: '', DATABASE_URL: `postgresql://u:${PLACEHOLDER_PASSWORD}@${PRODUCTION_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/db`, OFFLINE_DEMO_EXPECT_ENDPOINT: DEMO_ENDPOINT })
    ].flat().join('\n');
    assert.ok(!everything.includes(PLACEHOLDER_PASSWORD));
    assert.ok(!everything.includes(PLACEHOLDER_KEY));
    assert.ok(!everything.includes(PRODUCTION_ENDPOINT));
    assert.ok(!everything.includes('postgresql://'));
  });

  // ---------------------------------------------------------------- 3. the real environment module, in child processes
  await check('Startup accepts the approved demo configuration (flag on, production, no key, approved endpoint)', () => {
    const r = runProbe('ok-demo', ENV_PROBE, childEnv({}));
    assert.equal(r.status, 0, `exit ${String(r.status)}: ${r.output}`);
    assert.match(r.output, /ENV_OK offline=true/);
    assertNoSecrets(r.output);
  });

  await check('Startup refuses the flag when an AI key is also set', () => {
    const r = runProbe('demo-with-key', ENV_PROBE, childEnv({ OPENROUTER_API_KEY: PLACEHOLDER_KEY }));
    assert.equal(r.status, 1);
    assert.match(r.output, /must not be combined with OPENROUTER_API_KEY/);
    assertNoSecrets(r.output);
  });

  await check('Startup refuses the flag in development mode', () => {
    const r = runProbe('demo-dev', ENV_PROBE, childEnv({ NODE_ENV: 'development' }));
    assert.equal(r.status, 1);
    assert.match(r.output, /requires NODE_ENV=production/);
  });

  await check('Startup refuses the flag when the database is the production endpoint', () => {
    const r = runProbe(
      'demo-prod-db',
      ENV_PROBE,
      childEnv({
        DATABASE_URL: `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${PRODUCTION_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`,
        OFFLINE_DEMO_EXPECT_ENDPOINT: PRODUCTION_ENDPOINT
      })
    );
    assert.equal(r.status, 1);
    assert.match(r.output, /denied/);
    assertNoSecrets(r.output);
  });

  await check('Startup refuses the flag when the database is the development endpoint', () => {
    const r = runProbe(
      'demo-dev-db',
      ENV_PROBE,
      childEnv({
        DATABASE_URL: `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${DEVELOPMENT_ENDPOINT}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`,
        OFFLINE_DEMO_EXPECT_ENDPOINT: DEVELOPMENT_ENDPOINT
      })
    );
    assert.equal(r.status, 1);
    assert.match(r.output, /denied/);
  });

  await check('Startup refuses the flag when the database is the backup endpoint', () => {
    const r = runProbe(
      'demo-backup-db',
      ENV_PROBE,
      childEnv({
        DATABASE_URL: `postgresql://demo-user:${PLACEHOLDER_PASSWORD}@${BACKUP_ENDPOINT}-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`,
        OFFLINE_DEMO_EXPECT_ENDPOINT: BACKUP_ENDPOINT
      })
    );
    assert.equal(r.status, 1);
    assert.match(r.output, /denied/);
  });

  await check('Startup refuses the flag when no approved endpoint is named (fail closed)', () => {
    const r = runProbe('demo-no-expect', ENV_PROBE, childEnv({ OFFLINE_DEMO_EXPECT_ENDPOINT: '' }));
    assert.equal(r.status, 1);
    assert.match(r.output, /must name the approved demo endpoint/);
  });

  await check('Startup refuses a database that disagrees with the approved endpoint', () => {
    const r = runProbe('demo-mismatch', ENV_PROBE, childEnv({ OFFLINE_DEMO_EXPECT_ENDPOINT: 'ep-demo-other-zz99' }));
    assert.equal(r.status, 1);
    assert.match(r.output, /does not match/);
  });

  await check('Startup refuses a flag value other than exactly "true" or "false"', () => {
    const r = runProbe('demo-yes', ENV_PROBE, childEnv({ OFFLINE_DEMO_AI: 'yes' }));
    assert.equal(r.status, 1);
  });

  await check('The flag is off by default: production in live AI mode with no key still refuses to start (regression)', () => {
    const r = runProbe('prod-nokey', ENV_PROBE, childEnv({ OFFLINE_DEMO_AI: '', OFFLINE_DEMO_EXPECT_ENDPOINT: '', AI_TUTOR_MODE: 'live' }));
    assert.equal(r.status, 1);
    assert.match(r.output, /OPENROUTER_API_KEY is required in production/);
  });

  await check('The flag is off by default: production with AI off and no key starts, with the flag off', () => {
    const r = runProbe('prod-nokey-paused', ENV_PROBE, childEnv({ OFFLINE_DEMO_AI: '', OFFLINE_DEMO_EXPECT_ENDPOINT: '' }));
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /ENV_OK offline=false/);
    assertNoSecrets(r.output);
  });

  await check('The flag is off by default: production with a key starts with the flag off (regression)', () => {
    const r = runProbe('prod-key', ENV_PROBE, childEnv({ OFFLINE_DEMO_AI: 'false', OPENROUTER_API_KEY: PLACEHOLDER_KEY, OFFLINE_DEMO_EXPECT_ENDPOINT: '' }));
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /ENV_OK offline=false/);
    assertNoSecrets(r.output);
  });

  await check('Development mode with no key and the flag off still starts as before (regression)', () => {
    const r = runProbe('dev-nokey', ENV_PROBE, childEnv({ NODE_ENV: 'development', OFFLINE_DEMO_AI: '', OFFLINE_DEMO_EXPECT_ENDPOINT: '' }));
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /ENV_OK offline=false/);
  });

  // ---------------------------------------------------------------- 4. the Mock tutor: honest notice, no network
  const MOCK_PROBE = `
const fetchCalls = { count: 0 };
globalThis.fetch = (...args) => { fetchCalls.count += 1; return Promise.reject(new Error('network is blocked in this test')); };
const mod = await import(${JSON.stringify(pathToFileURL(MOCK_MODULE).href)});
const provider = new mod.MockAITutorProvider();
let text = '';
await provider.generateStream({
  systemPrompt: 'You are ED, a friendly tutor for Class 6 Science.',
  userPrompt: 'What is a shadow?',
  onChunk: (chunk) => { text += chunk; }
});
console.log('MOCK ' + JSON.stringify({
  notice: text.includes('Offline demo response.'),
  mentionsKey: /OPENROUTER/i.test(text),
  networkCalls: fetchCalls.count,
  length: text.length
}));
`;

  await check('In demo mode the Mock reply carries the neutral notice, never mentions a key, and makes no network call', () => {
    const r = runProbe('mock-demo', MOCK_PROBE, childEnv({}));
    assert.equal(r.status, 0, r.output);
    const line = r.output.split('\n').find((l) => l.startsWith('MOCK ')) ?? '';
    const result = JSON.parse(line.slice(5));
    assert.equal(result.notice, true, 'the demo reply has no offline notice');
    assert.equal(result.mentionsKey, false, 'the demo reply mentions an API key');
    assert.equal(result.networkCalls, 0, 'the Mock tried to use the network');
    assert.ok(result.length > 0);
    assertNoSecrets(r.output);
  });

  await check('Outside demo mode the production Mock reply has no notice (existing behaviour kept)', () => {
    const r = runProbe('mock-prod', MOCK_PROBE, childEnv({ OFFLINE_DEMO_AI: 'false', OPENROUTER_API_KEY: PLACEHOLDER_KEY, OFFLINE_DEMO_EXPECT_ENDPOINT: '' }));
    assert.equal(r.status, 0, r.output);
    const line = r.output.split('\n').find((l) => l.startsWith('MOCK ')) ?? '';
    const result = JSON.parse(line.slice(5));
    assert.equal(result.notice, false);
    assert.equal(result.networkCalls, 0);
  });

  // ---------------------------------------------------------------- 5. protections that must stay on in demo mode
  const PROTECTION_PROBE = `
import { register } from 'node:module';
import fs from 'node:fs';
const envReads = [];
const originalRead = fs.readFileSync;
fs.readFileSync = function (file, ...rest) {
  if (typeof file === 'string' && /\\.env$/.test(file)) envReads.push(file);
  return originalRead.call(this, file, ...rest);
};
register(${JSON.stringify(PRISMA_HOOK_URL)});
const cookie = await import(${JSON.stringify(pathToFileURL(COOKIE_MODULE).href)});
const app = await import(${JSON.stringify(pathToFileURL(APP_MODULE).href)});
const opts = cookie.getAuthCookieOptions();
const server = app.createApp().listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const res = await fetch('http://127.0.0.1:' + port + '/api/v1/health');
  console.log('PROT ' + JSON.stringify({
    health: res.status,
    csp: res.headers.get('content-security-policy') !== null,
    secure: opts.secure,
    sameSite: opts.sameSite,
    envReads,
    stub: globalThis.__EDP_PRISMA_STUB_LOADED__ === true
  }));
  server.close();
  process.exit(0);
});
`;

  await check('In demo mode CSP stays on, cookies stay Secure with SameSite=None, and health still answers', () => {
    const r = runProbe('protections', PROTECTION_PROBE, childEnv({}));
    assert.equal(r.status, 0, r.output);
    const line = r.output.split('\n').find((l) => l.startsWith('PROT ')) ?? '';
    const result = JSON.parse(line.slice(5));
    assert.equal(result.health, 200);
    assert.equal(result.csp, true, 'the content-security-policy header is missing');
    assert.equal(result.secure, true);
    assert.equal(result.sameSite, 'none');
    assert.equal(result.stub, true, 'the offline Prisma stub was not used');
    for (const read of result.envReads) {
      assert.ok(read.startsWith(WORK), 'an environment file outside the empty folder was read');
    }
    assertNoSecrets(r.output);
  });

  // ---------------------------------------------------------------- 6. source tripwires: nothing weakened
  await check('Error masking, cookie security, CSP, the account-state check and rate limits are still in source', () => {
    const errorMw = read(path.join(BACKEND, 'src', 'middlewares', 'error.middleware.ts'));
    assert.ok(errorMw.includes("env.NODE_ENV === 'production' && !isAppError && statusCode >= 500"), 'error masking changed');
    const cookieCfg = read(COOKIE_MODULE);
    assert.ok(cookieCfg.includes("if (isProduction && !process.env.COOKIE_SAME_SITE) {"), 'cookie defaults changed');
    const appSrc = read(APP_MODULE);
    assert.ok(appSrc.includes("contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false"), 'CSP changed');
    const authMw = read(path.join(BACKEND, 'src', 'middlewares', 'auth.middleware.ts'));
    assert.ok(authMw.includes('if (!user || !user.isActive) return null;'), 'the account-state check changed');
    assert.ok(read(path.join(BACKEND, 'src', 'routes', 'ai.routes.ts')).includes('aiRateLimiter'), 'AI rate limit removed');
    assert.ok(read(path.join(BACKEND, 'src', 'routes', 'auth.routes.ts')).includes('authRateLimiter'), 'auth rate limit removed');
  });

  await check('The factory only selects the demo Mock on the explicit flag, and never on a key', () => {
    const factory = read(path.join(BACKEND, 'src', 'services', 'ai', 'provider.factory.ts'));
    assert.ok(factory.includes('if (env.OFFLINE_DEMO_AI) {'), 'the demo branch is missing');
    assert.ok(factory.includes("console.log('🤖 AI provider: OFFLINE DEMO"), 'the demo mode is not logged');
  });

  await check('The demo mode is not reachable from any development seed or production runner file', () => {
    for (const file of ['prisma/seed-curriculum.ts', 'prisma/seed-curriculum-lessons.ts', 'prisma/seed-curriculum-quiz.ts']) {
      assert.ok(!read(path.join(BACKEND, file)).includes('OFFLINE_DEMO'), `${file} references the demo mode`);
    }
  });

  // ---------------------------------------------------------------- summary
  rmSync(WORK, { recursive: true, force: true });
  console.log('\n====================================================');
  console.log('📊 OFFLINE DEMO AI RESULTS');
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
