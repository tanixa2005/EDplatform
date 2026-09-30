'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  BookOpen,
  Award,
  Layers,
  Activity,
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
          <p className="text-sm text-muted-foreground">Loading platform administration analytics...</p>
        </div>
      </div>
    );
  }

  // Strict RBAC check for ADMIN
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Access Forbidden</h2>
        <p className="mt-2 text-muted-foreground">
          Platform-level administration metrics are restricted to Administrators. Your current role is <strong>{user.role}</strong>.
        </p>
        <Link href="/dashboard" className="inline-block mt-6">
          <Button>Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Platform Analytics Unavailable</h2>
        <p className="mt-2 text-muted-foreground">{error || 'Unable to fetch platform metrics.'}</p>
        <Button onClick={loadAdminDashboard} className="mt-6 space-x-2">
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { summary, recentActivity, recentUsers, recentCourses } = data;

  return (
    <div className="min-h-screen bg-background py-8 sm:py-10">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Platform Administration & Analytics
              </h1>
              <Badge variant="destructive" className="text-xs uppercase tracking-wider">
                Admin
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time platform overview of user growth, course production, enrollments, and quiz activity.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/courses">
              <Button variant="outline" size="sm">
                View All Courses
              </Button>
            </Link>
          </div>
        </div>

        {/* Platform Core Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Total Users</p>
                <span className="text-2xl font-black text-foreground block mt-0.5">
                  {summary.totalUsers}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {summary.totalStudents} st / {summary.totalInstructors} inst / {summary.totalAdmins} adm
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Total Courses</p>
                <span className="text-2xl font-black text-foreground block mt-0.5">
                  {summary.totalCourses}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {summary.publishedCourses} published / {summary.draftCourses} draft
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Platform Enrollments</p>
                <span className="text-2xl font-black text-foreground block mt-0.5">
                  {summary.totalEnrollments}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Across {summary.totalLessons} lessons
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Quiz Attempts</p>
                <span className="text-2xl font-black text-foreground block mt-0.5">
                  {summary.totalQuizAttempts}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Avg: {summary.averagePlatformQuizScore}% ({summary.passedQuizAttempts} passed)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Platform Activity */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Platform Activity Stream</h2>
          </div>

          {recentActivity.length === 0 ? (
            <Card className="border-border/60 p-6 text-center text-xs text-muted-foreground">
              No recent platform activity logged.
            </Card>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
              {recentActivity.map((act) => (
                <div key={act.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                      {act.type === 'USER_REGISTERED' ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <BookOpen className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{act.description}</p>
                      {act.userEmail && (
                        <p className="text-[11px] text-muted-foreground">{act.userEmail}</p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
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
            <h3 className="text-base font-bold text-foreground">Recently Registered Users</h3>
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
              {recentUsers.map((u) => (
                <div key={u.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-foreground">{u.fullName}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {u.role}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{u.email}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block">
                      {u.role === 'INSTRUCTOR'
                        ? `${u.createdCoursesCount} courses`
                        : `${u.enrolledCoursesCount} enrolled`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Courses */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground">Recent Platform Courses</h3>
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
              {recentCourses.map((c) => (
                <div key={c.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-foreground truncate max-w-[180px] sm:max-w-xs">
                        {c.title}
                      </span>
                      <Badge
                        variant={c.isPublished ? 'default' : 'secondary'}
                        className={`text-[9px] ${c.isPublished ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : ''}`}
                      >
                        {c.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Instructor: {c.instructorName}
                    </span>
                  </div>

                  <div className="text-right">
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
