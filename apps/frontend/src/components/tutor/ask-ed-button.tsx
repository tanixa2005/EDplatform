'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { fetchApi } from '@/lib/api';

interface AskEdButtonProps {
  /** Anchors the session to a lesson so ED can ground its examples in it. */
  lessonId?: string;
  /** Pre-fills the first question, e.g. "Explain this lesson to me". */
  initialMessage?: string;
  label?: string;
  className?: string;
}

/**
 * Opens a full-screen ED session from inside a lesson.
 *
 * Replaces the old side drawer. The conversation is a real persisted
 * TutorSession, so leaving the lesson and coming back does not lose it.
 */
export function AskEdButton({
  lessonId,
  initialMessage,
  label = 'Ask ED',
  className
}: AskEdButtonProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);

    try {
      const data = await fetchApi<{ session: { id: string } }>('/tutor/sessions', {
        method: 'POST',
        body: JSON.stringify({ lessonId, message: initialMessage })
      });

      const query = initialMessage ? `?ask=${encodeURIComponent(initialMessage)}` : '';
      router.push(`/tutor/${data.session.id}${query}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open ED');
      setIsStarting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={isStarting}
        className={
          className ??
          'inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3.5 text-sm font-semibold text-accent-foreground transition-colors hover:border-primary/60 disabled:opacity-60'
        }
      >
        {isStarting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
        {label}
      </button>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  );
}
