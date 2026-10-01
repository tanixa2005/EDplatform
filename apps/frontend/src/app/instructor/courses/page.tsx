'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, BookOpen, Edit, Eye, EyeOff, Users, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';

interface InstructorCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  price: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    enrollments: number;
    modules: number;
  };
}

export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState<InstructorCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const data = await fetchApi<{ courses: InstructorCourse[] }>('/courses/instructor/my-courses');
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Failed to load instructor courses', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const togglePublish = async (course: InstructorCourse) => {
    try {
      setUpdatingId(course.id);
      await fetchApi(`/courses/${course.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: !course.isPublished })
      });
      await loadCourses();
    } catch (err) {
      console.error('Failed to toggle publish status', err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6 gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-md border border-[#E53935]/30 bg-[#FDE8E7] px-3 py-1 text-xs font-bold text-[#B91C1C] mb-2">
                <Layers className="h-3.5 w-3.5" />
                <span>Instructor Authoring Studio</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                Course Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
                Author, structure, and publish your course curriculum, modules, video lessons, and interactive comprehension quizzes.
              </p>
            </div>

            <Link href="/instructor/courses/new">
              <Button className="rounded-md space-x-2 font-semibold px-5 py-2.5 bg-[#111111] text-white hover:bg-black shadow-xs">
                <Plus className="h-4 w-4" />
                <span>Create New Course</span>
              </Button>
            </Link>
          </div>

          {/* Courses List */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-60 rounded-lg border border-border bg-card p-6 animate-pulse space-y-4">
                  <div className="h-5 w-2/3 bg-muted rounded-md" />
                  <div className="h-4 w-1/3 bg-muted rounded-md" />
                  <div className="h-10 w-full bg-muted rounded-md mt-6" />
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card max-w-xl mx-auto p-8 shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[#FDE8E7] text-primary mb-4 border border-primary/20">
                <BookOpen className="h-7 w-7" />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground">No courses yet</h3>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Get started by creating your first course and adding modules, video lessons, and quizzes.
              </p>
              <Link href="/instructor/courses/new" className="mt-6 inline-block">
                <Button className="rounded-md font-semibold px-5 bg-[#111111] text-white hover:bg-black">Create Your First Course</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Card key={course.id} className="rounded-lg border-border bg-card shadow-xs flex flex-col justify-between hover:border-foreground/30 transition-all overflow-hidden">
                  <CardHeader className="space-y-2.5 p-6">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={course.isPublished ? 'default' : 'secondary'}
                        className={`text-[11px] font-bold rounded-md ${
                          course.isPublished
                            ? 'bg-emerald-600 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {course.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider font-mono">
                        {course.level}
                      </span>
                    </div>

                    <CardTitle className="line-clamp-2 font-display text-lg font-bold text-foreground pt-1 leading-snug">
                      {course.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {course.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 p-6 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border border-border py-3 bg-[#FFFDF8] px-3.5 rounded-md font-mono">
                      <div className="flex items-center space-x-1.5 font-medium">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{course._count?.enrollments || 0} Students</span>
                      </div>
                      <div className="flex items-center space-x-1.5 font-medium">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        <span>{course._count?.modules || 0} Modules</span>
                      </div>
                      <div className="font-bold text-foreground">
                        {course.price === 0 ? 'Free' : `$${course.price}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Link href={`/instructor/courses/${course.id}/edit`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full space-x-1.5 rounded-md font-semibold border-border">
                          <Edit className="h-3.5 w-3.5" />
                          <span>Curriculum</span>
                        </Button>
                      </Link>

                      <Button
                        variant={course.isPublished ? 'secondary' : 'default'}
                        size="sm"
                        disabled={updatingId === course.id}
                        onClick={() => togglePublish(course)}
                        className={`space-x-1 rounded-md font-semibold ${
                          course.isPublished ? '' : 'bg-[#111111] text-white hover:bg-black'
                        }`}
                      >
                        {course.isPublished ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Unpublish</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Publish</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
