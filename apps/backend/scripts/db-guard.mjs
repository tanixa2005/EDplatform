#!/usr/bin/env node
/**
 * Prisma database safety guard.
 *
 * Every Prisma command that touches a database must go through this wrapper. It
 * resolves the target connection string(s) and refuses to execute unless they
 * point at the one Neon endpoint development work is allowed to use.
 *
 * It NEVER opens a database connection. The check is pure text: read the config
 * file, parse the .env file, parse the URL authority, compare hostnames. Nothing
 * is dialled, and no Prisma Client is ever constructed here.
 *
 * Why this exists: `prisma migrate diff --shadow-database-url <url>` DROPS AND
 * REPLAYS migrations into whatever <url> names. Pointing that at production
 * destroyed the production data on 2026-10-05. The root cause was that the
 * Prisma CLI loads `.env` relative to the current working directory, and the
 * repo-root `.env` points at production while `apps/backend/.env` points at the
 * phase1-development branch.
 *
 * Three independent protections follow from that:
 *   1. Allowlist - the resolved endpoint must be exactly the expected one.
 *   2. Denylist  - the known production endpoint is refused outright, so the
 *                  guard still fails safely if the allowlist is misconfigured.
 *   3. Working directory - the npm scripts that call this run with
 *      cwd = apps/backend, so the correct .env resolves by construction.
 *      Running this file from the repo root resolves the root .env, which is
 *      production, and both the allowlist and denylist abort loudly.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Non-secret config file holding EDP_DB_EXPECT_HOST. Resolved relative to this
 * script, not the cwd, so the guard always finds its own rules.
 */
const GUARD_CONFIG_PATH = path.resolve(scriptDir, '..', 'db-guard.env');

/**
 * Endpoints that must never be the target of a Prisma database command, checked
 * as a case-insensitive substring so it covers both the direct and the "-pooler"
 * hostname of the same Neon branch.
 *
 * This is the second line of defence. The allowlist below is the first.
 */
const PRODUCTION_HOST_FRAGMENTS = [
  'ep-dark-flower-azql23vb' // Neon production branch - never touch
];

/**
 * Prisma subcommands that can destroy data. Blocked outright; set
 * EDP_ALLOW_DESTRUCTIVE=1 to override, which should only ever happen against a
 * throwaway database you are willing to lose.
 */
const DESTRUCTIVE_COMMANDS = [
  ['migrate', 'reset'],
  ['migrate', 'dev'],
  ['db', 'push'],
  ['db', 'execute']
];

/** CLI flags whose value is a database connection string. */
const URL_FLAGS = ['--shadow-database-url', '--from-url', '--to-url'];

/** Environment variables that may carry a connection string. */
const ENV_URL_KEYS = ['DATABASE_URL', 'SHADOW_DATABASE_URL', 'DIRECT_DATABASE_URL'];

function fail(message, ...details) {
  console.error('\n  ✖ DATABASE GUARD: refusing to run\n');
  console.error(`    ${message}`);
  for (const detail of details) {
    if (detail) console.error(`    ${detail}`);
  }
  console.error('\n    Nothing was executed and no database connection was opened.\n');
  process.exit(1);
}

/** Parses a KEY=value file without touching process.env. */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    return dotenv.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The expected Neon endpoint id. An explicit environment variable wins, then the
 * committed config file. Unresolvable means abort: fail closed.
 */
function resolveExpectedHost() {
  const fromProcess = process.env.EDP_DB_EXPECT_HOST;
  if (fromProcess && fromProcess.trim() !== '') return fromProcess.trim().toLowerCase();

  const fromFile = parseEnvFile(GUARD_CONFIG_PATH).EDP_DB_EXPECT_HOST;
  if (fromFile && fromFile.trim() !== '') return fromFile.trim().toLowerCase();

  return fail(
    'EDP_DB_EXPECT_HOST is not set, so no database target can be approved.',
    `Expected it in the environment or in ${GUARD_CONFIG_PATH}`
  );
}

/**
 * Resolves a connection-string variable using dotenv's real precedence: a value
 * already present in the environment wins, because dotenv does not override.
 * The .env file is read relative to the cwd, mirroring the Prisma CLI.
 */
function resolveEnvUrl(key, fileEnv) {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim() !== '') return fromProcess.trim();
  const fromFile = fileEnv[key];
  return fromFile && fromFile.trim() !== '' ? fromFile.trim() : null;
}

/**
 * Extracts the hostname from a connection string by string parsing only.
 * Deliberately not `new URL()`, and deliberately never a connection.
 */
function hostOf(url) {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(url);
  if (!match) return null;
  const authority = match[1];
  // Strip userinfo, then the port.
  const hostPort = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  const host = hostPort.replace(/:\d+$/, '').trim().toLowerCase();
  return host === '' ? null : host;
}

/**
 * The Neon endpoint id is the first DNS label, e.g.
 * "ep-young-moon-azdhrnrr-pooler.c-3.ap-southeast-1.aws.neon.tech"
 *   -> label "ep-young-moon-azdhrnrr-pooler"
 *   -> base  "ep-young-moon-azdhrnrr"
 *
 * The "-pooler" variant is accepted because it is a different hostname for the
 * same branch, and the configured phase1-development DATABASE_URL uses it.
 */
function endpointOf(hostname) {
  const label = hostname.split('.')[0];
  const isPooled = label.endsWith('-pooler');
  return {
    label,
    base: isPooled ? label.slice(0, -'-pooler'.length) : label,
    isPooled
  };
}

/** Hides credentials so a connection string is safe to print. */
function mask(url) {
  return url.replace(/:\/\/[^@/]*@/, '://***:***@');
}

/**
 * Applies both checks to one target. Denylist first, so a production URL is
 * reported as production even if the allowlist were misconfigured to permit it.
 */
function assertTargetAllowed(label, url, expectedHost) {
  const host = hostOf(url);

  if (!host) {
    fail(
      `Could not determine the database host for ${label}.`,
      `Value: ${mask(url)}`,
      'An unparseable target is not a safe target.'
    );
  }

  const forbidden = PRODUCTION_HOST_FRAGMENTS.find((fragment) => host.includes(fragment));
  if (forbidden) {
    fail(
      `${label} resolves to the PRODUCTION database.`,
      `Host: ${host}`,
      `Matched forbidden endpoint "${forbidden}".`
    );
  }

  const endpoint = endpointOf(host);
  if (endpoint.base !== expectedHost) {
    fail(
      `${label} is not the approved development database.`,
      `Host:     ${host}`,
      `Endpoint: ${endpoint.base}${endpoint.isPooled ? ' (via -pooler)' : ''}`,
      `Expected: ${expectedHost} (or ${expectedHost}-pooler)`
    );
  }

  return { host, endpoint };
}

/** Collects every connection string this invocation would target. */
function collectTargets(args, fileEnv) {
  const targets = [];

  for (const key of ENV_URL_KEYS) {
    const url = resolveEnvUrl(key, fileEnv);
    if (url) targets.push({ label: `env ${key}`, url });
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    for (const flag of URL_FLAGS) {
      if (arg === flag) {
        const value = args[i + 1];
        if (!value || value.startsWith('--')) {
          fail(`${flag} was given without a value.`);
        }
        targets.push({ label: `flag ${flag}`, url: value });
      } else if (arg.startsWith(`${flag}=`)) {
        targets.push({ label: `flag ${flag}`, url: arg.slice(flag.length + 1) });
      }
    }
  }

  return targets;
}

function assertNotDestructive(args) {
  if (process.env.EDP_ALLOW_DESTRUCTIVE === '1') return;

  const positional = args.filter((arg) => !arg.startsWith('-'));
  for (const command of DESTRUCTIVE_COMMANDS) {
    const matches = command.every((part, index) => positional[index] === part);
    if (matches) {
      fail(
        `"prisma ${command.join(' ')}" can destroy data and is blocked.`,
        'Use "npm run db:deploy" (forward-only migrate deploy) instead.'
      );
    }
  }
}

function resolvePrismaEntry() {
  try {
    const pkgPath = require.resolve('prisma/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const binRelative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
    if (!binRelative) return null;
    return path.join(path.dirname(pkgPath), binRelative);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const printOnly = args[0] === '--print';
  const prismaArgs = printOnly ? args.slice(1) : args;

  const expectedHost = resolveExpectedHost();
  const fileEnv = parseEnvFile(path.resolve(process.cwd(), '.env'));
  const targets = collectTargets(prismaArgs, fileEnv);

  if (targets.length === 0) {
    fail(
      'No DATABASE_URL could be resolved.',
      `Looked in process.env and ${path.resolve(process.cwd(), '.env')}`
    );
  }

  // Check every target before running anything at all.
  const checked = targets.map((target) => ({
    ...target,
    ...assertTargetAllowed(target.label, target.url, expectedHost)
  }));

  if (!printOnly) assertNotDestructive(prismaArgs);

  console.log('  ✔ database guard passed');
  console.log(`      expected endpoint          -> ${expectedHost} (or -pooler)`);
  for (const target of checked) {
    console.log(`      ${target.label.padEnd(26)} -> ${target.host}`);
  }
  console.log(`      cwd                        -> ${process.cwd()}`);

  if (printOnly) {
    process.exit(0);
  }

  if (prismaArgs.length === 0) {
    fail('No Prisma command was given.', 'Example: npm run db:status');
  }

  const prismaEntry = resolvePrismaEntry();
  if (!prismaEntry) {
    fail('Could not locate the local Prisma CLI.', 'Is "prisma" installed?');
  }

  console.log(`\n  $ prisma ${prismaArgs.join(' ')}\n`);

  // No shell: args are passed through verbatim, so quoting and spaces are safe
  // on Windows and POSIX alike.
  const result = spawnSync(process.execPath, [prismaEntry, ...prismaArgs], {
    stdio: 'inherit'
  });

  process.exit(result.status ?? 1);
}

main();
