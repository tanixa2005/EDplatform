/**
 * Command-line entry point for the demo curriculum bootstrap.
 *
 * This file only forwards the arguments to runFromCli in run.ts. The environment-
 * file guard and the Prisma import both live in run.ts, so this entry point and a
 * direct import of run.ts are equally protected.
 *
 * Usage: see DEPLOYMENT.md, section "Demo curriculum bootstrap".
 */
import { runFromCli } from './run.js';

runFromCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
);
