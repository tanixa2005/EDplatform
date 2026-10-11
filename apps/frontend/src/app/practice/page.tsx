'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, PlayCircle, Zap } from 'lucide-react';
import type { StudentDashboardDto, StudentQuizAttemptSummaryDto } from '@edplatform/shared';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';

/**
 * When the student sat this attempt, short enough to sit on one line.
 *
 * Four attempts at the same quiz are otherwise indistinguishable, so the time
 * matters as much as the date. Rendered only after the client-side fetch
 * resolves, so there is no server/client locale mismatch to hydrate.
 */
function attemptWhen(attempt: StudentQuizAttemptSummaryDto): string {
  const when = new Date(attempt.submittedAt ?? attempt.startedAt);
  const day = when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/**
 * The canonical result page for an attempt, or null when it cannot be built.
 *
 * This is the same URL the quiz flow itself redirects to on submit. A legacy
 * module-level quiz has no lesson, so there is no result route for it and the
 * row stays unlinked rather than pointing somewhere broken.
 */
function resultHref(attempt: StudentQuizAttemptSummaryDto): string | null {
  if (!attempt.courseSlug || !attempt.lessonId) return null;
  return `/courses/${attempt.courseSlug}/lessons/${attempt.lessonId}/quiz/results/${attempt.attemptId}`;
}

/**
 * Practice reuses the existing quiz engine rather than introducing a second one:
 * server-authoritative grading, resumable attempts and the time limit all already
 * work. The adaptive challenge composer arrives in Phase 5; until then this is the
 * student's view of the practice that exists, plus a route into ED to be quizzed
 * conversationally.
 */
export default function PracticePage() {
  const router = useRouter();
  const { isLoaded } = useStudent();
  const [data, setData] = useState<StudentDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      setError(null);
      setData(await fetchApi<StudentDashboardDto>('/dashboard/student'));
    } catch {
      // A failure is shown, not disguised. Swallowing it was what let the 401
      // below render as "Nothing yet" - an empty list and a broken request
      // have to look different to the student.
      setData(null);
      setError('Could not load your practice. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // Wait for the auth context before fetching.
  //
  // React runs child effects before parent effects, so this used to fire
  // before StudentProvider had registered the Clerk token getter. The request
  // went out unauthenticated, came back 401, was swallowed by the catch, and
  // the page told a student with four completed attempts that they had tried
  // "Nothing yet" - while /me, on the same data, said four quizzes at 85%.
  // The empty dependency array meant it never retried, so only a soft
  // navigation ever showed the truth.
  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded]);

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

  // Auth still settling counts as loading: an empty state here would claim the
  // student has never practised.
  if (!isLoaded || isLoading) {
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

        {error ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="ed-tap mt-3 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:border-primary/60"
            >
              Try again
            </button>
          </div>
        ) : attempts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center">
            <p className="font-semibold">Nothing yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask ED to quiz you and your attempts will show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {attempts.map((attempt) => {
              const href = resultHref(attempt);

              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{attempt.quizTitle}</span>
                    <span className="block text-sm text-muted-foreground">
                      {attempt.courseTitle} · {attemptWhen(attempt)}
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
                  {href && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </>
              );

              return (
                <li key={attempt.attemptId}>
                  {href ? (
                    // The attempt is still ownership-checked on the server; this
                    // only saves the student from having to find their own way
                    // back through Learn to see what they got wrong.
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/40"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
