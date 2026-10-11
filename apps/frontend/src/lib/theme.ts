/**
 * Theme resolution, kept free of React and of the DOM.
 *
 * The decisions here are small but easy to get subtly wrong - "respect the
 * system setting, but only until the student has chosen" is the kind of rule
 * that quietly regresses. Keeping it as plain functions means it can be tested
 * without a browser, which is why none of this lives inside the provider.
 */

export type Theme = 'light' | 'dark';

/** One key, read by both the provider and the pre-hydration script. */
export const THEME_STORAGE_KEY = 'ed-theme';

/** The class Tailwind's `darkMode: ['class']` looks for on <html>. */
export const DARK_CLASS = 'dark';

/** Browser chrome colour, so the phone status bar matches the page. */
export const THEME_COLORS: Record<Theme, string> = {
  light: '#FFFDF8',
  dark: '#141414'
};

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * Which theme to start in.
 *
 * A stored choice always wins: once a student has picked, their phone
 * switching to night mode at sunset must not overrule them. The system
 * preference is only consulted when nothing has been stored, and the final
 * fallback is light, which is the design the product was drawn in.
 *
 * `stored` is deliberately `unknown`: it comes from localStorage, which can
 * hold anything a previous version - or another tab - put there.
 */
export function resolveInitialTheme(stored: unknown, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

/** What the button says it will do, which is the opposite of where you are. */
export function toggleLabel(current: Theme): string {
  return current === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
}

/**
 * Reads the saved choice without ever throwing.
 *
 * localStorage is not guaranteed: Safari private mode, blocked site data and
 * some embedded webviews throw on access rather than returning null. A theme
 * is a convenience, so it fails back to "no preference" instead of taking the
 * page down with it.
 */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'> | null): Theme | null {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Saves the choice, and shrugs if storage is unavailable. */
export function writeStoredTheme(
  theme: Theme,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* A student who cannot persist the choice still gets it for this visit. */
  }
}

/**
 * The script that runs before first paint.
 *
 * Inlined into <head> so the class is on <html> before the browser paints
 * anything. Without it the page renders light, hydrates, then snaps to dark -
 * the flash this is here to prevent. It is also why it cannot be a React
 * effect: effects run after paint, which is already too late.
 *
 * Self-contained and wrapped in try/catch, because it executes before any
 * framework code and must never be able to block rendering.
 */
export function themeInitScript(): string {
  return `(function(){try{
var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}
var d=s==='dark'||(s!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var e=document.documentElement;
e.classList.toggle(${JSON.stringify(DARK_CLASS)},d);
e.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;
}
