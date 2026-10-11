'use client';

import React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { useTheme } from '@/context/theme-context';

/**
 * Keeps Clerk's own UI in the same theme as the rest of the app.
 *
 * Clerk renders the sign-in, sign-up and account modals itself, so they do not
 * see our CSS variables. Its `appearance.variables` is the supported way to
 * recolour them, and it is passed here from the live theme rather than
 * hard-coded - previously `colorBackground` was fixed at ivory, which would
 * have left a bright white sign-in panel floating on a charcoal page.
 *
 * Deliberately not `@clerk/themes`: that is an extra dependency for a handful
 * of colour variables we already own. These values are the same hsl tokens
 * from globals.css, written as hex because Clerk's variables do not read CSS
 * custom properties.
 */
const CLERK_LIGHT = {
  colorPrimary: '#E53935',
  colorBackground: '#FFFDF8',
  colorText: '#111111',
  colorTextSecondary: '#666666',
  colorInputBackground: '#FFFFFF',
  colorInputText: '#111111',
  borderRadius: '0.5rem'
} as const;

const CLERK_DARK = {
  colorPrimary: '#F05250',
  colorBackground: '#1C1C1C',
  colorText: '#FAF7F0',
  colorTextSecondary: '#A6A6A6',
  colorInputBackground: '#262626',
  colorInputText: '#FAF7F0',
  borderRadius: '0.5rem'
} as const;

export function ClerkThemeBridge({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <ClerkProvider
      appearance={{ variables: theme === 'dark' ? CLERK_DARK : CLERK_LIGHT }}
    >
      {children}
    </ClerkProvider>
  );
}
