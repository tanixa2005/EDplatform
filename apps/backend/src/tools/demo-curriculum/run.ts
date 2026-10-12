import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoModeFromArgv, runDemoBootstrap } from './demo-bootstrap.js';
import { envFilesPresent, locateRepoLayout, refusalMessage, UNVERIFIED_MESSAGE } from './env-guard.js';

/**
 * Runs the demo bootstrap for the given arguments and returns the exit code.
 *
 * The environment-file guard runs here, inside the function, before the Prisma
 * client is imported. So the guard holds however this module is reached: through
 * cli.ts, through a direct import, or through any other caller.
 *
 * This module has no static import of the Prisma client. Importing it loads
 * nothing that reads an environment file. Calling runFromCli is the only way to
 * load Prisma.
 */
export async function runFromCli(argv: readonly string[]): Promise<number> {
  const layout = locateRepoLayout(path.dirname(fileURLToPath(import.meta.url)));
  if (layout === null) {
    console.error(`\n  ${UNVERIFIED_MESSAGE}`);
    return 1;
  }

  const present = envFilesPresent(layout);
  if (present.length > 0) {
    console.error(`\n  ${refusalMessage(present)}`);
    return 1;
  }

  let mode;
  try {
    mode = demoModeFromArgv(argv);
  } catch (err) {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // Plan mode opens no connection and needs no database client, so Prisma is not
  // loaded for it at all. Every other mode loads it only now, after the guard.
  const PrismaClient = mode === 'plan' ? null : (await import('@prisma/client')).PrismaClient;

  try {
    await runDemoBootstrap({
      argv,
      env: process.env,
      log: (line) => console.log(line),
      makeClient: (url) => {
        if (PrismaClient === null) throw new Error('internal: no database client in plan mode');
        return new PrismaClient({ datasources: { db: { url } } });
      }
    });
    console.log('  finished: the requested mode ran and passed.');
    return 0;
  } catch (err) {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
