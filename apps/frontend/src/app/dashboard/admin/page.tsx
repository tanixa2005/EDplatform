'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  BookOpen,
  Award,
  Layers,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/context/auth-context';
import { fetchApi } from '@/lib/api';
import { AdminDashboardDto } from '@edplatform/shared';

function AdminDashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdminDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApi<AdminDashboardDto>('/dashboard/admin');
      setData(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load platform analytics';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground font-medium">Loading platform administration analytics...</p>
        </div>
      </div>
    );
  }

  // Strict RBAC check for ADMIN
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive w-fit mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Access Forbidden</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Platform-level administration metrics are restricted to Administrators. Your current role is <strong>{user.role}</strong>.
        </p>
        <Link href="/dashboard" className="inline-block pt-2">
          <Button className="rounded-md">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive w-fit mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Platform Analytics Unavailable</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{error || 'Unable to fetch platform metrics.'}</p>
        <Button onClick={loadAdminDashboard} className="mt-2 space-x-2 rounded-md">
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { summary, recentActivity, recentUsers, recentCourses } = data;

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
                Platform Administration & Analytics
              </h1>
              <Badge variant="outline" className="text-xs uppercase tracking-wider rounded-md px-2.5 border-[#E53935]/30 bg-[#FDE8E7] text-[#B91C1C] font-semibold">
                Admin
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl leading-relaxed">
              Real-time platform overview of user registrations, course authoring, enrollments, and quiz completions.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <Link href="/courses">
              <Button variant="outline" size="sm" className="rounded-md h-10 border-border font-medium">
                View All Courses
              </Button>
            </Link>
          </div>
        </div>

        {/* Platform Core Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#111111] text-white shrink-0">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Total Users</p>
                <span className="text-2xl font-black text-foreground font-display block mt-0.5 font-mono">
                  {summary.totalUsers}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {summary.totalStudents} st &bull; {summary.totalInstructors} inst &bull; {summary.totalAdmins} adm
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#FDE8E7] text-primary shrink-0 border border-primary/20">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Total Courses</p>
                <span className="text-2xl font-black text-foreground font-display block mt-0.5 font-mono">
                  {summary.totalCourses}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {summary.publishedCourses} pub / {summary.draftCourses} draft
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 shrink-0 border border-emerald-500/20">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Platform Enrollments</p>
                <span className="text-2xl font-black text-foreground font-display block mt-0.5 font-mono">
                  {summary.totalEnrollments}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Across {summary.totalLessons} lessons
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#FFF3CD] text-[#7A5A00] shrink-0 border border-[#E7E3D8]">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Quiz Attempts</p>
                <span className="text-2xl font-black text-foreground font-display block mt-0.5 font-mono">
                  {summary.totalQuizAttempts}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Avg: {summary.averagePlatformQuizScore}% ({summary.passedQuizAttempts} passed)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Platform Activity */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <h2 className="text-lg font-bold text-foreground font-display">Platform Activity Stream</h2>
          </div>

          {recentActivity.length === 0 ? (
            <Card className="border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-card">
              No recent platform activity logged.
            </Card>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              {recentActivity.map((act) => (
                <div key={act.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-md bg-[#FDE8E7] text-primary shrink-0 border border-primary/20">
                      {act.type === 'USER_REGISTERED' ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <BookOpen className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{act.description}</p>
                      {act.userEmail && (
                        <p className="text-[11px] text-muted-foreground font-mono">{act.userEmail}</p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                    {new Date(act.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side-by-Side: Recent Users & Recent Courses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Users */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground font-display">Recently Registered Users</h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              {recentUsers.map((u) => (
                <div key={u.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-foreground">{u.fullName}</span>
                      <Badge variant="outline" className="text-[10px] uppercase rounded-md border-border font-mono">
                        {u.role}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">{u.email}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block font-medium font-mono">
                      {u.role === 'INSTRUCTOR'
                        ? `${u.createdCoursesCount} courses`
                        : `${u.enrolledCoursesCount} enrolled`}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Courses */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground font-display">Recent Platform Courses</h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              {recentCourses.map((c) => (
                <div key={c.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-foreground truncate max-w-[180px] sm:max-w-xs">
                        {c.title}
                      </span>
                      <Badge
                        variant={c.isPublished ? 'default' : 'secondary'}
                        className={`text-[9px] rounded-md ${c.isPublished ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30' : ''}`}
                      >
                        {c.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Instructor: {c.instructorName}
                    </span>
                  </div>

                  <div className="text-right font-mono">
                    <span className="font-bold text-foreground text-xs block">
                      {c.enrollmentCount} enrolled
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.lessonCount} lessons
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute>
      <AdminDashboardContent />
    </ProtectedRoute>
  );
}

