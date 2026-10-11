/**
 * Theme behaviour, verified without a browser.
 *
 * The rules that are easy to regress are the decisions, not the CSS: whose
 * preference wins, what happens when storage throws, and whether the
 * pre-paint script agrees with the provider. Those all live in lib/theme.ts
 * as plain functions precisely so they can be checked here.
 *
 * What this cannot cover - that the class actually repaints the page, that
 * nothing flashes, that no text is unreadable - is covered in the browser.
 *
 * Run: npx tsx src/__tests__/verify_theme.ts
 */
import assert from 'node:assert/strict';
import {
  DARK_CLASS,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  readStoredTheme,
  resolveInitialTheme,
  themeInitScript,
  toggleLabel,
  writeStoredTheme,
  type Theme
} from '../lib/theme.js';

const RESULTS: { test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

function check(test: string, fn: () => void) {
  try {
    fn();
    RESULTS.push({ test, status: 'PASSED' });
    console.log(`  [PASS] ${test}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    RESULTS.push({ test, status: 'FAILED', error: msg });
    console.error(`  [FAIL] ${test}: ${msg}`);
  }
}

/** A localStorage stand-in, optionally one that throws like a private window. */
function fakeStorage(initial?: Record<string, string>, throws = false) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      if (throws) throw new Error('storage disabled');
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (throws) throw new Error('storage disabled');
      data.set(key, value);
    },
    dump: () => Object.fromEntries(data)
  };
}

console.log('====================================================');
console.log('ED THEME SUITE');
console.log('====================================================\n');

console.log('[SUITE 1] Choosing the initial theme');

check('With no stored choice, the system preference decides', () => {
  assert.equal(resolveInitialTheme(null, true), 'dark');
  assert.equal(resolveInitialTheme(null, false), 'light');
});

check('A stored choice overrides the system preference in both directions', () => {
  // The regression that matters: a student who picked light must not be
  // flipped to dark when their phone switches to night mode.
  assert.equal(resolveInitialTheme('light', true), 'light');
  assert.equal(resolveInitialTheme('dark', false), 'dark');
});

check('Junk in storage is ignored rather than trusted', () => {
  for (const junk of ['', 'DARK', 'system', '0', 'null', 42, {}, [], undefined, null]) {
    const resolved = resolveInitialTheme(junk, false);
    assert.equal(resolved, 'light', `"${String(junk)}" produced ${resolved}`);
  }
  assert.equal(resolveInitialTheme('nonsense', true), 'dark');
});

check('Light is the final fallback when nothing is known', () => {
  assert.equal(resolveInitialTheme(undefined, false), 'light');
});

console.log('\n[SUITE 2] Switching and labelling');

check('Toggling alternates and returns to where it started', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme(nextTheme('light')), 'light');
});

check('The accessible name describes the destination, not the current state', () => {
  // "Switch to dark mode" while light. Naming the current state would tell a
  // screen-reader user the opposite of what the button does.
  assert.equal(toggleLabel('light'), 'Switch to dark mode');
  assert.equal(toggleLabel('dark'), 'Switch to light mode');
});

check('isTheme accepts exactly the two themes', () => {
  assert.equal(isTheme('light'), true);
  assert.equal(isTheme('dark'), true);
  for (const bad of ['Light', 'auto', '', null, undefined, 1]) {
    assert.equal(isTheme(bad), false, `isTheme accepted ${String(bad)}`);
  }
});

console.log('\n[SUITE 3] Persistence');

check('A choice is written and read back', () => {
  const storage = fakeStorage();
  writeStoredTheme('dark', storage);
  assert.equal(storage.dump()[THEME_STORAGE_KEY], 'dark');
  assert.equal(readStoredTheme(storage), 'dark');
});

check('A later choice replaces the earlier one', () => {
  const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' });
  writeStoredTheme('light', storage);
  assert.equal(readStoredTheme(storage), 'light');
});

check('Unreadable storage degrades to "no preference" instead of throwing', () => {
  // Safari private mode and blocked site data throw on access. A theme is a
  // convenience; it must never be able to take the page down.
  const hostile = fakeStorage({}, true);
  assert.doesNotThrow(() => readStoredTheme(hostile));
  assert.equal(readStoredTheme(hostile), null);
  assert.doesNotThrow(() => writeStoredTheme('dark', hostile));
  // And with no stored value, the system preference still applies.
  assert.equal(resolveInitialTheme(readStoredTheme(hostile), true), 'dark');
});

check('A missing storage object is handled like unreadable storage', () => {
  assert.equal(readStoredTheme(null), null);
  assert.equal(readStoredTheme(undefined), null);
  assert.doesNotThrow(() => writeStoredTheme('dark', null));
});

console.log('\n[SUITE 4] The pre-paint script');

const script = themeInitScript();

check('The script reads the same storage key the provider writes', () => {
  assert.ok(
    script.includes(JSON.stringify(THEME_STORAGE_KEY)),
    'the inline script and the provider would disagree about where the choice lives'
  );
});

check('The script sets the class Tailwind is configured to look for', () => {
  assert.ok(script.includes(JSON.stringify(DARK_CLASS)));
  assert.ok(script.includes('classList.toggle'));
});

check('The script consults the system preference', () => {
  assert.ok(script.includes('prefers-color-scheme: dark'));
});

check('The script sets colorScheme so browser chrome follows', () => {
  // Without this the page is dark but the scrollbar and form controls are not.
  assert.ok(script.includes('colorScheme'));
});

check('The script cannot throw, even before any framework has loaded', () => {
  assert.ok(script.includes('try{'), 'the script is not guarded');
  assert.ok(script.includes('catch'), 'the script has no catch');
  // Executing it against a stub must not throw for any storage state.
  for (const stored of ['dark', 'light', 'rubbish', null]) {
    const run = new Function('window', 'document', 'localStorage', script);
    const classes = new Set<string>();
    const element = {
      classList: {
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        }
      },
      style: {} as { colorScheme?: string }
    };
    const win = { matchMedia: () => ({ matches: false }) };
    const doc = { documentElement: element };
    const store = { getItem: () => stored };
    assert.doesNotThrow(() => run(win, doc, store));
    const expected = stored === 'dark';
    assert.equal(
      classes.has(DARK_CLASS),
      expected,
      `stored="${String(stored)}" produced dark=${classes.has(DARK_CLASS)}`
    );
    assert.equal(element.style.colorScheme, expected ? 'dark' : 'light');
  }
});

check('The script agrees with resolveInitialTheme for every input', () => {
  // The two must never drift: the script decides the first paint, the
  // provider decides everything after it.
  for (const stored of ['dark', 'light', 'rubbish', null]) {
    for (const prefersDark of [true, false]) {
      const run = new Function('window', 'document', 'localStorage', script);
      const classes = new Set<string>();
      const element = {
        classList: {
          toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name))
        },
        style: {} as { colorScheme?: string }
      };
      run(
        { matchMedia: () => ({ matches: prefersDark }) },
        { documentElement: element },
        { getItem: () => stored }
      );
      const fromScript: Theme = classes.has(DARK_CLASS) ? 'dark' : 'light';
      const fromProvider = resolveInitialTheme(stored, prefersDark);
      assert.equal(
        fromScript,
        fromProvider,
        `stored="${String(stored)}" prefersDark=${prefersDark}: script said ${fromScript}, provider said ${fromProvider}`
      );
    }
  }
});

check('Both themes declare a browser-chrome colour', () => {
  assert.match(THEME_COLORS.light, /^#[0-9A-Fa-f]{6}$/);
  assert.match(THEME_COLORS.dark, /^#[0-9A-Fa-f]{6}$/);
  assert.notEqual(THEME_COLORS.light, THEME_COLORS.dark);
});

console.log('\n====================================================');
const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
console.log('📊 THEME SUITE RESULTS');
console.log('====================================================');
console.log(`Total Tests Run: ${RESULTS.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================\n');

if (failed > 0) process.exit(1);
