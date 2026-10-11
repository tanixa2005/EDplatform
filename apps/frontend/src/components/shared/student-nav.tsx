'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, BookOpen, Zap, User } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { CLASS_LEVEL_LABELS } from '@edplatform/shared';
import { EdLogo } from '@/components/shared/ed-logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useStudent } from '@/context/student-context';

/**
 * Four destinations, deliberately. Ask is home, because the tutor is the product.
 * "My progress" lives inside Me rather than taking a tab of its own: a progress
 * tab is something an adult visits, not an 11-year-old.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Ask', icon: MessageCircle, match: (p: string) => p === '/' || p.startsWith('/tutor') },
  { href: '/learn', label: 'Learn', icon: BookOpen, match: (p: string) => p.startsWith('/learn') || p.startsWith('/courses') },
  { href: '/practice', label: 'Practice', icon: Zap, match: (p: string) => p.startsWith('/practice') },
  { href: '/me', label: 'Me', icon: User, match: (p: string) => p.startsWith('/me') }
] as const;

export function StudentNav() {
  const pathname = usePathname();
  const { profile, isSignedIn } = useStudent();

  const classLabel = profile ? CLASS_LEVEL_LABELS[profile.classLevel] : null;

  return (
    <>
      {/* Top bar: brand, class chip, account */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="ED home">
            <EdLogo size={22} showWordmark />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* In the header rather than the bottom bar: the header is the one
                piece of chrome present on every screen and in both signed-in
                and signed-out states. */}
            <ThemeToggle />

            {classLabel && (
              <Link
                href="/me"
                className="rounded-full border border-border bg-secondary px-3 py-1 text-sm font-semibold text-foreground/80 transition-colors hover:border-primary/40"
              >
                {classLabel}
              </Link>
            )}

            <SignedIn>
              <UserButton
                appearance={{ elements: { avatarBox: 'h-8 w-8' } }}
                userProfileMode="modal"
              />
            </SignedIn>

            <SignedOut>
              <SignInButton mode="modal">
                <Button size="sm" className="font-semibold">
                  Sign in
                </Button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        {/* Desktop navigation sits in the header; on a phone it moves to the bottom. */}
        {isSignedIn && (
          <nav className="mx-auto hidden max-w-3xl items-center gap-1 px-4 pb-2 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* Mobile bottom bar: 48px tap targets, thumb-reachable */}
      {isSignedIn && (
        <nav
          aria-label="Main"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/98 backdrop-blur-sm sm:hidden"
        >
          <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors ${
                    active ? 'text-primary' : 'text-foreground/55'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
