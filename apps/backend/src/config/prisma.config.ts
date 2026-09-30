import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances of Prisma Client in development during hot-reloading
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
