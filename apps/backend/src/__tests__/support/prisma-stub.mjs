// Offline stand-in for @prisma/client, used only by tests through prisma-stub-hook.mjs.
//
// Constructing the stub does nothing. Any use of it throws, so a test that tries to
// reach a database fails loudly instead of connecting. The real generated client is
// never loaded under test, which also means the environment file it reads is never
// read by a test.

globalThis.__EDP_PRISMA_STUB_LOADED__ = true;

const refuse = () => {
  throw new Error('offline test: a database call was attempted');
};

export class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(_target, key) {
        if (key === 'then') return undefined;
        return refuse();
      }
    });
  }
}

// Only referenced as a type in the application. Present so runtime imports resolve.
export const Prisma = {};
