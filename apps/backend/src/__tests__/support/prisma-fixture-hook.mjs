// A module resolution hook for tests. Every import of '@prisma/client' resolves to
// the in-memory fixture stub instead of the real package. See prisma-fixture-stub.mjs.

const STUB_URL = new URL('./prisma-fixture-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@prisma/client') {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
