'use client';

import React from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { useSpeech } from '@/context/speech-context';
import { speakableText, speechButtonLabel } from '@/lib/speech';

interface SpeakButtonProps {
  /** Stable id for this answer, so only the playing one shows controls. */
  id: string;
  /** The student-visible reply, exactly as it is rendered on screen. */
  content: string;
}

/**
 * "Read this aloud" for one ED answer.
 *
 * Renders nothing at all when the browser has no Web Speech API, or when the
 * answer has no speakable words left after the Markdown and LaTeX are
 * stripped. A control that does nothing when pressed is worse than no control.
 *
 * Sized for a thumb (36px targets) and built from the same role tokens as the
 * rest of the UI, so it follows light and dark without knowing which is on.
 */
export function SpeakButton({ id, content }: SpeakButtonProps) {
  const { supported, activeId, state, play, pause, resume, stop } = useSpeech();

  const isActive = activeId === id && state !== 'idle';
  const speakable = React.useMemo(() => speakableText(content), [content]);

  if (!supported || speakable.length === 0) return null;

  const base =
    'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  if (!isActive) {
    return (
      <button
        type="button"
        onClick={() => play(id, content)}
        aria-label={speechButtonLabel('idle')}
        title={speechButtonLabel('idle')}
        className={base}
      >
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  // While this answer is loaded the control becomes a pair: pause/resume, and
  // an explicit stop. Stop is separate on purpose - pausing and never
  // resuming leaves the engine holding the utterance.
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Reading controls">
      <button
        type="button"
        onClick={state === 'speaking' ? pause : resume}
        aria-label={speechButtonLabel(state)}
        title={speechButtonLabel(state)}
        aria-pressed={state === 'speaking'}
        className={`${base} bg-secondary text-foreground`}
      >
        {state === 'speaking' ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop reading"
        title="Stop reading"
        className={base}
      >
        <Square className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {/* Announced to a screen reader, invisible on screen: the icon swap
          alone is not a state change assistive tech reports. */}
      <span className="sr-only" role="status">
        {state === 'speaking' ? 'Reading aloud' : 'Reading paused'}
      </span>
    </div>
  );
}
