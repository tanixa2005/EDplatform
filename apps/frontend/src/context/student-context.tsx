'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import type { StudentMeDto, StudentProfileDto } from '@edplatform/shared';
import { fetchApi, registerTokenGetter } from '@/lib/api';

interface StudentContextValue {
  student: StudentMeDto | null;
  profile: StudentProfileDto | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isOnboarded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const StudentContext = createContext<StudentContextValue | undefined>(undefined);

/** Paths a signed-in student may visit before finishing onboarding. */
const ONBOARDING_EXEMPT = ['/onboarding', '/sign-in', '/sign-up'];

/**
 * Bridges Clerk identity to the EDplatform student record.
 *
 * Does three things:
 *  1. Registers Clerk's `getToken` with the API client so every request is
 *     authenticated without passing a hook around.
 *  2. Loads GET /me once per session and shares class level and preferences.
 *  3. Sends a signed-in student who has not onboarded to /onboarding.
 *
 * Onboarding state lives in PostgreSQL, not in the Clerk token, so this gate is
 * client-side. Authentication itself is enforced in middleware and again on the
 * backend, so a student cannot reach data by skipping this.
 */
export function StudentProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useAuth();
  const [student, setStudent] = useState<StudentMeDto | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    registerTokenGetter(() => getToken());
    return () => registerTokenGetter(null);
  }, [getToken]);

  const load = useCallback(async () => {
    if (!clerkLoaded) return;

    if (!isSignedIn) {
      setStudent(null);
      setIsLoaded(true);
      return;
    }

    try {
      const me = await fetchApi<StudentMeDto>('/me');
      setStudent(me);
      setError(null);
    } catch (err) {
      setStudent(null);
      setError(err instanceof Error ? err.message : 'Could not load your profile');
    } finally {
      setIsLoaded(true);
    }
  }, [clerkLoaded, isSignedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !student) return;
    if (student.isOnboarded) return;
    if (ONBOARDING_EXEMPT.some((path) => pathname.startsWith(path))) return;

    router.replace('/onboarding');
  }, [isLoaded, isSignedIn, student, pathname, router]);

  return (
    <StudentContext.Provider
      value={{
        student,
        profile: student?.profile ?? null,
        isLoaded: clerkLoaded && isLoaded,
        isSignedIn: Boolean(isSignedIn),
        isOnboarded: Boolean(student?.isOnboarded),
        error,
        refresh: load
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent(): StudentContextValue {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error('useStudent must be used within a StudentProvider');
  }
  return context;
}
