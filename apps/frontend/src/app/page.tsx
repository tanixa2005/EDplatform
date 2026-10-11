'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { ArrowRight, Loader2, MessageCircle, Zap } from 'lucide-react';
import {
  CLASS_LEVEL_LABELS,
  type StudentProfileDto,
  type TutorSessionSummaryDto
} from '@edplatform/shared';
import { AskBar } from '@/components/tutor/ask-bar';
import { Button } from '@/components/ui/button';
import { EdLogo } from '@/components/shared/ed-logo';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';
import { setPendingImage } from '@/lib/pending-image';

interface HomeContext {
  profile: StudentProfileDto | null;
  recentSessions: TutorSessionSummaryDto[];
  suggestedPrompts: string[];
  lastQuizAttempt: { attemptId: string; quizTitle: string; percentage: number } | null;
}

export default function HomePage() {
  const { isLoaded, isSignedIn, student, isOnboarded, error, refresh } = useStudent();

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) return <SignedOutHome />;

  // A signed-in student whose profile could not load must see an error and a way
  // out, never an endless spinner.
  if (error && !student) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">We could not load your profile</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button onClick={() => void refresh()} className="ed-tap mt-6 font-semibold">
          Try again
        </Button>
      </div>
    );
  }

  // StudentProvider is already redirecting to /onboarding; avoid a flash of the
  // home screen with no class level.
  if (!isOnboarded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <AskEdHome firstName={student?.firstName ?? null} />;
}

/**
 * The home screen IS the tutor. No hero banner, no course cards, no feature grid:
 * the input is the first thing on the page and everything else sits below it.
 */
function AskEdHome({ firstName }: { firstName: string | null }) {
  const router = useRouter();
  const [context, setContext] = useState<HomeContext | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<HomeContext>('/tutor/home')
      .then(setContext)
      .catch(() => setContext(null));
  }, []);

  /** Creates a session, then hands the opening question to the tutor canvas. */
  const startSession = useCallback(
    async (message: string, image?: File | null) => {
      if (isStarting) return;
      setIsStarting(true);
      setError(null);

      try {
        // Session creation stays JSON. The photo belongs to the first turn,
        // which happens after navigation, so it is handed over in memory
        // rather than written anywhere.
        const data = await fetchApi<{ session: { id: string } }>('/tutor/sessions', {
          method: 'POST',
          body: JSON.stringify(message ? { message } : {})
        });
        if (image) setPendingImage(image);
        router.push(
          message
            ? `/tutor/${data.session.id}?ask=${encodeURIComponent(message)}`
            : `/tutor/${data.session.id}`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start a session');
        setIsStarting(false);
      }
    },
    [isStarting, router]
  );

  const greeting = firstName ? `Hi ${firstName}` : 'Hi';
  const prompts = context?.suggestedPrompts ?? [
    'Explain fractions',
    "I don't understand photosynthesis",
    'Help me with this homework',
    'Quiz me on integers'
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:pt-12">
      <section>
        <p className="text-lg text-muted-foreground">{greeting} 👋</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug sm:text-3xl">
          I&apos;m ED. What are you learning today?
        </h1>

        <div className="mt-5">
          <AskBar
            onSubmit={(message, image) => void startSession(message, image)}
            disabled={isStarting}
            placeholder="Ask me anything…"
          />
        </div>

        {isStarting && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening your session…
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Starter prompts: real questions in the student's own subjects, not feature labels */}
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void startSession(prompt)}
                disabled={isStarting}
                className="ed-chip"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* The way back into practice.
          /tutor/home has always returned the last attempt and the home screen
          never rendered it, so the loop ended here: a student who had just
          worked through a mistake with ED had no route back to the quiz except
          navigating Learn again. One row, in the same shape as the session
          rows below, into the Practice tab that lists the attempt. */}
      {context?.lastQuizAttempt && (
        <section className="mt-6">
          <Link
            href="/practice"
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
          >
            <Zap className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Back to your last practice</span>
              {/* Score first: at 375px the quiz title alone fills the line, and
                  truncation was swallowing the number the row exists to show. */}
              <span className="block truncate text-sm text-muted-foreground">
                {Math.round(context.lastQuizAttempt.percentage)}% ·{' '}
                {context.lastQuizAttempt.quizTitle}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      )}

      {/* Pick up where you left off: resumes a conversation, not a video */}
      {context && context.recentSessions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-bold">Pick up where you left off</h2>
          <ul className="mt-3 space-y-2">
            {context.recentSessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/tutor/${session.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{session.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {CLASS_LEVEL_LABELS[session.classLevel]} ·{' '}
                      {session.messageCount === 0
                        ? 'Not started yet'
                        : `${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

function SignedOutHome() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-14 text-center sm:pt-20">
      <div className="flex justify-center">
        <EdLogo size={40} showWordmark={false} />
      </div>

      <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
        Meet ED, your own
        <br />
        <span className="text-primary">AI learning companion</span>
      </h1>

      <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
        For Classes 6, 7 and 8. Ask anything in Maths, Science, Social Science or
        English — ED explains it step by step, at your level.
      </p>

      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
        <SignUpButton mode="modal">
          <Button size="lg" className="ed-tap font-semibold">
            Start learning
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button size="lg" variant="outline" className="ed-tap font-semibold">
            I already have an account
          </Button>
        </SignInButton>
      </div>

      <ul className="mx-auto mt-10 max-w-sm space-y-3 text-left text-base text-foreground/80">
        <li className="flex gap-3">
          <span aria-hidden className="font-bold text-primary">
            ✓
          </span>
          ED teaches instead of just handing you the answer
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="font-bold text-primary">
            ✓
          </span>
          Explanations change depending on your class
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="font-bold text-primary">
            ✓
          </span>
          Ask follow-up questions until it actually makes sense
        </li>
      </ul>
    </div>
  );
}
