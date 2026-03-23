// ============================================================================
// REFLECTIONS ARCHIVE PAGE
// ============================================================================
//
// Lists all reflections for the current user (read and unread), newest first.
// This is the "View all reflections" destination from the popover indicator.
//
// Server component — data is fetched before the page renders.
// Each reflection card shows the period, a preview, and read/unread status.
// Clicking a card navigates to the full detail view at /reflections/[id].
// ============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getReflections } from "@/lib/actions/reflections";
import EmptyState from "@/components/empty-state";

export default async function ReflectionsPage() {
  // Auth guard (defense in depth — middleware already checks this)
  const session = await getSession();
  if (!session) redirect("/login");

  const reflections = await getReflections();

  // Format a date string like "2026-03-16" into "Mar 16, 2026"
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* ---- Header with back link ---- */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            Reflections
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Weekly AI-generated reflections on your saved records.
          </p>
        </div>

        {/* ---- Reflection list ---- */}
        {reflections.length === 0 ? (
          <EmptyState
            icon="reflections"
            title="No reflections yet"
            description="Reflections are generated weekly based on your saved records. Keep saving and one will appear soon."
          />
        ) : (
          <ul className="space-y-3">
            {reflections.map((reflection) => (
              <li key={reflection.id}>
                <Link
                  href={`/reflections/${reflection.id}`}
                  className="group block rounded-lg border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                >
                  {/* Top row: period label + unread indicator */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-violet-600 dark:text-violet-400">
                      {formatDate(reflection.periodStart)} –{" "}
                      {formatDate(reflection.periodEnd)}
                    </span>

                    {/* Unread dot — small violet circle for unread reflections */}
                    {!reflection.isRead && (
                      <span className="h-2 w-2 rounded-full bg-violet-500" />
                    )}
                  </div>

                  {/* Preview text */}
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {reflection.preview}
                  </p>

                  {/* Created date */}
                  <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    Generated{" "}
                    {reflection.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
