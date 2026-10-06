'use client';

import React, { useRef, useState } from 'react';
import { ArrowUp, Camera, Mic } from 'lucide-react';

interface AskBarProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Renders the taller home-screen variant rather than the compact in-conversation one. */
  variant?: 'hero' | 'compact';
}

/**
 * The product's primary input.
 *
 * Camera and microphone sit beside the text field as peers, not behind a menu: for
 * a student holding a worksheet, the camera is the keyboard. Both are inert in
 * Phase 1 and say so when tapped - Picture Tutor is Phase 3 and voice is Phase 4.
 * They are present now so the entry points and layout are settled.
 */
export function AskBar({
  onSubmit,
  placeholder = 'Ask me anything…',
  disabled = false,
  autoFocus = false,
  variant = 'hero'
}: AskBarProps) {
  const [value, setValue] = useState('');
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isHero = variant === 'hero';

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSubmit(trimmed);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line, which students need for working out.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function autoGrow(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value);
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function flagComingSoon(label: string) {
    setComingSoon(label);
    window.setTimeout(() => setComingSoon(null), 2600);
  }

  return (
    <div>
      <div
        className={`flex items-end gap-2 rounded-2xl border border-border bg-card shadow-sm transition-colors focus-within:border-primary/50 ${
          isHero ? 'px-3 py-2.5' : 'px-2.5 py-2'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={autoGrow}
          onKeyDown={handleKeyDown}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Ask ED a question"
          className={`flex-1 resize-none bg-transparent px-1.5 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60 ${
            isHero ? 'min-h-[44px]' : 'min-h-[40px]'
          }`}
        />

        <div className="flex items-center gap-1 pb-0.5">
          <button
            type="button"
            onClick={() => flagComingSoon('Ask with a picture')}
            aria-label="Ask with a picture (coming soon)"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Camera className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => flagComingSoon('Talk to ED')}
            aria-label="Talk to ED (coming soon)"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Mic className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={disabled || value.trim().length === 0}
            aria-label="Send"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white transition-opacity hover:bg-black disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      {comingSoon && (
        <p
          role="status"
          className="mt-2 rounded-lg bg-notyet-soft px-3 py-2 text-sm font-medium text-notyet-ink"
        >
          {comingSoon} is coming soon. For now, type your question and ED will help.
        </p>
      )}
    </div>
  );
}
