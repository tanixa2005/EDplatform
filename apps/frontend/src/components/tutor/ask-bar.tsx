'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ImagePlus, Loader2, Mic, Square, X } from 'lucide-react';
import { useSpeech } from '@/context/speech-context';
import { listenButtonLabel, mergeTranscript } from '@/lib/speech';
import { useSpeechInput } from '@/lib/use-speech-input';

interface AskBarProps {
  /** `image` is present only when the student attached a photo to this turn. */
  onSubmit: (message: string, image?: File | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Renders the taller home-screen variant rather than the compact in-conversation one. */
  variant?: 'hero' | 'compact';
}

/**
 * Exactly the three formats the server accepts.
 *
 * HEIC is deliberately absent: browsers cannot reliably decode it for a
 * preview, and converting it client-side would mean trusting the client with
 * the one step that must stay authoritative on the server.
 *
 * This is a filter hint for the picker, not a guarantee - a student can still
 * choose "All files". The server decides from the file's actual bytes.
 */
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

/** Mirrors MAX_IMAGE_BYTES on the server so an obvious overrun fails instantly. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The product's primary input: photo, voice, send.
 *
 * The photo button now does something. One image per turn, previewed before it
 * is sent so the student can see what ED will see, and removable. On a phone
 * the OS picker already offers Camera or Gallery, so there is no custom camera
 * here and there should not be one.
 *
 * The photo is never stored: it is held in component state, sent with the turn,
 * and dropped. The object URL behind the preview is revoked when it changes.
 */
export function AskBar({
  onSubmit,
  placeholder = 'Ask me anything…',
  disabled = false,
  autoFocus = false,
  variant = 'hero'
}: AskBarProps) {
  const [value, setValue] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isHero = variant === 'hero';

  // ED's own playback, so the microphone is never opened while he is talking.
  const { stop: stopSpeaking } = useSpeech();

  /**
   * A recognised phrase goes into the composer, never straight to the server.
   *
   * Recognition mishears names, numbers and anything said quickly, and this is
   * a child's homework question. They read it, fix it, and press send.
   */
  const handleTranscript = useCallback((text: string) => {
    setValue((current) => {
      const merged = mergeTranscript(current, text);
      // Keep the box sized to the dictated text, same as typing does.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        el.focus();
      });
      return merged;
    });
  }, []);

  const listen = useSpeechInput(handleTranscript);
  const isListening = listen.state === 'listening';
  const isFinishing = listen.state === 'processing';

  function toggleListening() {
    if (isListening) {
      listen.stop();
      return;
    }
    if (isFinishing) return;
    if (!listen.supported) {
      setNotice(
        'This browser cannot listen for speech. Chrome or Edge can — for now, type your question.'
      );
      return;
    }
    // ED talking into an open microphone would be transcribed back as the
    // student's question.
    stopSpeaking();
    setNotice(null);
    listen.start();
  }

  // One object URL at a time, always revoked. Without this, every replaced
  // photo would leak its blob for the lifetime of the page.
  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function submit() {
    const trimmed = value.trim();
    // A photo on its own is a complete question; the server supplies the
    // instruction for it. So send if there is text OR a photo.
    if ((!trimmed && !image) || disabled) return;
    const attached = image;
    setValue('');
    setImage(null);
    setNotice(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSubmit(trimmed, attached);
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

  function handleImagePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = '';
    if (!picked) return;

    // Cheap local checks for the two mistakes a student will actually make.
    // Neither is trusted - the server re-checks the real bytes.
    if (!/^image\/(jpeg|png|webp)$/i.test(picked.type)) {
      setNotice('That needs to be a photo — JPG, PNG or WebP.');
      return;
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      setNotice(
        `That photo is too big. Please use one under ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`
      );
      return;
    }

    setNotice(null);
    setImage(picked);
  }

  function removeImage() {
    setImage(null);
    setNotice(null);
  }

  return (
    <div>
      {/* The photo, shown before sending so the student sees what ED will see.
          Small and inline: a homework photo does not need a hero card. */}
      {image && previewUrl && (
        <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-border bg-secondary/60 p-2">
          <img
            src={previewUrl}
            alt={`Photo to send: ${image.name}`}
            className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{image.name}</span>
            <span className="block text-xs text-muted-foreground">{formatSize(image.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={removeImage}
            disabled={disabled}
            aria-label="Remove photo"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
          placeholder={image ? 'Ask about this photo, or just send it' : placeholder}
          aria-label="Ask ED a question"
          className={`flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2 text-base text-foreground outline-none placeholder:truncate placeholder:text-muted-foreground disabled:opacity-60 ${
            isHero ? 'min-h-[44px]' : 'min-h-[40px]'
          }`}
        />

        <div className="flex items-center gap-1 pb-0.5">
          {/* 1. Attach file */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={handleImagePicked}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label={image ? 'Replace photo' : 'Add a photo'}
            title={image ? 'Replace photo' : 'Add a photo'}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40 ${
              image ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          {/* 2. Voice - push to talk. Press once to listen, again to stop. */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled || isFinishing}
            aria-label={listenButtonLabel(listen.state, listen.supported)}
            title={listenButtonLabel(listen.state, listen.supported)}
            aria-pressed={isListening}
            className={
              isListening
                ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-notyet-soft text-notyet-ink transition-colors'
                : 'flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40'
            }
          >
            {isFinishing ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : isListening ? (
              <Square className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          {/* 3. Send */}
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (value.trim().length === 0 && !image)}
            aria-label="Send"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-solid text-solid-foreground transition-opacity hover:bg-solid-hover disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Listening and processing are announced, not just coloured: a student
          needs to know the microphone is open, and a screen reader gets no
          signal from an icon swap. `aria-live="polite"` rather than assertive
          so it does not interrupt what is being read. */}
      {(isListening || isFinishing) && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-foreground"
        >
          <span className="mt-0.5 flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-notyet" />
          <span className="min-w-0">
            <span className="font-medium">
              {isListening ? 'Listening…' : 'Finishing up…'}
            </span>
            {/* Interim words, so the student can see it is working. Shown in
                muted type because they are not final and will change. */}
            {listen.interim && (
              <span className="ml-1.5 break-words text-muted-foreground">{listen.interim}</span>
            )}
            {isListening && (
              <button
                type="button"
                onClick={listen.cancel}
                className="ml-2 whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline"
              >
                Cancel
              </button>
            )}
          </span>
        </p>
      )}

      {listen.error && (
        <p
          role="alert"
          className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-notyet-soft px-3 py-2 text-sm font-medium text-notyet-ink"
        >
          <span className="min-w-0">{listen.error}</span>
          <button
            type="button"
            onClick={listen.dismissError}
            aria-label="Dismiss"
            className="shrink-0 underline underline-offset-2 hover:no-underline"
          >
            OK
          </button>
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="mt-2 rounded-lg bg-notyet-soft px-3 py-2 text-sm font-medium text-notyet-ink"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
