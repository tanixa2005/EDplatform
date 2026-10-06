'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, HelpCircle, Loader2, Square, X } from 'lucide-react';
import { MarkdownMessage } from '@/components/ai/markdown-message';
import { streamSse } from '@/lib/sse-stream';

interface QuizHintPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  questionId?: string;
}

interface Turn {
  role: 'student' | 'ed';
  text: string;
}

const PROMPTS = [
  'Can you give me a hint on this question?',
  'What concept is this question testing?',
  'How should I break this problem down?'
];

/**
 * In-quiz hints, kept deliberately separate from the main tutor.
 *
 * This calls the existing `/ai/tutor/stream` endpoint in `quiz` mode, whose system
 * prompt carries six explicit anti-answer rules and which never loads the
 * `isCorrect` flag of any option into the prompt. Quiz integrity is enforced on
 * the server, not by this UI.
 *
 * The one thing that changed in Phase 1: replies render as Markdown and LaTeX
 * instead of raw text, so a hint about a fraction is actually readable.
 */
export function QuizHintPanel({ isOpen, onClose, lessonId, questionId }: QuizHintPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isStreaming = streaming !== null;

  async function ask(message: string) {
    if (isStreaming) return;

    const history = turns.map((turn) => ({
      role: turn.role === 'student' ? ('user' as const) : ('model' as const),
      text: turn.text
    }));

    setTurns((prev) => [...prev, { role: 'student', text: message }]);
    setStreaming('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await streamSse({
        endpoint: '/ai/tutor/stream',
        body: { lessonId, mode: 'quiz', message, questionId, history: history.slice(-6) },
        signal: controller.signal,
        onChunk: (chunk) => setStreaming((prev) => (prev ?? '') + chunk)
      });
      setTurns((prev) => [...prev, { role: 'ed', text: reply }]);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Could not get a hint');
      }
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <div>
            <p className="font-bold leading-tight">Hints from ED</p>
            <p className="text-sm text-muted-foreground">No answers — just a nudge</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close hints"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && !isStreaming && (
          <p className="text-muted-foreground">
            I will not tell you the answer, but I can help you work it out. What part
            is tricky?
          </p>
        )}

        {turns.map((turn, index) =>
          turn.role === 'student' ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-white">
                {turn.text}
              </div>
            </div>
          ) : (
            <MarkdownMessage key={index} content={turn.text} />
          )
        )}

        {isStreaming &&
          (streaming ? (
            <MarkdownMessage content={streaming} />
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </p>
          ))}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void ask(prompt)}
              disabled={isStreaming}
              className="ed-chip text-[13px]"
            >
              {prompt}
            </button>
          ))}
        </div>

        {isStreaming && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="ed-tap w-full gap-2 rounded-lg border border-border text-sm font-semibold text-destructive"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
