'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  DARK_CLASS,
  THEME_COLORS,
  nextTheme,
  readStoredTheme,
  resolveInitialTheme,
  writeStoredTheme,
  type Theme
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Applies the theme to the document.
 *
 * The class is what Tailwind's `darkMode: ['class']` keys off. `colorScheme`
 * is separate and matters: it tells the browser to render its own furniture -
 * scrollbars, form controls, the autofill overlay - dark too. Without it you
 * get a dark page with a white scrollbar.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, theme === 'dark');
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

/**
 * Light/dark for the whole app.
 *
 * The inline script in the root layout has already put the right class on
 * <html> before first paint, so this provider's job is not to set the initial
 * theme - it is to KNOW what the script decided, so the toggle button renders
 * the right icon and label.
 *
 * That is why the initial state is read back from the DOM rather than
 * recomputed: recomputing on the server would render `light` into the HTML
 * and mismatch the class the script just set, which is exactly the hydration
 * error this avoids. The first render on the client therefore agrees with the
 * server's markup, and the effect below reconciles immediately after.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `light` on the server and for the very first client render. The effect
  // corrects it before paint matters, and nothing themed depends on this
  // value - the CSS is already right, driven by the class on <html>.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = readStoredTheme(typeof window === 'undefined' ? null : window.localStorage);
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const initial = resolveInitialTheme(stored, prefersDark);
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  // Follow the system only while the student has made no choice of their own.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme(window.localStorage)) return; // their choice wins
      const updated: Theme = event.matches ? 'dark' : 'light';
      setThemeState(updated);
      applyTheme(updated);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    applyTheme(value);
    writeStoredTheme(value, typeof window === 'undefined' ? null : window.localStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const value = nextTheme(current);
      applyTheme(value);
      writeStoredTheme(value, typeof window === 'undefined' ? null : window.localStorage);
      return value;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
