import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Stops the demo bootstrap from loading a development or production environment
 * file. The Prisma client loads apps/backend/.env (and would load a root .env if
 * one were configured) as soon as it is imported, so this check must run before
 * anything imports Prisma.
 *
 * This module only checks whether the files exist. It never opens, reads, parses,
 * logs or names their contents. It imports Node built-ins only.
 *
 * Paths come from where this module sits on disk, never from the working
 * directory or from an environment variable, so neither can point the check
 * somewhere else.
 */

const BACKEND_PACKAGE = '@edplatform/backend';
const REPO_PACKAGE_MARKER = 'workspaces';

export interface RepoLayout {
  backendDir: string;
  rootDir: string;
}

/** Walks upward from startDir to the nearest package.json with the given name. */
export function findPackageDir(startDir: string, packageName: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown };
        if (parsed.name === packageName) return dir;
      } catch {
        // An unreadable manifest is not the package we are looking for.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Locates the backend package and the repository root from a module's directory.
 * The source layout (src/tools/...) and the compiled layout (dist/tools/...) both
 * resolve the same way. Returns null when either cannot be verified, so the caller
 * fails closed.
 */
export function locateRepoLayout(moduleDir: string): RepoLayout | null {
  const backendDir = findPackageDir(moduleDir, BACKEND_PACKAGE);
  if (backendDir === null) return null;

  const rootDir = path.resolve(backendDir, '..', '..');
  try {
    const root = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as Record<string, unknown>;
    if (!(REPO_PACKAGE_MARKER in root)) return null;
  } catch {
    return null;
  }
  return { backendDir, rootDir };
}

/**
 * The environment files that exist, named by location only. Never by content.
 */
export function envFilesPresent(layout: RepoLayout): string[] {
  const present: string[] = [];
  if (existsSync(path.join(layout.rootDir, '.env'))) present.push('the repository root');
  if (existsSync(path.join(layout.backendDir, '.env'))) present.push('the backend folder');
  return present;
}

export function refusalMessage(locations: readonly string[]): string {
  return [
    'The demo bootstrap refuses to run here.',
    `An environment file exists in: ${locations.join(' and ')}.`,
    'That file would be loaded by the database client before any demo check runs.',
    'Run the bootstrap from a fresh clone of the repository, which has no .env files,',
    'or from a host where the environment is supplied directly. See DEPLOYMENT.md,',
    'section "Demo curriculum bootstrap". Nothing was loaded or changed.'
  ].join('\n  ');
}

export const UNVERIFIED_MESSAGE = [
  'The demo bootstrap refuses to run here.',
  'Its location in the repository could not be verified, so it cannot prove that',
  'no environment file would be loaded. Run it from a fresh clone of the repository.',
  'Nothing was loaded or changed.'
].join('\n  ');
