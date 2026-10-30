'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';

/**
 * What the backend says about AI right now (GET /tutor/status). Flags only.
 *
 * `voiceInputAllowed` is true only while external AI is live. Browser speech
 * recognition sends the student's audio to the browser vendor's speech
 * service, so while AI is off - and in the offline demo - the mic is not
 * offered at all.
 */
export interface AiStatus {
  tutorPaused: boolean;
  voiceInputAllowed: boolean;
}

/**
 * Whether the mic may be shown. Fails closed: still loading, a failed request,
 * a signed-out visitor or a malformed reply all mean no mic. Only an explicit
 * `voiceInputAllowed: true` from the backend turns it on.
 */
export function isVoiceInputAllowed(status: unknown): boolean {
  if (!status || typeof status !== 'object') return false;
  return (status as { voiceInputAllowed?: unknown }).voiceInputAllowed === true;
}

/** One request per page load, shared by every composer on the screen. */
let statusRequest: Promise<AiStatus | null> | null = null;

function loadStatus(): Promise<AiStatus | null> {
  if (!statusRequest) {
    statusRequest = fetchApi<AiStatus>('/tutor/status').catch(() => {
      // Forget the failure so a later mount (after sign-in, say) can ask again.
      statusRequest = null;
      return null;
    });
  }
  return statusRequest;
}

/** The current AI status, or null until it is known (or if it cannot be). */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;
    void loadStatus().then((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return status;
}
