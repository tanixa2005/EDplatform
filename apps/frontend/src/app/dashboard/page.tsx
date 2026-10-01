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
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-8 border-b border-border">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
              Welcome, {user.firstName} {user.lastName}!
            </h1>
            <Badge variant="outline" className="capitalize text-xs rounded-md border-[#E53935]/30 bg-[#FDE8E7] text-[#B91C1C] font-semibold">
              {user.role.toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-xl">
            Access your role-specific dashboard, active learning paths, or curriculum authoring studio.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => logout()} className="w-fit rounded-md border-border font-medium">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>

      {/* Role Dashboard Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Student Learning Dashboard */}
        <Card className="border-border hover:border-foreground/30 transition-all duration-200 rounded-lg shadow-xs flex flex-col justify-between overflow-hidden bg-card">
          <CardHeader className="p-6 pb-3">
            <div className="p-3 rounded-md bg-[#FDE8E7] text-primary w-fit mb-3 border border-primary/20">
              <GraduationCap className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold text-foreground font-display">
              Student Dashboard
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed">
              Track course progress, resume active lessons, and view quiz score history.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <Link href="/dashboard/student" className="block">
              <Button className="w-full space-x-1.5 text-xs rounded-md bg-[#111111] text-white hover:bg-black font-semibold shadow-xs">
                <span>Open Student Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Instructor Teaching Hub */}
        <Card
          className={`border-border rounded-lg flex flex-col justify-between transition-all duration-200 overflow-hidden bg-card ${
            user.role === 'INSTRUCTOR' || user.role === 'ADMIN'
              ? 'hover:border-foreground/30 shadow-xs'
              : 'opacity-60 bg-muted/20'
          }`}
        >
          <CardHeader className="p-6 pb-3">
            <div className="p-3 rounded-md bg-[#FFF3CD] text-[#7A5A00] w-fit mb-3 border border-[#E7E3D8]">
              <Layers className="h-6 w-6" />
            </div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-lg font-bold text-foreground font-display">
                Instructor Hub
              </CardTitle>
              {user.role === 'STUDENT' && (
                <Badge variant="outline" className="text-[10px] rounded-md border-border">
                  Instructors Only
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed">
              Manage your authored courses, student enrollments, and quiz pass rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {user.role === 'INSTRUCTOR' || user.role === 'ADMIN' ? (
              <Link href="/dashboard/instructor" className="block">
                <Button variant="outline" className="w-full space-x-1.5 text-xs rounded-md border-border font-medium">
                  <span>Open Instructor Hub</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled className="w-full text-xs rounded-md border-border">
                Instructor Role Required
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Admin Platform Analytics */}
        <Card
          className={`border-border rounded-lg flex flex-col justify-between transition-all duration-200 overflow-hidden bg-card ${
            user.role === 'ADMIN'
              ? 'hover:border-foreground/30 shadow-xs'
              : 'opacity-60 bg-muted/20'
          }`}
        >
          <CardHeader className="p-6 pb-3">
            <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 w-fit mb-3 border border-emerald-500/20">
              <Shield className="h-6 w-6" />
            </div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-lg font-bold text-foreground font-display">
                Admin Analytics
              </CardTitle>
              {user.role !== 'ADMIN' && (
                <Badge variant="outline" className="text-[10px] rounded-md border-border">
                  Admin Only
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed">
              Platform-wide user metrics, system activity logs, and course production statistics.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {user.role === 'ADMIN' ? (
              <Link href="/dashboard/admin" className="block">
                <Button variant="outline" className="w-full space-x-1.5 text-xs rounded-md border-border font-medium">
                  <span>Open Admin Analytics</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled className="w-full text-xs rounded-md border-border">
                Administrator Role Required
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Profile Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <Card className="md:col-span-2 rounded-lg border-border shadow-xs overflow-hidden bg-card">
          <CardHeader className="bg-[#FFFDF8] border-b border-border">
            <div className="flex items-center space-x-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-bold font-display">Account Profile</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Verified credentials and session attributes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm p-6">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Mail className="h-4 w-4" /> Email Address
              </span>
              <span className="font-semibold text-foreground text-xs sm:text-sm font-mono">{user.email}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Shield className="h-4 w-4" /> Role & Permissions
              </span>
              <Badge variant="outline" className="rounded-md text-xs border-border">{user.role}</Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Calendar className="h-4 w-4" /> Member Since
              </span>
              <span className="text-foreground text-xs sm:text-sm font-medium font-mono">
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground text-xs">Account Status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Active & Verified
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border shadow-xs overflow-hidden bg-card">
          <CardHeader className="bg-[#FFFDF8] border-b border-border">
            <CardTitle className="text-base font-bold font-display">Security Status</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Architecture verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs text-muted-foreground p-6 leading-relaxed">
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

