'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, HelpCircle, Lightbulb, Loader2, Sparkles, Square, Zap } from 'lucide-react';
import {
  CLASS_LEVEL_LABELS,
  type TutorMessageDto,
  type TutorQuickAction,
  type TutorSessionDetailDto
} from '@edplatform/shared';
import { MarkdownMessage } from '@/components/ai/markdown-message';
import { AskBar } from '@/components/tutor/ask-bar';
import { fetchApi } from '@/lib/api';
import { streamSse } from '@/lib/sse-stream';

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

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Guards the initial message against React Strict Mode's double effect run,
  // which would otherwise send the student's first question twice.
  const initialSentRef = useRef(false);

  const isStreaming = streamingText !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingText]);

  /** Loads the persisted transcript, so a refresh or reopen restores everything. */
  const loadSession = useCallback(async () => {
    try {
      const data = await fetchApi<{ session: TutorSessionDetailDto }>(
        `/tutor/sessions/${sessionId}`
      );
      setSession(data.session);
      setMessages(data.session.messages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this session');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const sendTurn = useCallback(
    async (payload: { message?: string; action?: TutorQuickAction }) => {
      if (isStreaming) return;

      const optimisticText =
        payload.message ??
        QUICK_ACTIONS.find((item) => item.action === payload.action)?.label ??
        'I still don’t understand';

      // Show the student's turn immediately; the server is the source of truth and
      // the transcript is reconciled once the stream finishes.
      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          role: 'STUDENT',
          inputKind: 'TEXT',
          content: optimisticText,
          mode: payload.action ?? null,
          createdAt: new Date().toISOString()
        }
      ]);
      setStreamingText('');
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamSse({
          endpoint: `/tutor/sessions/${sessionId}/stream`,
          body: payload,
          signal: controller.signal,
          onChunk: (chunk) => setStreamingText((prev) => (prev ?? '') + chunk)
        });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'ED could not reply just now');
        }
      } finally {
        abortRef.current = null;
        setStreamingText(null);
        // Reload rather than appending locally: the backend persisted both turns,
        // so this also confirms the conversation really was saved.
        await loadSession();
      }
    },
    [isStreaming, sessionId, loadSession]
  );

  useEffect(() => {
    if (isLoading || !initialMessage || initialSentRef.current) return;
    if (messages.length > 0) return;
    initialSentRef.current = true;
    void sendTurn({ message: initialMessage });
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
          className="ed-tap mt-6 rounded-lg bg-ink px-5 text-white hover:bg-black"
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

        {messages.map((message) =>
          message.role === 'STUDENT' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <EdAvatar />
              <div className="min-w-0 flex-1 pt-0.5">
                <MarkdownMessage content={message.content} />
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

        {error && session && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions + "I still don't understand" escalation */}
      <div className="sticky bottom-0 -mx-4 space-y-2.5 border-t border-border bg-background/98 px-4 pb-4 pt-3 backdrop-blur-sm">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
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
            placeholder="Type your answer or ask something else…"
            onSubmit={(message) => void sendTurn({ message })}
          />
        )}
      </div>
    </div>
  );
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
