'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, BookOpen, BarChart3, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { fetchApi } from '@/lib/api';

interface CourseListItem {
  id: string;
  title: string;
  slug: string;
  shortSummary?: string;
  description: string;
  thumbnailUrl?: string;
  price: number;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
  modulesCount?: number;
  lessonsCount?: number;
  _count?: {
    enrollments: number;
    modules: number;
  };
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi<{ courses: CourseListItem[] }>('/courses');
      setCourses(data?.courses || []);
    } catch (err: unknown) {
      console.error('Failed to load courses', err);
      setError('Failed to load courses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const filteredCourses = courses.filter((course) => {
    const q = searchQuery.toLowerCase().trim();
    const titleMatch = (course.title || '').toLowerCase().includes(q);
    const descMatch = (course.description || '').toLowerCase().includes(q);
    const summaryMatch = (course.shortSummary || '').toLowerCase().includes(q);
    const matchesSearch = !q || titleMatch || descMatch || summaryMatch;
    const matchesLevel = selectedLevel === 'ALL' || course.level === selectedLevel;
    return matchesSearch && matchesLevel;
  });

  const levelBadges: Record<string, { label: string; color: string }> = {
    BEGINNER: { label: 'Beginner', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    INTERMEDIATE: { label: 'Intermediate', color: 'bg-brand-50 text-brand-700 border-brand-200' },
    ADVANCED: { label: 'Advanced', color: 'bg-cream text-amber-900 border-amber-300' }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Editorial Header */}
      <section className="border-b border-border py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Structured Curriculums
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-tight">
              Explore Our Course Catalog
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
              Master software engineering, databases, and distributed architectures with structured modules, interactive comprehension quizzes, and verified progress tracking.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search courses by title or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 bg-card rounded-md border-border focus:border-primary text-sm"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto items-center">
              {['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((lvl) => (
                <Button
                  key={lvl}
                  variant={selectedLevel === lvl ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`capitalize text-xs font-semibold rounded-md h-10 px-3 ${
                    selectedLevel === lvl
                      ? 'bg-[#111111] text-white hover:bg-[#2A2A2A]'
                      : 'border-border text-foreground hover:bg-secondary'
                  }`}
                >
                  {lvl === 'ALL' ? 'All Levels' : lvl.toLowerCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Courses Grid */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 rounded-md border border-border bg-card p-5 animate-pulse space-y-4">
                <div className="h-32 rounded bg-muted" />
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/2 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : error && courses.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-red-300 dark:border-red-900/60 rounded-md bg-card max-w-md mx-auto p-6 space-y-3">
            <AlertCircle className="mx-auto h-10 w-10 text-primary" />
            <h3 className="text-base font-bold text-foreground">Failed to Load Courses</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCourses}
              className="mt-2 rounded-md text-xs font-semibold"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-md bg-card max-w-md mx-auto p-6 space-y-3">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="text-base font-bold text-foreground">No matching courses found</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We couldn&apos;t find any courses matching your filter criteria. Try searching for different topics or clearing filters.
            </p>
            {(searchQuery || selectedLevel !== 'ALL') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLevel('ALL');
                }}
                className="mt-2 rounded-md text-xs font-semibold"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const badge = levelBadges[course.level] || levelBadges.BEGINNER;
              const instructorName = course.instructor
                ? `${course.instructor.firstName || ''} ${course.instructor.lastName || ''}`.trim() || 'Instructor'
                : 'Instructor';
              const initial = instructorName[0] || 'I';

              return (
                <Card
                  key={course.id}
                  className="flex flex-col justify-between overflow-hidden hover:border-primary/50 transition-colors rounded-md border-border bg-card shadow-xs"
                >
                  <CardHeader className="space-y-2 pb-2 pt-5 px-5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="font-bold text-foreground text-xs">
                        {course.price === 0 ? (
                          <span className="text-emerald-700">Free</span>
                        ) : (
                          `$${course.price}`
                        )}
                      </span>
                    </div>

                    <CardTitle className="line-clamp-2 text-base font-bold text-foreground leading-snug pt-1">
                      <Link href={`/courses/${course.slug}`} className="hover:text-primary transition-colors">
                        {course.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {course.shortSummary || course.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0 px-5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                      <div className="flex items-center space-x-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-background font-bold text-[10px]">
                          {initial}
                        </div>
                        <span className="font-medium text-foreground text-xs truncate max-w-[130px]">
                          {instructorName}
                        </span>
                      </div>

                      <span className="flex items-center space-x-1 text-xs text-muted-foreground">
                        <BarChart3 className="h-3 w-3 text-primary" />
                        <span>{course.level ? course.level.toLowerCase() : 'all'}</span>
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0 pb-5 px-5">
                    <Link href={`/courses/${course.slug}`} className="w-full">
                      <Button className="w-full font-semibold text-xs rounded-md border-border hover:bg-secondary" variant="outline">
                        <span>Explore Syllabus</span>
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5 text-primary" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
