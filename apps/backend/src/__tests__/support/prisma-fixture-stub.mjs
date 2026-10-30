// Offline stand-in for @prisma/client that serves in-memory fixtures, used only by
// tests through prisma-fixture-hook.mjs.
//
// A test sets globalThis.__EDP_PRISMA_FIXTURE__ to an object of model delegates
// (for example { quizAttempt: { findUnique, update } }). Any model the fixture does
// not provide throws, exactly like prisma-stub.mjs, so a test can never reach a real
// database and an unexpected query fails loudly. The real generated client, and the
// environment file it reads, are never loaded.

globalThis.__EDP_PRISMA_STUB_LOADED__ = true;

export class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(_target, key) {
        if (key === 'then') return undefined;
        const fixture = globalThis.__EDP_PRISMA_FIXTURE__;
        if (fixture && typeof key === 'string' && Object.prototype.hasOwnProperty.call(fixture, key)) {
          return fixture[key];
        }
        throw new Error(`offline test: a database call was attempted (${String(key)})`);
      }
    });
  }
}

// Only referenced as a type in the application. Present so runtime imports resolve.
export const Prisma = {};
