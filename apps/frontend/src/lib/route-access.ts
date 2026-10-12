import { createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Routes a signed-out visitor may open. Everything else requires a session.
 *
 * `/learn` is the public catalogue. It lists only the published Class 6-8
 * courses that the backend allows anonymously (see public-catalog.ts there).
 * It matches exactly, so `/learn/[subject]`, course details, lessons, quizzes,
 * dashboards and account routes all stay protected.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  '/',
  '/learn',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)'
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);
