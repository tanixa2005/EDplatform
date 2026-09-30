'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, BookOpen, BarChart3, Sparkles } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  useEffect(() => {
    async function loadCourses() {
      try {
        setIsLoading(true);
        const data = await fetchApi<{ courses: CourseListItem[] }>('/courses');
        setCourses(data.courses || []);
      } catch (err) {
        console.error('Failed to load courses', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCourses();
  }, []);

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = selectedLevel === 'ALL' || course.level === selectedLevel;
    return matchesSearch && matchesLevel;
  });

  const levelBadges: Record<string, { label: string; color: string }> = {
    BEGINNER: { label: 'Beginner', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    INTERMEDIATE: { label: 'Intermediate', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
    ADVANCED: { label: 'Advanced', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <section className="relative border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background py-14 sm:py-20">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Explore World-Class AI & Tech Curriculum</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Master Modern Skills with Interactive Learning
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Explore structured, in-depth courses guided by industry experts and an AI tutor grounded in every lesson.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search courses by topic, keyword, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 bg-background shadow-sm"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((lvl) => (
                <Button
                  key={lvl}
                  variant={selectedLevel === lvl ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLevel(lvl)}
                  className="capitalize text-xs font-medium"
                >
                  {lvl === 'ALL' ? 'All Levels' : lvl.toLowerCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Courses Grid */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-80 rounded-xl border border-border/40 bg-card p-6 animate-pulse space-y-4">
                <div className="h-36 rounded-lg bg-muted" />
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/2 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-20 border border-dashed rounded-2xl bg-muted/20">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No courses found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search query or level filter.
            </p>
            {(searchQuery || selectedLevel !== 'ALL') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLevel('ALL');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const badge = levelBadges[course.level] || levelBadges.BEGINNER;
              return (
                <Card key={course.id} className="flex flex-col overflow-hidden group hover:border-primary/40 transition-all">
                  {/* Thumbnail / Header Placeholder */}
                  <div className="relative aspect-video w-full bg-gradient-to-tr from-primary/15 via-muted to-muted/50 flex items-center justify-center overflow-hidden">
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrl}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-primary/80 space-y-2">
                        <BookOpen className="h-10 w-10 opacity-70" />
                        <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                          Course
                        </span>
                      </div>
                    )}
                    <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.color} backdrop-blur-md`}>
                      {badge.label}
                    </span>
                  </div>

                  <CardHeader className="flex-1 space-y-2 pb-3">
                    <CardTitle className="line-clamp-2 text-lg font-bold group-hover:text-primary transition-colors">
                      <Link href={`/courses/${course.slug}`}>
                        {course.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                      {course.shortSummary || course.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                        {course.instructor.firstName[0]}
                      </div>
                      <span className="font-medium text-foreground">
                        {course.instructor.firstName} {course.instructor.lastName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-3">
                      <span className="flex items-center space-x-1">
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>{course.level.toLowerCase()}</span>
                      </span>
                      <span className="font-semibold text-foreground text-sm">
                        {course.price === 0 ? 'Free' : `$${course.price}`}
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0">
                    <Link href={`/courses/${course.slug}`} className="w-full">
                      <Button className="w-full" variant="outline">
                        View Course
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
