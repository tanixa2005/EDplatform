/**
 * The demo bootstrap refuses to load the Prisma client while an environment file
 * exists, whichever way the runner is reached, verified offline.
 *
 * Each case builds a disposable tree shaped like the repository. The tree holds
 * copies of the real entry point, runner, guard and curriculum modules, a stub
 * Prisma package that prints PRISMA_LOADED when it is loaded, and a stub for the
 * one shared value the curriculum needs. Environment files are dummy markers. The
 * real checkout's environment files are never opened, and no database or network
 * is used.
 *
 * Run: npm run test:demo-entry-guard
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..', '..');
const REPO = path.resolve(BACKEND, '..', '..');
const TSX = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const MARKER = 'DUMMY-MARKER-do-not-print-7f3a';

const DEMO_SOURCE = path.join(BACKEND, 'src', 'tools', 'demo-curriculum');
const PRODUCTION_SOURCE = path.join(BACKEND, 'src', 'tools', 'production-curriculum');
const DEMO_FILES = ['cli.ts', 'run.ts', 'env-guard.ts', 'demo-guard.ts', 'demo-bootstrap.ts'];
const PRODUCTION_FILES = ['curriculum-bootstrap.ts', 'curriculum-content.ts'];

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

async function check(test: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: message });
    console.error(`  [FAIL] ${test}: ${message}`);
  }
}

const WORK = mkdtempSync(path.join(tmpdir(), 'edp-entry-guard-'));
let counter = 0;

interface Tree {
  root: string;
  backendDir: string;
  /** Where the copied demo-curriculum files sit. Source or compiled layout. */
  demoDir: string;
}

/**
 * A repository-shaped tree. `layout` chooses source (src/...) or compiled (dist/...)
 * placement. The options drop a package manifest or the workspaces key, so the
 * layout can be made unverifiable.
 */
function makeTree(layout: 'src' | 'dist', options: { rootWorkspaces?: boolean; backendPackage?: boolean } = {}): Tree {
  counter += 1;
  const root = path.join(WORK, `repo-${counter}`);
  const backendDir = path.join(root, 'apps', 'backend');
  const demoDir = path.join(backendDir, layout, 'tools', 'demo-curriculum');
  const productionDir = path.join(backendDir, layout, 'tools', 'production-curriculum');
  mkdirSync(demoDir, { recursive: true });
  mkdirSync(productionDir, { recursive: true });
  mkdirSync(path.join(root, 'docs'), { recursive: true });

  const rootManifest: Record<string, unknown> = { name: 'fixture-root' };
  if (options.rootWorkspaces !== false) rootManifest.workspaces = ['apps/*'];
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(rootManifest));
  if (options.backendPackage !== false) {
    writeFileSync(path.join(backendDir, 'package.json'), JSON.stringify({ name: '@edplatform/backend', type: 'module' }));
  }

  for (const file of DEMO_FILES) copyFileSync(path.join(DEMO_SOURCE, file), path.join(demoDir, file));
  // demo-guard.ts imports the endpoint module from config/, at the same relative place in both layouts.
  const configDir = path.join(backendDir, layout, 'config');
  mkdirSync(configDir, { recursive: true });
  copyFileSync(path.join(BACKEND, 'src', 'config', 'database-endpoints.ts'), path.join(configDir, 'database-endpoints.ts'));
  for (const file of PRODUCTION_FILES) copyFileSync(path.join(PRODUCTION_SOURCE, file), path.join(productionDir, file));
  copyFileSync(path.join(REPO, 'docs', 'curriculum-map.md'), path.join(root, 'docs', 'curriculum-map.md'));

  // Stub shared package: only SUBJECT_LABELS is read at runtime by the curriculum modules.
  const sharedDir = path.join(root, 'node_modules', '@edplatform', 'shared');
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(path.join(sharedDir, 'package.json'), JSON.stringify({ name: '@edplatform/shared', type: 'module', main: 'index.js' }));
  writeFileSync(
    path.join(sharedDir, 'index.js'),
    "export const SUBJECT_LABELS = { MATH: 'Mathematics', SCIENCE: 'Science', SOCIAL_SCIENCE: 'Social Science', ENGLISH: 'English' };\n"
  );

  // Stub Prisma package: announces its load, then exports a client that never connects.
  const prismaDir = path.join(root, 'node_modules', '@prisma', 'client');
  mkdirSync(prismaDir, { recursive: true });
  writeFileSync(path.join(prismaDir, 'package.json'), JSON.stringify({ name: '@prisma/client', main: 'index.js' }));
  writeFileSync(
    path.join(prismaDir, 'index.js'),
    "console.log('PRISMA_LOADED');\nexports.PrismaClient = class PrismaClient { async $disconnect() {} };\n"
  );

  return { root, backendDir, demoDir };
}

function dropEnv(tree: Tree, where: 'root' | 'backend'): void {
  const target = where === 'root' ? path.join(tree.root, '.env') : path.join(tree.backendDir, '.env');
  writeFileSync(target, `${MARKER}=${MARKER}\n`);
}

interface RunResult {
  status: number | null;
  output: string;
}

/** Runs a probe file with tsx, from the given working directory, with a minimal environment. */
function runProbe(probePath: string, cwd: string, args: string[] = []): RunResult {
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP']) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const result = spawnSync(process.execPath, [TSX, probePath, ...args], { cwd, env, encoding: 'utf8', timeout: 180_000 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A probe that imports the runner module and does nothing else. */
function writeImportProbe(tree: Tree, name: string): string {
  const file = path.join(tree.root, `${name}.mts`);
  writeFileSync(file, `await import(${JSON.stringify(pathToFileURL(path.join(tree.demoDir, 'run.ts')).href)});\nconsole.log('IMPORTED');\n`);
  return file;
}

/** A probe that calls the runner with the given arguments and reports the exit code. */
function writeRunProbe(tree: Tree, name: string): string {
  const file = path.join(tree.root, `${name}.mts`);
  writeFileSync(
    file,
    [
      `const run = await import(${JSON.stringify(pathToFileURL(path.join(tree.demoDir, 'run.ts')).href)});`,
      'const code = await run.runFromCli(process.argv.slice(2));',
      "console.log('RUN_EXIT ' + code);",
      'process.exitCode = code;',
      ''
    ].join('\n')
  );
  return file;
}

function assertNoPrisma(output: string): void {
  assert.ok(!output.includes('PRISMA_LOADED'), 'the Prisma client was loaded');
}

function assertNoContents(output: string): void {
  assert.ok(!output.includes(MARKER), 'an environment file was printed');
}

async function runAll(): Promise<void> {
  console.log('\n====================================================');
  console.log('🛡️  DEMO ENTRY POINT ENVIRONMENT-FILE GUARD SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------- 1. the locator and the existence check
  await check('The repository layout is found from source and from compiled locations alike', async () => {
    const { locateRepoLayout } = await import(pathToFileURL(path.join(DEMO_SOURCE, 'env-guard.ts')).href);
    const src = makeTree('src');
    const dist = makeTree('dist');
    const fromSrc = locateRepoLayout(src.demoDir);
    const fromDist = locateRepoLayout(dist.demoDir);
    assert.ok(fromSrc && fromDist, 'the layout was not found');
    assert.equal(fromSrc.backendDir, src.backendDir);
    assert.equal(fromSrc.rootDir, src.root);
    assert.equal(fromDist.backendDir, dist.backendDir);
    assert.equal(fromDist.rootDir, dist.root);
  });

  await check('The layout is not verified when the root has no workspaces, so the guard fails closed', async () => {
    const { locateRepoLayout } = await import(pathToFileURL(path.join(DEMO_SOURCE, 'env-guard.ts')).href);
    const tree = makeTree('src', { rootWorkspaces: false });
    assert.equal(locateRepoLayout(tree.demoDir), null);
  });

  await check('The layout is not verified when no backend package exists, so the guard fails closed', async () => {
    const { locateRepoLayout } = await import(pathToFileURL(path.join(DEMO_SOURCE, 'env-guard.ts')).href);
    const tree = makeTree('src', { backendPackage: false });
    assert.equal(locateRepoLayout(tree.demoDir), null);
  });

  // ---------------------------------------------------------------- 2. importing the runner loads nothing
  await check('Importing run.ts directly loads no Prisma client, with or without environment files', () => {
    const clean = makeTree('src');
    const probe = writeImportProbe(clean, 'import-clean');
    const cleanRun = runProbe(probe, clean.root);
    assert.equal(cleanRun.status, 0, cleanRun.output);
    assert.match(cleanRun.output, /IMPORTED/);
    assertNoPrisma(cleanRun.output);

    const dirty = makeTree('src');
    dropEnv(dirty, 'root');
    dropEnv(dirty, 'backend');
    const dirtyRun = runProbe(writeImportProbe(dirty, 'import-dirty'), dirty.root);
    assertNoPrisma(dirtyRun.output);
    assertNoContents(dirtyRun.output);
  });

  // ---------------------------------------------------------------- 3. calling the runner: guard first, then Prisma
  await check('With no environment file, plan mode runs without loading Prisma at all', () => {
    const tree = makeTree('src');
    const result = runProbe(writeRunProbe(tree, 'plan-clean'), tree.root, ['--plan']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /RUN_EXIT 0/);
    assert.match(result.output, /plan only: no connection was opened/);
    assertNoPrisma(result.output);
  });

  await check('With no environment file, apply mode loads Prisma only after the guard has passed, and the target check then refuses', () => {
    const tree = makeTree('src');
    const result = runProbe(writeRunProbe(tree, 'apply-clean'), tree.root, ['--confirm-demo-seed']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /RUN_EXIT 1/);
    assert.match(result.output, /refusing: set EDP_ALLOW_DEMO_SEED=1/);
    assert.ok(result.output.includes('PRISMA_LOADED'), 'the Prisma client did not load after the guard passed');
  });

  await check('A root .env file refuses plan and apply before Prisma loads, and never prints its contents', () => {
    const tree = makeTree('src');
    dropEnv(tree, 'root');
    for (const args of [['--plan'], ['--confirm-demo-seed'], ['--preflight', '--confirm-demo-seed']]) {
      const result = runProbe(writeRunProbe(tree, 'root-env'), tree.root, args);
      assert.equal(result.status, 1, `${args.join(' ')}: ${result.output}`);
      assert.match(result.output, /An environment file exists in: the repository root/);
      assertNoPrisma(result.output);
      assertNoContents(result.output);
    }
  });

  await check('A backend .env file refuses plan and apply before Prisma loads', () => {
    const tree = makeTree('src');
    dropEnv(tree, 'backend');
    for (const args of [['--plan'], ['--confirm-demo-seed']]) {
      const result = runProbe(writeRunProbe(tree, 'backend-env'), tree.root, args);
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /An environment file exists in: the backend folder/);
      assertNoPrisma(result.output);
      assertNoContents(result.output);
    }
  });

  await check('Both environment files are named, and the run is refused without loading anything', () => {
    const tree = makeTree('src');
    dropEnv(tree, 'root');
    dropEnv(tree, 'backend');
    const result = runProbe(writeRunProbe(tree, 'both-env'), tree.root, ['--confirm-demo-seed']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /the repository root and the backend folder/);
    assertNoPrisma(result.output);
    assertNoContents(result.output);
  });

  await check('The working directory cannot bypass the guard: a file in the repository refuses from any directory', () => {
    const tree = makeTree('src');
    dropEnv(tree, 'root');
    const elsewhere = path.join(WORK, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    const probe = writeRunProbe(tree, 'cwd-probe');
    for (const cwd of [tree.root, tree.backendDir, tree.demoDir, elsewhere, path.parse(WORK).root]) {
      const result = runProbe(probe, cwd, ['--plan']);
      assert.equal(result.status, 1, `cwd ${cwd}: ${result.output}`);
      assertNoPrisma(result.output);
    }
  });

  await check('The compiled layout is guarded the same way: a root .env refuses, and a clean tree is allowed', () => {
    const dirty = makeTree('dist');
    dropEnv(dirty, 'root');
    const refused = runProbe(writeRunProbe(dirty, 'dist-dirty'), dirty.root, ['--plan']);
    assert.equal(refused.status, 1, refused.output);
    assertNoPrisma(refused.output);

    const clean = makeTree('dist');
    const allowed = runProbe(writeRunProbe(clean, 'dist-clean'), clean.root, ['--plan']);
    assert.equal(allowed.status, 0, allowed.output);
    assertNoPrisma(allowed.output);
  });

  await check('An unverifiable location refuses the run before any Prisma load', () => {
    const tree = makeTree('src', { backendPackage: false });
    const result = runProbe(writeRunProbe(tree, 'unverified'), tree.root, ['--confirm-demo-seed']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /could not be verified/);
    assertNoPrisma(result.output);
  });

  // ---------------------------------------------------------------- 4. the entry point
  await check('The entry point refuses with a root or backend .env, and loads nothing', () => {
    const tree = makeTree('src');
    dropEnv(tree, 'backend');
    const result = runProbe(path.join(tree.demoDir, 'cli.ts'), tree.root, ['--plan']);
    assert.equal(result.status, 1, result.output);
    assertNoPrisma(result.output);
    assertNoContents(result.output);
  });

  await check('The entry point allows a clean tree, and reaches the runner', () => {
    const tree = makeTree('src');
    const result = runProbe(path.join(tree.demoDir, 'cli.ts'), tree.root, ['--plan']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /plan only/);
  });

  // ---------------------------------------------------------------- 5. source checks
  await check('run.ts has no static import of the Prisma client, so importing it cannot load Prisma', () => {
    const source = readFileSync(path.join(DEMO_SOURCE, 'run.ts'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*import\s/.test(line)) {
        assert.ok(!/@prisma\/client/.test(line), `a static Prisma import remains: ${line}`);
      }
    }
    assert.match(source, /await import\('@prisma\/client'\)/, 'the Prisma client is not loaded dynamically');
  });

  await check('The entry point and the guard use only Node built-ins and the guard itself, never Prisma', () => {
    for (const file of ['cli.ts', 'env-guard.ts']) {
      const source = readFileSync(path.join(DEMO_SOURCE, file), 'utf8');
      assert.ok(!/@prisma\/client/.test(source), `${file} refers to the Prisma client`);
    }
  });

  await check('The package script for the bootstrap runs the guarded entry point, not the runner', () => {
    const pkg = JSON.parse(readFileSync(path.join(BACKEND, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['demo:bootstrap'], 'tsx src/tools/demo-curriculum/cli.ts');
  });

  rmSync(WORK, { recursive: true, force: true });
  console.log('\n====================================================');
  console.log('📊 DEMO ENTRY GUARD RESULTS');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  rmSync(WORK, { recursive: true, force: true });
  process.exit(1);
});
