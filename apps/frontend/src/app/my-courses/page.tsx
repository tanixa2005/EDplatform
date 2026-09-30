'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';

interface EnrolledCourseItem {
  id: string;
  courseId: string;
  enrolledAt: string;
  completedAt?: string | null;
  progressPercentage: number;
  course: {
    id: string;
    title: string;
    slug: string;
    shortSummary?: string;
    description: string;
    thumbnailUrl?: string;
    level: string;
    instructor: {
      firstName: string;
      lastName: string;
    };
    modules: {
      id: string;
      lessons: { id: string }[];
    }[];
  };
}

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState<EnrolledCourseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadEnrollments() {
      try {
        setIsLoading(true);
        const data = await fetchApi<{ enrollments: EnrolledCourseItem[] }>('/enrollments/me');
        setEnrollments(data.enrollments || []);
      } catch (err) {
        console.error('Failed to load enrolled courses', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadEnrollments();
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="border-b border-border/40 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Student Learning Center</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                My Enrolled Courses
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Pick up right where you left off and monitor your progress across your learning paths.
              </p>
            </div>

            <Link href="/courses">
              <Button variant="outline" size="sm" className="space-x-1.5">
                <span>Browse More Courses</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Enrollments Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-72 rounded-xl border border-border/40 bg-card p-6 animate-pulse space-y-4">
                  <div className="h-32 rounded-lg bg-muted" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                  <div className="h-3 w-1/3 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-center py-20 border border-dashed rounded-2xl bg-muted/20 max-w-2xl mx-auto">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No enrolled courses yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                Explore our catalog to find hands-on, high-impact courses powered by our AI tutor.
              </p>
              <Link href="/courses" className="mt-6 inline-block">
                <Button>Explore Courses</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrollments.map((item) => {
                const course = item.course;
                const isCompleted = item.progressPercentage >= 100 || !!item.completedAt;

                return (
                  <Card key={item.id} className="flex flex-col overflow-hidden hover:border-primary/40 transition-all">
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full bg-gradient-to-tr from-primary/15 via-muted to-muted/50 flex items-center justify-center overflow-hidden">
                      {course.thumbnailUrl ? (
                        <img
                          src={course.thumbnailUrl}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="h-10 w-10 text-primary/70" />
                      )}

                      {isCompleted && (
                        <div className="absolute top-3 right-3 flex items-center space-x-1 rounded-full bg-emerald-500/90 text-white px-2.5 py-0.5 text-xs font-semibold shadow-md">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Completed</span>
                        </div>
                      )}
                    </div>

                    <CardHeader className="space-y-1.5 flex-1">
                      <div className="text-xs text-muted-foreground">
                        Instructor: {course.instructor.firstName} {course.instructor.lastName}
                      </div>
                      <CardTitle className="line-clamp-2 text-base font-bold">
                        <Link href={`/courses/${course.slug}`} className="hover:text-primary transition-colors">
                          {course.title}
                        </Link>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-muted-foreground">Course Progress</span>
                          <span className={isCompleted ? 'text-emerald-500' : 'text-primary'}>
                            {item.progressPercentage}%
                          </span>
                        </div>
                        <Progress
                          value={item.progressPercentage}
                          indicatorClassName={isCompleted ? 'bg-emerald-500' : 'bg-primary'}
                        />
                      </div>
                    </CardContent>

                    <CardFooter className="pt-0 border-t border-border/40 pt-4">
                      <Link href={`/courses/${course.slug}`} className="w-full">
                        <Button className="w-full" variant={isCompleted ? 'outline' : 'default'}>
                          <span>{isCompleted ? 'Review Course' : 'Continue Learning'}</span>
                          <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
