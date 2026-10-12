/**
 * Signed-out route access, verified offline.
 *
 * Uses the same matcher the middleware uses (lib/route-access.ts), on plain
 * Request objects. No browser, network or Clerk session is involved.
 *
 * Run: npx tsx src/__tests__/verify_route_access.ts
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isPublicRoute } from '../lib/route-access.js';

const BASE = 'https://app.example.test';

// The middleware receives a NextRequest, so the matcher is tested with one too.
function publicFor(path: string): boolean {
  return isPublicRoute(new NextRequest(`${BASE}${path}`));
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, body: () => void): void {
  try {
    body();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

// The public catalogue and the existing public pages.
for (const path of ['/', '/learn', '/learn?search=math', '/sign-in', '/sign-in/factor-one', '/sign-up', '/api/health']) {
  check(`signed-out visitor may open ${path}`, () => assert.equal(publicFor(path), true));
}

// The subject dashboards, course details, lessons, quizzes and results stay protected.
const PROTECTED = [
  '/learn/math',
  '/learnx',
  '/learn-admin',
  '/courses',
  '/courses/class-6-math',
  '/courses/class-6-math/lessons/abc',
  '/courses/class-6-math/lessons/abc/quiz',
  '/courses/class-6-math/lessons/abc/quiz/results/attempt-1',
  '/tutor/session-1',
  '/practice',
  '/onboarding',
  '/me',
  '/api/other'
];

for (const path of PROTECTED) {
  check(`signed-out visitor is redirected from ${path}`, () => assert.equal(publicFor(path), false));
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
}
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length > 0) process.exitCode = 1;
