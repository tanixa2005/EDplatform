'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  isSpeechSupported,
  nextSpeechState,
  pickVoice,
  speakableText,
  speechRateFor,
  type SpeechState,
  type VoiceLike
} from '@/lib/speech';

interface SpeechContextValue {
  /**
   * True only once the read-aloud voice (Google UK English Female) has been
   * found. False on browsers with no Web Speech API, before the voice list
   * arrives, and on browsers that do not offer that voice.
   */
  supported: boolean;
  /**
   * True when the browser can speak but, after waiting for its voice list, does
   * not offer the read-aloud voice. The button then says so instead of hiding.
   */
  voiceUnavailable: boolean;
  /** Which answer is currently loaded, so only that one shows controls. */
  activeId: string | null;
  state: SpeechState;
  /** Starts (or restarts) one answer. Any current playback is cancelled first. */
  play: (id: string, markdown: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const SpeechContext = createContext<SpeechContextValue | undefined>(undefined);

/**
 * How long to wait for the browser's voice list before saying the read-aloud
 * voice is unavailable. Chrome loads its Google voices after the page starts.
 */
const VOICE_WAIT_MS = 3000;

/**
 * One speech controller for the whole app.
 *
 * `window.speechSynthesis` is a single global queue, so the controller has to
 * be single too. Per-component state would let a tutor answer and a quiz hint
 * both think they were playing - and the engine would read them one after the
 * other, which is exactly the overlap this has to prevent.
 *
 * Nothing autoplays. `play` only ever runs from a button press, which is both
 * the product rule and a practical necessity: browsers block speech that was
 * not triggered by a user gesture.
 */
export function SpeechProvider({ children }: { children: React.ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<SpeechState>('idle');

  /**
   * The live utterance.
   *
   * Held in a ref so its handlers can be detached before cancelling. Without
   * that, `cancel()` fires `onend` for the utterance being thrown away, and
   * that late event resets the state of the answer that just started.
   */
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  /**
   * The read-aloud voice, or null, which means read-aloud is off.
   *
   * A ref so `play` always reads the latest choice; `supported` mirrors
   * whether there is one, so the buttons appear only when they can work.
   */
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  /**
   * Voice selection, which is asynchronous whether you like it or not.
   *
   * `getVoices()` returns [] on the first call in Chrome and Edge - the list
   * is populated later and announced with `voiceschanged`. Picking once at
   * mount therefore gets nothing on exactly the browsers most students use,
   * which is why this listens as well as reads, and re-picks each time the
   * list changes. It runs in an effect, so the server and the first client
   * render agree and hydration does not mismatch.
   *
   * Only Google UK English Female is used (see pickVoice), never another
   * voice or the engine default. Until VOICE_WAIT_MS has passed, a list
   * without it counts as still loading; after that, the student is told the
   * voice is unavailable, and a later voiceschanged that brings it still
   * switches read-aloud on. Everything is wrapped: a browser that throws from
   * getVoices still has working text tutoring.
   */
  useEffect(() => {
    if (!isSpeechSupported()) return;

    let waited = false;

    const choose = () => {
      try {
        const available = window.speechSynthesis.getVoices();
        const chosen = pickVoice((available ?? []) as unknown as VoiceLike[]);
        voiceRef.current = chosen ? (chosen as unknown as SpeechSynthesisVoice) : null;
      } catch {
        voiceRef.current = null;
      }
      setSupported(voiceRef.current !== null);
      setVoiceUnavailable(waited && voiceRef.current === null);
    };

    const timer = window.setTimeout(() => {
      waited = true;
      choose();
    }, VOICE_WAIT_MS);

    choose();
    try {
      window.speechSynthesis.addEventListener('voiceschanged', choose);
    } catch {
      return () => window.clearTimeout(timer);
    }
    return () => {
      window.clearTimeout(timer);
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', choose);
      } catch {
        // Nothing to clean up on a browser that never attached it.
      }
    };
  }, []);

  /** Drops the current utterance and silences the engine. */
  const hardStop = useCallback(() => {
    const current = utteranceRef.current;
    if (current) {
      current.onend = null;
      current.onerror = null;
      current.onpause = null;
      current.onresume = null;
      utteranceRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      // A browser that throws here cannot speak; text tutoring is unaffected.
    }
  }, []);

  const stop = useCallback(() => {
    hardStop();
    setActiveId(null);
    setState((prev) => nextSpeechState(prev, 'stop'));
  }, [hardStop]);

  const play = useCallback(
    (id: string, markdown: string) => {
      if (!isSpeechSupported()) return;

      // Without the read-aloud voice, no speech: never another voice or the
      // engine default. The button cannot play in this case; this guards it anyway.
      const voice = voiceRef.current;
      if (!voice) return;

      const text = speakableText(markdown);
      // Nothing to say: leave the state alone rather than entering a
      // "speaking" state that will never end.
      if (text.length === 0) return;

      // Always cancel first. This is what makes a second answer's play button
      // replace the first instead of queueing behind it.
      hardStop();

      try {
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        // Match the language to the voice rather than asserting en-IN over
        // the top of, say, an en-GB voice - a mismatch makes some engines
        // fall back to a worse voice or ignore the choice entirely.
        utterance.lang = voice.lang;

        // Pace follows the engine's quality; pitch stays at 1 always, because
        // moving it is what makes a synthesiser sound like a cartoon.
        utterance.rate = speechRateFor(voice as VoiceLike | null);
        utterance.pitch = 1;

        utterance.onend = () => {
          utteranceRef.current = null;
          setActiveId(null);
          setState((prev) => nextSpeechState(prev, 'end'));
        };
        utterance.onerror = () => {
          // Errors here are routine, not exceptional: a cancel mid-utterance
          // reports one on some browsers. Reset quietly and keep the page
          // working.
          utteranceRef.current = null;
          setActiveId(null);
          setState((prev) => nextSpeechState(prev, 'error'));
        };

        utteranceRef.current = utterance;
        setActiveId(id);
        setState((prev) => nextSpeechState(prev, 'play'));
        window.speechSynthesis.speak(utterance);
      } catch {
        utteranceRef.current = null;
        setActiveId(null);
        setState('idle');
      }
    },
    [hardStop]
  );

  const pause = useCallback(() => {
    try {
      window.speechSynthesis.pause();
      setState((prev) => nextSpeechState(prev, 'pause'));
    } catch {
      stop();
    }
  }, [stop]);

  const resume = useCallback(() => {
    try {
      window.speechSynthesis.resume();
      setState((prev) => nextSpeechState(prev, 'resume'));
    } catch {
      stop();
    }
  }, [stop]);

  // Leaving the page must not leave a voice running. speechSynthesis outlives
  // React: without this, navigating away mid-answer keeps talking.
  useEffect(() => {
    return () => {
      if (isSpeechSupported()) hardStop();
    };
  }, [hardStop]);

  return (
    <SpeechContext.Provider value={{ supported, voiceUnavailable, activeId, state, play, pause, resume, stop }}>
      {children}
    </SpeechContext.Provider>
  );
}

export function useSpeech(): SpeechContextValue {
  const context = useContext(SpeechContext);
  if (!context) throw new Error('useSpeech must be used inside SpeechProvider');
  return context;
}
