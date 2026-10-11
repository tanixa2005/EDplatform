'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SUBJECT_KEYS, SUBJECT_LABELS, type SubjectKey } from '@edplatform/shared';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';

/**
 * Opens a subject-scoped session with ED.
 *
 * Phase 1 has no concept graph to browse, so a subject is an entry point into
 * tutoring rather than a chapter tree. The subject is stored on the session so the
 * prompt builder can mention it.
 */
export default function LearnSubjectPage() {
  const params = useParams<{ subject: string }>();
  const router = useRouter();
  const { isLoaded } = useStudent();
  const [error, setError] = useState<string | null>(null);

  const subjectKey = String(params.subject ?? '').toUpperCase() as SubjectKey;
  const isValid = SUBJECT_KEYS.includes(subjectKey);

  useEffect(() => {
    if (!isValid) {
      setError('That subject does not exist.');
      return;
    }

    // Wait for the auth context before creating the session.
    //
    // React runs child effects before parent effects, so on a cold load this
    // POST went out before StudentProvider had registered the Clerk token
    // getter. The backend correctly refused it, and the raw 401 message -
    // "Authentication required. Please sign in to continue." - was rendered
    // full-page to a student who was signed in, with their own class chip
    // visible in the header above it.
    if (!isLoaded) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchApi<{ session: { id: string } }>('/tutor/sessions', {
          method: 'POST',
          body: JSON.stringify({ subject: subjectKey })
        });
        if (!cancelled) router.replace(`/tutor/${data.session.id}`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start a session');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isValid, subjectKey, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/learn')}
          className="ed-tap mt-5 rounded-lg bg-solid px-5 text-solid-foreground hover:bg-solid-hover"
        >
          Back to Learn
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-muted-foreground">
        Opening {isValid ? SUBJECT_LABELS[subjectKey] : 'your subject'} with ED…
      </p>
    </div>
  );
}
