'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <div className="min-h-screen bg-background py-10 sm:py-14">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="border-b border-border pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-md border border-[#E53935]/20 bg-[#FDE8E7] px-3.5 py-1 text-xs font-semibold text-[#B91C1C] mb-2.5">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Active Learning Journey</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                My Enrolled Courses
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Resume lessons, review completed modules, and keep moving toward your verified certificate of completion.
              </p>
            </div>

            <Link href="/courses">
              <Button variant="outline" size="sm" className="space-x-1.5 rounded-md h-10 border-border font-medium">
                <span>Explore Catalog</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Enrollments Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-76 rounded-lg border border-border bg-card p-6 animate-pulse space-y-4">
                  <div className="h-36 rounded-md bg-muted" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                  <div className="h-3 w-1/3 bg-muted rounded" />
                  <div className="h-9 w-full bg-muted rounded-md mt-4" />
                </div>
              ))}
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/40 max-w-xl mx-auto p-8 space-y-4">
              <div className="p-4 rounded-md bg-[#FDE8E7] text-primary w-fit mx-auto border border-primary/20">
                <BookOpen className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">No enrolled courses yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Discover courses taught by real-world practitioners with grounded AI tutoring and verifiable completion records.
              </p>
              <Link href="/courses" className="inline-block pt-2">
                <Button className="rounded-md bg-[#111111] text-white hover:bg-black font-semibold shadow-xs">
                  <span>Browse Course Catalog</span>
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrollments.map((item) => {
                const course = item.course;
                const isCompleted = item.progressPercentage >= 100 || !!item.completedAt;

                return (
                  <Card key={item.id} className="flex flex-col overflow-hidden hover:border-foreground/30 transition-all duration-200 rounded-lg border-border hover:shadow-sm bg-card">
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden border-b border-border">
                      {course.thumbnailUrl ? (
                        <img
                          src={course.thumbnailUrl}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-3.5 rounded-md bg-card border border-border text-primary">
                          <BookOpen className="h-7 w-7" />
                        </div>
                      )}

                      {isCompleted ? (
                        <div className="absolute top-3 right-3 flex items-center space-x-1 rounded-md bg-emerald-700 text-white px-2.5 py-0.5 text-xs font-semibold shadow-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Completed</span>
                        </div>
                      ) : (
                        <div className="absolute top-3 right-3">
                          <Badge variant="outline" className="bg-card text-[11px] font-semibold text-primary border-border font-mono rounded-md">
                            {item.progressPercentage}%
                          </Badge>
                        </div>
                      )}
                    </div>

                    <CardHeader className="space-y-1.5 flex-1 pt-5 pb-3">
                      <div className="text-xs text-muted-foreground flex items-center space-x-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Instructor: {course.instructor.firstName} {course.instructor.lastName}</span>
                      </div>
                      <CardTitle className="line-clamp-2 text-base font-bold leading-snug">
                        <Link href={`/courses/${course.slug}`} className="hover:text-primary transition-colors">
                          {course.title}
                        </Link>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-muted-foreground">Course Completion</span>
                          <span className={`font-mono ${isCompleted ? 'text-emerald-700' : 'text-primary'}`}>
                            {item.progressPercentage}%
                          </span>
                        </div>
                        <Progress
                          value={item.progressPercentage}
                          indicatorClassName={isCompleted ? 'bg-emerald-600' : 'bg-primary'}
                        />
                      </div>
                    </CardContent>

                    <CardFooter className="pb-5 border-t border-border pt-4">
                      <Link href={`/courses/${course.slug}`} className="w-full">
                        <Button className="w-full rounded-md font-semibold" variant={isCompleted ? 'outline' : 'default'}>
                          <span>{isCompleted ? 'Review Syllabus' : 'Continue Learning'}</span>
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

