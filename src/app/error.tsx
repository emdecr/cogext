"use client";
// =============================================================================
// ROOT ERROR BOUNDARY
// =============================================================================
//
// Next.js calls this component when a page or layout throws an unhandled
// error during rendering. It replaces the crashed page with a graceful UI.
//
// Why "use client"?
//   React error boundaries are implemented as class components with
//   componentDidCatch. Next.js wraps this behind the scenes, but the
//   error.tsx file must be a Client Component to work. Server Components
//   can't catch their own render errors (they've already left the server
//   by the time this catches them).
//
// Props from Next.js:
//   error  — the thrown Error object (+ a digest for server-side errors)
//   reset  — a function to retry rendering the component tree
//
// Scope:
//   This catches errors in the root route group. For errors inside
//   (app) specifically, you'd add src/app/(app)/error.tsx instead.
//   For errors in the root layout itself, see global-error.tsx.
//
// When does this fire?
//   - A server component throws during render
//   - A client component throws during render (that isn't caught elsewhere)
//   - A data fetch (like a server action) throws and isn't handled
// =============================================================================

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console so it appears in browser devtools.
    // In a real setup, you'd also send this to an error tracking service
    // like Sentry: Sentry.captureException(error)
    //
    // `error.digest` is a Next.js-specific hash of the server-side error.
    // It lets you correlate a user-reported error with your server logs
    // without exposing sensitive server details to the client.
    console.error("[ErrorBoundary]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] dark:bg-[#121212]">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        {/* Minimal error indicator — not alarming, just honest */}
        <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-6">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-neutral-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 className="text-xl font-medium text-[#1A1A1A] dark:text-[#E8E8E6] mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-[#6B6B6B] dark:text-[#9CA3AF] mb-8 leading-relaxed">
          An unexpected error occurred. Your data is safe — this is a display
          issue, not a data issue.
        </p>

        <div className="flex flex-col gap-3">
          {/* reset() re-renders the component tree from this boundary down.
              Useful for transient errors (network hiccup, race condition). */}
          <button
            onClick={reset}
            className="w-full px-4 py-2.5 bg-[#1A1A1A] dark:bg-[#E8E8E6] text-white dark:text-[#1A1A1A] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>

          <a
            href="/dashboard"
            className="w-full px-4 py-2.5 border border-[#E8E8E6] dark:border-[#2A2A2A] text-[#1A1A1A] dark:text-[#E8E8E6] rounded-lg text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-center"
          >
            Go to dashboard
          </a>
        </div>

        {/* Show the error digest in development — useful for looking up
            server logs. In production this is just a hash, not a leaky
            error message. */}
        {error.digest && (
          <p className="mt-6 text-xs text-[#6B6B6B] dark:text-[#9CA3AF] font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
