'use client';

import React, { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TutorCanvas } from '@/components/tutor/tutor-canvas';

function TutorSessionView() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();

  // `ask` carries the question typed on the home screen so the first turn fires
  // immediately instead of making the student retype it here.
  const initialMessage = searchParams.get('ask') ?? undefined;

  return (
    <TutorCanvas sessionId={String(params.sessionId)} initialMessage={initialMessage} />
  );
}

export default function TutorSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <TutorSessionView />
    </Suspense>
  );
}
