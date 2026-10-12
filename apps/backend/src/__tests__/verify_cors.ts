/**
 * CORS for the browser frontend, verified offline.
 *
 * Every request here goes to a local server on 127.0.0.1. No test calls Clerk,
 * the database or any other host. The authentication checks send requests with
 * no credentials, which the server rejects before any verification would reach
 * a network service.
 *
 * Run: npm run test:cors
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  CorsConfigError,
  createCorsMiddleware,
  matchAllowedOrigin,
  normaliseOrigin,
  parseAllowedOrigins
} from '../config/cors-origins.js';

const PROD = 'https://e-dplatform.vercel.app';
const PREVIEW = 'https://e-dplatform-fh81hvko1-tanixa.vercel.app';
const LOCAL = 'http://localhost:3000';
const EVIL = 'https://evil.example.com';
/** Another project on the same hosting platform: must never be trusted by pattern. */
const SIBLING = 'https://attacker-project.vercel.app';

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

// Offline isolation helpers. The hook routes @prisma/client to a stub. The empty folder
// is where the suite runs, so any dotenv read resolves there and nowhere else.
const HOOK_URL = new URL('./support/prisma-stub-hook.mjs', import.meta.url).href;
const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ISOLATED_DIR = mkdtempSync(path.join(tmpdir(), 'edp-cors-isolated-'));
const ENV_READS: string[] = [];

/** Records every read of a path ending in .env, from this process, from now on. */
function installEnvReadRecorder(): void {
  const mutable = fs as unknown as { readFileSync: (...args: unknown[]) => unknown };
  const original = mutable.readFileSync;
  mutable.readFileSync = function (file: unknown, ...rest: unknown[]) {
    if (typeof file === 'string' && /\.env$/.test(file)) ENV_READS.push(file);
    return original.call(this, file, ...rest);
  };
}

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

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function send(port: number, method: string, path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ port, close: () => new Promise<void>((done) => server.close(() => done())) });
    });
  });
}

/** A minimal app that uses the real CORS middleware, with the given allowlist. */
async function probeApp(allowed: string[]) {
  const app = express();
  app.use(createCorsMiddleware(allowed));
  app.get('/probe', (_req, res) => {
    res.json({ ok: true });
  });
  return listen(app);
}

const allowOrigin = (reply: Reply) => reply.headers['access-control-allow-origin'];

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🌐 CORS SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. configuration parsing
  await check('Whitespace, trailing slashes and letter case are normalised in CORS_ORIGIN', () => {
    assert.deepEqual(parseAllowedOrigins(` HTTPS://E-DPlatform.vercel.app/ , ${LOCAL}/ `), [
      'https://e-dplatform.vercel.app',
      LOCAL
    ]);
  });

  await check('Several origins are accepted, and a repeated origin is listed once', () => {
    assert.deepEqual(parseAllowedOrigins(`${PROD},${PREVIEW},${PROD}`), [PROD, PREVIEW]);
  });

  await check('A wildcard, a path, a query, a non-web scheme and an empty list are all refused', () => {
    assert.throws(() => parseAllowedOrigins('*'), CorsConfigError);
    assert.throws(() => parseAllowedOrigins(`${PROD}/app`), CorsConfigError);
    assert.throws(() => parseAllowedOrigins(`${PROD}?x=1`), CorsConfigError);
    assert.throws(() => parseAllowedOrigins('ftp://files.example.com'), CorsConfigError);
    assert.throws(() => parseAllowedOrigins(' , '), CorsConfigError);
  });

  await check('A value that is not a URL is refused with a message, not accepted', () => {
    assert.throws(() => normaliseOrigin('not a url'), /not a valid origin/);
  });

  // ---------------------------------------------------------------- 2. matching a request
  await check('An exact match returns that origin, and a look-alike suffix does not match', () => {
    assert.equal(matchAllowedOrigin(PROD, [PROD]), PROD);
    assert.equal(matchAllowedOrigin(`${PROD}.evil.example.com`, [PROD]), null);
    assert.equal(matchAllowedOrigin('https://e-dplatform.vercel.app.evil.com', [PROD]), null);
  });

  await check('A missing Origin or an opaque "null" origin never matches', () => {
    assert.equal(matchAllowedOrigin(undefined, [PROD]), null);
    assert.equal(matchAllowedOrigin('null', [PROD]), null);
  });

  // ---------------------------------------------------------------- 3. the real middleware, over HTTP
  await check('The existing production frontend origin is accepted and echoed back exactly', async () => {
    const server = await probeApp([PROD]);
    try {
      const reply = await send(server.port, 'GET', '/probe', { Origin: PROD });
      assert.equal(reply.status, 200);
      assert.equal(allowOrigin(reply), PROD);
      assert.equal(reply.headers['access-control-allow-credentials'], 'true');
    } finally {
      await server.close();
    }
  });

  await check('The reported preview origin is refused when only production is configured', async () => {
    const server = await probeApp([PROD]);
    try {
      const reply = await send(server.port, 'GET', '/probe', { Origin: PREVIEW });
      assert.equal(allowOrigin(reply), undefined, 'the preview origin was accepted without being configured');
    } finally {
      await server.close();
    }
  });

  await check('The reported preview origin is accepted once it is explicitly configured', async () => {
    const server = await probeApp([PROD, PREVIEW]);
    try {
      const reply = await send(server.port, 'GET', '/probe', { Origin: PREVIEW });
      assert.equal(allowOrigin(reply), PREVIEW);
    } finally {
      await server.close();
    }
  });

  await check('Several configured origins each get their own origin back, not one shared value', async () => {
    const server = await probeApp([PROD, PREVIEW, LOCAL]);
    try {
      assert.equal(allowOrigin(await send(server.port, 'GET', '/probe', { Origin: PROD })), PROD);
      assert.equal(allowOrigin(await send(server.port, 'GET', '/probe', { Origin: PREVIEW })), PREVIEW);
      assert.equal(allowOrigin(await send(server.port, 'GET', '/probe', { Origin: LOCAL })), LOCAL);
    } finally {
      await server.close();
    }
  });

  await check('Unapproved origins are rejected, including another project on the same hosting platform', async () => {
    const server = await probeApp([PROD, PREVIEW]);
    try {
      for (const origin of [EVIL, SIBLING, 'https://e-dplatform.vercel.app.evil.com']) {
        const reply = await send(server.port, 'GET', '/probe', { Origin: origin });
        assert.equal(allowOrigin(reply), undefined, `${origin} was accepted`);
      }
    } finally {
      await server.close();
    }
  });

  await check('The wildcard is never sent, for allowed or refused origins', async () => {
    const server = await probeApp([PROD]);
    try {
      for (const origin of [PROD, EVIL]) {
        assert.notEqual(allowOrigin(await send(server.port, 'GET', '/probe', { Origin: origin })), '*');
      }
    } finally {
      await server.close();
    }
  });

  await check('A preflight from an allowed origin returns the headers a browser needs', async () => {
    const server = await probeApp([PROD, PREVIEW]);
    try {
      const reply = await send(server.port, 'OPTIONS', '/probe', {
        Origin: PREVIEW,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type'
      });
      assert.equal(reply.status, 204);
      assert.equal(allowOrigin(reply), PREVIEW);
      assert.equal(reply.headers['access-control-allow-credentials'], 'true');
      assert.match(String(reply.headers['access-control-allow-methods']), /GET/);
      assert.match(String(reply.headers['access-control-allow-headers']).toLowerCase(), /authorization/);
      assert.match(String(reply.headers.vary), /Origin/i, 'the response does not vary by origin');
    } finally {
      await server.close();
    }
  });

  await check('A preflight from an unapproved origin gets no allow-origin header', async () => {
    const server = await probeApp([PROD]);
    try {
      const reply = await send(server.port, 'OPTIONS', '/probe', {
        Origin: EVIL,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      });
      assert.equal(allowOrigin(reply), undefined);
    } finally {
      await server.close();
    }
  });

  await check('A request with no Origin header is not a cross-origin request, and is served normally', async () => {
    const server = await probeApp([PROD]);
    try {
      const reply = await send(server.port, 'GET', '/probe');
      assert.equal(reply.status, 200);
      assert.equal(allowOrigin(reply), undefined);
    } finally {
      await server.close();
    }
  });

  // ---------------------------------------------------------------- 4. the real application
  // The environment is set before the application is imported, because its
  // configuration is read once, at import. The allowlist here is what the
  // server would read from Render.
  // Offline isolation. The Prisma import resolves to the offline stub, so the generated
  // client (and the .env file it reads) is never loaded, and the working directory is an
  // empty folder, so the environment module's own dotenv read finds nothing in the checkout.
  register(HOOK_URL);
  installEnvReadRecorder();
  process.chdir(ISOLATED_DIR);
  process.env.CORS_ORIGIN = `${PROD},${PREVIEW}`;
  const { createApp } = await import('../app.js');

  let appServer: { port: number; close: () => Promise<void> } | null = null;
  const withApp = async (fn: (port: number) => Promise<void>) => {
    if (!appServer) appServer = await listen(createApp());
    await fn(appServer.port);
  };

  await check('The real application answers a preflight to /me from the configured preview origin', async () => {
    await withApp(async (port) => {
      const reply = await send(port, 'OPTIONS', '/api/v1/me', {
        Origin: PREVIEW,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      });
      assert.equal(reply.status, 204);
      assert.equal(allowOrigin(reply), PREVIEW);
      assert.match(String(reply.headers['access-control-allow-headers']).toLowerCase(), /authorization/);
    });
  });

  await check('The real application refuses a preflight to /me from an unapproved origin', async () => {
    await withApp(async (port) => {
      const reply = await send(port, 'OPTIONS', '/api/v1/me', {
        Origin: EVIL,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      });
      assert.equal(allowOrigin(reply), undefined);
    });
  });

  await check('Authentication is still required for /me: no credentials gives 401, with the origin echoed for the browser', async () => {
    await withApp(async (port) => {
      const reply = await send(port, 'GET', '/api/v1/me', { Origin: PROD });
      assert.equal(reply.status, 401, `expected 401, got ${reply.status}`);
      assert.equal(allowOrigin(reply), PROD, 'the 401 cannot be read by the production frontend');
      assert.ok(!/"email"|"clerkUserId"|"classLevel"/.test(reply.body), 'profile data appeared without a session');
    });
  });

  await check('Authentication is still required for /me from an unapproved origin too', async () => {
    await withApp(async (port) => {
      const reply = await send(port, 'GET', '/api/v1/me', { Origin: EVIL });
      assert.equal(reply.status, 401);
      assert.equal(allowOrigin(reply), undefined);
    });
  });

  if (appServer) await (appServer as { close: () => Promise<void> }).close();

  await check('The offline isolation held: the stub was used and no environment file outside the empty folder was read', () => {
    assert.equal((globalThis as { __EDP_PRISMA_STUB_LOADED__?: boolean }).__EDP_PRISMA_STUB_LOADED__, true, 'the stub was not used');
    for (const read of ENV_READS) {
      assert.ok(path.resolve(read).startsWith(path.resolve(ISOLATED_DIR) + path.sep), 'an environment file outside the empty folder was read');
      assert.ok(path.resolve(read) !== path.resolve(BACKEND, '.env'), 'the backend environment file was read');
    }
  });

  console.log('\n====================================================');
  console.log('📊 CORS RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');
  if (failed > 0) process.exit(1);
  // Windows cannot remove the working directory, so leave it before removing the folder.
  process.chdir(BACKEND);
  rmSync(ISOLATED_DIR, { recursive: true, force: true });
  // Nothing else is open, so the process ends on its own.
  process.exit(0);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
