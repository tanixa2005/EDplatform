'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { SignOutButton } from '@clerk/nextjs';
import {
  CLASS_LEVELS,
  CLASS_LEVEL_LABELS,
  EXPLANATION_STYLE_LABELS,
  SUBJECT_KEYS,
  SUBJECT_LABELS,
  type ClassLevel,
  type ExplanationStyle,
  type StudentDashboardDto,
  type SubjectKey
} from '@edplatform/shared';
import { Button } from '@/components/ui/button';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';

const EXPLANATION_STYLES: ExplanationStyle[] = [
  'SIMPLE',
  'STEP_BY_STEP',
  'REAL_LIFE',
  'EXAM_FOCUSED'
];

/**
 * Me holds the student's learning settings and a short progress summary.
 *
 * Replaces the three-card role router and the metric-grid student dashboard. The
 * learning map and weak areas land in Phase 5; this keeps progress to the few
 * lines that are honest today.
 */
export default function MePage() {
  const { student, profile, isLoaded, refresh } = useStudent();
  const [dashboard, setDashboard] = useState<StudentDashboardDto | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<StudentDashboardDto>('/dashboard/student')
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }, []);

  async function save(patch: {
    classLevel?: ClassLevel;
    subjects?: SubjectKey[];
    preferredExplanationStyle?: ExplanationStyle;
  }) {
    setIsSaving(true);
    setError(null);
    try {
      await fetchApi('/me', { method: 'PATCH', body: JSON.stringify(patch) });
      await refresh();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSubject(subject: SubjectKey) {
    if (!profile) return;
    const next = profile.subjects.includes(subject)
      ? profile.subjects.filter((s) => s !== subject)
      : [...profile.subjects, subject];

    // The API requires at least one subject; keep the last one selected.
    if (next.length === 0) return;
    void save({ subjects: next });
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="text-2xl font-bold">
        {student?.firstName ? `${student.firstName}'s learning` : 'My learning'}
      </h1>

      {/* Progress: three lines, not a dashboard */}
      {dashboard && (
        <section className="mt-6 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-bold">This far</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="Lessons done" value={dashboard.summary.totalLessonsCompleted} />
            <Stat label="Quizzes tried" value={dashboard.summary.quizzesAttempted} />
            <Stat
              label="Average score"
              value={`${dashboard.summary.averageQuizPercentage}%`}
            />
          </dl>
        </section>
      )}

      {/* Class level */}
      <section className="mt-8">
        <h2 className="text-base font-bold">My class</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ED changes how it explains things based on this.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CLASS_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => void save({ classLevel: level })}
              disabled={isSaving}
              aria-pressed={profile?.classLevel === level}
              className={`ed-tap rounded-xl border px-5 font-semibold transition-colors ${
                profile?.classLevel === level
                  ? 'border-primary bg-accent text-accent-foreground'
                  : 'border-border bg-card hover:border-primary/40'
              } disabled:opacity-60`}
            >
              {CLASS_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </section>

      {/* Subjects */}
      <section className="mt-8">
        <h2 className="text-base font-bold">My subjects</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {SUBJECT_KEYS.map((subject) => {
            const selected = profile?.subjects.includes(subject) ?? false;
            return (
              <button
                key={subject}
                type="button"
                onClick={() => toggleSubject(subject)}
                disabled={isSaving}
                aria-pressed={selected}
                className={`ed-tap justify-between rounded-xl border px-4 text-left font-semibold transition-colors ${
                  selected
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border bg-card hover:border-primary/40'
                } disabled:opacity-60`}
              >
                {SUBJECT_LABELS[subject]}
                {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Explanation style */}
      <section className="mt-8">
        <h2 className="text-base font-bold">How I like explanations</h2>
        <div className="mt-3 grid gap-2.5">
          {EXPLANATION_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => void save({ preferredExplanationStyle: style })}
              disabled={isSaving}
              aria-pressed={profile?.preferredExplanationStyle === style}
              className={`ed-tap justify-between rounded-xl border px-4 text-left font-semibold transition-colors ${
                profile?.preferredExplanationStyle === style
                  ? 'border-primary bg-accent text-accent-foreground'
                  : 'border-border bg-card hover:border-primary/40'
              } disabled:opacity-60`}
            >
              {EXPLANATION_STYLE_LABELS[style]}
              {profile?.preferredExplanationStyle === style && (
                <Check className="h-5 w-5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      </section>

      <div aria-live="polite" className="mt-5 min-h-[1.5rem]">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : savedAt ? (
          <p className="text-sm font-medium text-gotit-ink">Saved</p>
        ) : null}
      </div>

      <section className="mt-6 border-t border-border pt-6">
        <SignOutButton>
          <Button variant="outline" className="ed-tap w-full font-semibold sm:w-auto">
            Sign out
          </Button>
        </SignOutButton>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-2 py-3">
      <dd className="text-xl font-bold text-foreground">{value}</dd>
      <dt className="mt-0.5 text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}
