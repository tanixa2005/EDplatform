'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Moon, Sun, BookOpen, Compass, GraduationCap, LogOut, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';

export function Navbar() {
  const [isDark, setIsDark] = useState(false);
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Check initial dark mode from DOM or user preference
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-foreground">
              ED<span className="text-primary">platform</span>
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link
            href="/courses"
            className="flex items-center space-x-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Compass className="h-4 w-4" />
            <span>Explore Courses</span>
          </Link>
          <Link
            href="/#features"
            className="flex items-center space-x-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span>Platform Features</span>
          </Link>
          <Link
            href="/#ai-tutor"
            className="flex items-center space-x-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI Tutor</span>
          </Link>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {isLoading ? (
            <div className="h-8 w-20 rounded-md bg-muted animate-pulse" />
          ) : user ? (
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link href="/dashboard">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex items-center space-x-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span>Dashboard</span>
                </Button>
              </Link>

              <div className="flex items-center space-x-2 pl-1 border-l border-border/60">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {user.firstName[0]?.toUpperCase()}
                  {user.lastName[0]?.toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-medium text-foreground leading-none">
                    {user.firstName} {user.lastName}
                  </span>
                  <Badge variant="outline" className="mt-1 text-[10px] px-1 py-0 h-4 w-fit">
                    {user.role}
                  </Badge>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Sign out"
                aria-label="Sign out"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Sign In
                </Button>
              </Link>

              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
