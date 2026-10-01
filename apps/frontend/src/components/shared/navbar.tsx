'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { EdLogo } from '@/components/shared/ed-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const isActive = (path: string) => {
    if (path === '/courses') {
      return pathname.startsWith('/courses') && !pathname.includes('/lessons/');
    }
    return pathname === path;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm transition-colors">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo: Original progressive 'E' mark + wordmark */}
        <Link href="/" className="flex items-center space-x-2 group">
          <EdLogo size={24} showWordmark={true} />
        </Link>

        {/* Center Navigation: Explore Courses & AI Tutor */}
        <nav className="hidden md:flex items-center space-x-7 text-sm font-semibold">
          <Link
            href="/courses"
            className={`transition-colors py-1 relative ${
              isActive('/courses')
                ? 'text-primary font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                : 'text-foreground/80 hover:text-foreground'
            }`}
          >
            Explore Courses
          </Link>

          <Link
            href="/#ai-tutor"
            className="text-foreground/80 hover:text-foreground transition-colors py-1"
          >
            AI Tutor
          </Link>

          {user && (
            <Link
              href="/my-courses"
              className={`transition-colors py-1 relative ${
                isActive('/my-courses')
                  ? 'text-primary font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-foreground/80 hover:text-foreground'
              }`}
            >
              Learning
            </Link>
          )}

          {user && (user.role === 'INSTRUCTOR' || user.role === 'ADMIN') && (
            <Link
              href="/instructor/courses"
              className={`transition-colors py-1 relative ${
                pathname.startsWith('/instructor')
                  ? 'text-primary font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-foreground/80 hover:text-foreground'
              }`}
            >
              Instructor Studio
            </Link>
          )}
        </nav>

        {/* Right Action Controls: Theme Toggle, Sign In & [Get Started] */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />

          {isLoading ? (
            <div className="h-9 w-20 rounded-md bg-muted animate-pulse" />
          ) : user ? (
            <div className="flex items-center space-x-3">
              <Link href="/dashboard">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex items-center space-x-1.5 font-semibold">
                  <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
                  <span>Dashboard</span>
                </Button>
              </Link>

              <div className="flex items-center space-x-2 pl-2 border-l border-border">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
                  {user.firstName[0]?.toUpperCase()}
                  {user.lastName[0]?.toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-bold text-foreground leading-tight">
                    {user.firstName}
                  </span>
                  <Badge variant="brand" className="text-[9px] px-1 py-0 h-3 w-fit rounded-xs">
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
                className="h-8 w-8 text-muted-foreground hover:text-primary rounded-md"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link
                href="/login"
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors px-2 py-1"
              >
                Sign In
              </Link>

              <Link href="/register">
                <Button size="sm" className="font-semibold bg-primary text-white hover:bg-brand-600 rounded-md px-4 shadow-xs">
                  Get Started
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile Menu Trigger */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden h-9 w-9 text-foreground"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-3">
          <Link
            href="/courses"
            className="block px-3 py-2 rounded-md text-sm font-semibold text-foreground hover:bg-muted"
          >
            Explore Courses
          </Link>

          <Link
            href="/#ai-tutor"
            className="block px-3 py-2 rounded-md text-sm font-semibold text-foreground hover:bg-muted"
          >
            AI Tutor
          </Link>

          {user && (
            <Link
              href="/my-courses"
              className="block px-3 py-2 rounded-md text-sm font-semibold text-foreground hover:bg-muted"
            >
              Learning
            </Link>
          )}

          {user && (user.role === 'INSTRUCTOR' || user.role === 'ADMIN') && (
            <Link
              href="/instructor/courses"
              className="block px-3 py-2 rounded-md text-sm font-semibold text-primary bg-accent"
            >
              Instructor Studio
            </Link>
          )}

          {user && (
            <Link
              href="/dashboard"
              className="block px-3 py-2 rounded-md text-sm font-semibold text-foreground hover:bg-muted"
            >
              My Dashboard
            </Link>
          )}

          {!user && (
            <div className="pt-3 border-t border-border flex flex-col gap-2">
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full justify-center">
                  Sign In
                </Button>
              </Link>
              <Link href="/register" className="w-full">
                <Button className="w-full justify-center bg-primary text-white hover:bg-brand-600">
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
