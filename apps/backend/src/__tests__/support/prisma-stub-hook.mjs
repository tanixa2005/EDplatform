// A module resolution hook for tests. Every import of '@prisma/client' resolves to
// the offline stub instead of the real package.
//
// The real package loads the generated client, and the generated client reads
// apps/backend/.env as soon as it is loaded. Routing the import to the stub keeps
// the real environment file out of every test process.

const STUB_URL = new URL('./prisma-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@prisma/client') {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
