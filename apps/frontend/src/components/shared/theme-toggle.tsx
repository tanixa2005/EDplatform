'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { toggleLabel } from '@/lib/theme';

/**
 * One button, in the header, on every screen size.
 *
 * Deliberately not a three-way light/dark/system control: that needs a menu,
 * and a menu is a settings panel for something a student should be able to
 * change without thinking. System preference is still honoured - it just
 * decides the starting point rather than occupying the UI.
 *
 * Both icons are rendered and cross-faded by CSS rather than swapped in
 * JavaScript, so the icon is correct in the server-rendered HTML too: the
 * pre-hydration script has already put `dark` on <html>, and `dark:` variants
 * follow it immediately. Swapping on state would show the wrong icon until
 * hydration.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = toggleLabel(theme);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      // Bigger target on a phone, where this is tapped with a thumb; the
      // header is tight on desktop, where it is clicked with a cursor.
      className="-mr-1 flex h-10 w-10 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9 sm:w-9"
    >
      {/* Sun in light (tap for dark), moon in dark (tap for light). */}
      <Sun className="h-[18px] w-[18px] dark:hidden" aria-hidden />
      <Moon className="hidden h-[18px] w-[18px] dark:block" aria-hidden />
    </button>
  );
}
