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
          <p className="text-sm text-muted-foreground font-medium">Loading instructor analytics...</p>
        </div>
      </div>
    );
  }

  // RBAC Access Check
  if (user && user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN') {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive w-fit mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Instructor Access Required</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This dashboard is reserved for Instructors and Administrators. Your account currently has the role of <strong>{user.role}</strong>.
        </p>
        <Link href="/dashboard/student" className="inline-block pt-2">
          <Button className="rounded-md">Go to Student Dashboard</Button>
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
        <h2 className="text-2xl font-bold text-foreground">Analytics Unavailable</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{error || 'Unable to fetch instructor dashboard.'}</p>
        <Button onClick={loadDashboard} className="mt-2 space-x-2 rounded-md">
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { summary, courses, recentEnrollments } = data;

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
                Instructor Hub & Analytics
              </h1>
              <Badge variant="outline" className="text-xs rounded-md border-[#E53935]/30 bg-[#FDE8E7] text-[#B91C1C] font-semibold">
                Instructor
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl leading-relaxed">
              Monitor student engagement, cohort completion trends, and quiz performance across your authored curriculum.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <Link href="/instructor/courses">
              <Button variant="outline" size="sm" className="space-x-1.5 rounded-md h-10 border-border font-medium">
                <Layers className="h-4 w-4" />
                <span>My Courses</span>
              </Button>
            </Link>

            <Link href="/instructor/courses/new">
              <Button size="sm" className="space-x-1.5 rounded-md h-10 bg-[#111111] text-white hover:bg-black font-semibold shadow-xs">
                <Plus className="h-4 w-4" />
                <span>Create Course</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Aggregate Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#FDE8E7] text-primary shrink-0 border border-primary/20">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Authored Courses</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground font-display font-mono">{summary.totalCourses}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    ({summary.publishedCourses} pub / {summary.draftCourses} draft)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#111111] text-white shrink-0">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Enrolled Students</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground font-display font-mono">{summary.totalEnrolledStudents}</span>
                  <span className="text-[11px] text-muted-foreground">total</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 shrink-0 border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Avg. Completion</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground font-display font-mono">{summary.averageCourseCompletion}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border rounded-lg shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-md bg-[#FFF3CD] text-[#7A5A00] shrink-0 border border-[#E7E3D8]">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Quiz Avg Score</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground font-display font-mono">{summary.averageQuizPercentage}%</span>
                  <span className="text-[11px] text-muted-foreground font-mono">({summary.totalQuizAttempts} att.)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Course-by-Course Performance */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground font-display">Course Performance Breakdown</h2>
            <span className="text-xs text-muted-foreground font-mono">{courses.length} courses managed</span>
          </div>

          {courses.length === 0 ? (
            <Card className="border-border rounded-lg p-8 text-center space-y-3 bg-card">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-base font-bold text-foreground">No courses created yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Build your curriculum with modules, video and text lessons, and interactive AI quizzes.
              </p>
              <Link href="/instructor/courses/new" className="inline-block mt-2">
                <Button size="sm" className="rounded-md bg-[#111111] text-white hover:bg-black font-semibold">Create First Course</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((course) => (
                <Card key={course.courseId} className="border-border hover:border-foreground/30 rounded-lg shadow-xs transition-all flex flex-col justify-between overflow-hidden bg-card">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge
                          variant={course.isPublished ? 'default' : 'secondary'}
                          className={`text-[10px] rounded-md ${course.isPublished ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30' : ''}`}
                        >
                          {course.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                        <CardTitle className="text-base font-bold text-foreground leading-snug">
                          {course.title}
                        </CardTitle>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-foreground font-display font-mono">
                          {course.enrollmentCount}
                        </span>
                        <p className="text-[10px] text-muted-foreground">students</p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-border text-center bg-[#FFFDF8] rounded-md my-1 font-mono">
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">Lessons</span>
                        <span className="text-xs font-bold text-foreground">{course.publishedLessonCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">Completed</span>
                        <span className="text-xs font-bold text-emerald-700">{course.completionCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block font-sans">Quiz Avg</span>
                        <span className="text-xs font-bold text-primary">
                          {course.quizAttemptsCount > 0 ? `${course.averageQuizScore}%` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Cohort Average Progress</span>
                        <span className="font-semibold text-foreground font-mono">{course.averageProgress}%</span>
                      </div>
                      <Progress value={course.averageProgress} className="h-1.5" />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
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
                          <Button size="sm" variant="outline" className="h-8 text-xs space-x-1 rounded-md border-border font-medium">
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit Studio</span>
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
            <h3 className="text-base font-bold text-foreground font-display">Recent Student Enrollments</h3>
            <span className="text-xs text-muted-foreground font-mono">Last {recentEnrollments.length} enrollments</span>
          </div>

          {recentEnrollments.length === 0 ? (
            <Card className="border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-card">
              No student enrollments recorded yet.
            </Card>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              {recentEnrollments.map((enr) => (
                <div key={enr.enrollmentId} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-md bg-[#111111] text-white flex items-center justify-center font-bold text-xs border border-border">
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
                      <p className="font-semibold text-foreground text-xs font-mono">{enr.progressPercentage}%</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
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

