'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isRecognitionSupported,
  nextListenState,
  recognitionErrorMessage,
  type ListenState
} from '@/lib/speech';

/**
 * Push-to-talk for the composer.
 *
 * A hook rather than a provider: unlike playback, there is no shared global
 * resource to arbitrate - one composer is on screen at a time, and each owns
 * its own recognition object.
 *
 * The microphone is only ever opened by `start`, which only ever runs from a
 * button press. There is no always-listening mode and no wake word, and
 * nothing here runs on mount.
 *
 * NOT offline. The browser implements recognition by sending audio to its
 * vendor's speech service, so this needs a connection and the student's voice
 * leaves the device. The UI says so rather than implying local processing.
 */

/** The slice of the SpeechRecognition API this hook uses. */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultLikeEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionResultLikeEvent {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

type RecognitionConstructor = new () => RecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechInput {
  supported: boolean;
  state: ListenState;
  /** Words heard but not yet final, for a live hint while speaking. */
  interim: string;
  /** Student-facing message when something went wrong, or null. */
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Throws the attempt away without keeping what was heard. */
  cancel: () => void;
  dismissError: () => void;
}

/**
 * @param onTranscript Called with each FINAL phrase. Never submits anything -
 *   the caller puts it in the composer for the student to check first.
 */
export function useSpeechInput(onTranscript: (text: string) => void): SpeechInput {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ListenState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionLike | null>(null);
  /** Set while cancelling, so the resulting error event stays silent. */
  const cancellingRef = useRef(false);
  /** Kept in a ref so the handlers never close over a stale callback. */
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(isRecognitionSupported());
  }, []);

  /** Detaches handlers and releases the microphone. */
  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    recognitionRef.current = null;
    try {
      recognition.abort();
    } catch {
      // Already finished; nothing to release.
    }
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    // A second press while already listening is a stop, handled by the
    // caller. Guard anyway so a double-tap cannot open two microphones.
    if (recognitionRef.current) return;

    setError(null);
    setInterim('');
    cancellingRef.current = false;

    let recognition: RecognitionLike;
    try {
      recognition = new Recognition();
    } catch {
      setState((prev) => nextListenState(prev, 'error'));
      setError(recognitionErrorMessage(null));
      return;
    }

    // One phrase at a time. `continuous` would keep the microphone open
    // indefinitely, which is exactly what this must not do.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = 'en-IN';

    recognition.onresult = (event) => {
      let finalText = '';
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else pending += text;
      }
      setInterim(pending);
      if (finalText.trim() !== '') {
        // Handed to the composer, never submitted. The student reads it,
        // edits it if the engine misheard, and presses send themselves.
        onTranscriptRef.current(finalText);
      }
    };

    recognition.onerror = (event) => {
      if (cancellingRef.current) return;
      const message = recognitionErrorMessage(event?.error);
      // An empty message means the student cancelled: no error to show.
      if (message === '') {
        setState((prev) => nextListenState(prev, 'settled'));
        return;
      }
      setState((prev) => nextListenState(prev, 'error'));
      setError(message);
    };

    recognition.onend = () => {
      setInterim('');
      recognitionRef.current = null;
      setState((prev) => nextListenState(prev, 'settled'));
    };

    recognitionRef.current = recognition;
    setState((prev) => nextListenState(prev, 'start'));

    try {
      recognition.start();
    } catch {
      // Chrome throws if start() is called while a previous session is still
      // closing. Treated as a failed attempt rather than a wedged state.
      teardown();
      setState((prev) => nextListenState(prev, 'error'));
      setError(recognitionErrorMessage(null));
    }
  }, [teardown]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setState((prev) => nextListenState(prev, 'stop'));
    try {
      // `stop` rather than `abort`: it lets the engine deliver the last
      // phrase it heard instead of discarding it.
      recognition.stop();
    } catch {
      teardown();
      setState((prev) => nextListenState(prev, 'settled'));
    }
  }, [teardown]);

  const cancel = useCallback(() => {
    cancellingRef.current = true;
    teardown();
    setInterim('');
    setError(null);
    setState((prev) => nextListenState(prev, 'settled'));
  }, [teardown]);

  const dismissError = useCallback(() => {
    setError(null);
    setState((prev) => nextListenState(prev, 'dismiss'));
  }, []);

  // Leaving the screen must release the microphone. Without this, navigating
  // away mid-phrase leaves it open and the browser indicator lit.
  useEffect(() => {
    return () => {
      cancellingRef.current = true;
      teardown();
    };
  }, [teardown]);

  return { supported, state, interim, error, start, stop, cancel, dismissError };
}
