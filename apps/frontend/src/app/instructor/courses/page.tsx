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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-6 gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
                <Layers className="h-3.5 w-3.5" />
                <span>Instructor Authoring Studio</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Course Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Author, organize, and publish your course curriculum, modules, and video lessons.
              </p>
            </div>

            <Link href="/instructor/courses/new">
              <Button className="space-x-1.5 shadow-sm">
                <Plus className="h-4 w-4" />
                <span>Create New Course</span>
              </Button>
            </Link>
          </div>

          {/* Courses List */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-56 rounded-xl border border-border/40 bg-card p-6 animate-pulse space-y-4">
                  <div className="h-5 w-2/3 bg-muted rounded" />
                  <div className="h-4 w-1/3 bg-muted rounded" />
                  <div className="h-10 w-full bg-muted rounded mt-4" />
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20 border border-dashed rounded-2xl bg-muted/20 max-w-xl mx-auto">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No courses yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started by creating your first course and adding modules and video lessons.
              </p>
              <Link href="/instructor/courses/new" className="mt-6 inline-block">
                <Button>Create Your First Course</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Card key={course.id} className="flex flex-col justify-between hover:border-primary/40 transition-all">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={course.isPublished ? 'default' : 'secondary'}
                        className="text-[11px]"
                      >
                        {course.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      <span className="text-xs text-muted-foreground uppercase font-semibold">
                        {course.level}
                      </span>
                    </div>

                    <CardTitle className="line-clamp-2 text-lg font-bold">
                      {course.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs">
                      {course.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-y border-border/40 py-2.5">
                      <div className="flex items-center space-x-1">
                        <Users className="h-3.5 w-3.5" />
                        <span>{course._count?.enrollments || 0} Students</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>{course._count?.modules || 0} Modules</span>
                      </div>
                      <div className="font-semibold text-foreground">
                        {course.price === 0 ? 'Free' : `$${course.price}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Link href={`/instructor/courses/${course.id}/edit`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full space-x-1.5">
                          <Edit className="h-3.5 w-3.5" />
                          <span>Curriculum</span>
                        </Button>
                      </Link>

                      <Button
                        variant={course.isPublished ? 'secondary' : 'default'}
                        size="sm"
                        disabled={updatingId === course.id}
                        onClick={() => togglePublish(course)}
                        className="space-x-1"
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
