'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  HelpCircle,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Zap
} from 'lucide-react';
import {
  CLASS_LEVEL_LABELS,
  type TutorMessageDto,
  type TutorQuickAction,
  type TutorSessionDetailDto
} from '@edplatform/shared';
import { MarkdownMessage } from '@/components/ai/markdown-message';
import { SpeakButton } from '@/components/tutor/speak-button';
import { AskBar } from '@/components/tutor/ask-bar';
import { fetchApi } from '@/lib/api';
import { streamSse } from '@/lib/sse-stream';
import { takePendingImage } from '@/lib/pending-image';

interface TutorCanvasProps {
  sessionId: string;
  /** Sent as the first turn immediately after mount, e.g. from the home screen. */
  initialMessage?: string;
}

/** The four quick actions, plus the escalation path below the conversation. */
const QUICK_ACTIONS: Array<{ action: TutorQuickAction; label: string; icon: typeof Lightbulb }> = [
  { action: 'hint', label: 'Hint', icon: Lightbulb },
  { action: 'simpler', label: 'Simpler', icon: Sparkles },
  { action: 'real_example', label: 'Real example', icon: HelpCircle },
  { action: 'quiz_me', label: 'Quiz me', icon: Zap }
];

export function TutorCanvas({ sessionId, initialMessage }: TutorCanvasProps) {
  const [session, setSession] = useState<TutorSessionDetailDto | null>(null);
  const [messages, setMessages] = useState<TutorMessageDto[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Object URL for a photo sent during THIS page load, shown against the most
   * recent image turn. Intentionally not persisted: on refresh it is null, and
   * the transcript says the photo was not saved rather than inventing one.
   */
  const [sentImageUrl, setSentImageUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Guards the initial message against React Strict Mode's double effect run,
  // which would otherwise send the student's first question twice.
  const initialSentRef = useRef(false);

  const isStreaming = streamingText !== null;

  /** The question a failed turn should re-send, rather than asking the student to retype it. */
  const lastStudentMessage =
    [...messages].reverse().find((message) => message.role === 'STUDENT')?.content ?? null;

  /** Quick actions only mean something once ED has said something to act on. */
  const hasEdReply = messages.some((message) => message.role === 'ED');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingText]);

  /**
   * Loads the persisted transcript, so a refresh or reopen restores everything.
   *
   * `preserveError` exists because this also runs immediately after a turn
   * finishes. A successful reload used to clear the error unconditionally - so
   * when ED failed, the error was set and then wiped microseconds later by
   * this reload, and the student was left with no reply AND no message at all.
   * After a failed turn the reload still refreshes the transcript, but the
   * explanation of what went wrong has to survive it.
   */
  const loadSession = useCallback(
    async (options?: { preserveError?: boolean }) => {
      try {
        const data = await fetchApi<{ session: TutorSessionDetailDto }>(
          `/tutor/sessions/${sessionId}`
        );
        setSession(data.session);
        setMessages(data.session.messages);
        if (!options?.preserveError) setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open this session');
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const sendTurn = useCallback(
    async (
      payload: { message?: string; action?: TutorQuickAction },
      image?: File | null
    ) => {
      if (isStreaming) return;

      const optimisticText =
        payload.message ??
        QUICK_ACTIONS.find((item) => item.action === payload.action)?.label ??
        (image ? 'Look at this image and explain what it shows.' : 'I still don’t understand');

      if (image) {
        setSentImageUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(image);
        });
      }

      // Show the student's turn immediately; the server is the source of truth and
      // the transcript is reconciled once the stream finishes.
      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          role: 'STUDENT',
          inputKind: image ? 'IMAGE' : 'TEXT',
          content: optimisticText,
          mode: payload.action ?? null,
          createdAt: new Date().toISOString()
        }
      ]);
      setStreamingText('');
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let turnFailed = false;
      try {
        await streamSse({
          endpoint: `/tutor/sessions/${sessionId}/stream`,
          body: payload,
          image,
          signal: controller.signal,
          onChunk: (chunk) => setStreamingText((prev) => (prev ?? '') + chunk)
        });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          turnFailed = true;
          setError(err instanceof Error ? err.message : 'ED could not reply just now');
        }
      } finally {
        abortRef.current = null;
        setStreamingText(null);
        // Reload rather than appending locally: the backend persisted both turns,
        // so this also confirms the conversation really was saved. Keep any
        // failure message, or the student is left staring at their own question
        // with nothing after it.
        await loadSession({ preserveError: turnFailed });
      }
    },
    [isStreaming, sessionId, loadSession]
  );

  useEffect(() => {
    if (isLoading || initialSentRef.current) return;
    if (messages.length > 0) return;

    // A photo picked on the home screen waits in memory for exactly this hop.
    const pendingImage = takePendingImage();
    if (!initialMessage && !pendingImage) return;

    initialSentRef.current = true;
    void sendTurn(initialMessage ? { message: initialMessage } : {}, pendingImage);
  }, [isLoading, initialMessage, messages.length, sendTurn]);

  function stopStreaming() {
    abortRef.current?.abort();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">We could not open that session</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Link
          href="/"
          className="ed-tap mt-6 rounded-lg bg-solid px-5 text-solid-foreground hover:bg-solid-hover"
        >
          Back to Ask ED
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-3xl flex-col px-4">
      {/* Session header: concept and class level stay visible while scrolling */}
      <div className="sticky top-14 z-30 -mx-4 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:top-[6.25rem]">
        <Link
          href="/"
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight">
            {session?.title ?? 'Session with ED'}
          </h1>
          {session && (
            <p className="text-sm text-muted-foreground">
              {CLASS_LEVEL_LABELS[session.classLevel]}
            </p>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 space-y-5 py-5">
        {messages.length === 0 && !isStreaming && (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold">Hi! I&apos;m ED.</p>
            <p className="mt-1 text-muted-foreground">
              Ask me anything you are stuck on and we will work through it together.
            </p>
          </div>
        )}

        {messages.map((message, index) =>
          message.role === 'STUDENT' ? (
            <div key={message.id} className="flex flex-col items-end gap-1.5">
              {message.inputKind === 'IMAGE' &&
                (isNewestImageTurn(messages, index) && sentImageUrl ? (
                  <img
                    src={sentImageUrl}
                    alt="The photo you sent"
                    className="max-h-48 max-w-[85%] rounded-2xl rounded-br-md border border-border object-contain"
                  />
                ) : (
                  // Honest about the trade-off: nothing was stored, so nothing
                  // can be shown. Better than a broken image or a fake one.
                  <p className="max-w-[85%] rounded-lg bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                    Photo not saved — send it again to ask about it.
                  </p>
                ))}
              {/* Student text is rendered as text, never as markup.
                  `whitespace-pre-wrap` keeps the blank lines and single
                  newlines the server composed - without it the mistake
                  handoff, which is a labelled block of question / what I
                  picked / the right answer / explanation, collapsed into one
                  unreadable run-on paragraph. Deliberately not MarkdownMessage:
                  this is the student's own content and must not be interpreted
                  as markup. */}
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-solid px-4 py-2.5 text-solid-foreground">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <EdAvatar />
              <div className="min-w-0 flex-1 pt-0.5">
                <MarkdownMessage content={message.content} />
                {/* Only finished answers can be read aloud. A half-arrived
                    one would be spoken mid-sentence and could not be kept in
                    step with the text still coming in. */}
                <div className="-ml-2 mt-0.5">
                  <SpeakButton id={message.id} content={message.content} />
                </div>
              </div>
            </div>
          )
        )}

        {isStreaming && (
          <div className="flex gap-3">
            <EdAvatar thinking />
            <div className="min-w-0 flex-1 pt-0.5">
              {streamingText ? (
                <MarkdownMessage content={streamingText} />
              ) : (
                <p className="text-muted-foreground">ED is thinking…</p>
              )}
            </div>
          </div>
        )}

        {/* A failed turn is recoverable: the student's question is already
            saved, so retrying re-sends exactly that rather than making them
            type it again. The backend reuses the stored question instead of
            appending a duplicate. */}
        {error && session && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            {lastStudentMessage && !isStreaming && (
              <button
                type="button"
                onClick={() => void sendTurn({ message: lastStudentMessage })}
                className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-card px-3.5 font-semibold text-foreground transition-colors hover:border-primary/40"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions + "I still don't understand" escalation.

          Both are hidden until ED has actually replied: on a brand new session
          there is nothing to get a hint about or re-explain, and showing five
          controls above an empty conversation made the first screen cluttered
          instead of calm.

          The chip row wraps rather than scrolling horizontally. It used to be
          an overflow-x container with no scroll affordance, so on a phone
          "Quiz me" sat off-screen with nothing to suggest it existed. */}
      {/* Sticks ABOVE the mobile tab bar, not under it.
          `sticky bottom-0` pins to the bottom of the viewport, but the phone
          nav is `fixed bottom-0` at z-40, so the composer sat behind it: 32 of
          its 40px were covered and elementFromPoint at its centre returned a
          nav link, meaning a tap went to the nav instead of the text box. The
          offset is the nav's own height (min-h-[56px] = 3.5rem) plus the home
          indicator inset it pads itself with, so the two stay in step. On
          sm+ the nav moves into the header and there is nothing to clear. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 space-y-2.5 border-t border-border bg-background/98 px-4 pb-4 pt-3 backdrop-blur-sm sm:bottom-0">
        {hasEdReply && (
          <>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map(({ action, label, icon: Icon }) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void sendTurn({ action })}
                  disabled={isStreaming}
                  className="ed-chip"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void sendTurn({ action: 'still_confused' })}
              disabled={isStreaming}
              className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              I still don&apos;t understand — explain it a different way
            </button>
          </>
        )}

        {isStreaming ? (
          <button
            type="button"
            onClick={stopStreaming}
            className="ed-tap w-full gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-destructive"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </button>
        ) : (
          <AskBar
            variant="compact"
            placeholder="Reply or ask something else…"
            onSubmit={(message, image) =>
              void sendTurn(message ? { message } : {}, image)
            }
          />
        )}
      </div>
    </div>
  );
}

/** True for the last image turn in the transcript, which is the one just sent. */
function isNewestImageTurn(messages: TutorMessageDto[], index: number): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'STUDENT' && messages[i].inputKind === 'IMAGE') {
      return i === index;
    }
  }
  return false;
}

function EdAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <div
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${
        thinking
          ? 'animate-pulse border-primary/30 bg-accent text-primary'
          : 'border-border bg-secondary text-foreground'
      }`}
    >
      E
    </div>
  );
}
