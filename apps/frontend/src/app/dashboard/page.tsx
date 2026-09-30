'use client';

import React from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  UserCheck,
  Shield,
  Mail,
  Calendar,
  LogOut,
  GraduationCap,
  Layers,
  ArrowRight
} from 'lucide-react';

function DashboardContent() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
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
            Access your role-specific dashboard, course progress, and teaching analytics.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => logout()} className="w-fit">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>

      {/* Role Dashboard Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Student Learning Dashboard */}
        <Card className="border-border/60 hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex flex-col justify-between">
          <CardHeader className="p-5 pb-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary w-fit mb-3">
              <GraduationCap className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold text-foreground">
              Student Dashboard
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Track course progress, continue active lessons, and view quiz score history.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Link href="/dashboard/student" className="block">
              <Button className="w-full space-x-1.5 text-xs">
                <span>Open Student Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Instructor Teaching Hub */}
        <Card
          className={`border-border/60 flex flex-col justify-between transition-all ${
            user.role === 'INSTRUCTOR' || user.role === 'ADMIN'
              ? 'hover:border-blue-500/50 shadow-sm hover:shadow-md'
              : 'opacity-60 bg-muted/20'
          }`}
        >
          <CardHeader className="p-5 pb-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 w-fit mb-3">
              <Layers className="h-6 w-6" />
            </div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-lg font-bold text-foreground">
                Instructor Hub
              </CardTitle>
              {user.role === 'STUDENT' && (
                <Badge variant="outline" className="text-[10px]">
                  Instructors Only
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Manage your authored courses, student enrollments, and quiz pass rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {user.role === 'INSTRUCTOR' || user.role === 'ADMIN' ? (
              <Link href="/dashboard/instructor" className="block">
                <Button variant="outline" className="w-full space-x-1.5 text-xs">
                  <span>Open Instructor Hub</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled className="w-full text-xs">
                Instructor Role Required
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Admin Platform Analytics */}
        <Card
          className={`border-border/60 flex flex-col justify-between transition-all ${
            user.role === 'ADMIN'
              ? 'hover:border-purple-500/50 shadow-sm hover:shadow-md'
              : 'opacity-60 bg-muted/20'
          }`}
        >
          <CardHeader className="p-5 pb-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 w-fit mb-3">
              <Shield className="h-6 w-6" />
            </div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-lg font-bold text-foreground">
                Admin Analytics
              </CardTitle>
              {user.role !== 'ADMIN' && (
                <Badge variant="outline" className="text-[10px]">
                  Admin Only
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Platform-wide user metrics, system activity logs, and course production statistics.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {user.role === 'ADMIN' ? (
              <Link href="/dashboard/admin" className="block">
                <Button variant="outline" className="w-full space-x-1.5 text-xs">
                  <span>Open Admin Analytics</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled className="w-full text-xs">
                Administrator Role Required
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Profile Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Security & Architecture</CardTitle>
            <CardDescription>Platform security status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>
              🔒 <strong>HttpOnly Cookie:</strong> Auth session token stored securely in <code>auth_token</code> cookie.
            </p>
            <p>
              🛡️ <strong>RBAC Guards:</strong> Server-side authorization enforces strict separation between student, instructor, and admin boundaries.
            </p>
            <p>
              📊 <strong>Server-Calculated Analytics:</strong> Course completion and progress are computed securely from database records.
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
