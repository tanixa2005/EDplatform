'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, PlayCircle, Zap } from 'lucide-react';
import type { StudentDashboardDto } from '@edplatform/shared';
import { fetchApi } from '@/lib/api';

/**
 * Practice reuses the existing quiz engine rather than introducing a second one:
 * server-authoritative grading, resumable attempts and the time limit all already
 * work. The adaptive challenge composer arrives in Phase 5; until then this is the
 * student's view of the practice that exists, plus a route into ED to be quizzed
 * conversationally.
 */
export default function PracticePage() {
  const router = useRouter();
  const [data, setData] = useState<StudentDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    fetchApi<StudentDashboardDto>('/dashboard/student')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function quizMeWithEd() {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const created = await fetchApi<{ session: { id: string } }>('/tutor/sessions', {
        method: 'POST',
        body: JSON.stringify({ message: 'Quiz me on something I should practise' })
      });
      router.push(
        `/tutor/${created.session.id}?ask=${encodeURIComponent('Quiz me on something I should practise')}`
      );
    } catch {
      setIsStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const attempts = data?.recentQuizAttempts ?? [];
  const continueLearning = data?.continueLearning ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="text-2xl font-bold">Practice</h1>
      <p className="mt-1.5 text-muted-foreground">
        The best way to find out if you really understand something is to try it.
      </p>

      {/* Practising with ED is a conversation, not a form */}
      <button
        type="button"
        onClick={() => void quizMeWithEd()}
        disabled={isStarting}
        className="mt-6 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-4 text-left transition-colors hover:border-primary/60 disabled:opacity-60"
      >
        {isStarting ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        ) : (
          <Zap className="h-5 w-5 shrink-0 text-primary" />
        )}
        <span className="flex-1">
          <span className="block font-bold text-accent-foreground">Let ED quiz me</span>
          <span className="block text-sm text-accent-foreground/80">
            One question at a time, with hints when you need them
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
      </button>

      {continueLearning.length > 0 && (
        <section className="mt-9">
          <h2 className="text-base font-bold">Carry on from here</h2>
          <ul className="mt-3 space-y-2.5">
            {continueLearning.map((item) => (
              <li key={item.lessonId}>
                <Link
                  href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/40"
                >
                  <PlayCircle className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.lessonTitle}</span>
                    <span className="block text-sm text-muted-foreground">
                      {item.courseTitle}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-9">
        <h2 className="text-base font-bold">What you have tried</h2>

        {attempts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center">
            <p className="font-semibold">Nothing yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask ED to quiz you and your attempts will show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {attempts.map((attempt) => (
              <li
                key={attempt.attemptId}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{attempt.quizTitle}</span>
                  <span className="block text-sm text-muted-foreground">
                    {attempt.courseTitle}
                  </span>
                </span>
                {/* Amber rather than red: "not yet", never "failed". */}
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${
                    attempt.isPassed
                      ? 'bg-gotit-soft text-gotit-ink'
                      : 'bg-notyet-soft text-notyet-ink'
                  }`}
                >
                  {Math.round(attempt.percentage)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
