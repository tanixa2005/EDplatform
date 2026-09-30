'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserRole } from '@edplatform/shared';
import { useAuth } from '@/context/auth-context';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [user, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Verifying credentials...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Access Restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your current account role (
            <span className="font-semibold text-foreground">{user.role}</span>) does not have
            permission to view this page.
          </p>
          <div className="mt-6">
            <Button variant="outline" onClick={() => router.push('/')}>
              Return Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
