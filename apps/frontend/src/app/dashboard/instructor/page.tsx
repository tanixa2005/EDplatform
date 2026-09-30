'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Users,
  TrendingUp,
  Plus,
  AlertCircle,
  RotateCcw,
  Edit3,
  ExternalLink,
  CheckCircle2,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/context/auth-context';
import { fetchApi } from '@/lib/api';
import { InstructorDashboardDto } from '@edplatform/shared';

function InstructorDashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState<InstructorDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApi<InstructorDashboardDto>('/dashboard/instructor');
      setData(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load instructor analytics';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading instructor analytics...</p>
        </div>
      </div>
    );
  }

  // RBAC Access Check
  if (user && user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Instructor Access Required</h2>
        <p className="mt-2 text-muted-foreground">
          This dashboard is reserved for Instructors and Administrators. Your account currently has the role of <strong>{user.role}</strong>.
        </p>
        <Link href="/dashboard/student" className="inline-block mt-6">
          <Button>Go to Student Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Analytics Unavailable</h2>
        <p className="mt-2 text-muted-foreground">{error || 'Unable to fetch instructor dashboard.'}</p>
        <Button onClick={loadDashboard} className="mt-6 space-x-2">
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { summary, courses, recentEnrollments } = data;

  return (
    <div className="min-h-screen bg-background py-8 sm:py-10">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Instructor Hub & Analytics
              </h1>
              <Badge variant="outline" className="text-xs text-primary border-primary/30">
                Instructor
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor student engagement, enrollment trends, and quiz completion across your courses.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/instructor/courses">
              <Button variant="outline" size="sm" className="space-x-1.5">
                <Layers className="h-4 w-4" />
                <span>My Courses</span>
              </Button>
            </Link>

            <Link href="/instructor/courses/new">
              <Button size="sm" className="space-x-1.5 shadow-sm">
                <Plus className="h-4 w-4" />
                <span>Create Course</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Aggregate Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Authored Courses</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.totalCourses}</span>
                  <span className="text-xs text-muted-foreground">
                    ({summary.publishedCourses} pub / {summary.draftCourses} draft)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Enrolled Students</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.totalEnrolledStudents}</span>
                  <span className="text-xs text-muted-foreground">total</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Avg. Completion</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.averageCourseCompletion}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Quiz Avg Score</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.averageQuizPercentage}%</span>
                  <span className="text-xs text-muted-foreground">({summary.totalQuizAttempts} attempts)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Course-by-Course Performance */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Course Performance Breakdown</h2>
            <span className="text-xs text-muted-foreground">{courses.length} courses managed</span>
          </div>

          {courses.length === 0 ? (
            <Card className="border-border/60 p-8 text-center space-y-3">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
              <h3 className="text-base font-semibold text-foreground">No courses created yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Build your curriculum with modules, video and text lessons, and interactive quizzes.
              </p>
              <Link href="/instructor/courses/new" className="inline-block mt-2">
                <Button size="sm">Create First Course</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((course) => (
                <Card key={course.courseId} className="border-border/60 hover:shadow-md transition-all flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge
                          variant={course.isPublished ? 'default' : 'secondary'}
                          className={`text-[10px] ${course.isPublished ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : ''}`}
                        >
                          {course.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                        <CardTitle className="text-base font-bold text-foreground">
                          {course.title}
                        </CardTitle>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-foreground">
                          {course.enrollmentCount}
                        </span>
                        <p className="text-[10px] text-muted-foreground">students</p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/40 text-center">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Lessons</span>
                        <span className="text-xs font-bold text-foreground">{course.publishedLessonCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Completed</span>
                        <span className="text-xs font-bold text-emerald-600">{course.completionCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Quiz Avg</span>
                        <span className="text-xs font-bold text-primary">
                          {course.quizAttemptsCount > 0 ? `${course.averageQuizScore}%` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Average Cohort Progress</span>
                        <span className="font-semibold text-foreground">{course.averageProgress}%</span>
                      </div>
                      <Progress value={course.averageProgress} className="h-1.5" />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <Link
                        href={`/courses/${course.slug}`}
                        target="_blank"
                        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground space-x-1"
                      >
                        <span>Student View</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>

                      <div className="flex items-center space-x-2">
                        <Link href={`/instructor/courses/${course.courseId}/edit`}>
                          <Button size="sm" variant="outline" className="h-8 text-xs space-x-1">
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit Course</span>
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Enrollments Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Recent Student Enrollments</h3>
            <span className="text-xs text-muted-foreground">Last {recentEnrollments.length} enrollments</span>
          </div>

          {recentEnrollments.length === 0 ? (
            <Card className="border-border/60 p-6 text-center text-xs text-muted-foreground">
              No student enrollments recorded yet.
            </Card>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
              {recentEnrollments.map((enr) => (
                <div key={enr.enrollmentId} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {enr.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{enr.studentName}</p>
                      <p className="text-[11px] text-muted-foreground">{enr.courseTitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right hidden sm:block">
                      <span className="text-[11px] text-muted-foreground">Progress</span>
                      <p className="font-semibold text-foreground text-xs">{enr.progressPercentage}%</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(enr.enrolledAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InstructorDashboardPage() {
  return (
    <ProtectedRoute>
      <InstructorDashboardContent />
    </ProtectedRoute>
  );
}
