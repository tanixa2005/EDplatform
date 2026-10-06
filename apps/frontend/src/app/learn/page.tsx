'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { SUBJECT_LABELS, type SubjectKey } from '@edplatform/shared';
import { Button } from '@/components/ui/button';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';

interface CourseListItem {
  id: string;
  title: string;
  slug: string;
  shortSummary?: string;
  description: string;
  _count?: { enrollments: number; modules: number };
}

/**
 * The "I want to study, not ask" path.
 *
 * Replaces the old /courses marketplace listing: no prices, no instructor bylines,
 * no ratings. Just the student's chosen subjects and the material available, with
 * a route into ED from every subject.
 */
export default function LearnPage() {
  const { profile, isLoaded } = useStudent();
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi<{ courses: CourseListItem[] }>('/courses');
      setCourses(data?.courses ?? []);
    } catch {
      setError('Could not load your material. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const subjects: SubjectKey[] = profile?.subjects ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="text-2xl font-bold">Learn</h1>
      <p className="mt-1.5 text-muted-foreground">
        Pick a subject and ask ED, or work through the material below.
      </p>

      {/* Subjects route straight into a tutoring session for that subject */}
      {subjects.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-bold">Your subjects</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {subjects.map((subject) => (
              <Link
                key={subject}
                href={`/learn/${subject.toLowerCase()}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/40"
              >
                <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                <span className="flex-1 font-semibold">{SUBJECT_LABELS[subject]}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-9">
        <h2 className="text-base font-bold">Lessons and practice</h2>

        {isLoading || !isLoaded ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="mt-3 gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        ) : courses.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 font-semibold">No lessons here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lessons for your class are on the way. In the meantime, just ask ED
              anything you are stuck on.
            </p>
            <Link href="/" className="ed-tap mt-4 rounded-lg bg-ink px-5 text-white hover:bg-black">
              Ask ED
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.slug}`}
                  className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <p className="font-semibold leading-snug">{course.title}</p>
                  {(course.shortSummary || course.description) && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {course.shortSummary || course.description}
                    </p>
                  )}
                  {course._count?.modules != null && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {course._count.modules} chapter
                      {course._count.modules === 1 ? '' : 's'}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
