import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Routes a signed-out visitor may see. Everything else requires a session.
 *
 * Server-side protection, replacing the old client-side <ProtectedRoute>: a
 * signed-out visitor is redirected before the page renders instead of after a
 * loading spinner resolves.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)'
]);

const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default hasClerkKeys
  ? clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    })
  : // Not a supported configuration. ClerkProvider wraps every page, so the build
    // fails first without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. This branch is a
    // safety net only, and it does not make Clerk optional.
    () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
