// ============================================================================
// REFLECTION DETAIL PAGE
// ============================================================================
//
// Displays the full content of a single weekly reflection.
// Designed to feel calm and readable — a centered card with generous spacing.
//
// Server component for the data fetch, with a client component for the
// markdown rendering (react-markdown needs to run in the browser).
//
// When this page loads, we automatically mark the reflection as read.
// Viewing it = reading it. This clears the notification dot on the dashboard.
// ============================================================================

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getReflection, markReflectionAsRead } from "@/lib/actions/reflections";
import ReflectionContent from "./reflection-content";

// Next.js passes dynamic route params as a prop.
// /reflections/abc-123 → params.id = "abc-123"
type Props = {
  params: Promise<{ id: string }>;
};

export default async function ReflectionDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Await params (Next.js 15+ makes params a Promise for async layouts)
  const { id } = await params;

  const reflection = await getReflection(id);

  // If the reflection doesn't exist or doesn't belong to this user, 404.
  if (!reflection) notFound();

  // Mark as read on view — fire and forget (no need to await).
  // We don't block the page render on this; it's a background side effect.
  if (!reflection.isRead) {
    markReflectionAsRead(id);
  }

  // Format a date string into a readable label
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* ---- Navigation ---- */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/reflections"
            className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← All reflections
          </Link>
        </div>

        {/* ---- Reflection card ---- */}
        {/* Generous padding and max-width for a calm, readable feel.
            The prose class from Tailwind Typography handles all the
            markdown-generated HTML elements (headings, lists, paragraphs, etc.) */}
        <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm md:p-10 dark:border-gray-800 dark:bg-gray-900">
          {/* Period header */}
          <header className="mb-6 border-b border-gray-100 pb-6 dark:border-gray-800">
            <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
              Weekly Reflection
            </p>
            <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {formatDate(reflection.periodStart)} –{" "}
              {formatDate(reflection.periodEnd)}
            </h1>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Generated{" "}
              {reflection.createdAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </header>

          {/* Reflection content — rendered as markdown.
              This is a client component because react-markdown runs in the browser.
              We pass recommendations separately rather than concatenating them
              into markdown so the UI can render them as structured cards. */}
          <ReflectionContent
            content={reflection.content}
            recommendations={reflection.recommendations}
          />
        </article>
      </div>
    </div>
  );
}
