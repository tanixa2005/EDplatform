'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Award,
  Clock,
  Play,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/context/auth-context';
import { fetchApi } from '@/lib/api';
import { StudentDashboardDto } from '@edplatform/shared';

function StudentDashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApi<StudentDashboardDto>('/dashboard/student');
      setData(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
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
          <p className="text-sm text-muted-foreground">Loading your learning dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Dashboard Unavailable</h2>
        <p className="mt-2 text-muted-foreground">{error || 'Unable to fetch your dashboard.'}</p>
        <Button onClick={loadDashboard} className="mt-6 space-x-2">
          <RotateCcw className="h-4 w-4" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { summary, courses, recentActivities, recentQuizAttempts, continueLearning } = data;

  return (
    <div className="min-h-screen bg-background py-8 sm:py-10">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Welcome back, {user?.firstName}! 👋
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your course progress, resume active lessons, and view quiz achievements.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/courses">
              <Button variant="outline" size="sm" className="space-x-1.5">
                <BookOpen className="h-4 w-4" />
                <span>Browse Courses</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Enrolled Courses</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.totalEnrolledCourses}</span>
                  {summary.completedCourses > 0 && (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      {summary.completedCourses} completed
                    </Badge>
                  )}
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
                <p className="text-xs font-semibold text-muted-foreground">Completed Lessons</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.totalLessonsCompleted}</span>
                  {summary.totalLessonsInProgress > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({summary.totalLessonsInProgress} in progress)
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center space-x-4">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Quizzes Passed</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.quizzesPassed}</span>
                  <span className="text-xs text-muted-foreground">/ {summary.quizzesAttempted} attempted</span>
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
                <p className="text-xs font-semibold text-muted-foreground">Avg. Quiz Score</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-foreground">{summary.averageQuizPercentage}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Continue Learning Strip */}
        {continueLearning.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Continue Learning</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {continueLearning.map((item) => (
                <Card
                  key={item.lessonId}
                  className="border-primary/20 bg-primary/5 hover:border-primary/40 transition-all shadow-sm hover:shadow flex flex-col justify-between"
                >
                  <CardHeader className="p-4 pb-2">
                    <Badge variant="outline" className="w-fit text-[10px] text-primary border-primary/30 mb-1 truncate max-w-[240px]">
                      {item.courseTitle}
                    </Badge>
                    <CardTitle className="text-base font-bold text-foreground leading-snug line-clamp-1">
                      {item.lessonTitle}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground truncate">
                      {item.moduleTitle}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                        <span>Progress</span>
                        <span>{item.coveragePercentage}% watched</span>
                      </div>
                      <Progress value={item.coveragePercentage} className="h-1.5" />
                    </div>

                    <Link href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`} className="block">
                      <Button size="sm" className="w-full space-x-1.5 text-xs">
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Resume Lesson</span>
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Enrolled Courses Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">My Enrolled Courses</h2>
            <span className="text-xs text-muted-foreground">{courses.length} courses enrolled</span>
          </div>

          {courses.length === 0 ? (
            <Card className="border-border/60 p-8 text-center space-y-3">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
              <h3 className="text-base font-semibold text-foreground">No course enrollments yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Explore our rich curriculum of courses, enroll in topics of interest, and begin your journey.
              </p>
              <Link href="/courses" className="inline-block mt-2">
                <Button size="sm">Browse Courses</Button>
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
                          variant={course.isCompleted ? 'default' : 'secondary'}
                          className={`text-[10px] ${course.isCompleted ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : ''}`}
                        >
                          {course.isCompleted ? 'Course Completed' : 'In Progress'}
                        </Badge>
                        <CardTitle className="text-base font-bold text-foreground">
                          {course.courseTitle}
                        </CardTitle>
                      </div>
                      <span className="text-xs font-black text-primary shrink-0">
                        {course.progressPercentage}%
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {course.completedLessons} of {course.totalPublishedLessons} lessons completed
                        </span>
                        <span>{course.progressPercentage}%</span>
                      </div>
                      <Progress
                        value={course.progressPercentage}
                        indicatorClassName={course.isCompleted ? 'bg-emerald-500' : 'bg-primary'}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-[11px] text-muted-foreground">
                        Enrolled: {new Date(course.enrolledAt).toLocaleDateString()}
                      </span>

                      {course.continueLesson ? (
                        <Link href={`/courses/${course.courseSlug}/lessons/${course.continueLesson.lessonId}`}>
                          <Button size="sm" variant={course.isCompleted ? 'outline' : 'default'} className="space-x-1.5 text-xs">
                            <span>{course.isCompleted ? 'Review' : 'Continue'}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/courses/${course.courseSlug}`}>
                          <Button size="sm" variant="outline" className="text-xs">
                            Course Details
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Section: Recent Activities & Recent Quiz Attempts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground">Recent Learning Activity</h3>
            {recentActivities.length === 0 ? (
              <Card className="border-border/60 p-6 text-center text-xs text-muted-foreground">
                No recent activity recorded yet.
              </Card>
            ) : (
              <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
                {recentActivities.map((act) => (
                  <div key={act.id} className="p-3.5 px-4 flex items-center space-x-3.5 hover:bg-muted/20 text-xs">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                      {act.type === 'QUIZ_ATTEMPT' ? (
                        <Award className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{act.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{act.subtitle}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(act.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Quiz Attempts */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground">Recent Quiz Performance</h3>
            {recentQuizAttempts.length === 0 ? (
              <Card className="border-border/60 p-6 text-center text-xs text-muted-foreground">
                No quizzes attempted yet. Quizzes appear inside lesson modules!
              </Card>
            ) : (
              <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
                {recentQuizAttempts.map((att) => (
                  <div key={att.attemptId} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground truncate max-w-[200px] sm:max-w-xs">
                        {att.quizTitle}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{att.courseTitle}</p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="font-black text-sm text-foreground">{att.percentage}%</span>
                      </div>

                      <Badge
                        variant={att.isPassed ? 'default' : 'destructive'}
                        className={`text-[10px] ${att.isPassed ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : ''}`}
                      >
                        {att.isPassed ? 'Passed' : 'Failed'}
                      </Badge>

                      {att.lessonId ? (
                        <Link href={`/courses/${att.courseSlug}/lessons/${att.lessonId}/quiz/results/${att.attemptId}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Review
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  return (
    <ProtectedRoute>
      <StudentDashboardContent />
    </ProtectedRoute>
  );
}
