'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserCheck, Shield, Mail, Calendar, LogOut } from 'lucide-react';

function DashboardContent() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-8 border-b border-border/40">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Welcome, {user.firstName} {user.lastName}!
            </h1>
            <Badge variant="success" className="capitalize">
              {user.role.toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Authenticated session active via secure HttpOnly cookie.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => logout()} className="w-fit">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        {/* User Profile Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Account Profile</CardTitle>
            </div>
            <CardDescription>Verified credentials and session attributes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-border/40">
              <span className="text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email
              </span>
              <span className="font-medium text-foreground">{user.email}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/40">
              <span className="text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" /> Role & Permissions
              </span>
              <Badge variant="outline">{user.role}</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/40">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Member Since
              </span>
              <span className="text-foreground">
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Account Status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Phase 2 Verification Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">RBAC & Security</CardTitle>
            <CardDescription>Phase 2 implementation status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>
              🔒 <strong>HttpOnly Cookie:</strong> Auth token is stored securely in an environment-aware HttpOnly cookie (`auth_token`), protecting against client-side script inspection.
            </p>
            <p>
              🛡️ <strong>Argon2id Hashing:</strong> Passwords are encrypted with production-grade Argon2id memory-hard parameters.
            </p>
            <p>
              ✨ <strong>Protected Route:</strong> This view is guarded by <code>ProtectedRoute</code>, verifying session state on mount.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
