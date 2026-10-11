/**
 * Command-line entry point for the production curriculum bootstrap.
 *
 * This file is the only way to start a run. It is not guarded by a "was this
 * the entry point?" check, because that check is what failed silently on
 * Windows. Running this file runs the command, and the exit code always reports
 * what happened:
 *
 *   exit 0   the requested mode ran and every check passed
 *   exit 1   a check refused the run, or something failed; the reason is printed
 *
 * Usage (see the release notes for the approved sequence):
 *   tsx src/tools/production-curriculum/cli.ts --plan
 *   tsx src/tools/production-curriculum/cli.ts --preflight --confirm-production-seed
 *   tsx src/tools/production-curriculum/cli.ts --confirm-production-seed
 */
import { PrismaClient } from '@prisma/client';
import { runProductionCurriculumBootstrap } from './curriculum-bootstrap.js';

async function main(): Promise<void> {
  await runProductionCurriculumBootstrap({
    argv: process.argv.slice(2),
    env: process.env,
    log: (line) => console.log(line),
    makeClient: (url) => new PrismaClient({ datasources: { db: { url } } })
  });
  console.log('  finished: the requested mode ran and passed.');
}

main().then(
  () => {
    process.exitCode = 0;
  },
  (err: unknown) => {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
);
